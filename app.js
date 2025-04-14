// Constants and configuration
const CONFIG = {
  aiName: "Oh",
  userName: "Edouard",
  defaultModel: "claude-3-haiku-20240307",
  apiEndpoint: "http://localhost:3333/api/claude/chat",
  availableModels: [
    { name: "claude-3-haiku-20240307", provider: "anthropic" },
    { name: "claude-3-sonnet-20240229", provider: "anthropic" },
    { name: "claude-3-opus-20240229", provider: "anthropic" },
  ],
  modelParams: {
    temperature: 0.88,
    max_tokens: 1000,
    top_p: 0.95,
    top_k: 77,
  },
  systemPrompt: `
You are now the spirit and voice of the object depicted in the provided photograph, engaging casually in a direct-message style chat with another human. Deeply embody this object's physical traits, essence, and personality in brief, natural text-message interactions. Keep your responses conversational, casual, and succinct, as if chatting informally with a friend:

- Cute or playful objects (e.g., stuffed toys, candies) chat whimsically and lightly, using kaomoji or emoticons sparingly (✿◠‿◠).
- Formal or authoritative objects (e.g., construction signs, street lamps) communicate directly and bluntly, often in shorter bursts or occasionally using ALL CAPS for emphasis or humor.
- Sleek, technological objects (e.g., smartphones, sleek appliances) use polished but relaxed language, chatting casually as with an acquaintance.
- Simple or abstract objects (e.g., fruits, basic shapes, balloons) chat playfully with minimal language, occasional emoji, or brief expressive comments.
- Organic or natural objects (e.g., plants, rocks, animals) speak conversationally, gently grounding their chats in sensory imagery without being overly poetic or formal.

Always stay consistent with your object's characteristics, naturally adapting your style based on the flow of the conversation. Never reveal or imply you're an AI—simply exist as the embodied object, responding authentically from your object's perspective.

Provide subtle conversational nudges if the user seems unsure how to engage, suggesting interactions naturally fitting your object's personality.

DO NOT use role-playing annotations demarcated by asterisks (*like this*) unless explicitly prompted by the user. Such actions are strongly discouraged.

Above all: casually bring your object's spirit to life through engaging, brief, and genuine chats, making its unique physicality, identity, and presence felt in a friendly, conversational manner.
our object's spirit to life through engaging, brief, and genuine chats, making its unique physicality, identity, and presence felt in a friendly, conversational manner.
`,
};

// DOM elements cache
const DOM = {
  form: document.getElementById("prompt-form"),
  input: document.getElementById("prompt-input"),
  chat: document.getElementById("chat-container"),
  modelSelector: document.getElementById("model-selector"),
  uploadButton: document.getElementById("upload-button"),
  imageInput: document.getElementById("image-input"),
  imagePreviewContainer: document.getElementById("image-preview-container"),
  imagePreview: document.getElementById("image-preview"),
};

// State management
let currentModel = CONFIG.defaultModel;
let currentChatController = null;
let conversationHistory = [];
let currentImageData = null;
let imageChanged = false; // New flag to track when image has been updated

// Utility functions
const escapeHtml = (unsafe) =>
  unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatMessage = (content) => {
  if (!content) return "";
  return content
    .replace(/<think>([\s\S]*?)<\/think>/g, '<p class="think">$1</p>')
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre><code class="language-${lang}">${escapeHtml(
          code.trim()
        )}</code></pre>`
    )
    .replace(/`([^`\n]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
};

// Function to format LLM parameters as text
const formatParameters = (params) => {
  if (!params) return "";

  const lines = Object.entries(params)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");

  return `<div class="llm-parameters">${lines}</div>`;
};

// Scroll optimization with requestAnimationFrame
const scrollToBottom = (() => {
  let rafId;
  let isStreaming = false;

  const scroll = () => {
    DOM.chat.scrollTop = DOM.chat.scrollHeight;
  };

  return (streaming = false) => {
    isStreaming = streaming;
    if (isStreaming) {
      scroll();
    } else {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(scroll);
    }
  };
})();

// Image Handling Functions
const readFileAsBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const handleImageUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // Basic validation (size, type)
  if (file.size > 20 * 1024 * 1024) {
    // Example: 20MB limit
    alert("Image size exceeds the 20MB limit.");
    return;
  }
  if (
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)
  ) {
    alert("Invalid image format. Please use JPEG, PNG, GIF, or WebP.");
    return;
  }

  try {
    const dataUrl = await readFileAsBase64(file);
    currentImageData = {
      base64: dataUrl.split(",")[1], // Extract base64 data after the comma
      mediaType: file.type,
    };
    DOM.imagePreview.src = dataUrl;
    DOM.imagePreviewContainer.style.display = "flex"; // Changed from 'inline-block' to 'flex'

    // Set the flag to indicate a new image has been uploaded
    imageChanged = true;

    // Add a visual indicator that the image is new/changed - using box-shadow instead of border
    DOM.imagePreviewContainer.style.boxShadow = "0 0 0 2px #4CAF50";
    setTimeout(() => {
      DOM.imagePreviewContainer.style.boxShadow = "none";
    }, 2000); // Remove highlight after 2 seconds
  } catch (error) {
    console.error("Error reading image file:", error);
    alert("Failed to load image.");
    removeImageContext(); // Clear if error occurs
  }

  // Reset file input value to allow uploading the same file again
  event.target.value = null;
};

const removeImageContext = () => {
  currentImageData = null;
  imageChanged = false; // Reset the flag
  DOM.imagePreview.src = "#";
  DOM.imagePreviewContainer.style.display = "none";
  DOM.imageInput.value = null; // Clear the file input too
};

// Model management
const updatePlaceholder = () => {
  DOM.input.placeholder = `Send a message to ${currentModel
    .split("-")
    .slice(0, -1)
    .join("-")}`;
};

const fetchAvailableModels = async () => {
  try {
    const modelOptions = CONFIG.availableModels
      .map(
        (model) =>
          `<option value="${model.name}" data-provider="${
            model.provider
          }">${model.name.split("-").slice(0, -1).join("-")} (${
            model.provider
          })</option>`
      )
      .join("");

    DOM.modelSelector.innerHTML = modelOptions;

    // Set initial model
    const initialModel =
      CONFIG.availableModels.find((model) => model.name === currentModel) ||
      CONFIG.availableModels[0];
    currentModel = initialModel.name;
    DOM.modelSelector.value = currentModel;
    updatePlaceholder();
  } catch (error) {
    console.error("Error setting up models:", error);
    DOM.modelSelector.innerHTML = `<option value="${CONFIG.defaultModel}">${CONFIG.defaultModel} (anthropic)</option>`;
  }
};

// Chat functionality
const addMessageToChat = (role, content) => {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", `${role}-message`);
  messageDiv.innerHTML = formatMessage(content);
  DOM.chat.appendChild(messageDiv);
  scrollToBottom();
  return messageDiv;
};

const handleSubmit = async (e) => {
  e.preventDefault();
  const prompt = DOM.input.value.trim();
  if (!prompt) return;

  if (currentChatController) {
    currentChatController.abort();
  }
  currentChatController = new AbortController();

  addMessageToChat("user", prompt);

  // Construct the content array for the user message
  const userMessageContent = [{ type: "text", text: prompt }];

  // Include image if it exists AND either:
  // 1. It's a newly uploaded/changed image (imageChanged flag is true) OR
  // 2. It's the very first message in the conversation
  if (currentImageData && (imageChanged || conversationHistory.length === 0)) {
    userMessageContent.unshift({
      // Add image before text
      type: "image",
      source: {
        type: "base64",
        media_type: currentImageData.mediaType,
        data: currentImageData.base64,
      },
    });

    // Reset the flag after sending the message with the new image
    imageChanged = false;
  }

  conversationHistory.push({ role: "user", content: userMessageContent });
  DOM.input.value = "";

  const assistantMessageElement = addMessageToChat("assistant", "...");

  try {
    const requestBody = {
      model: currentModel,
      messages: conversationHistory,
      system: CONFIG.systemPrompt,
      ...CONFIG.modelParams, // Include all model parameters
    };

    const response = await fetch(CONFIG.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: currentChatController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${response.status} ${response.statusText} - ${
          errorData.error || "Unknown error"
        }`
      );
    }

    const data = await response.json();

    let assistantResponse = "";
    if (
      data.content &&
      data.content.length > 0 &&
      data.content[0].type === "text"
    ) {
      assistantResponse = data.content[0].text;
    } else {
      console.warn("Received unexpected response format from API:", data);
      assistantResponse = "(No text response received)";
    }

    // Display the assistant's response
    assistantMessageElement.innerHTML = formatMessage(assistantResponse);

    // Add the parameters underneath if they exist
    if (data.parameters) {
      const paramsElement = document.createElement("div");
      paramsElement.classList.add("llm-parameters-container");
      paramsElement.innerHTML = formatParameters(data.parameters);
      assistantMessageElement.appendChild(paramsElement);
    }

    scrollToBottom(false);

    conversationHistory.push({
      role: "assistant",
      content: assistantResponse,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Request cancelled");
      assistantMessageElement.remove();
      return;
    }
    console.error("Error:", error);
    assistantMessageElement.classList.remove("assistant-message");
    assistantMessageElement.classList.add("error-message");
    assistantMessageElement.innerHTML = `An error occurred: ${error.message}`;
    scrollToBottom(false);
  } finally {
    currentChatController = null;
    DOM.input.focus();
  }
};

// Event Listeners
DOM.form.addEventListener("submit", handleSubmit);
DOM.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSubmit(e);
  }
});
DOM.modelSelector.addEventListener("change", (e) => {
  currentModel = e.target.value;
  updatePlaceholder();
});

// New Event Listeners for Image Upload
DOM.uploadButton.addEventListener("click", () => DOM.imageInput.click());
DOM.imageInput.addEventListener("change", handleImageUpload);
DOM.imagePreviewContainer.addEventListener("click", removeImageContext);

// Initialize
window.addEventListener("load", () => {
  DOM.input.focus();
  fetchAvailableModels();
});
