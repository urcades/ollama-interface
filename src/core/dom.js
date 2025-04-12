const elements = {
  form: null,
  input: null,
  chat: null,
  modelSelector: null,
  imageUploadBtn: null,
  imageUploadInput: null,
  imagePreviewContainer: null,
  imagePreview: null,
  removeImageBtn: null,
};

export const initialize = () => {
  elements.form = document.getElementById("prompt-form");
  elements.input = document.getElementById("prompt-input");
  elements.chat = document.getElementById("chat-container");
  elements.modelSelector = document.getElementById("model-selector");
  elements.imageUploadBtn = document.getElementById("image-upload-btn");
  elements.imageUploadInput = document.getElementById("image-upload");
  elements.imagePreviewContainer = document.getElementById(
    "image-preview-container"
  );
  elements.imagePreview = document.getElementById("image-preview");
  elements.removeImageBtn = document.getElementById("remove-image-btn");
};

export const getElements = () => elements;

export const showImageUploadButton = (show) => {
  if (show) {
    elements.imageUploadBtn.classList.remove("hidden");
  } else {
    elements.imageUploadBtn.classList.add("hidden");
  }
};

export default {
  initialize,
  getElements,
  showImageUploadButton,
};
