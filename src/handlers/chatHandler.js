import * as Config from "../config/config.js";
import * as Chat from "../core/chat.js";
import * as DOM from "../core/dom.js";
import * as ModelManager from "../core/modelManager.js";
import * as ProviderAPI from "../core/providerAPI.js";
import * as ErrorHandler from "../utils/errorHandler.js";
import * as Utilities from "../utils/utilities.js";

const elements = DOM.getElements();
const config = Config.getConfig();

export const handleSubmit = async (e) => {
  if (e) e.preventDefault();
  const prompt = elements.input.value.trim();
  if (!prompt) return;

  Chat.abortCurrentChat();
  Chat.setChatController(new AbortController());

  // Get the current image data, if any
  const imageData = Chat.getCurrentImage();
  const imageDataUrl = Chat.getCurrentImageDataUrl();

  // Add the message to the chat
  Chat.addMessageToChat("user", prompt, imageDataUrl);
  Chat.appendToConversationHistory("user", prompt, imageData);

  // Clear input and image
  elements.input.value = "";
  Chat.setCurrentImage(null);

  try {
    const currentProvider = ModelManager.getCurrentProvider();
    const currentModel = ModelManager.getCurrentModel();
    const conversationHistory = Chat.getConversationHistory();

    // Make API request using the provider API with image data if available
    const response = await ProviderAPI.sendRequest(
      currentProvider,
      currentModel,
      conversationHistory,
      prompt,
      Chat.getChatController().signal,
      imageData
    );

    if (!response.ok) {
      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        // Ignore JSON parsing errors
      }

      // Handle "does not support tools" error specifically
      if (data.error && data.error.includes("does not support tools")) {
        // Switch to basic mode without tools for this model
        console.warn(
          `Model ${currentModel} doesn't support tools, retrying without tools`
        );

        try {
          // Create a new message element for the retry
          const assistantMessageElement = Chat.addMessageToChat(
            "assistant",
            "Let me try again without using tools..."
          );

          // Create a new controller for the retry
          Chat.abortCurrentChat();
          Chat.setChatController(new AbortController());

          // Create a modified request body without tool definitions
          const retryResponse = await fetch(`${config.apiEndpoint}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: currentModel,
              messages: conversationHistory,
              stream: true,
              // Intentionally omitting tools
            }),
            signal: Chat.getChatController().signal,
          });

          if (!retryResponse.ok) {
            throw ErrorHandler.handleApiError(
              retryResponse.status,
              await retryResponse.json().catch(() => ({}))
            );
          }

          // Create a new scrolling function for this response
          const scrollToBottom = Utilities.createScrollToBottom();

          // Process the streaming response
          const responseData = await ProviderAPI.processStreamingResponse(
            "ollama", // Force provider to ollama for tool-less retry
            retryResponse,
            (text) => {
              // Update the message content as chunks arrive
              if (assistantMessageElement) {
                assistantMessageElement.innerHTML = "";
                const textDiv = document.createElement("div");
                textDiv.className = "message-text";
                textDiv.innerHTML = Utilities.formatMessage(text);
                assistantMessageElement.appendChild(textDiv);
                scrollToBottom(true);
              }
            }
          );

          // Extract response text
          let retryResponseText = "";
          if (typeof responseData === "object" && responseData !== null) {
            retryResponseText = responseData.text || "";
          } else {
            retryResponseText = responseData || "";
          }

          // Add the response to conversation history
          Chat.appendToConversationHistory("assistant", retryResponseText);

          // Final scroll
          scrollToBottom(false);

          return; // Exit the handler since we've successfully processed the response
        } catch (retryError) {
          console.error("Error in retry attempt:", retryError);
          throw retryError; // Let the outer catch block handle it
        }
      }

      throw ErrorHandler.handleApiError(response.status, data);
    }

    // Create a message element for displaying the assistant's response
    let assistantResponse = "";
    let toolCalls = null;
    const scrollToBottom = Utilities.createScrollToBottom();

    // Always create the message element before any async operations
    const assistantMessageElement = Chat.addMessageToChat(
      "assistant",
      "Thinking..."
    );

    // Process the streaming response
    const responseData = await ProviderAPI.processStreamingResponse(
      currentProvider,
      response,
      (text, toolCallsData) => {
        // Update tool calls if provided
        if (toolCallsData) {
          toolCalls = toolCallsData;
        }
        // Clear previous content and set new content
        assistantMessageElement.innerHTML = "";
        const textDiv = document.createElement("div");
        textDiv.classList.add("message-text");
        textDiv.innerHTML = Utilities.formatMessage(text);
        assistantMessageElement.appendChild(textDiv);
        scrollToBottom(true);
      }
    );

    // Extract text and toolCalls from response data
    if (typeof responseData === "object" && responseData !== null) {
      assistantResponse = responseData.text || "";
      if (responseData.toolCalls) {
        toolCalls = responseData.toolCalls;
      }
    } else {
      assistantResponse = responseData;
    }

    // Final scroll and update
    assistantMessageElement.innerHTML = "";
    const textDiv = document.createElement("div");
    textDiv.classList.add("message-text");
    textDiv.innerHTML = Utilities.formatMessage(assistantResponse);
    assistantMessageElement.appendChild(textDiv);
    scrollToBottom(false);

    // If there are tool calls, we need to handle them
    if (toolCalls && toolCalls.length > 0) {
      // Store the tool calls in the conversation history
      Chat.appendToConversationHistory(
        "assistant",
        assistantResponse,
        null,
        toolCalls
      );

      // Here you would process the tool calls and send the results back to the model
      handleToolCalls(toolCalls, currentModel, conversationHistory);
    } else {
      // Standard response without tool calls
      Chat.appendToConversationHistory("assistant", assistantResponse);
    }
  } catch (error) {
    const errorInfo =
      error.isApiError || error.isNetworkError
        ? error
        : ErrorHandler.handleNetworkError(error, "chat submission");

    ErrorHandler.displayErrorMessage(errorInfo, Chat.addMessageToChat);
  } finally {
    Chat.setChatController(null);
    elements.input.focus();
  }
};

// Handle tool calls by executing functions and sending results back to the model
export const handleToolCalls = async (
  toolCalls,
  currentModel,
  conversationHistory
) => {
  for (const toolCall of toolCalls) {
    const { function: func } = toolCall;

    // Add a message to indicate we're processing the tool call
    Chat.addMessageToChat("system", `Processing tool call: ${func.name}...`);

    // Execute tool function
    let toolResult;
    try {
      toolResult = await simulateToolExecution(func);

      // Display the tool result
      Chat.addMessageToChat(
        "system",
        `Tool result: ${JSON.stringify(toolResult, null, 2)}`
      );

      // Add the tool result to the conversation history
      Chat.appendToConversationHistory(
        "tool",
        JSON.stringify(toolResult),
        null,
        {
          tool_call_id: toolCall.id || "unknown",
          name: func.name,
        }
      );

      // Send the tool result back to the model for a follow-up response
      await sendToolResultToModel(
        toolCall,
        toolResult,
        currentModel,
        conversationHistory
      );
    } catch (error) {
      Chat.addMessageToChat("error", `Error executing tool: ${error.message}`);
    }
  }
};

// Send tool results back to the model for a follow-up response
export const sendToolResultToModel = async (
  toolCall,
  toolResult,
  currentModel,
  conversationHistory
) => {
  try {
    // Create a new controller for this request
    Chat.abortCurrentChat();
    Chat.setChatController(new AbortController());

    // Format the tool response correctly for the API
    const toolResponse = {
      role: "tool",
      tool_call_id: toolCall.id || "unknown",
      name: toolCall.function.name,
      content: JSON.stringify(toolResult),
    };

    // Create a copy of the conversation history with the tool response added
    const updatedConversationHistory = [...conversationHistory, toolResponse];

    // Add a loading message to the UI while we wait for the response
    const assistantMessageElement = Chat.addMessageToChat(
      "assistant",
      "Thinking..."
    );

    // Make the API request
    const response = await fetch(`${Config.getConfig().apiEndpoint}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: currentModel,
        messages: updatedConversationHistory,
      }),
      signal: Chat.getChatController().signal,
    });

    if (!response.ok) {
      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        // Ignore JSON parsing errors
      }
      throw ErrorHandler.handleApiError(response.status, data);
    }

    // Process the streaming response
    const scrollToBottom = Utilities.createScrollToBottom();
    let followUpResponse = "";
    let followUpToolCalls = null;

    // Process the response
    const responseData = await ProviderAPI.processStreamingResponse(
      "ollama", // Always ollama for tool responses
      response,
      (text, toolCallsData) => {
        // Update follow-up tool calls if provided
        if (toolCallsData) {
          followUpToolCalls = toolCallsData;
        }

        // Clear previous content and set new content
        assistantMessageElement.innerHTML = "";
        const textDiv = document.createElement("div");
        textDiv.classList.add("message-text");
        textDiv.innerHTML = Utilities.formatMessage(text);
        assistantMessageElement.appendChild(textDiv);
        scrollToBottom(true);
      }
    );

    // Extract text and toolCalls from response data
    if (typeof responseData === "object" && responseData !== null) {
      followUpResponse = responseData.text || "";
      if (responseData.toolCalls) {
        followUpToolCalls = responseData.toolCalls;
      }
    } else {
      followUpResponse = responseData;
    }

    // Final scroll and update
    assistantMessageElement.innerHTML = "";
    const textDiv = document.createElement("div");
    textDiv.classList.add("message-text");
    textDiv.innerHTML = Utilities.formatMessage(followUpResponse);
    assistantMessageElement.appendChild(textDiv);
    scrollToBottom(false);

    // Add the follow-up response to conversation history
    if (followUpToolCalls && followUpToolCalls.length > 0) {
      // If there are new tool calls in the follow-up, handle them
      Chat.appendToConversationHistory(
        "assistant",
        followUpResponse,
        null,
        followUpToolCalls
      );
      handleToolCalls(
        followUpToolCalls,
        currentModel,
        updatedConversationHistory
      );
    } else {
      // Standard response without new tool calls
      Chat.appendToConversationHistory("assistant", followUpResponse);
    }
  } catch (error) {
    const errorInfo =
      error.isApiError || error.isNetworkError
        ? error
        : ErrorHandler.handleNetworkError(error, "tool response processing");

    ErrorHandler.displayErrorMessage(errorInfo, Chat.addMessageToChat);
  } finally {
    Chat.setChatController(null);
  }
};

// Execute tool function
export const simulateToolExecution = async (func) => {
  try {
    // Use the Tools module implementation if available (via global bridge)
    if (
      window.Tools &&
      typeof window.Tools.executeToolFunction === "function"
    ) {
      return await window.Tools.executeToolFunction(func);
    }

    // Fallback implementation if Tools module is not available
    const { name, arguments: args } = func;
    let parsedArgs = typeof args === "string" ? JSON.parse(args) : args;

    if (name === "flip_coin") {
      const numFlips = parsedArgs?.flips || 1;
      const results = [];
      for (let i = 0; i < numFlips; i++) {
        results.push(Math.random() < 0.5 ? "heads" : "tails");
      }
      return {
        status: "success",
        flips: numFlips,
        results: results,
      };
    }

    throw new Error(`Unknown function: ${name}`);
  } catch (error) {
    console.error("Error executing tool function:", error);
    throw error;
  }
};

export default {
  handleSubmit,
  handleToolCalls,
  sendToolResultToModel,
  simulateToolExecution,
};
