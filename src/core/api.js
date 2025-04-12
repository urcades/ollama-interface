import * as Config from "../config/config.js";

// Fetch API keys from server
export const fetchApiKeys = async () => {
  try {
    const response = await fetch("/api/config");
    if (response.ok) {
      const data = await response.json();
      if (data.nousApiKey) {
        Config.setNousApiKey(data.nousApiKey);
      }
      if (data.cerebrasApiKey) {
        Config.setCerebrasCredentials(data.cerebrasApiKey, data.cerebrasOrgId);
      }
    }
  } catch (error) {
    console.error("Failed to fetch API keys:", error);
  }
};

export default {
  fetchApiKeys,
};
