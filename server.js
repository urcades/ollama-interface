import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { ChromaClient } from "chromadb";
import dotenv from "dotenv";
import fs from "fs";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

// Load environment variables
dotenv.config();

// Initialize Cerebras client
const cerebrasClient = process.env.CEREBAS_API_KEY
  ? new Cerebras({
      apiKey: process.env.CEREBAS_API_KEY,
      organizationId: process.env.CEREBAS_ORG_ID, // Add organization ID
    })
  : null;

// Simple queue system for managing Chroma API calls
const chromaQueue = {
  queue: [],
  processing: false,

  add(operation, callback) {
    this.queue.push({ operation, callback });
    if (!this.processing) {
      this.processNext();
    }
  },

  async processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift();

    try {
      // Ensure minimum time between API calls
      const now = Date.now();
      const timeSinceLastCall = now - lastChromaApiCall;

      if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
        const waitTime = MIN_API_CALL_INTERVAL - timeSinceLastCall;
        console.log(`Queue: waiting ${waitTime}ms before next Chroma API call`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      // Update timestamp before making the call
      lastChromaApiCall = Date.now();

      // Execute the operation
      const result = await item.operation();
      item.callback(null, result);
    } catch (error) {
      item.callback(error);
    } finally {
      // Add a significant delay between queue processing to prevent bursts
      const delay = Math.min(30000, 5000 * (consecutiveFailures + 1));
      console.log(
        `Adding ${delay / 1000}s delay before processing next queue item`
      );
      setTimeout(() => this.processNext(), delay);
    }
  },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Chroma client
const chromaClient = new ChromaClient({
  path: "https://api.trychroma.com:8000",
  auth: {
    provider: "token",
    credentials: process.env.CHROMA_API_KEY,
    tokenHeaderType: "X_CHROMA_TOKEN",
  },
  tenant: process.env.CHROMA_TENANT,
  database: process.env.CHROMA_DATABASE,
});

// Initialize or get the collection
let conversationCollection;
let lastChromaApiCall = 0;
const MIN_API_CALL_INTERVAL = 30000; // Increased to 30 seconds
const MAX_RETRIES_PER_HOUR = 10; // Limit total retries per hour
let retryCount = 0;
let lastResetTime = Date.now();
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

// Conversation batching system
const conversationBatch = {
  items: [],
  timer: null,
  maxBatchSize: 3, // Reduced batch size
  batchTimeout: 60000, // Increased to 1 minute
  cooldownActive: false,
  cooldownTimer: null,

  add(id, document, metadata) {
    this.items.push({ id, document, metadata });
    console.log(`Added to batch queue (size: ${this.items.length})`);

    // If this is the first item, start the timer
    if (this.items.length === 1 && !this.cooldownActive) {
      this.resetTimer();
    }

    // If we've reached max batch size and not in cooldown, process
    if (this.items.length >= this.maxBatchSize && !this.cooldownActive) {
      this.processNow();
    }
  },

  resetTimer() {
    // Clear existing timer if any
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Set new timer if not in cooldown
    if (!this.cooldownActive) {
      this.timer = setTimeout(() => this.processNow(), this.batchTimeout);
    }
  },

  activateCooldown(minutes) {
    this.cooldownActive = true;
    console.log(
      `⚠️ Activating API cooldown for ${minutes} minutes due to rate limiting`
    );

    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
    }

    // Set cooldown timer
    this.cooldownTimer = setTimeout(() => {
      this.cooldownActive = false;
      console.log("✅ Cooldown period ended, resuming normal operations");

      // Process any pending items
      if (this.items.length > 0) {
        this.processNow();
      }
    }, minutes * 60 * 1000);
  },

  handleRateLimitError() {
    consecutiveFailures++;

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // Exponential cooldown: start with 5 minutes, then 10, then 20, etc.
      const cooldownMinutes = Math.min(
        5 * Math.pow(2, consecutiveFailures - MAX_CONSECUTIVE_FAILURES),
        60
      );
      this.activateCooldown(cooldownMinutes);
    }
  },

  handleSuccess() {
    // Reset consecutive failures counter on success
    consecutiveFailures = 0;
  },

  async processNow() {
    if (this.items.length === 0 || this.cooldownActive) return;

    // Reset hour-based retry counter if needed
    const now = Date.now();
    if (now - lastResetTime > 60 * 60 * 1000) {
      retryCount = 0;
      lastResetTime = now;
    }

    // If we've exceeded our hourly retry limit, activate cooldown
    if (retryCount >= MAX_RETRIES_PER_HOUR) {
      this.activateCooldown(60); // 1 hour cooldown
      return;
    }

    const itemsToProcess = [...this.items];
    this.items = []; // Clear the queue

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const ids = itemsToProcess.map((item) => item.id);

    // Use significantly shortened content to reduce payload size
    const documents = itemsToProcess.map((item) => {
      const userPart =
        item.metadata.userMessage.length > 100
          ? item.metadata.userMessage.substring(0, 100) + "..."
          : item.metadata.userMessage;

      const assistantPart =
        item.metadata.assistantResponse.length > 100
          ? item.metadata.assistantResponse.substring(0, 100) + "..."
          : item.metadata.assistantResponse;

      return `User: ${userPart}\nAssistant: ${assistantPart}`;
    });

    const metadatas = itemsToProcess.map((item) => ({
      ...item.metadata,
      truncated: true,
      timestamp: item.metadata.timestamp,
    }));

    console.log(`Processing batch of ${ids.length} conversations`);

    try {
      retryCount++;

      await rateLimitedChromaOperation(async () => {
        await conversationCollection.add({
          ids,
          documents,
          metadatas,
        });
      });

      console.log(
        `✅ Successfully stored batch of ${ids.length} conversations in Chroma`
      );
      this.handleSuccess();
    } catch (error) {
      console.warn("❌ Failed to store conversation batch:", error.message);
      this.handleRateLimitError();

      // Store failed items locally for future retry
      storeItemsLocally(itemsToProcess);
    }
  },
};

// Store messages locally when Chroma is unavailable
const pendingItems = [];
const PENDING_ITEMS_FILE = path.join(__dirname, "pending_conversations.json");

// Load any saved pending items on startup
function loadPendingItems() {
  try {
    if (fs.existsSync(PENDING_ITEMS_FILE)) {
      const data = fs.readFileSync(PENDING_ITEMS_FILE, "utf8");
      const loaded = JSON.parse(data);

      if (Array.isArray(loaded) && loaded.length > 0) {
        pendingItems.push(...loaded);
        console.log(`Loaded ${loaded.length} pending conversations from disk`);
      }
    }
  } catch (error) {
    console.error("Error loading pending items from disk:", error.message);
  }
}

// Save pending items to disk
function savePendingItems() {
  try {
    fs.writeFileSync(PENDING_ITEMS_FILE, JSON.stringify(pendingItems), "utf8");
    console.log(`Saved ${pendingItems.length} pending conversations to disk`);
  } catch (error) {
    console.error("Error saving pending items to disk:", error.message);
  }
}

function storeItemsLocally(items) {
  console.log(`Storing ${items.length} conversations locally for future retry`);
  pendingItems.push(...items);

  // If we're accumulating too many items, trim the oldest ones
  if (pendingItems.length > 100) {
    const removed = pendingItems.splice(0, pendingItems.length - 100);
    console.log(
      `Removed ${removed.length} oldest pending items due to capacity limits`
    );
  }

  // Save to disk
  savePendingItems();
}

// Load pending items at startup
loadPendingItems();

// Try to process pending items when server is idle
setInterval(() => {
  if (pendingItems.length > 0 && !conversationBatch.cooldownActive) {
    console.log(
      `Attempting to process ${Math.min(3, pendingItems.length)} of ${
        pendingItems.length
      } pending items`
    );

    // Take up to 3 items
    const itemsToProcess = pendingItems.splice(0, 3);

    // Add them to the regular batch processing
    itemsToProcess.forEach((item) => {
      conversationBatch.add(item.id, item.document, item.metadata);
    });

    // Save updated pending items list
    savePendingItems();
  }
}, 10 * 60 * 1000); // Check every 10 minutes

// Helper for rate-limited Chroma operations with retry
async function rateLimitedChromaOperation(operation, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    // Queue the operation instead of executing immediately
    chromaQueue.add(
      async () => {
        // Try the operation with exponential backoff
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              // Much longer exponential backoff with jitter to prevent retry storms
              // Base: 10s, 30s, 60s for retries 1, 2, 3
              const baseBackoff = Math.min(
                60000,
                10000 * Math.pow(3, attempt - 1)
              );
              const jitter = Math.random() * 10000; // Up to 10s of jitter
              const backoffTime = baseBackoff + jitter;

              console.log(
                `⏳ Retry attempt ${attempt}/${maxRetries}: waiting ${Math.round(
                  backoffTime / 1000
                )}s`
              );
              await new Promise((resolve) => setTimeout(resolve, backoffTime));
            }

            return await operation();
          } catch (error) {
            lastError = error;

            // Only retry on rate limit errors
            if (!error.message || !error.message.includes("429")) {
              throw error; // Don't retry non-rate-limit errors
            }

            console.warn(
              `⚠️ Rate limit hit on attempt ${attempt + 1}/${maxRetries + 1}`
            );

            // If this was the last retry, throw the error
            if (attempt === maxRetries) {
              throw error;
            }
          }
        }
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
}

async function initChroma() {
  console.log("=== INITIALIZING CHROMA ===");
  console.log(
    `API URL: ${process.env.CHROMA_API_KEY ? "API key set" : "No API key"}`
  );
  console.log(
    `Tenant: ${
      process.env.CHROMA_TENANT
        ? process.env.CHROMA_TENANT.substring(0, 8) + "..."
        : "No tenant ID"
    }`
  );
  console.log(`Database: ${process.env.CHROMA_DATABASE || "No database name"}`);

  try {
    // First try to get the existing collection
    try {
      console.log("Attempting to get existing collection...");
      conversationCollection = await rateLimitedChromaOperation(async () => {
        return await chromaClient.getCollection({
          name: "conversations",
        });
      });
      console.log("Successfully connected to existing collection");
    } catch (error) {
      // If collection doesn't exist, create it
      if (error.message && error.message.includes("not found")) {
        console.log("Collection not found, creating new collection...");
        conversationCollection = await rateLimitedChromaOperation(async () => {
          return await chromaClient.createCollection({
            name: "conversations",
            metadata: { description: "Chat conversation history for memory" },
          });
        });
        console.log("New collection created successfully");
      } else {
        // Some other error occurred
        console.error("Error connecting to collection:", error.message);
        throw error;
      }
    }

    // Test the collection with a simple query
    try {
      const count = await rateLimitedChromaOperation(async () => {
        return await conversationCollection.count();
      });
      console.log(`Collection contains ${count} documents`);
    } catch (testError) {
      console.warn("Collection test failed:", testError.message);
    }
  } catch (error) {
    console.error("Error initializing Chroma:", error);
    // Continue without Chroma - application will work but without memory features
    console.log("Application will continue without memory features");
  }
}

// Initialize Chroma on startup
initChroma();

const app = express();
const port = process.env.PORT || 3333;

// Middleware for parsing JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the root directory
app.use(express.static(__dirname));

// Serve index.html at the root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// API endpoint to serve configuration
app.get("/api/config", (req, res) => {
  // Only provide what's needed for the client
  res.json({
    nousApiKey: process.env.NOUS_API_KEY,
    cerebrasApiKey: process.env.CEREBAS_API_KEY,
    cerebrasOrgId: process.env.CEREBAS_ORG_ID,
  });
});

// API endpoint for Cerebras chat completions
app.post("/api/cerebras/chat", async (req, res) => {
  if (!cerebrasClient) {
    return res.status(400).json({ error: "Cerebras API key not configured" });
  }

  try {
    const {
      messages,
      model = "llama-3.3-70b",
      temperature = 0.2,
      max_completion_tokens = 2048,
      top_p = 1,
      stream = true,
    } = req.body;

    // Set response for streaming
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }

    const cerebrasStream = await cerebrasClient.chat.completions.create({
      messages,
      model,
      stream,
      max_completion_tokens,
      temperature,
      top_p,
    });

    if (stream) {
      // Process the stream and send chunks to client
      for await (const chunk of cerebrasStream) {
        const content = chunk.choices[0]?.delta?.content || "";
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // Handle non-streaming response
      const response = await cerebrasStream;
      res.json(response);
    }
  } catch (error) {
    console.error("Error with Cerebras API:", error);
    // Don't use res.status().json() if headers might have been sent already
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to get response from Cerebras",
        details: error.message,
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// API endpoint to handle chat interactions and store in Chroma
app.post("/api/chat", async (req, res) => {
  try {
    const {
      userMessage,
      assistantResponse,
      model,
      provider,
      timestamp = new Date().toISOString(),
    } = req.body;

    console.log(`=== CHAT MEMORY DEBUG ===`);
    console.log(`Provider: ${provider || "unknown"}`);
    console.log(`Model: ${model || "unknown"}`);
    console.log(`Message length: ${userMessage?.length || 0} chars`);
    console.log(`Response length: ${assistantResponse?.length || 0} chars`);

    if (!userMessage || !assistantResponse) {
      console.log("ERROR: Missing required fields in request");
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Store the conversation pair in Chroma if available
    if (conversationCollection) {
      try {
        const id = `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const document = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

        console.log(`Adding conversation to batch queue (ID: ${id})`);

        // Add to batch instead of immediate storage
        conversationBatch.add(id, document, {
          timestamp,
          model,
          provider,
          userMessage,
          assistantResponse,
        });

        // The main request succeeded - we'll process the batch asynchronously
        return res.json({
          success: true,
          message: "Conversation queued for storage",
        });
      } catch (error) {
        console.warn(
          "Error preparing conversation for storage:",
          error.message
        );
        return res.json({
          success: true,
          warning: "Conversation not queued for storage due to an error",
          details: error.message,
        });
      }
    } else {
      // Chroma collection not available
      console.log("ERROR: Chroma collection not initialized");
      return res.json({
        success: true,
        warning: "Memory feature not available - Chroma initialization failed",
      });
    }
  } catch (error) {
    console.error("Error handling chat:", error);
    res.status(500).json({ error: "Failed to process chat" });
  }
});

// API endpoint to query conversation history
app.post("/api/memory/search", async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    if (!conversationCollection) {
      return res.status(503).json({
        error: "Memory system not available",
        message:
          "Chroma initialization failed. Please restart the server or check your connection.",
      });
    }

    try {
      // Search for similar conversations with rate limiting
      const results = await rateLimitedChromaOperation(async () => {
        return await conversationCollection.query({
          queryTexts: [query],
          nResults: limit,
        });
      });

      res.json(results);
    } catch (chromaError) {
      console.warn("Chroma search error:", chromaError.message);

      // Return an empty result set with an explanation if Chroma search fails
      if (chromaError.message.includes("429")) {
        return res.status(429).json({
          error:
            "Rate limit exceeded on memory search. Please try again later.",
          documents: [],
          metadatas: [],
        });
      } else {
        return res.status(503).json({
          error: "Memory search unavailable: " + chromaError.message,
          documents: [],
          metadatas: [],
        });
      }
    }
  } catch (error) {
    console.error("Error searching memory:", error);
    res.status(500).json({ error: "Failed to search memory" });
  }
});

// Also add an API endpoint to check queue status
app.get("/api/memory/status", (req, res) => {
  res.json({
    batchQueueSize: conversationBatch.items.length,
    pendingItemsCount: pendingItems.length,
    cooldownActive: conversationBatch.cooldownActive,
    consecutiveFailures,
    status: conversationBatch.cooldownActive ? "cooldown" : "operational",
  });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

// Handle graceful shutdown to ensure pending operations are completed
process.on("SIGINT", async () => {
  console.log("Graceful shutdown initiated");

  // Save any items remaining in the batch queue
  if (conversationBatch.items.length > 0) {
    console.log(
      `Saving ${conversationBatch.items.length} items from batch queue to pending items`
    );
    storeItemsLocally(conversationBatch.items);
    conversationBatch.items = [];
  }

  // If not in cooldown and there are pending items, try to process some
  if (!conversationBatch.cooldownActive && pendingItems.length > 0) {
    console.log(
      `Processing ${Math.min(
        5,
        pendingItems.length
      )} pending conversations before shutdown`
    );
    try {
      // Take at most 5 items to process before shutdown
      const itemsToProcess = pendingItems.splice(0, 5);

      // Try to process them directly without batching
      for (const item of itemsToProcess) {
        try {
          await rateLimitedChromaOperation(async () => {
            await conversationCollection.add({
              ids: [item.id],
              documents: [
                `User: ${item.metadata.userMessage.substring(
                  0,
                  100
                )}...\nAssistant: ${item.metadata.assistantResponse.substring(
                  0,
                  100
                )}...`,
              ],
              metadatas: [{ ...item.metadata, truncated: true }],
            });
          });
          console.log(
            `Successfully processed pending item ${item.id} during shutdown`
          );
        } catch (error) {
          console.error(
            `Failed to process item ${item.id} during shutdown:`,
            error.message
          );
          // Put it back in the pending items
          pendingItems.unshift(item);
        }
      }

      // Save any remaining pending items
      savePendingItems();
    } catch (error) {
      console.error(
        "Failed to process pending conversations during shutdown:",
        error.message
      );
    }
  } else {
    // Just save pending items
    savePendingItems();
  }

  console.log("Shutdown complete");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, initiating shutdown");

  // Save any items remaining in the batch queue
  if (conversationBatch.items.length > 0) {
    console.log(
      `Saving ${conversationBatch.items.length} items from batch queue to pending items`
    );
    storeItemsLocally(conversationBatch.items);
    conversationBatch.items = [];
  }

  // Save all pending items
  savePendingItems();

  console.log("Shutdown complete");
  process.exit(0);
});
