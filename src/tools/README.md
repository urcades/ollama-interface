# Tools for Ollama Interface

This directory contains modular definitions and implementations of tools (functions) that Ollama models can call when using tools capability.

## Directory Structure

- `index.js` - Main export file that combines and exports all tools
- `definitions.js` - Contains tool definitions (JSON schema) for each tool
- `implementations.js` - Contains the actual implementations of each tool function

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

2. Add the tool implementation to `implementations.js`:

```javascript
const myNewFunction = async (args) => {
  // Implementation goes here
  return {
    status: "success",
    // Result data
  };
};

// Add to the implementations map
const toolImplementations = {
  // ...existing implementations,
  my_new_function: myNewFunction,
};

// Add to exports
export { myNewFunction };
```

3. The tool will automatically be available through the `executeToolFunction` without any changes needed to that function.

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
