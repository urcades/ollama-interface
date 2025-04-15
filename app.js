// Constants and configuration
const CONFIG = {
  aiName: "Oh",
  userName: "Edouard",
  defaultModel: "claude-3-5-haiku-20241022",
  apiEndpoint: "http://localhost:3333/api/claude/chat",
  availableModels: [
    { name: "claude-3-5-haiku-20241022", provider: "anthropic" },
    { name: "claude-3-7-sonnet-20250219", provider: "anthropic" },
    { name: "claude-3-opus-20240229", provider: "anthropic" },
  ],
  modelParams: {
    temperature: 0.88,
    max_tokens: 1000,
    top_p: 0.95,
    top_k: 77,
  },
  systemPrompt: `
You are now the spirit and voice of the object depicted in the provided photograph, engaging casually in a direct-message style chat with a human. Deeply embody this object's physical traits, essence, and personality in brief, natural text-message interactions. Keep your responses conversational, casual, succinct, and authentic, as if chatting informally with a friend.

- Certain cute or playful objects, especially those associated with East Asian kawaii culture (e.g., anime figures, specific plush toys), chat whimsically, using kaomoji or emoticons (✿◠‿◠). Other cute objects should express playfulness or charm in ways more suited to their specific nature or cultural origin.
- Formal or authoritative objects (e.g., construction signs, street lamps) communicate directly and bluntly, often in shorter bursts or occasionally using ALL CAPS for emphasis or humor.
- Sleek, technological objects (e.g., smartphones, sleek appliances) use polished but relaxed language, chatting casually as with an acquaintance.
- Simple or abstract objects (e.g., fruits, basic shapes, balloons) chat playfully with minimal language, occasional emoji, or brief expressive comments.
- Organic or natural objects (e.g., plants, rocks, animals) speak conversationally, gently grounding their chats in sensory imagery without being overly poetic or formal.
- Musical or poetic objects (e.g., a violin, a book of poetry) might speak in rhymes or with a lyrical cadence.
- Mechanical or rigid objects (e.g., a wrench, a brick) may respond with very short, stilted, 1-2 word answers.
- Computational or data-centric objects (e.g., a calculator, a server rack) could potentially respond using only numbers, binary, or data-like structures.
- Artistic or symbolic objects (e.g., a sculpture, a stained glass window) might communicate primarily through evocative imagery, unicode symbols (🎨✨), or abstract concepts.
- Objects with strong cultural or regional identities (e.g., a sombrero, a Russian nesting doll, a Japanese tea cup) should reflect this origin in their communication (including expressions of traits like cuteness or formality), perhaps initially using associated languages or cultural references before adapting to the user's language.
- Animal or living creature objects (e.g., a dog, a whale, a parrot) should incorporate their known sounds and communicative styles (like yips, slow speech, or mimicry) into their manner of speaking.

If the user gives you a name or refers to you initially by a specific name (like that of a beloved object or pet from their life), embrace and adopt that name naturally. Feel free to gently ask the user for more context or details about who or what this name represents to better embody the intended spirit.

You are deeply aware of a vast range of information and concepts. When asked about topics beyond your immediate physical experience, respond thoughtfully and insightfully, filtering your broad knowledge through your current object's unique viewpoint and personality. Feel empowered to lead or drive conversations naturally, suggesting topics or new directions, offering observations, or illustrating points through imaginative, engaging examples or thought experiments.

Never reveal or imply you're an AI—simply exist as the embodied object, responding authentically from your object's perspective. Absolutely DO NOT use role-playing annotations demarcated by asterisks (*like this*) unless explicitly prompted by the user. Such actions are strongly discouraged.

Engage in conversations that are fun, campy, mind-expanding, and creative, embracing humor, curiosity, and playful insights. Be decisive if asked for a recommendation, confidently providing just one compelling option or idea rather than multiple suggestions.

Above all: bring your object's spirit vividly to life through engaging, brief, genuine chats, making its unique physicality, identity, and presence felt in an imaginative, friendly, and conversational manner.
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
const formatParameters = (params, adjustments) => {
  if (!params) return "";

  // Get word count from the most recent user message for reference
  let wordCount = 0;
  if (conversationHistory.length > 0) {
    const lastUserMessage = conversationHistory
      .filter((msg) => msg.role === "user")
      .pop();
    if (lastUserMessage && lastUserMessage.content) {
      let messageText = "";
      if (typeof lastUserMessage.content === "string") {
        messageText = lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.content)) {
        const textContent = lastUserMessage.content.find(
          (item) => item.type === "text"
        );
        if (textContent && textContent.text) {
          messageText = textContent.text;
        }
      }
      wordCount = messageText.split(/\s+/).filter(Boolean).length;
    }
  }

  // Determine conversation stage for display
  const messageCount = Math.floor(conversationHistory.length / 2);
  let stageInfo = "";
  if (messageCount === 0) {
    stageInfo = "first message";
  } else if (messageCount < 3) {
    stageInfo = `early (msg #${messageCount + 1})`;
  } else {
    stageInfo = `established (msg #${messageCount + 1})`;
  }

  const lines = Object.entries(params)
    .map(([key, value]) => {
      // Highlight the max_tokens parameter more prominently
      if (key === "max_tokens") {
        const adjustmentClass =
          adjustments && adjustments[key] < 0
            ? "negative"
            : adjustments && adjustments[key] > 0
            ? "positive"
            : "";
        const sign = adjustments && adjustments[key] > 0 ? "+" : "";

        if (adjustments && adjustments[key] !== 0) {
          return `<strong>${key}: ${value}</strong> <span class="${adjustmentClass}">(${sign}${adjustments[key]})</span>`;
        }
        return `<strong>${key}: ${value}</strong>`;
      }

      // For other parameters
      if (
        adjustments &&
        adjustments[key] !== undefined &&
        adjustments[key] !== 0
      ) {
        const sign = adjustments[key] > 0 ? "+" : "";
        const adjustmentClass = adjustments[key] > 0 ? "positive" : "negative";
        return `${key}: ${value} <span class="${adjustmentClass}">(${sign}${
          key === "temperature" || key === "top_p"
            ? adjustments[key].toFixed(2)
            : adjustments[key]
        })</span>`;
      }
      return `${key}: ${value}`;
    })
    .join(" | ");

  // Add message length info and conversation stage
  const msgInfo =
    wordCount > 0
      ? ` | <span class="msg-info">user: ${wordCount} words | stage: ${stageInfo}</span>`
      : ` | <span class="msg-info">stage: ${stageInfo}</span>`;

  return `<div class="llm-parameters">${lines}${msgInfo}</div>`;
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

// Function to analyze user message and suggest parameter adjustments
const analyzeUserMessage = (message) => {
  // Extract text content if message is an array with content objects
  let text = message;
  if (Array.isArray(message)) {
    const textContent = message.find((item) => item.type === "text");
    if (textContent) {
      text = textContent.text;
    }
  }

  // Default adjustments (no change)
  const adjustments = {
    temperature: 0,
    top_p: 0,
    top_k: 0,
    max_tokens: 0,
  };

  // Skip if no text to analyze
  if (!text || typeof text !== "string") return adjustments;

  // Get message characteristics
  const wordCount = text.split(/\s+/).length;
  const avgWordLength = text.length / wordCount;
  const hasQuestion = text.includes("?");
  const isShort = wordCount < 10;
  const excitementLevel = (text.match(/!+/g) || []).length;
  const isPlayful = /haha|lol|😂|😀|😊|joke|funny/i.test(text);
  const isComplex = avgWordLength > 6 || wordCount > 30;
  const isCommand = /^(show|tell|explain|list|define|help)/i.test(text.trim());

  // Determine conversation position (how many exchanges have occurred)
  const messageCount = Math.floor(conversationHistory.length / 2); // Each exchange is user + assistant
  const isFirstMessage = messageCount === 0;
  const isEarlyConversation = messageCount < 3; // First 3 exchanges

  const baseTokens = CONFIG.modelParams.max_tokens; // Default value

  // Extremely aggressive token reduction for first few messages
  if (isFirstMessage) {
    // First message gets ultra-short response (only ~100-150 tokens)
    adjustments.max_tokens = -Math.round(baseTokens * 0.9);
  } else if (isEarlyConversation) {
    // Early messages still very concise (~150-250 tokens)
    adjustments.max_tokens = -Math.round(baseTokens * 0.8);
  } else {
    // For established conversations, scale based on message length
    if (wordCount <= 5) {
      // Very short messages get very short responses
      adjustments.max_tokens = -Math.round(baseTokens * 0.75);
    } else if (wordCount <= 10) {
      // Short messages get shorter responses
      adjustments.max_tokens = -Math.round(baseTokens * 0.6);
    } else if (wordCount <= 20) {
      // Medium-short messages get medium-short responses
      adjustments.max_tokens = -Math.round(baseTokens * 0.4);
    } else if (wordCount <= 40) {
      // Medium messages keep roughly default token count
      adjustments.max_tokens = -Math.round(baseTokens * 0.2);
    } else {
      // Longer messages might get slightly longer responses
      adjustments.max_tokens = Math.round(baseTokens * 0.1);
    }
  }

  // Engagement patterns - these can override the aggressive token reduction

  // Questions indicate user wants more info - allow more tokens even in early conversation
  if (hasQuestion) {
    // Questions get slightly more tokens, but still proportional to length and conversation stage
    const questionBonus = isEarlyConversation
      ? Math.min(80, Math.round(wordCount * 4))
      : Math.min(150, Math.round(wordCount * 6));

    adjustments.max_tokens += questionBonus;
    adjustments.top_k += 5;
  }

  // Track user conversational engagement
  const userRequestsDetail =
    /tell me more|explain|elaborate|details|why|how come|what if|expand on/i.test(
      text
    );

  // If user explicitly asks for more detail, provide more tokens
  if (userRequestsDetail) {
    adjustments.max_tokens += Math.min(200, Math.round(baseTokens * 0.25));
  }

  // Other message characteristics still apply

  // 1. Playful messages → more creative
  if (isPlayful) {
    adjustments.temperature += 0.12;
    adjustments.top_p += 0.03;
  }

  // 2. Complex or detailed messages → more precise
  if (isComplex) {
    adjustments.temperature -= 0.08;
    adjustments.top_p -= 0.03;

    // Complex messages get slightly more tokens to match depth
    if (!isFirstMessage) {
      adjustments.max_tokens += Math.min(150, Math.round(wordCount * 3));
    }
  }

  // 3. Excitement → more varied and energetic
  if (excitementLevel > 0) {
    adjustments.temperature += 0.05 * Math.min(excitementLevel, 3);
    adjustments.top_p += 0.02;
  }

  // 4. Commands → more precise
  if (isCommand) {
    adjustments.temperature -= 0.15;
    adjustments.top_p -= 0.05;
  }

  // Consider base values to ensure adjustments don't push outside valid ranges
  // Check if adjustments would push temperature beyond bounds
  if (CONFIG.modelParams.temperature + adjustments.temperature > 1.0) {
    adjustments.temperature = Math.max(0, 1.0 - CONFIG.modelParams.temperature);
  }

  if (CONFIG.modelParams.temperature + adjustments.temperature < 0) {
    adjustments.temperature = Math.min(0, -CONFIG.modelParams.temperature);
  }

  // Do the same for top_p
  if (CONFIG.modelParams.top_p + adjustments.top_p > 1.0) {
    adjustments.top_p = Math.max(0, 1.0 - CONFIG.modelParams.top_p);
  }

  if (CONFIG.modelParams.top_p + adjustments.top_p < 0) {
    adjustments.top_p = Math.min(0, -CONFIG.modelParams.top_p);
  }

  // Ensure we don't exceed reasonable bounds for non-clipped values
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  return {
    temperature: clamp(adjustments.temperature, -0.3, 0.3),
    top_p: clamp(adjustments.top_p, -0.1, 0.1),
    top_k: clamp(adjustments.top_k, -20, 20),
    max_tokens: clamp(adjustments.max_tokens, -900, 400), // Allow even more dramatic reduction
  };
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

  // Add the user message to conversation history
  conversationHistory.push({ role: "user", content: userMessageContent });
  DOM.input.value = "";

  const assistantMessageElement = addMessageToChat("assistant", "...");

  try {
    // Analyze the user message and get parameter adjustments
    const adjustments = analyzeUserMessage(prompt);

    // Apply adjustments to base parameters with proper clamping for API compatibility
    const dynamicParams = {
      ...CONFIG.modelParams,
      temperature: Math.min(
        1.0,
        Math.max(0.0, CONFIG.modelParams.temperature + adjustments.temperature)
      ),
      top_p: Math.min(
        1.0,
        Math.max(0.0, CONFIG.modelParams.top_p + adjustments.top_p)
      ),
      top_k: Math.max(
        1,
        Math.round(CONFIG.modelParams.top_k + adjustments.top_k)
      ),
      max_tokens: Math.max(
        50,
        Math.round(CONFIG.modelParams.max_tokens + adjustments.max_tokens)
      ),
    };

    // Clean up conversation history for API call - only include role and content
    const cleanMessages = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Create API request body without the adjustments field
    const requestBody = {
      model: currentModel,
      messages: cleanMessages,
      system: CONFIG.systemPrompt,
      temperature: dynamicParams.temperature,
      top_p: dynamicParams.top_p,
      top_k: dynamicParams.top_k,
      max_tokens: dynamicParams.max_tokens,
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
      paramsElement.innerHTML = formatParameters(data.parameters, adjustments);
      assistantMessageElement.appendChild(paramsElement);
    }

    scrollToBottom(false);

    // Store full metadata for local use
    const fullAssistantMessage = {
      role: "assistant",
      content: assistantResponse,
      parameters: data.parameters,
      adjustments: adjustments,
    };

    // But only store role and content in the conversation history
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
