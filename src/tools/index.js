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
    "IMPORTANT: You have access to external tools that you can use to assist with certain tasks. When appropriate, use one of these tools:\n\n";

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

  // Add guidance for tool usage
  toolDescriptions += `
When a user asks something that would benefit from using these tools, proactively offer to use them.
For weather queries, location information, current events, or questions about external data, use the appropriate tool rather than stating you don't have access to real-time information.
When using a tool, clearly indicate which tool you're using and why.`;

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
