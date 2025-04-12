export const escapeHtml = (unsafe) =>
  unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const formatMessage = (content) => {
  if (!content) return "";
  return content
    .replace(/<think>([\s\S]*?)<\/think>/g, '<p class="think">$1</p>')
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_, lang, code) =>
        `<pre><code class="language-${lang}">${escapeHtml(
          code.trim()
        )}</code></pre>`
    )
    .replace(/`([^`\n]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
};

// Convert image file to base64
export const imageToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Extract the base64 data without the data URL prefix
      // Format is like: data:image/jpeg;base64,/9j/4AAQSkZJRg...
      const result = reader.result;
      const base64Data = result.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

// Optimized scroll with requestAnimationFrame
export const createScrollToBottom = () => {
  let rafId;
  let isStreaming = false;

  const scroll = () => {
    // We'll need to import DOM from '../core/dom.js', but for now we'll keep it this way
    // In the final implementation, this should be properly imported
    const elements = window.DOM?.getElements(); // Temporary solution for transition
    if (elements && elements.chat) {
      elements.chat.scrollTop = elements.chat.scrollHeight;
    }
  };

  return (streaming = false) => {
    isStreaming = streaming;
    if (isStreaming) {
      scroll();
    } else {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(scroll);
    }
  };
};

export default {
  escapeHtml,
  formatMessage,
  imageToBase64,
  createScrollToBottom,
};
