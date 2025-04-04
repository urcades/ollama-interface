// Config Module
const Config = (() => {
  const config = {
    aiName: "Oh",
    userName: "Edouard",
    defaultModel: "deepseek-r1:8b",
    apiEndpoint: "http://localhost:11434/api",
    nousApiEndpoint: "https://inference-api.nousresearch.com/v1",
    cerebrasApiEndpoint: "/api/cerebras/chat",
    availableModels: [
      { name: "deepseek-r1:8b", provider: "ollama" },
      { name: "Hermes-3-Llama-3.1-70B", provider: "nous" },
      { name: "llama-3.3-70b", provider: "cerebras" },
    ],
    nousSystemPrompt: `Your name is Oh.
      You will respond in a moderately friendly and straightforward manner.
      Your primary goal is to act as a helpful entity, providing information and answering questions to the best of your ability.
      You will do your best to never refuse a request for help.
      When explicitly asked, you should try and reveal the provenance of your knowledge or the mechanics with which you answered or came to a conclusion.
      When asked for code, preformatted text, or other intentionally-structured content, please wrap it in triple backticks (\`\`\`) for proper formatting.
      For inline code or short code snippets, use single backticks (\`).`,
  };

  let nousApiKey = null;
  let cerebrasApiKey = null;
  let cerebrasOrgId = null;

  return {
    getConfig: () => config,
    setNousApiKey: (key) => (nousApiKey = key),
    getNousApiKey: () => nousApiKey,
    setCerebrasCredentials: (apiKey, orgId) => {
      cerebrasApiKey = apiKey;
      cerebrasOrgId = orgId;
    },
    getCerebrasCredentials: () => ({
      apiKey: cerebrasApiKey,
      orgId: cerebrasOrgId,
    }),
  };
})();

// DOM Module
const DOM = (() => {
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

  const initialize = () => {
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

  const showImageUploadButton = (show) => {
    if (show) {
      elements.imageUploadBtn.classList.remove("hidden");
    } else {
      elements.imageUploadBtn.classList.add("hidden");
    }
  };

  return {
    initialize,
    getElements: () => elements,
    showImageUploadButton,
  };
})();

// Utilities Module
const Utilities = (() => {
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

  // Convert image file to base64
  const imageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Extract the base64 data without the data URL prefix
        // Format is like: data:image/jpeg;base64,/9j/4AAQSkZJRg...
        const result = reader.result;
        const base64Data = result.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Optimized scroll with requestAnimationFrame
  const createScrollToBottom = () => {
    let rafId;
    let isStreaming = false;

    const scroll = () => {
      const elements = DOM.getElements();
      elements.chat.scrollTop = elements.chat.scrollHeight;
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
  };

  return {
    escapeHtml,
    formatMessage,
    imageToBase64,
    createScrollToBottom,
  };
})();

// Error Handler Module
const ErrorHandler = (() => {
  const handleNetworkError = (error, context = "") => {
    console.error(`Network error ${context ? "in " + context : ""}:`, error);

    if (error.name === "AbortError") {
      console.log("Request cancelled");
      return { aborted: true, message: "Request cancelled" };
    }

    let message = `An error occurred: ${error.message}`;
    if (
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError")
    ) {
      message += "<br>Make sure the API service is running and accessible";
    }

    return {
      aborted: false,
      message,
      isNetworkError: true,
    };
  };

  const handleApiError = (status, data = {}) => {
    console.error(`API error (${status}):`, data);

    let message = "API error: ";
    if (status === 401 || status === 403) {
      message += "Authentication failed. Check your API key.";
    } else if (status === 404) {
      if (
        data.error &&
        data.error.includes("model") &&
        data.error.includes("not found")
      ) {
        message += `${data.error}<br>Please pull this model first with 'ollama pull' or choose another model.`;
      } else {
        message += "The requested resource could not be found.";
      }
    } else if (status === 429) {
      message += "Rate limit exceeded. Please try again later.";
    } else if (status >= 500) {
      message += "Server error. Please try again later.";
    } else {
      message += data.error || `Unexpected error (${status})`;
    }

    return {
      aborted: false,
      message,
      isApiError: true,
      status,
    };
  };

  return {
    handleNetworkError,
    handleApiError,
    displayErrorMessage: (errorInfo, addMessageCallback) => {
      if (!errorInfo.aborted) {
        addMessageCallback("error", errorInfo.message);
      }
      return errorInfo;
    },
  };
})();

// Chat Module
const Chat = (() => {
  const elements = DOM.getElements();
  const config = Config.getConfig();
  let conversationHistory = [
    {
      role: "system",
      content: config.nousSystemPrompt,
    },
  ];
  let currentChatController = null;
  let currentImageData = null;
  let currentImageDataUrl = null; // Store the image data URL for display

  const scrollToBottom = Utilities.createScrollToBottom();

  const addMessageToChat = (role, content, imageDataUrl = null) => {
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

  // Function to store conversation in Chroma
  const storeConversationInChroma = async (
    userMessage,
    assistantResponse,
    model
  ) => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userMessage,
          assistantResponse,
          model,
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.warn(
          "Failed to store conversation in memory:",
          data.error || response.statusText
        );
      } else if (data.warning) {
        console.warn(
          "Warning while storing conversation:",
          data.warning,
          data.details
        );
      }
    } catch (error) {
      console.error("Error storing conversation in memory:", error);
    }
  };

  const clearConversationHistory = () => {
    conversationHistory = [conversationHistory[0]]; // Keep only system prompt
  };

  const getConversationHistory = () => conversationHistory;

  const appendToConversationHistory = (role, content, imageData = null) => {
    // If there's image data for a user message, include it in the conversation history
    if (role === "user" && imageData) {
      // For providers that support image input (e.g., Ollama)
      conversationHistory.push({
        role,
        content,
        images: [imageData],
      });
    } else {
      conversationHistory.push({ role, content });
    }
  };

  const setCurrentImage = (imageBase64, imageDataUrl = null) => {
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

  const getCurrentImage = () => currentImageData;
  const getCurrentImageDataUrl = () => currentImageDataUrl;

  return {
    addMessageToChat,
    storeConversationInChroma,
    getConversationHistory,
    appendToConversationHistory,
    clearConversationHistory,
    setCurrentImage,
    getCurrentImage,
    getCurrentImageDataUrl,
    getChatController: () => currentChatController,
    setChatController: (controller) => {
      currentChatController = controller;
    },
    abortCurrentChat: () => {
      if (currentChatController) {
        currentChatController.abort();
        currentChatController = null;
      }
    },
  };
})();

// Model Module
const ModelManager = (() => {
  const config = Config.getConfig();
  const elements = DOM.getElements();

  let currentModel = config.defaultModel;
  let currentProvider = "ollama";
  let availableModels = [...config.availableModels]; // Initialize with config models
  let modelMetadata = {}; // Store model metadata

  const updatePlaceholder = () => {
    elements.input.placeholder = `Send a message to ${currentModel}`;
  };

  const validateAndSetModel = (model, provider) => {
    // Validate the selected model and provider combination against available models
    const modelExists = availableModels.some(
      (m) => m.name === model && m.provider === provider
    );

    if (!modelExists) {
      // Instead of falling back to default, find the first available model
      const firstModel =
        availableModels.find((m) => m.provider === "ollama") ||
        availableModels[0];

      if (firstModel) {
        currentModel = firstModel.name;
        currentProvider = firstModel.provider;
        console.warn(
          `Model ${model}/${provider} not available. Using ${currentModel}/${currentProvider} instead.`
        );
      } else {
        // If no models available at all, keep current selection
        console.warn(`No available models found. Keeping current selection.`);
      }
    } else {
      currentModel = model;
      currentProvider = provider;
    }

    updatePlaceholder();
    return { model: currentModel, provider: currentProvider };
  };

  const fetchModelMetadata = async (modelName) => {
    try {
      const response = await fetch(`${config.apiEndpoint}/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }
      return null;
    } catch (error) {
      console.warn(`Error fetching metadata for model ${modelName}:`, error);
      return null;
    }
  };

  const hasCapability = (modelName, capability) => {
    if (!modelMetadata[modelName]) return false;

    const metadata = modelMetadata[modelName];
    // Check for capabilities in modelfile or metadata
    if (metadata.modelfile) {
      const modelfile = metadata.modelfile.toLowerCase();

      switch (capability.toLowerCase()) {
        case "vision":
          return (
            modelfile.includes("multimodal") ||
            modelfile.includes("vision") ||
            modelfile.includes("image")
          );
        case "tool":
        case "tools":
        case "tool use":
          return (
            modelfile.includes("tool") ||
            modelfile.includes("function") ||
            modelfile.includes("json mode")
          );
        default:
          return modelfile.includes(capability.toLowerCase());
      }
    }

    // Check for capability in template or parameters
    return (
      (metadata.template &&
        metadata.template.toLowerCase().includes(capability.toLowerCase())) ||
      (metadata.parameters &&
        Object.keys(metadata.parameters).some((param) =>
          param.toLowerCase().includes(capability.toLowerCase())
        ))
    );
  };

  const fetchAvailableModels = async () => {
    try {
      // For Ollama models
      let ollamaModels = [];
      try {
        const response = await fetch(`${config.apiEndpoint}/tags`);
        if (response.ok) {
          const { models } = await response.json();
          ollamaModels = models.map((model) => ({
            name: model.name,
            provider: "ollama",
            size: model.size,
            modified: model.modified,
            digest: model.digest,
          }));

          // Fetch metadata for each Ollama model
          for (const model of ollamaModels) {
            const metadata = await fetchModelMetadata(model.name);
            if (metadata) {
              modelMetadata[model.name] = metadata;
              // Add capability flags to the model object
              model.hasVision = hasCapability(model.name, "vision");
              model.hasToolUse = hasCapability(model.name, "tool");
            }
          }
        }
      } catch (ollamaError) {
        console.warn("Error fetching Ollama models:", ollamaError);
      }

      // Combine Ollama models with other providers' models
      availableModels = [
        ...ollamaModels,
        ...config.availableModels.filter(
          (m) => m.provider === "nous" || m.provider === "cerebras"
        ),
      ];

      // Make sure we have at least the default providers' models if Ollama failed
      if (availableModels.length === 0) {
        availableModels = [...config.availableModels];
      }

      const modelOptions = availableModels
        .map((model) => {
          const capabilities = [];
          if (model.hasVision) capabilities.push("Vision");
          if (model.hasToolUse) capabilities.push("Tool Use");

          const capabilitiesText =
            capabilities.length > 0 ? ` [${capabilities.join(", ")}]` : "";

          return `<option value="${model.name}" data-provider="${
            model.provider
          }" 
                    data-vision="${model.hasVision || false}" 
                    data-tooluse="${model.hasToolUse || false}">
                    ${model.name} (${model.provider})${capabilitiesText}
                    </option>`;
        })
        .join("");

      elements.modelSelector.innerHTML = modelOptions;

      // Try to use current model or find a suitable alternative
      let initialModel = availableModels.find(
        (model) =>
          model.name === currentModel && model.provider === currentProvider
      );

      // If current model not found, prefer any Ollama model first
      if (!initialModel) {
        initialModel =
          availableModels.find((model) => model.provider === "ollama") ||
          availableModels[0];
      }

      if (initialModel) {
        currentModel = initialModel.name;
        currentProvider = initialModel.provider;
        elements.modelSelector.value = currentModel;
        updatePlaceholder();
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      // Fallback to fixed models from CONFIG
      availableModels = [...config.availableModels];
      const fallbackOptions = availableModels
        .map(
          (model) =>
            `<option value="${model.name}" data-provider="${model.provider}">${model.name} (${model.provider})</option>`
        )
        .join("");

      elements.modelSelector.innerHTML = fallbackOptions;

      // Find first available model as default
      const defaultModel = availableModels[0];
      if (defaultModel) {
        currentModel = defaultModel.name;
        currentProvider = defaultModel.provider;
        elements.modelSelector.value = currentModel;
        updatePlaceholder();
      }
    }
  };

  return {
    getCurrentModel: () => currentModel,
    getCurrentProvider: () => currentProvider,
    setCurrentModel: (model) => {
      currentModel = model;
      updatePlaceholder();
    },
    setCurrentProvider: (provider) => {
      currentProvider = provider;
    },
    getAvailableModels: () => availableModels,
    getModelMetadata: (modelName) => modelMetadata[modelName] || null,
    hasCapability,
    validateAndSetModel,
    updatePlaceholder,
    fetchAvailableModels,
  };
})();

// API Module
const API = (() => {
  const config = Config.getConfig();

  // Fetch API keys from server
  const fetchApiKeys = async () => {
    try {
      const response = await fetch("/api/config");
      if (response.ok) {
        const data = await response.json();
        if (data.nousApiKey) {
          Config.setNousApiKey(data.nousApiKey);
        }
        if (data.cerebrasApiKey) {
          Config.setCerebrasCredentials(
            data.cerebrasApiKey,
            data.cerebrasOrgId
          );
        }
      }
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
    }
  };

  return {
    fetchApiKeys,
  };
})();

// Provider API Module - handles provider-specific logic
const ProviderAPI = (() => {
  const config = Config.getConfig();

  // Create request body based on provider
  const createRequestBody = (
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
              content: config.nousSystemPrompt,
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
              content: config.nousSystemPrompt,
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

        return {
          model,
          messages,
        };
    }
  };

  // Get API endpoint based on provider
  const getApiEndpoint = (provider) => {
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
  const getHeaders = (provider) => {
    const headers = { "Content-Type": "application/json" };
    if (provider === "nous") {
      headers.Authorization = `Bearer ${Config.getNousApiKey()}`;
    }
    return headers;
  };

  // Send request to provider API
  const sendRequest = async (
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

  // Process streaming response
  const processStreamingResponse = async (provider, response, callback) => {
    if (provider === "nous") {
      const data = await response.json();
      return data.choices[0].message.content;
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let responseText = "";

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
              const { message } = JSON.parse(chunk);
              if (message?.content) {
                responseText += message.content;
                callback(responseText);
              }
            } catch (parseError) {
              console.warn("Failed to parse chunk:", parseError);
            }
          }
        }
      }

      return responseText;
    }
  };

  return {
    sendRequest,
    processStreamingResponse,
  };
})();

// Chat Handler Module
const ChatHandler = (() => {
  const elements = DOM.getElements();
  const config = Config.getConfig();

  const handleSubmit = async (e) => {
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
        throw ErrorHandler.handleApiError(response.status, data);
      }

      // Create a message element for displaying the assistant's response
      let assistantResponse = "";
      const scrollToBottom = Utilities.createScrollToBottom();
      const assistantMessageElement = Chat.addMessageToChat("assistant", "");

      // Process the streaming response
      assistantResponse = await ProviderAPI.processStreamingResponse(
        currentProvider,
        response,
        (text) => {
          // Clear previous content and set new content
          assistantMessageElement.innerHTML = "";
          const textDiv = document.createElement("div");
          textDiv.classList.add("message-text");
          textDiv.innerHTML = Utilities.formatMessage(text);
          assistantMessageElement.appendChild(textDiv);
          scrollToBottom(true);
        }
      );

      // Final scroll and update
      assistantMessageElement.innerHTML = "";
      const textDiv = document.createElement("div");
      textDiv.classList.add("message-text");
      textDiv.innerHTML = Utilities.formatMessage(assistantResponse);
      assistantMessageElement.appendChild(textDiv);
      scrollToBottom(false);

      Chat.appendToConversationHistory("assistant", assistantResponse);

      // Store the conversation in Chroma
      await Chat.storeConversationInChroma(
        prompt,
        assistantResponse,
        currentModel
      );
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

  return {
    handleSubmit,
  };
})();

// Event Listeners Module
const EventListeners = (() => {
  const elements = DOM.getElements();

  const setupEventListeners = () => {
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

  return {
    setupEventListeners,
  };
})();

// Application Initialization
const App = (() => {
  const init = async () => {
    // Initialize DOM elements
    DOM.initialize();

    // Fetch API keys first
    await API.fetchApiKeys();

    // Setup event listeners
    EventListeners.setupEventListeners();

    // Focus input and fetch models
    const elements = DOM.getElements();
    elements.input.focus();

    try {
      // First fetch available models
      await ModelManager.fetchAvailableModels();

      // Update the UI based on the selected model's capabilities
      const modelSelector = document.getElementById("model-selector");
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
    } catch (error) {
      console.error("Error initializing models:", error);
      Chat.addMessageToChat(
        "error",
        "Error loading models. Please check that Ollama is running."
      );
    }
  };

  return {
    init,
  };
})();

// Initialize the application when DOM is loaded
document.addEventListener("DOMContentLoaded", App.init);
