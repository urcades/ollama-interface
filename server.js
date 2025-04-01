import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { ChromaClient } from "chromadb";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

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
async function initChroma() {
  try {
    // First try to get the existing collection
    try {
      console.log("Attempting to get existing collection...");
      conversationCollection = await chromaClient.getCollection({
        name: "conversations",
      });
      console.log("Successfully connected to existing collection");
    } catch (error) {
      // If collection doesn't exist, create it
      if (error.message && error.message.includes("not found")) {
        console.log("Collection not found, creating new collection...");
        conversationCollection = await chromaClient.createCollection({
          name: "conversations",
          metadata: { description: "Chat conversation history for memory" },
        });
        console.log("New collection created successfully");
      } else {
        // Some other error occurred
        throw error;
      }
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
  });
});

// API endpoint to handle chat interactions and store in Chroma
app.post("/api/chat", async (req, res) => {
  try {
    const {
      userMessage,
      assistantResponse,
      model,
      timestamp = new Date().toISOString(),
    } = req.body;

    if (!userMessage || !assistantResponse) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Store the conversation pair in Chroma if available
    if (conversationCollection) {
      try {
        const id = `conv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const document = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

        await conversationCollection.add({
          ids: [id],
          documents: [document],
          metadatas: [
            {
              timestamp,
              model,
              userMessage,
              assistantResponse,
            },
          ],
        });
        console.log("Successfully stored conversation in Chroma");
      } catch (chromaError) {
        console.warn("Chroma storage error:", chromaError.message);

        // Don't fail the whole request if Chroma storage fails
        return res.json({
          success: true,
          warning:
            "Conversation not stored in memory due to rate limiting or server error",
          details: chromaError.message,
        });
      }
    } else {
      // Chroma collection not available
      return res.json({
        success: true,
        warning: "Memory feature not available - Chroma initialization failed",
      });
    }

    // The main request succeeded
    res.json({ success: true, message: "Conversation processed" });
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
      // Search for similar conversations
      const results = await conversationCollection.query({
        queryTexts: [query],
        nResults: limit,
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

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
