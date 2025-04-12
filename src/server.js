import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import Cerebras from "@cerebras/cerebras_cloud_sdk";

// Load environment variables
dotenv.config();

// Configuration
const config = {
  port: process.env.PORT || 3333,
};

// Initialize services
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Cerebras client
const cerebrasClient = process.env.CEREBAS_API_KEY
  ? new Cerebras({
      apiKey: process.env.CEREBAS_API_KEY,
      organizationId: process.env.CEREBAS_ORG_ID,
    })
  : null;

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

app.listen(config.port, () => {
  console.log(`Server is running at http://localhost:${config.port}`);
});

// Graceful shutdown handlers
const shutdownHandlers = {
  async handleShutdown() {
    console.log("Graceful shutdown initiated");
    process.exit(0);
  },
};

process.on("SIGINT", shutdownHandlers.handleShutdown);
process.on("SIGTERM", shutdownHandlers.handleShutdown);
