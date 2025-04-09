/**
 * Tool implementations for Ollama models that support tool use/function calling
 */

// Get current weather implementation
const getCurrentWeather = async (args) => {
  const location = args.location || "Unknown";
  const format = args.format || "celsius";

  return {
    status: "success",
    location: location,
    temperature:
      format === "celsius"
        ? Math.floor(15 + Math.random() * 15)
        : Math.floor(60 + Math.random() * 30),
    unit: format === "celsius" ? "°C" : "°F",
    condition: ["Sunny", "Partly Cloudy", "Cloudy", "Rainy", "Stormy"][
      Math.floor(Math.random() * 5)
    ],
    humidity: Math.floor(40 + Math.random() * 50),
    wind_speed: Math.floor(5 + Math.random() * 20),
    forecast:
      "This is simulated weather data. In a real application, this would connect to a weather API.",
  };
};

// Web search implementation
const searchWeb = async (args) => {
  const query = args.query || "";

  return {
    status: "success",
    results: [
      {
        title: `Search results for: ${query}`,
        snippet:
          "This is a simulated search result. In a real application, this would connect to a search API.",
      },
    ],
  };
};

// Coin flip implementation
const flipCoin = async (args) => {
  const numFlips = args.flips || 1;
  const maxFlips = Math.min(numFlips, 100); // Enforce maximum

  // Generate random coin flips
  const results = [];
  for (let i = 0; i < maxFlips; i++) {
    results.push(Math.random() < 0.5 ? "heads" : "tails");
  }

  return {
    status: "success",
    flips: maxFlips,
    results: results,
    summary:
      numFlips === 1
        ? `The coin landed on ${results[0]}.`
        : `You flipped ${
            results.filter((r) => r === "heads").length
          } heads and ${results.filter((r) => r === "tails").length} tails.`,
  };
};

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

// Export individual implementations
export { getCurrentWeather, searchWeb, flipCoin };

// Export the function executor
export { executeToolFunction };

// Export default for easier importing
export default executeToolFunction;
