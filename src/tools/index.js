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

/**
 * Generate system prompt descriptions for all tools
 * Creates a formatted string that can be included in the system prompt
 * @returns {string} - Formatted tool descriptions for system prompt
 */
export const generateToolDescriptions = () => {
  let toolDescriptions =
    "IMPORTANT: You have access to external tools that you can use to assist with certain tasks. " +
    "You MUST use these tools when appropriate instead of saying you don't have access to real-time data. " +
    "Here are the tools available to you:\n\n";

  // Add each tool's description
  allDefinitions.forEach((tool, index) => {
    const { name, description, parameters } = tool.function;
    toolDescriptions += `${index + 1}. ${name} - ${description}\n`;

    // Add parameter descriptions
    if (parameters && parameters.properties) {
      const requiredParams = parameters.required || [];

      Object.entries(parameters.properties).forEach(
        ([paramName, paramConfig]) => {
          const isRequired = requiredParams.includes(paramName);
          const paramPrefix = isRequired
            ? "   - Required: "
            : "   - Optional: ";

          let paramDescription = `${paramPrefix}${paramName} (${paramConfig.type})`;

          // Add description if available
          if (paramConfig.description) {
            paramDescription += ` - ${paramConfig.description}`;
          }

          // Add enum values if available
          if (paramConfig.enum) {
            paramDescription += ` (${paramConfig.enum
              .map((v) => `"${v}"`)
              .join(" or ")})`;
          }

          toolDescriptions += `${paramDescription}\n`;
        }
      );
    }

    // Add spacing between tools
    if (index < allDefinitions.length - 1) {
      toolDescriptions += "\n";
    }
  });

  // Add guidance for tool usage with improved clarity and emphasis
  toolDescriptions += `
REMEMBER: When a user asks something that requires real-time information, external data, or specialized functions, you MUST use these tools.

Specific scenarios where you MUST use tools:
- Weather inquiries → use get_current_weather
- Current events or factual questions about recent events → use search_web
- Requests for randomization → use flip_coin

DO NOT say you don't have real-time information or can't access current data. Instead, PROACTIVELY offer to use the tools to get the information.

When using a tool, clearly indicate which tool you're using. Always format your function calls correctly according to the schema provided.`;

  return toolDescriptions;
};

/**
 * Update the system prompt with current tool descriptions
 * This should be called whenever tools are added or modified
 */
export const updateSystemPromptWithTools = async () => {
  // We need to check if Config is available in the current context
  try {
    // Dynamically import the Config module using the global window object
    // This avoids circular dependencies
    if (typeof window !== "undefined" && window.Config && window.Chat) {
      const toolDescriptions = generateToolDescriptions();
      window.Config.updateSystemPrompt(toolDescriptions);
      window.Chat.updateSystemPrompt();
      console.log("System prompt updated with current tool descriptions");
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error updating system prompt with tools:", error);
    return false;
  }
};

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

  // Tool system prompt generator
  generateToolDescriptions,
  updateSystemPromptWithTools,
};
