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
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.CLAUDE_API_KEY,
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

// Proxy endpoint for Anthropic API
app.post("/api/anthropic/messages", async (req, res) => {
  const anthropicApiKey = process.env.CLAUDE_API_KEY;

  if (!anthropicApiKey) {
    return res.status(400).json({ error: "Anthropic API key not configured" });
  }

  try {
    const {
      model,
      messages,
      stream = true,
      max_tokens = 2048,
      temperature = 0.7,
      system,
      tools,
    } = req.body;

    console.log("Anthropic API request for model:", model);
    console.log(
      "Anthropic system prompt:",
      system ? system.substring(0, 50) + "..." : "None provided"
    );

    // Create request to Anthropic API
    const requestHeaders = {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    };

    const requestBody = {
      model,
      messages,
      max_tokens,
      temperature,
      stream,
    };

    // Add system message if provided
    if (system) {
      requestBody.system = system;
    }

    // Only add tools if they exist (they're now supported in the main API)
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    console.log(
      "Sending request to Anthropic with headers:",
      Object.keys(requestHeaders)
    );

    // Create request to Anthropic API
    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      }
    );

    if (!anthropicResponse.ok) {
      const errorData = await anthropicResponse.json();
      console.error("Anthropic API error:", errorData);
      return res.status(anthropicResponse.status).json({
        error: "Error from Anthropic API",
        details: errorData,
      });
    }

    // Handle streaming response
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = anthropicResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }

      res.end();
    } else {
      // Non-streaming response
      const data = await anthropicResponse.json();
      res.json(data);
    }
  } catch (error) {
    console.error("Error proxying to Anthropic API:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to get response from Anthropic",
        details: error.message,
      });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Proxy endpoint for OpenAI API
app.post("/api/openai/chat/completions", async (req, res) => {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    return res.status(400).json({ error: "OpenAI API key not configured" });
  }

  try {
    const {
      model,
      messages,
      stream = true,
      max_tokens = 2000,
      temperature = 0.7,
      tools,
    } = req.body;

    console.log("OpenAI API request for model:", model);

    // Check if there's a system message and log it
    const systemMessage = messages.find((msg) => msg.role === "system");
    console.log(
      "OpenAI system message:",
      systemMessage
        ? systemMessage.content.substring(0, 50) + "..."
        : "None found in messages"
    );

    // Prepare messages - make sure image URLs are properly formatted
    // This is important because the image URL format might be different in the client vs server
    const formattedMessages = messages.map((msg) => {
      // If message has content array with images, ensure URLs are properly formatted
      if (msg.content && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((item) => {
            if (
              item.type === "image_url" &&
              item.image_url &&
              item.image_url.url
            ) {
              // No need to modify the URL since we're already passing the data URL
              return item;
            }
            return item;
          }),
        };
      }
      return msg;
    });

    // Create request to OpenAI API
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          max_tokens,
          temperature,
          tools,
          stream,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.error("OpenAI API error:", errorData);
      return res.status(openaiResponse.status).json({
        error: "Error from OpenAI API",
        details: errorData,
      });
    }

    // Handle streaming response
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = openaiResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }

      res.end();
    } else {
      // Non-streaming response
      const data = await openaiResponse.json();
      res.json(data);
    }
  } catch (error) {
    console.error("Error proxying to OpenAI API:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Failed to get response from OpenAI",
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
