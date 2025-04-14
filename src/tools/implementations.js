/**
 * Tool implementations for models that support tool use/function calling
 * Compatible with Ollama, OpenAI, and Claude APIs
 * This file imports individual tool implementations and combines them
 */

// Import individual tool implementations
import getCurrentWeather from "./weather.js";
import searchWeb from "./search.js";
import flipCoin from "./coin.js";

// Export individual implementations
export { getCurrentWeather, searchWeb, flipCoin };

// Map of function names to their implementations
const toolImplementations = {
  get_current_weather: getCurrentWeather,
  search_web: searchWeb,
  flip_coin: flipCoin,
};

// Execute a tool based on the function name and arguments
const executeToolFunction = async (func) => {
  const { name, arguments: args } = func;

  // Parse the arguments if they're a string
  let parsedArgs;
  try {
    parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
  } catch (e) {
    parsedArgs = args;
  }

  // Check if the function exists in our implementation map
  if (toolImplementations[name]) {
    return await toolImplementations[name](parsedArgs);
  } else {
    throw new Error(`Unknown function: ${name}`);
  }
};

// Export the function executor
export { executeToolFunction };

// Export default for easier importing
export default executeToolFunction;
