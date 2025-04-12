import * as DOM from "../core/dom.js";
import * as Chat from "../core/chat.js";
import * as ModelManager from "../core/modelManager.js";
import * as ChatHandler from "./chatHandler.js";
import * as Utilities from "../utils/utilities.js";

const elements = DOM.getElements();

export const setupEventListeners = () => {
  // Form submission
  elements.form.addEventListener("submit", ChatHandler.handleSubmit);

  // Enter key handling
  elements.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ChatHandler.handleSubmit(e);
    }
  });

  // Model selection
  elements.modelSelector.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const modelName = e.target.value;
    const provider = selectedOption.dataset.provider;
    const hasVision = selectedOption.dataset.vision === "true";

    ModelManager.validateAndSetModel(modelName, provider);

    // Show/hide the image upload button based on the selected model's capabilities
    DOM.showImageUploadButton(hasVision);
  });

  // Image upload button click
  elements.imageUploadBtn.addEventListener("click", () => {
    elements.imageUploadInput.click();
  });

  // Image file selection
  elements.imageUploadInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Store the original image data URL for preview
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result;

          // Get clean base64 for API
          const base64Data = dataUrl.split(",")[1];

          // Set both versions
          Chat.setCurrentImage(base64Data, dataUrl);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error processing image:", error);
        Chat.addMessageToChat(
          "error",
          "Failed to process the image. Please try a different image."
        );
      }
    }
  });

  // Remove image button
  elements.removeImageBtn.addEventListener("click", () => {
    Chat.setCurrentImage(null);
    elements.imageUploadInput.value = "";
  });
};

export default {
  setupEventListeners,
};
