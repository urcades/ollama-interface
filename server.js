const express = require("express");
const path = require("path");
require("dotenv").config(); // Load .env variables
const fetch = require("node-fetch"); // Import node-fetch

const app = express();
const PORT = process.env.PORT || 3000;

// Increase JSON payload size limit to 50MB (from default 1MB)
app.use(express.json({ limit: "50mb" }));
// Serve static files from the current directory
app.use(express.static(__dirname));

// Route for the home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// New endpoint to proxy Claude API requests
app.post("/api/claude/chat", async (req, res) => {
  const {
    model,
    messages,
    max_tokens = 1000,
    system,
    temperature = 1.0,
    top_p = 0.9,
    top_k = 50,
  } = req.body;

  const apiKey = process.env.CLAUDE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Claude API key not configured." });
  }

  if (!model || !messages) {
    return res
      .status(400)
      .json({ error: "Missing model or messages in request." });
  }

  try {
    const requestBody = {
      model: model,
      messages: messages,
      max_tokens: max_tokens,
      system: system,
      temperature: temperature,
      top_p: top_p,
      top_k: top_k,
    };

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01", // Specify the API version
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!anthropicResponse.ok) {
      const errorBody = await anthropicResponse.text();
      console.error("Anthropic API Error:", errorBody);
      return res.status(anthropicResponse.status).json({
        error: `Anthropic API Error: ${anthropicResponse.statusText}`,
        details: errorBody,
      });
    }

    const data = await anthropicResponse.json();

    // Include the model parameters in the response
    res.json({
      ...data,
      parameters: {
        model: model,
        temperature: temperature,
        max_tokens: max_tokens,
        top_p: top_p,
        top_k: top_k,
      },
    });
  } catch (error) {
    console.error("Error proxying to Claude API:", error);
    res
      .status(500)
      .json({ error: "Internal server error while contacting Claude API." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
