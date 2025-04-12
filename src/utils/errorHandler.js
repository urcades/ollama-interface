export const handleNetworkError = (error, context = "") => {
  console.error(`Network error ${context ? "in " + context : ""}:`, error);

  if (error.name === "AbortError") {
    console.log("Request cancelled");
    return { aborted: true, message: "Request cancelled" };
  }

  let message = `An error occurred: ${error.message}`;
  if (
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  ) {
    message += "<br>Make sure the API service is running and accessible";
  }

  return {
    aborted: false,
    message,
    isNetworkError: true,
  };
};

export const handleApiError = (status, data = {}) => {
  console.error(`API error (${status}):`, data);

  let message = "API error: ";
  if (status === 401 || status === 403) {
    message += "Authentication failed. Check your API key.";
  } else if (status === 404) {
    if (
      data.error &&
      data.error.includes("model") &&
      data.error.includes("not found")
    ) {
      message += `${data.error}<br>Please pull this model first with 'ollama pull' or choose another model.`;
    } else {
      message += "The requested resource could not be found.";
    }
  } else if (status === 429) {
    message += "Rate limit exceeded. Please try again later.";
  } else if (status >= 500) {
    message += "Server error. Please try again later.";
  } else {
    message += data.error || `Unexpected error (${status})`;
  }

  return {
    aborted: false,
    message,
    isApiError: true,
    status,
  };
};

export const displayErrorMessage = (errorInfo, addMessageCallback) => {
  if (!errorInfo.aborted) {
    addMessageCallback("error", errorInfo.message);
  }
  return errorInfo;
};

export default {
  handleNetworkError,
  handleApiError,
  displayErrorMessage,
};
