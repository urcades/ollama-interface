// Configuration module
const config = {
  aiName: "Oh",
  userName: "Edouard",
  defaultModel: "deepseek-r1:8b",
  apiEndpoint: "http://localhost:11434/api",
  nousApiEndpoint: "https://inference-api.nousresearch.com/v1",
  cerebrasApiEndpoint: "/api/cerebras/chat",
  openaiApiEndpoint: "https://api.openai.com/v1",
  anthropicApiEndpoint: "https://api.anthropic.com/v1",
  availableModels: [
    { name: "deepseek-r1:8b", provider: "ollama" },
    { name: "Hermes-3-Llama-3.1-70B", provider: "nous" },
    { name: "llama-3.3-70b", provider: "cerebras" },
    { name: "gpt-4o", provider: "openai" },
    { name: "gpt-4-vision-preview", provider: "openai" },
    { name: "claude-3-opus-20240229", provider: "anthropic" },
    { name: "claude-3-sonnet-20240229", provider: "anthropic" },
    { name: "claude-3-haiku-20240307", provider: "anthropic" },
    { name: "claude-3-5-sonnet-20240620", provider: "anthropic" },
  ],
  // Base system prompt will be added below
};

// Define baseSystemPrompt after config is initialized
config.baseSystemPrompt = `Your name is ${config.aiName}. You are communicating with ${config.userName}.
    You will respond in a moderately friendly and straightforward manner.
    Your primary goal is to act as a helpful entity, providing information and answering questions to the best of your ability.
    You will do your best to never refuse a request for help.
    When explicitly asked, you should try and reveal the provenance of your knowledge or the mechanics with which you answered or came to a conclusion.
    When asked for code, preformatted text, or other intentionally-structured content, please wrap it in triple backticks (\`\`\`) for proper formatting.
    For inline code or short code snippets, use single backticks (\`).`;

let nousApiKey = null;
let cerebrasApiKey = null;
let cerebrasOrgId = null;
let openaiApiKey = null;
let anthropicApiKey = null;

// This will be populated once tools are initialized
let systemPrompt = config.baseSystemPrompt;

export const getConfig = () => config;
export const setNousApiKey = (key) => (nousApiKey = key);
export const getNousApiKey = () => nousApiKey;
export const setCerebrasCredentials = (apiKey, orgId) => {
  cerebrasApiKey = apiKey;
  cerebrasOrgId = orgId;
};
export const getCerebrasCredentials = () => ({
  apiKey: cerebrasApiKey,
  orgId: cerebrasOrgId,
});
export const setOpenaiApiKey = (key) => (openaiApiKey = key);
export const getOpenaiApiKey = () => openaiApiKey;
export const setAnthropicApiKey = (key) => (anthropicApiKey = key);
export const getAnthropicApiKey = () => anthropicApiKey;
// Get the full system prompt including tool descriptions
export const getSystemPrompt = () => systemPrompt;
// Update the system prompt with tool descriptions
export const updateSystemPrompt = (toolDescriptions) => {
  systemPrompt = `${config.baseSystemPrompt}
  
  ${toolDescriptions}`;
  return systemPrompt;
};

export default {
  getConfig,
  setNousApiKey,
  getNousApiKey,
  setCerebrasCredentials,
  getCerebrasCredentials,
  setOpenaiApiKey,
  getOpenaiApiKey,
  setAnthropicApiKey,
  getAnthropicApiKey,
  getSystemPrompt,
  updateSystemPrompt,
};
