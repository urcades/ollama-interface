import * as Config from "../config/config.js";
import * as DOM from "./dom.js";
import * as Utilities from "../utils/utilities.js";
import * as ModelManager from "./modelManager.js";

const elements = DOM.getElements();
const scrollToBottom = Utilities.createScrollToBottom();

let conversationHistory = [
  {
    role: "system",
    content: Config.getSystemPrompt(),
  },
];
let currentChatController = null;
let currentImageData = null;
let currentImageDataUrl = null; // Store the image data URL for display

export const addMessageToChat = (role, content, imageDataUrl = null) => {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", `${role}-message`);

  // If there's an image, add it to the message BEFORE the text
  if (imageDataUrl && role === "user") {
    const img = document.createElement("img");
    img.src = imageDataUrl;
    img.classList.add("image-attachment");
    img.alt = "Attached image";
    messageDiv.appendChild(img);
  }

  // Create a container for the text content
  const textDiv = document.createElement("div");
  textDiv.classList.add("message-text");
  textDiv.innerHTML = Utilities.formatMessage(content);
  messageDiv.appendChild(textDiv);

  elements.chat.appendChild(messageDiv);
  scrollToBottom();
  return messageDiv;
};

// Update the conversation history with the current system prompt
export const updateSystemPrompt = () => {
  // If the first message is a system message, update it
  if (
    conversationHistory.length > 0 &&
    conversationHistory[0].role === "system"
  ) {
    conversationHistory[0].content = Config.getSystemPrompt();
  } else {
    // Otherwise insert it at the beginning
    conversationHistory.unshift({
      role: "system",
      content: Config.getSystemPrompt(),
    });
  }
};

export const clearConversationHistory = () => {
  conversationHistory = [
    {
      role: "system",
      content: Config.getSystemPrompt(),
    },
  ]; // Keep only system prompt
};

export const getConversationHistory = () => conversationHistory;

export const appendToConversationHistory = (
  role,
  content,
  imageData = null,
  toolCalls = null
) => {
  // If there's image data for a user message, include it in the conversation history
  if (role === "user" && imageData) {
    // For providers that support image input (e.g., Ollama)
    conversationHistory.push({
      role,
      content,
      images: [imageData],
    });
  } else if (role === "assistant" && toolCalls) {
    // For assistant messages with tool calls
    conversationHistory.push({
      role,
      content,
      tool_calls: toolCalls,
    });
  } else if (role === "tool") {
    // For tool responses
    // Format should be: { tool_call_id: "id", name: "name" }
    if (typeof toolCalls === "object" && toolCalls !== null) {
      conversationHistory.push({
        role,
        tool_call_id: toolCalls.tool_call_id,
        name: toolCalls.name,
        content,
      });
    } else {
      console.warn("Invalid tool call data:", toolCalls);
      conversationHistory.push({ role, content });
    }
  } else {
    conversationHistory.push({ role, content });
  }
};

export const setCurrentImage = (imageBase64, imageDataUrl = null) => {
  currentImageData = imageBase64;
  currentImageDataUrl =
    imageDataUrl ||
    (imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : null);

  // Show the image preview
  if (currentImageDataUrl) {
    elements.imagePreview.src = currentImageDataUrl;
    elements.imagePreviewContainer.classList.remove("hidden");
    elements.imageUploadBtn.classList.add("hidden");
  } else {
    elements.imagePreviewContainer.classList.add("hidden");
    // Only show upload button if the current model has vision capability
    const currentModel = ModelManager.getCurrentModel();
    const hasVision = ModelManager.hasCapability(currentModel, "vision");
    if (hasVision) {
      elements.imageUploadBtn.classList.remove("hidden");
    }
  }
};

export const getCurrentImage = () => currentImageData;
export const getCurrentImageDataUrl = () => currentImageDataUrl;

export const getChatController = () => currentChatController;
export const setChatController = (controller) => {
  currentChatController = controller;
};

export const abortCurrentChat = () => {
  if (currentChatController) {
    currentChatController.abort();
    currentChatController = null;
  }
};

export default {
  addMessageToChat,
  getConversationHistory,
  appendToConversationHistory,
  clearConversationHistory,
  updateSystemPrompt,
  setCurrentImage,
  getCurrentImage,
  getCurrentImageDataUrl,
  getChatController,
  setChatController,
  abortCurrentChat,
};
