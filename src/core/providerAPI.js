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
    case "openai":
      // Convert image to OpenAI format if present
      let openaiContent = [];

      // Add system message first if it's not in history
      if (!conversationHistory.some((msg) => msg.role === "system")) {
        openaiContent.push({
          role: "system",
          content: Config.getSystemPrompt(),
        });
      }

      // Add conversation history (excluding system messages as we handle them separately)
      conversationHistory
        .filter((msg) => msg.role !== "system")
        .forEach((msg) => {
          // Handle text messages
          if (!msg.images) {
            openaiContent.push({
              role: msg.role,
              content: msg.content,
            });
          } else {
            // Handle messages with images
            const messageContent = [{ type: "text", text: msg.content }];

            // Add image content
            msg.images.forEach((image) => {
              messageContent.push({
                type: "image_url",
                image_url: {
                  url: image.startsWith("data:")
                    ? image
                    : `data:image/jpeg;base64,${image}`,
                },
              });
            });

            openaiContent.push({
              role: msg.role,
              content: messageContent,
            });
          }
        });

      // Check if the model supports tool use
      const openaiHasToolUse = ModelManager.hasCapability(model, "tool");

      const openaiRequestBody = {
        model,
        messages: openaiContent,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      };

      // Add tools if the model supports them and Tools module is available
      if (openaiHasToolUse && window.Tools?.toolDefinitions) {
        openaiRequestBody.tools = window.Tools.toolDefinitions.map((tool) => ({
          type: "function",
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        }));
      }

      return openaiRequestBody;

    case "anthropic":
      // Fix model name format for Anthropic if needed
      let anthropicModel = model;

      // Ensure we're using the correct model id format for Claude
      if (model.startsWith("claude-") && !model.includes(":")) {
        // Convert to proper model ID format
        // For example: "claude-3-opus-20240229" or "claude-3-5-sonnet-20240620"
        if (model === "claude-3-opus") {
          anthropicModel = "claude-3-opus-20240229";
        } else if (model === "claude-3-sonnet") {
          anthropicModel = "claude-3-sonnet-20240229";
        } else if (model === "claude-3-haiku") {
          anthropicModel = "claude-3-haiku-20240307";
        } else if (model === "claude-3-5-sonnet") {
          anthropicModel = "claude-3-5-sonnet-20240620";
        }
      }

      // Convert messages to Anthropic format
      let anthropicMessages = [];

      // Add conversation history
      conversationHistory
        .filter((msg) => msg.role !== "system")
        .forEach((msg) => {
          // Handle text messages
          if (!msg.images) {
            // Ensure role is either user or assistant - Anthropic only accepts these roles
            const role = msg.role === "assistant" ? "assistant" : "user";
            anthropicMessages.push({
              role,
              content: msg.content,
            });
          } else {
            // Handle messages with images - only user can send images to Claude
            const messageContent = [];

            // Add text content first
            messageContent.push({
              type: "text",
              text: msg.content,
            });

            // Add image content
            msg.images.forEach((image) => {
              // Extract the base64 data without the prefix for Claude API
              const base64Data = image.startsWith("data:")
                ? image.substring(image.indexOf(",") + 1)
                : image;

              // Detect content type
              let mediaType = "image/jpeg";
              if (image.startsWith("data:")) {
                const mimeMatch = image.match(/^data:(image\/[a-z]+);base64,/);
                if (mimeMatch && mimeMatch[1]) {
                  mediaType = mimeMatch[1];
                }
              }

              messageContent.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              });
            });

            // Images can only be sent by user
            anthropicMessages.push({
              role: "user",
              content: messageContent,
            });
          }
        });

      const anthropicRequest = {
        model: anthropicModel,
        messages: anthropicMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true,
      };

      // Add system prompt if not present in messages
      if (!conversationHistory.some((msg) => msg.role === "system")) {
        anthropicRequest.system = Config.getSystemPrompt();
      } else {
        // Find the system message and use it
        const systemMsg = conversationHistory.find(
          (msg) => msg.role === "system"
        );
        if (systemMsg) {
          anthropicRequest.system = systemMsg.content;
        }
      }

      // Add tools if available and model supports them
      const anthropicHasToolUse = ModelManager.hasCapability(model, "tool");
      if (anthropicHasToolUse && window.Tools?.toolDefinitions) {
        anthropicRequest.tools = window.Tools.toolDefinitions.map((tool) => ({
          type: "function",
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        }));
      }

      return anthropicRequest;

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
      const ollamaMessages = [...conversationHistory];

      // If there's image data and the last message is from the user,
      // make sure it includes the image data
      if (imageData && lastMessage && lastMessage.role === "user") {
        // Replace the last message with one that includes the image
        ollamaMessages[ollamaMessages.length - 1] = {
          role: "user",
          content: lastMessage.content,
          images: [imageData],
        };
      }

      // Check if the model supports tool use
      const ollamaHasToolUse = ModelManager.hasCapability(model, "tool");

      const ollamaRequestBody = {
        model,
        messages: ollamaMessages,
      };

      // Add tools if the model supports them and Tools module is available
      if (ollamaHasToolUse && window.Tools?.toolDefinitions) {
        ollamaRequestBody.tools = window.Tools.toolDefinitions;
      }

      return ollamaRequestBody;
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
    case "openai":
      // Use proxy endpoint to avoid CORS issues
      return "/api/openai/chat/completions";
    case "anthropic":
      // Use proxy endpoint to avoid CORS issues
      return "/api/anthropic/messages";
    default: // ollama
      return config.apiEndpoint + "/chat";
  }
};

// Get headers based on provider
export const getHeaders = (provider) => {
  const headers = { "Content-Type": "application/json" };

  switch (provider) {
    case "nous":
      headers.Authorization = `Bearer ${Config.getNousApiKey()}`;
      break;
    case "openai":
      // No need to include auth headers for proxy endpoints
      // The server will add them
      break;
    case "anthropic":
      // No need to include auth headers for proxy endpoints
      // The server will add them
      break;
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
  } else if (provider === "openai") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";
    let toolCalls = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;

        const data = line.substring(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);

          if (parsed.choices && parsed.choices.length > 0) {
            const choice = parsed.choices[0];
            const delta = choice.delta;

            // Handle content
            if (delta.content) {
              responseText += delta.content;
              callback(responseText, null);
            }

            // Handle tool calls
            if (delta.tool_calls) {
              // Initialize tool calls array if needed
              if (!toolCalls) {
                toolCalls = delta.tool_calls.map((tc) => ({
                  index: tc.index,
                  id: tc.id,
                  type: tc.type,
                  function: {
                    name: tc.function.name || "",
                    arguments: tc.function.arguments || "",
                  },
                }));
              } else {
                // Update existing tool calls with new data
                delta.tool_calls.forEach((deltaTC) => {
                  const existingTC = toolCalls.find(
                    (tc) => tc.index === deltaTC.index
                  );
                  if (existingTC) {
                    if (deltaTC.function?.name) {
                      existingTC.function.name += deltaTC.function.name;
                    }
                    if (deltaTC.function?.arguments) {
                      existingTC.function.arguments +=
                        deltaTC.function.arguments;
                    }
                  }
                });
              }

              // Only format and display complete tool calls
              if (choice.finish_reason === "tool_calls") {
                // Try to parse the arguments as JSON
                toolCalls.forEach((tc) => {
                  try {
                    tc.function.arguments = JSON.parse(tc.function.arguments);
                  } catch (e) {
                    // Keep as string if parsing fails
                  }
                });

                const toolCallsText = formatToolCalls(toolCalls);
                responseText += (responseText ? "\n\n" : "") + toolCallsText;
                callback(responseText, toolCalls);
              }
            }
          }
        } catch (error) {
          console.warn("Error parsing OpenAI stream:", error);
        }
      }
    }

    return { text: responseText, toolCalls };
  } else if (provider === "anthropic") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";
    let toolCalls = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;

        const data = line.substring(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);

          // Handle text content
          if (
            parsed.type === "content_block_delta" &&
            parsed.delta.type === "text_delta"
          ) {
            responseText += parsed.delta.text;
            callback(responseText, null);
          }

          // Handle tool calls
          if (
            parsed.type === "content_block_delta" &&
            parsed.delta.type === "tool_use"
          ) {
            // Initialize tool calls array if needed
            if (!toolCalls) {
              toolCalls = [
                {
                  id: parsed.index,
                  type: "function",
                  function: {
                    name: parsed.delta.tool_use.name || "",
                    arguments: parsed.delta.tool_use.input || "{}",
                  },
                },
              ];
            } else {
              // Update existing tool call
              const existingTC = toolCalls.find((tc) => tc.id === parsed.index);
              if (existingTC) {
                if (parsed.delta.tool_use.name) {
                  existingTC.function.name = parsed.delta.tool_use.name;
                }
                if (parsed.delta.tool_use.input) {
                  existingTC.function.arguments = parsed.delta.tool_use.input;
                }
              } else {
                // Add new tool call
                toolCalls.push({
                  id: parsed.index,
                  type: "function",
                  function: {
                    name: parsed.delta.tool_use.name || "",
                    arguments: parsed.delta.tool_use.input || "{}",
                  },
                });
              }
            }
          }

          // When message is complete, display tool calls
          if (parsed.type === "message_stop") {
            if (toolCalls) {
              // Format tool calls
              toolCalls.forEach((tc) => {
                try {
                  if (typeof tc.function.arguments === "string") {
                    tc.function.arguments = JSON.parse(tc.function.arguments);
                  }
                } catch (e) {
                  // Keep as string if parsing fails
                }
              });

              const toolCallsText = formatToolCalls(toolCalls);
              responseText += (responseText ? "\n\n" : "") + toolCallsText;
              callback(responseText, toolCalls);
            }
          }
        } catch (error) {
          console.warn("Error parsing Anthropic stream:", error);
        }
      }
    }

    return { text: responseText, toolCalls };
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
