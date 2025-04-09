import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { ChromaClient } from "chromadb";
import dotenv from "dotenv";
import fs from "fs";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

// Load environment variables
dotenv.config();

// Configuration
const config = {
  port: process.env.PORT || 3333,
  chroma: {
    path: "https://api.trychroma.com:8000",
    auth: {
      provider: "token",
      credentials: process.env.CHROMA_API_KEY,
      tokenHeaderType: "X_CHROMA_TOKEN",
    },
    tenant: process.env.CHROMA_TENANT,
    database: process.env.CHROMA_DATABASE,
  },
  queue: {
    minApiCallInterval: 30000, // 30 seconds
    maxRetriesPerHour: 10,
    maxConsecutiveFailures: 3,
  },
  batch: {
    maxBatchSize: 3,
    batchTimeout: 60000, // 1 minute
    maxPendingItems: 100,
  },
};

// Initialize services
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Queue system for managing Chroma API calls with rate limiting
 */
class ChromaQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.lastApiCall = 0;
    this.consecutiveFailures = 0;
  }

  add(operation, callback) {
    this.queue.push({ operation, callback });
    if (!this.processing) {
      this.processNext();
    }
  }

  async processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { operation, callback } = this.queue.shift();

    try {
      const now = Date.now();
      const timeSinceLastCall = now - this.lastApiCall;

      if (timeSinceLastCall < config.queue.minApiCallInterval) {
        const waitTime = config.queue.minApiCallInterval - timeSinceLastCall;
        console.log(`Queue: waiting ${waitTime}ms before next Chroma API call`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      this.lastApiCall = Date.now();
      const result = await operation();
      callback(null, result);
      this.consecutiveFailures = 0;
    } catch (error) {
      callback(error);
      this.consecutiveFailures++;
    } finally {
      const delay = Math.min(30000, 5000 * (this.consecutiveFailures + 1));
      console.log(
        `Adding ${delay / 1000}s delay before processing next queue item`
      );
      setTimeout(() => this.processNext(), delay);
    }
  }
}

/**
 * Batch processing system for conversation storage
 */
class ConversationBatch {
  constructor() {
    this.items = [];
    this.timer = null;
    this.cooldownActive = false;
    this.cooldownTimer = null;
  }

  add(id, document, metadata) {
    this.items.push({ id, document, metadata });
    console.log(`Added to batch queue (size: ${this.items.length})`);

    if (this.items.length === 1 && !this.cooldownActive) {
      this.resetTimer();
    }

    if (
      this.items.length >= config.batch.maxBatchSize &&
      !this.cooldownActive
    ) {
      this.processNow();
    }
  }

  resetTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (!this.cooldownActive) {
      this.timer = setTimeout(
        () => this.processNow(),
        config.batch.batchTimeout
      );
    }
  }

  activateCooldown(minutes) {
    this.cooldownActive = true;
    console.log(
      `⚠️ Activating API cooldown for ${minutes} minutes due to rate limiting`
    );

    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
    }

    this.cooldownTimer = setTimeout(() => {
      this.cooldownActive = false;
      console.log("✅ Cooldown period ended, resuming normal operations");

      if (this.items.length > 0) {
        this.processNow();
      }
    }, minutes * 60 * 1000);
  }

  async processNow() {
    if (this.items.length === 0 || this.cooldownActive) return;

    const itemsToProcess = [...this.items];
    this.items = [];

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const { ids, documents, metadatas } = this.prepareBatchData(itemsToProcess);
    console.log(`Processing batch of ${ids.length} conversations`);

    try {
      await rateLimitedChromaOperation(async () => {
        await conversationCollection.add({ ids, documents, metadatas });
      });

      console.log(
        `✅ Successfully stored batch of ${ids.length} conversations in Chroma`
      );
    } catch (error) {
      console.warn("❌ Failed to store conversation batch:", error.message);
      this.handleRateLimitError();
      fileUtils.storeItemsLocally(itemsToProcess);
    }
  }

  prepareBatchData(items) {
    const ids = items.map((item) => item.id);
    const documents = items.map((item) => {
      const truncateText = (text) =>
        text.length > 100 ? `${text.substring(0, 100)}...` : text;
      return `User: ${truncateText(
        item.metadata.userMessage
      )}\nAssistant: ${truncateText(item.metadata.assistantResponse)}`;
    });
    const metadatas = items.map((item) => ({
      ...item.metadata,
      truncated: true,
      timestamp: item.metadata.timestamp,
    }));

    return { ids, documents, metadatas };
  }

  handleRateLimitError() {
    if (this.consecutiveFailures >= config.queue.maxConsecutiveFailures) {
      const cooldownMinutes = Math.min(
        5 *
          Math.pow(
            2,
            this.consecutiveFailures - config.queue.maxConsecutiveFailures
          ),
        60
      );
      this.activateCooldown(cooldownMinutes);
    }
  }
}

// Initialize services
const chromaQueue = new ChromaQueue();
const conversationBatch = new ConversationBatch();
const pendingItems = [];
const PENDING_ITEMS_FILE = path.join(__dirname, "pending_conversations.json");

// Initialize Chroma client
const chromaClient = new ChromaClient(config.chroma);
let conversationCollection;

// Initialize Cerebras client
const cerebrasClient = process.env.CEREBAS_API_KEY
  ? new Cerebras({
      apiKey: process.env.CEREBAS_API_KEY,
      organizationId: process.env.CEREBAS_ORG_ID,
    })
  : null;

/**
 * Utility functions for file operations
 */
const fileUtils = {
  loadPendingItems() {
    try {
      if (fs.existsSync(PENDING_ITEMS_FILE)) {
        const data = fs.readFileSync(PENDING_ITEMS_FILE, "utf8");
        const loaded = JSON.parse(data);

        if (Array.isArray(loaded) && loaded.length > 0) {
          pendingItems.push(...loaded);
          console.log(
            `Loaded ${loaded.length} pending conversations from disk`
          );
        }
      }
    } catch (error) {
      console.error("Error loading pending items from disk:", error.message);
    }
  },

  savePendingItems() {
    try {
      fs.writeFileSync(
        PENDING_ITEMS_FILE,
        JSON.stringify(pendingItems),
        "utf8"
      );
      console.log(`Saved ${pendingItems.length} pending conversations to disk`);
    } catch (error) {
      console.error("Error saving pending items to disk:", error.message);
    }
  },

  storeItemsLocally(items) {
    console.log(
      `Storing ${items.length} conversations locally for future retry`
    );
    pendingItems.push(...items);

    if (pendingItems.length > config.batch.maxPendingItems) {
      const removed = pendingItems.splice(
        0,
        pendingItems.length - config.batch.maxPendingItems
      );
      console.log(
        `Removed ${removed.length} oldest pending items due to capacity limits`
      );
    }

    this.savePendingItems();
  },
};

// Load pending items at startup
fileUtils.loadPendingItems();

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
    fileUtils.savePendingItems();
  }
}, 10 * 60 * 1000); // Check every 10 minutes

/**
 * Helper for rate-limited Chroma operations with retry
 */
async function rateLimitedChromaOperation(operation, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    chromaQueue.add(
      async () => {
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              const baseBackoff = Math.min(
                60000,
                10000 * Math.pow(3, attempt - 1)
              );
              const jitter = Math.random() * 10000;
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
            if (!error.message?.includes("429")) {
              throw error;
            }

            console.warn(
              `⚠️ Rate limit hit on attempt ${attempt + 1}/${maxRetries + 1}`
            );
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

/**
 * Initialize Chroma collection
 */
async function initChroma() {
  console.log("=== INITIALIZING CHROMA ===");
  console.log(
    `API URL: ${process.env.CHROMA_API_KEY ? "API key set" : "No API key"}`
  );
  console.log(
    `Tenant: ${
      process.env.CHROMA_TENANT
        ? `${process.env.CHROMA_TENANT.substring(0, 8)}...`
        : "No tenant ID"
    }`
  );
  console.log(`Database: ${process.env.CHROMA_DATABASE || "No database name"}`);

  try {
    try {
      console.log("Attempting to get existing collection...");
      conversationCollection = await rateLimitedChromaOperation(async () => {
        return await chromaClient.getCollection({ name: "conversations" });
      });
      console.log("Successfully connected to existing collection");
    } catch (error) {
      if (error.message?.includes("not found")) {
        console.log("Collection not found, creating new collection...");
        conversationCollection = await rateLimitedChromaOperation(async () => {
          return await chromaClient.createCollection({
            name: "conversations",
            metadata: { description: "Chat conversation history for memory" },
          });
        });
        console.log("New collection created successfully");
      } else {
        console.error("Error connecting to collection:", error.message);
        throw error;
      }
    }

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
    console.log("Application will continue without memory features");
  }
}

// Initialize Chroma on startup
initChroma();

const app = express();

// Middleware for parsing JSON and urlencoded data
app.use(express.json({ limit: "50mb" }));
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

    // Ensure there's a system message in the conversation
    const processedMessages = [...messages];
    const hasSystemMessage = processedMessages.some(
      (msg) => msg.role === "system"
    );

    if (!hasSystemMessage) {
      // Add a default system message if none exists
      processedMessages.unshift({
        role: "system",
        content: "You are a helpful assistant.",
      });
    }

    // Set response for streaming
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }

    const cerebrasStream = await cerebrasClient.chat.completions.create({
      messages: processedMessages,
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
    consecutiveFailures: chromaQueue.consecutiveFailures,
    status: conversationBatch.cooldownActive ? "cooldown" : "operational",
  });
});

app.listen(config.port, () => {
  console.log(`Server is running at http://localhost:${config.port}`);
});

// Graceful shutdown handlers
const shutdownHandlers = {
  async handleShutdown() {
    console.log("Graceful shutdown initiated");

    if (conversationBatch.items.length > 0) {
      console.log(
        `Saving ${conversationBatch.items.length} items from batch queue to pending items`
      );
      fileUtils.storeItemsLocally(conversationBatch.items);
      conversationBatch.items = [];
    }

    if (!conversationBatch.cooldownActive && pendingItems.length > 0) {
      console.log(
        `Processing ${Math.min(
          5,
          pendingItems.length
        )} pending conversations before shutdown`
      );
      const itemsToProcess = pendingItems.splice(0, 5);

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
          pendingItems.unshift(item);
        }
      }
    }

    fileUtils.savePendingItems();
    console.log("Shutdown complete");
    process.exit(0);
  },
};

process.on("SIGINT", shutdownHandlers.handleShutdown);
process.on("SIGTERM", shutdownHandlers.handleShutdown);
