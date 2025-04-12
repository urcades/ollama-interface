# Tools for Ollama Interface

This directory contains modular definitions and implementations of tools (functions) that Ollama models can call when using tools capability.

## Directory Structure

- `index.js` - Main export file that combines and exports all tools
- `definitions.js` - Contains tool definitions (JSON schema) for each tool
- `implementations.js` - Imports individual tool implementations and provides the executor function
- `weather.js` - Implementation of the weather tool
- `search.js` - Implementation of the web search tool
- `coin.js` - Implementation of the coin flip tool

## How to Use

Import tools in your application:

```javascript
import Tools from "./tools/index.js";

// Use all tool definitions
const allTools = Tools.toolDefinitions;

// Use a specific tool definition
const { weatherTool } = Tools;

// Execute a tool function
const result = await Tools.executeToolFunction({
  name: "flip_coin",
  arguments: { flips: 5 },
});
```

## Adding New Tools

To add a new tool:

1. Add the tool definition to `definitions.js`:

```javascript
const myNewTool = {
  type: "function",
  function: {
    name: "my_new_function",
    description: "Description of what the function does",
    parameters: {
      type: "object",
      properties: {
        // Define parameters here
      },
      required: [],
    },
  },
};

// Add to exports
export { myNewTool };
export const allTools = [
  // ...existing tools,
  myNewTool,
];
```

2. Create a new file for your tool implementation (e.g., `mynewtool.js`):

```javascript
/**
 * My new tool implementation
 */

export const myNewFunction = async (args) => {
  // Implementation goes here
  return {
    status: "success",
    // Result data
  };
};

export default myNewFunction;
```

3. Update `implementations.js` to import and register your new tool:

```javascript
// In implementations.js
import myNewFunction from "./mynewtool.js";

// Add to exports
export { myNewFunction };

// Add to the implementations map
const toolImplementations = {
  // ...existing implementations,
  my_new_function: myNewFunction,
};
```

4. The tool will automatically be available through the `executeToolFunction` without any changes needed to that function.

5. Update the exports in `index.js` if needed:

```javascript
// In index.js
export const { /* ...existing tools... */, myNewTool } = definitions;
export const { /* ...existing implementations... */, myNewFunction } = implementations;

// Update the default export if needed
export default {
  // ...
  myNewTool,
  myNewFunction,
};
```

## Available Tools

### Weather Tool

- **Name**: `get_current_weather`
- **Description**: Gets current weather for a location
- **Parameters**:
  - `location` (required): Location to get weather for
  - `format`: "celsius" or "fahrenheit"

### Web Search Tool

- **Name**: `search_web`
- **Description**: Searches the web for information
- **Parameters**:
  - `query` (required): Search query

### Coin Flip Tool

- **Name**: `flip_coin`
- **Description**: Flips a coin to get heads or tails
- **Parameters**:
  - `flips`: Number of flips to perform (default: 1, max: 100)
