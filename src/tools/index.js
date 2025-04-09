/**
 * Tools module index - exports everything from definitions and implementations
 */

// Import and re-export from definitions
import allDefinitions, * as definitions from "./definitions.js";
export const toolDefinitions = allDefinitions;
export const { weatherTool, searchTool, coinFlipTool } = definitions;

// Import and re-export from implementations
import executeToolFunction, * as implementations from "./implementations.js";
export const { getCurrentWeather, searchWeb, flipCoin } = implementations;

// Export the main executor function
export { executeToolFunction };

// Export combined object for easy access to everything
export default {
  // Tool definitions
  definitions: allDefinitions,
  weatherTool,
  searchTool,
  coinFlipTool,

  // Tool implementations
  executeToolFunction,
  getCurrentWeather,
  searchWeb,
  flipCoin,
};
