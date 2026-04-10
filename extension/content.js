// content.js — Content script injected into web pages
// Signals to the background service worker that this page is ready for
// bridge script injection. The actual injection is handled by background.js
// via chrome.scripting.executeScript to insert a <script> tag pointing to
// the remotely-hosted mcp-bridge.js.

(() => {
  if (!window.__mcpExtensionLoaded) {
    window.__mcpExtensionLoaded = true;
    console.log('[MCP Extension] Content script loaded.');
  }
})();
