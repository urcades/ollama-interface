const MODEL = "llama3.1:latest";
const SYSTEM_PROMPT = `
    Your name is Oh.
    You will respond in a moderately friendly and straightforward manner.
    Your primary goal is to act as a helpful entity, providing information and answering questions to the best of your ability.
    You will do your best to never refuse a request for help.
    When explicitly asked, you should try and reveal the provenance of your knowledge or the mechanics with which you answered or came to a conclusion.
    When asked for code, preformatted text, or other intentionally-structured content, please wrap it in triple backticks (\`\`\`) for proper formatting.
    For inline code or short code snippets, use single backticks (\`).
    `;

const form = document.getElementById("prompt-form");
const promptInput = document.getElementById("prompt-input");
const chatContainer = document.getElementById("chat-container");
let conversationHistory = [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
];

// Focus the input field when the page loads
window.addEventListener("load", () => {
  promptInput.focus();
});

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return; // Don't submit if the prompt is empty

  // Add user message to the chat container
  addMessageToChat("user", prompt);

  // Add user message to conversation history
  conversationHistory.push({ role: "user", content: prompt });

  promptInput.value = ""; // Clear the input field

  try {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: conversationHistory,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const reader = response.body.getReader();
    let assistantResponse = "";

    // Create a new message element for the assistant's response
    const assistantMessageElement = addMessageToChat("assistant", "");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.trim() !== "") {
          const parsedLine = JSON.parse(line);
          if (parsedLine.message?.content) {
            assistantResponse += parsedLine.message.content;
            assistantMessageElement.innerHTML =
              formatMessage(assistantResponse);
            chatContainer.scrollTop = chatContainer.scrollHeight;
          }
        }
      }
    }
    // Add assistant's complete response to conversation history
    conversationHistory.push({ role: "assistant", content: assistantResponse });
  } catch (error) {
    console.error("Error:", error);
    addMessageToChat(
      "error",
      `An error occurred: ${error.message}<br>Make sure Ollama is running and accessible at http://localhost:11434`,
    );
  } finally {
    // Refocus the input field after submission
    promptInput.focus();
  }
}

function addMessageToChat(role, content) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", `${role}-message`);
  messageDiv.innerHTML = formatMessage(content);
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return messageDiv; // Return the created element
}

function formatMessage(content) {
  // Replace triple backticks with <pre><code> blocks
  content = content.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (match, language, code) => {
      return `<pre><code class="language-${language}">${escapeHtml(code.trim())}</code></pre>`;
    },
  );

  // Replace single backticks with <code> inline
  content = content.replace(/`([^`\n]+)`/g, (match, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // Replace newlines with <br> tags
  // content = content.replace(/\n/g, "<br>");

  return content;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Handle form submission
form.addEventListener("submit", handleSubmit);

// Handle Enter key press
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // Prevent default to avoid newline
    handleSubmit(e);
  }
});
