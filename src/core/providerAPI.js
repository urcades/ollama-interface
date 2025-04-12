import * as Config from "../config/config.js";
import * as ModelManager from "./modelManager.js";

// Create request body based on provider
export const createRequestBody = (
  provider,
  model,
  conversationHistory,
  prompt,
  imageData = null
) => {
  switch (provider) {
    case "nous":
      return {
        model,
        messages: [
          {
            role: "system",
            content: Config.getSystemPrompt(),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      };
    case "cerebras":
      return {
        messages: [
          {
            role: "system",
            content: Config.getSystemPrompt(),
          },
          ...conversationHistory.filter((msg) => msg.role !== "system"),
        ],
        model,
        stream: true,
        temperature: 0.2,
        max_completion_tokens: 2048,
        top_p: 1,
      };
    default: // ollama
      // For Ollama, we can directly include the image in the messages array
      // Check if the last message in history has an image
      const lastMessage = conversationHistory[conversationHistory.length - 1];

      // Create a copy of the conversation history
      const messages = [...conversationHistory];

      // If there's image data and the last message is from the user,
      // make sure it includes the image data
      if (imageData && lastMessage && lastMessage.role === "user") {
        // Replace the last message with one that includes the image
        messages[messages.length - 1] = {
          role: "user",
          content: lastMessage.content,
          images: [imageData],
        };
      }

      // Check if the model supports tool use
      const hasToolUse = ModelManager.hasCapability(model, "tool");

      const requestBody = {
        model,
        messages,
      };

      // Add tools if the model supports them and Tools module is available
      if (hasToolUse && window.Tools?.toolDefinitions) {
        requestBody.tools = window.Tools.toolDefinitions;
      }

      return requestBody;
  }
};

// Get API endpoint based on provider
export const getApiEndpoint = (provider) => {
  const config = Config.getConfig();

  switch (provider) {
    case "nous":
      return config.nousApiEndpoint + "/chat/completions";
    case "cerebras":
      return config.cerebrasApiEndpoint;
    default: // ollama
      return config.apiEndpoint + "/chat";
  }
};

// Get headers based on provider
export const getHeaders = (provider) => {
  const headers = { "Content-Type": "application/json" };
  if (provider === "nous") {
    headers.Authorization = `Bearer ${Config.getNousApiKey()}`;
  }
  return headers;
};

// Send request to provider API
export const sendRequest = async (
  provider,
  model,
  conversationHistory,
  prompt,
  signal,
  imageData = null
) => {
  const endpoint = getApiEndpoint(provider);
  const headers = getHeaders(provider);
  const body = createRequestBody(
    provider,
    model,
    conversationHistory,
    prompt,
    imageData
  );

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
};

// Format tool calls for display
export const formatToolCalls = (toolCalls) => {
  if (!toolCalls || toolCalls.length === 0) return "";

  let formattedText = "🔧 **Tool Call**\n\n";

  toolCalls.forEach((toolCall, index) => {
    const { function: func } = toolCall;
    formattedText += `Function: \`${func.name}\`\n\n`;
    formattedText +=
      "Arguments:\n```json\n" +
      JSON.stringify(func.arguments, null, 2) +
      "\n```\n\n";

    if (index < toolCalls.length - 1) {
      formattedText += "---\n\n";
    }
  });

  return formattedText;
};

// Process streaming response
export const processStreamingResponse = async (
  provider,
  response,
  callback
) => {
  if (provider === "nous") {
    const data = await response.json();
    return data.choices[0].message.content;
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";
    let toolCalls = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });

      if (provider === "cerebras") {
        const lines = text.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const content = line.substring(6);
            if (content === "[DONE]") break;

            try {
              const json = JSON.parse(content);
              if (json.content) {
                responseText += json.content;
                callback(responseText);
              }
            } catch (error) {
              console.error("Error parsing SSE message:", error);
            }
          }
        }
      } else {
        // ollama
        const chunks = text.split("\n");
        for (const chunk of chunks) {
          if (!chunk.trim()) continue;

          try {
            const parsedChunk = JSON.parse(chunk);
            const { message } = parsedChunk;

            if (message?.content) {
              responseText += message.content;
              callback(responseText, null); // Pass null for toolCalls
            }

            // Check for tool calls in the message
            if (message?.tool_calls) {
              toolCalls = message.tool_calls;

              // Format tool calls for display
              const toolCallsText = formatToolCalls(toolCalls);
              if (toolCallsText) {
                responseText += (responseText ? "\n\n" : "") + toolCallsText;
                callback(responseText, toolCalls);
              }
            }

            // If this is the final message, check if it has tool_calls
            if (
              parsedChunk.done &&
              parsedChunk.done_reason === "stop" &&
              !toolCalls &&
              message?.tool_calls
            ) {
              toolCalls = message.tool_calls;

              // Format tool calls for display
              const toolCallsText = formatToolCalls(toolCalls);
              if (toolCallsText) {
                responseText += (responseText ? "\n\n" : "") + toolCallsText;
                callback(responseText, toolCalls);
              }
            }
          } catch (parseError) {
            console.warn("Failed to parse chunk:", parseError);
          }
        }
      }
    }

    return { text: responseText, toolCalls };
  }
};

export default {
  createRequestBody,
  getApiEndpoint,
  getHeaders,
  sendRequest,
  processStreamingResponse,
  formatToolCalls,
};
