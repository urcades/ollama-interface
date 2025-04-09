/**
 * Tool definitions for Ollama models that support tool use/function calling
 */

// Weather tool definition
const weatherTool = {
  type: "function",
  function: {
    name: "get_current_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            "The location to get the weather for, e.g. San Francisco, CA",
        },
        format: {
          type: "string",
          description: "The format to return the weather in",
          enum: ["celsius", "fahrenheit"],
        },
      },
      required: ["location"],
    },
  },
};

// Web search tool definition
const searchTool = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search the web for current information",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
};

// Coin flip tool definition
const coinFlipTool = {
  type: "function",
  function: {
    name: "flip_coin",
    description: "Flip a coin and randomly get heads or tails",
    parameters: {
      type: "object",
      properties: {
        flips: {
          type: "integer",
          description: "Number of coin flips to perform (default: 1)",
          minimum: 1,
          maximum: 100,
        },
      },
      required: [],
    },
  },
};

// Export individual tools
export { weatherTool, searchTool, coinFlipTool };

// Export all tools as an array
export const allTools = [weatherTool, searchTool, coinFlipTool];

// Export default for easier importing
export default allTools;
