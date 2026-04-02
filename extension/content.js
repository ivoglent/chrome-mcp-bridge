// content.js — Content script injected into web pages
// Currently used as a placeholder. The main logic runs in background.js
// via chrome.scripting.executeScript for on-demand script injection.

(() => {
  // Signal that the content script is loaded
  if (!window.__mcpExtensionLoaded) {
    window.__mcpExtensionLoaded = true;
  }
})();
