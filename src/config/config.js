// Configuration module
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
  // Base system prompt without tool descriptions
  baseSystemPrompt: `Your name is Oh.
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
  getSystemPrompt,
  updateSystemPrompt,
};
