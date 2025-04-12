// Import all modules
import * as Config from "./config/config.js";
import * as DOM from "./core/dom.js";
import * as Chat from "./core/chat.js";
import * as ModelManager from "./core/modelManager.js";
import * as ProviderAPI from "./core/providerAPI.js";
import * as API from "./core/api.js";
import * as Utilities from "./utils/utilities.js";
import * as ErrorHandler from "./utils/errorHandler.js";
import * as ChatHandler from "./handlers/chatHandler.js";
import * as EventListeners from "./handlers/eventListeners.js";

// Application Initialization
const init = async () => {
  // Initialize DOM elements
  DOM.initialize();

  // Make Config and Chat available globally for tools module to access
  // This is temporary to support transition from the monolithic app to modules
  if (typeof window !== "undefined") {
    window.Config = Config;
    window.Chat = Chat;
    window.DOM = DOM;
  }

  // Fetch API keys from server
  await API.fetchApiKeys();

  // Initialize tools module and update system prompt with tool descriptions
  let toolDescriptions = "";
  try {
    // Load tools dynamically
    const Tools = await import("./tools/index.js").then(
      (module) => module.default
    );

    if (Tools) {
      // Make the Tools module available globally for use with tool calls
      window.Tools = Tools;

      // Generate tool descriptions for the system prompt
      if (typeof Tools.generateToolDescriptions === "function") {
        toolDescriptions = Tools.generateToolDescriptions();
        console.log("Generated tool descriptions for system prompt");
      } else {
        console.warn(
          "Tools module doesn't have generateToolDescriptions function"
        );
      }

      // Alternative: use the module's updateSystemPromptWithTools function if available
      if (typeof Tools.updateSystemPromptWithTools === "function") {
        const updated = await Tools.updateSystemPromptWithTools();
        if (updated) {
          console.log("System prompt updated with tools via direct method");
        }
      }
    }
  } catch (error) {
    console.warn("Failed to load tools module:", error);
  }

  // Update system prompt with tool descriptions if available and not already updated
  if (toolDescriptions) {
    Config.updateSystemPrompt(toolDescriptions);
    // Make sure the Chat module is using the updated system prompt
    Chat.updateSystemPrompt();
    console.log("System prompt updated with tool descriptions");
  }

  // Setup event listeners
  EventListeners.setupEventListeners();

  // Focus input and fetch models
  const elements = DOM.getElements();
  elements.input.focus();

  try {
    // First fetch available models
    await ModelManager.fetchAvailableModels();

    // Update the UI based on the selected model's capabilities
    const modelSelector = elements.modelSelector;
    if (modelSelector) {
      const selectedOption = modelSelector.options[modelSelector.selectedIndex];

      if (selectedOption) {
        const hasVision = selectedOption.dataset.vision === "true";
        DOM.showImageUploadButton(hasVision);
      }

      // Add a simple indicator for model loading
      if (modelSelector.options.length > 0) {
        console.log(
          `Loaded ${modelSelector.options.length} models successfully`
        );
      } else {
        console.warn(
          "No models were loaded. Check Ollama service or connection."
        );
        Chat.addMessageToChat(
          "error",
          "No models were loaded. Please ensure Ollama is running at " +
            Config.getConfig().apiEndpoint
        );
      }
    }
  } catch (error) {
    console.error("Error initializing models:", error);
    Chat.addMessageToChat(
      "error",
      "Error loading models. Please check that Ollama is running."
    );
  }

  // Log the initial system prompt to verify it includes tool descriptions
  console.log(
    "Initial system prompt:",
    Config.getSystemPrompt().substring(0, 100) + "..."
  );
};

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", init);

// Export what might be needed in other places
export {
  Config,
  DOM,
  Chat,
  ModelManager,
  ProviderAPI,
  API,
  Utilities,
  ErrorHandler,
  ChatHandler,
  EventListeners,
};
