import * as Config from "../config/config.js";
import * as DOM from "./dom.js";

const config = Config.getConfig();
const elements = DOM.getElements();

let currentModel = config.defaultModel;
let currentProvider = "ollama";
let availableModels = [...config.availableModels]; // Initialize with config models
let modelMetadata = {}; // Store model metadata

export const getCurrentModel = () => currentModel;
export const getCurrentProvider = () => currentProvider;

export const setCurrentModel = (model) => {
  currentModel = model;
  updatePlaceholder();
};

export const setCurrentProvider = (provider) => {
  currentProvider = provider;
};

export const getAvailableModels = () => availableModels;
export const getModelMetadata = (modelName) => modelMetadata[modelName] || null;

export const updatePlaceholder = () => {
  if (elements.input) {
    elements.input.placeholder = `Send a message to ${currentModel}`;
  }
};

export const validateAndSetModel = (model, provider) => {
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

export const fetchModelMetadata = async (modelName) => {
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

export const hasCapability = (modelName, capability) => {
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

export const fetchAvailableModels = async () => {
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

        return `<option value="${model.name}" data-provider="${model.provider}" 
                  data-vision="${model.hasVision || false}" 
                  data-tooluse="${model.hasToolUse || false}">
                  ${model.name} (${model.provider})${capabilitiesText}
                  </option>`;
      })
      .join("");

    if (elements.modelSelector) {
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
    }
  } catch (error) {
    console.error("Error fetching models:", error);
    // Fallback to fixed models from CONFIG
    availableModels = [...config.availableModels];

    if (elements.modelSelector) {
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
  }
};

export default {
  getCurrentModel,
  getCurrentProvider,
  setCurrentModel,
  setCurrentProvider,
  getAvailableModels,
  getModelMetadata,
  hasCapability,
  validateAndSetModel,
  updatePlaceholder,
  fetchAvailableModels,
};
