// background.js — Chrome Extension Service Worker
// Handles browser-level actions (tabs, screenshots) directly via Chrome APIs.
// Page-level DOM actions are handled by the injected mcp-bridge.js script
// which connects to the MCP server via its own WebSocket.

const WS_URL = 'ws://localhost:7890';
const CLIENT_ID = self.crypto.randomUUID();

// URL of the remotely-hosted bridge script. Override via storage or env.
// When developing locally, you can serve inject/mcp-bridge.js yourself.
const DEFAULT_BRIDGE_SCRIPT_URL = 'http://localhost:7890/mcp-bridge.js';

let ws = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

// ─── WebSocket Connection ───────────────────────────────────────────

function scheduleReconnect() {
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connectWebSocket();
  }, reconnectDelay);
}

function connectWebSocket() {
  console.log(`[MCP Extension] Connecting to ${WS_URL}...`);

  try {
    ws = new WebSocket(WS_URL);
  } catch (error) {
    console.error(`[MCP Extension] Failed to create WebSocket: ${error.message || error}`);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[MCP Extension] Connected to server');
    reconnectDelay = 1000;
    ws.send(JSON.stringify({ type: 'identify', clientId: CLIENT_ID, clientType: 'extension' }));
  };

  ws.onmessage = async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (parseError) {
      console.error('[MCP Extension] Failed to parse message:', parseError);
      return;
    }

    const { requestId, action, payload } = message;
    if (!requestId || !action) {
      console.warn('[MCP Extension] Invalid message format:', message);
      return;
    }

    console.log(`[MCP Extension] Received action: ${action}, requestId: ${requestId}`);

    try {
      const result = await handleAction(action, payload || {});
      sendResponse(requestId, true, result);
    } catch (error) {
      console.error(`[MCP Extension] Error handling ${action}:`, error);
      sendResponse(requestId, false, null, error.message || String(error));
    }
  };

  ws.onclose = (event) => {
    const reason = event.reason || 'unknown';
    const code = event.code || 0;
    console.warn(`[MCP Extension] Disconnected (code: ${code}, reason: ${reason}). Reconnecting in ${reconnectDelay}ms...`);
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    console.error(
      `[MCP Extension] WebSocket error — connection to ${WS_URL} failed. ` +
      `Is the server running? (readyState: ${ws?.readyState ?? 'N/A'})`
    );
  };
}

function sendResponse(requestId, success, data, error = null) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('[MCP Extension] Cannot send response — WebSocket not open');
    return;
  }
  const response = { requestId, success, data, error };
  console.log(`[MCP Extension] Sending response for ${requestId}:`, success ? 'success' : 'error');
  ws.send(JSON.stringify(response));
}

// ─── Action Handlers ────────────────────────────────────────────────
// The extension only handles browser-level actions that require Chrome APIs.
// Page-level DOM actions (click, type, scroll, hover, get_html, etc.) are
// handled by the injected mcp-bridge.js via its own WS connection.

async function handleAction(action, payload) {
  switch (action) {
    case 'capture_screenshot':
      return await handleCaptureScreenshot(payload);
    case 'open_tab':
      return await handleOpenTab(payload);
    case 'close_tab':
      return await handleCloseTab(payload);
    case 'list_tabs':
      return await handleListTabs();
    case 'focus_tab':
      return await handleFocusTab(payload);
    case 'inject_bridge':
      return await handleInjectBridge(payload);
    default:
      throw new Error(`Unknown extension action: ${action}. Page-level actions are handled by the bridge script.`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

async function resolveTabId(payload) {
  if (payload.tabId) {
    return payload.tabId;
  }
  if (payload.title) {
    const tabs = await chrome.tabs.query({});
    const match = tabs.find((tab) =>
      tab.title && tab.title.toLowerCase().includes(payload.title.toLowerCase())
    );
    if (!match) {
      throw new Error(`No tab found matching title: "${payload.title}"`);
    }
    return match.id;
  }
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) {
    throw new Error('No active tab found');
  }
  return activeTab.id;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Inject Bridge Script ───────────────────────────────────────────
// Injects the mcp-bridge.js script into a tab by adding a <script> tag.
// The bridge script is loaded from a remote HTTPS URL so it runs in the
// page's MAIN world without needing eval or chrome.scripting.executeScript.

async function handleInjectBridge(payload) {
  const tabId = await resolveTabId(payload);
  const bridgeUrl = payload.bridgeUrl || DEFAULT_BRIDGE_SCRIPT_URL;
  const wsUrl = payload.wsUrl || WS_URL;

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (scriptUrl, serverWsUrl) => {
      // Prevent double-injection
      if (window.__mcpBridgeLoaded) {
        return { alreadyInjected: true };
      }
      // Set WS URL before the script loads
      window.__mcpBridgeWsUrl = serverWsUrl;
      var script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.dataset.wsUrl = serverWsUrl;
      document.head.appendChild(script);
      return { injected: true, scriptUrl: scriptUrl };
    },
    args: [bridgeUrl, wsUrl],
  });

  const result = results[0]?.result || {};
  return { tabId, ...result };
}

// ─── Screenshot ─────────────────────────────────────────────────────

async function handleCaptureScreenshot(payload) {
  const tabId = await resolveTabId(payload);
  const format = payload.format || 'jpeg';
  const quality = payload.quality ?? 50;

  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await delay(500);

  console.log(`[MCP Extension] Capturing screenshot of tab ${tabId}, window ${tab.windowId} (${format}, quality: ${quality})`);

  const captureOptions = { format };
  if (format === 'jpeg') {
    captureOptions.quality = quality;
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);

  if (!dataUrl) {
    throw new Error('captureVisibleTab returned empty result');
  }

  console.log(`[MCP Extension] Screenshot captured, dataUrl length: ${dataUrl.length}`);

  const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
  return {
    tabId,
    format,
    base64: base64Data,
  };
}

// ─── Open Tab ───────────────────────────────────────────────────────

async function handleOpenTab(payload) {
  if (!payload.url) {
    throw new Error('Missing required field: url');
  }
  const tab = await chrome.tabs.create({ url: payload.url });
  return {
    tabId: tab.id,
    url: tab.url || payload.url,
  };
}

// ─── Close Tab ──────────────────────────────────────────────────────

async function handleCloseTab(payload) {
  if (!payload.tabId) {
    throw new Error('Missing required field: tabId');
  }
  await chrome.tabs.remove(payload.tabId);
  return { tabId: payload.tabId, closed: true };
}

// ─── List Tabs ──────────────────────────────────────────────────────

async function handleListTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map((tab) => ({
    id: tab.id,
    title: tab.title || '',
    url: tab.url || '',
    active: tab.active,
    windowId: tab.windowId,
  }));
}

// ─── Focus Tab ──────────────────────────────────────────────────────

async function handleFocusTab(payload) {
  if (!payload.tabId) {
    throw new Error('Missing required field: tabId');
  }
  const tab = await chrome.tabs.update(payload.tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { tabId: payload.tabId, focused: true };
}

// ─── Auto-inject bridge on tab navigation ───────────────────────────
// Automatically inject the bridge script when a tab finishes loading.

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    console.log(`[MCP Extension] Tab ${tabId} loaded, injecting bridge script...`);
    handleInjectBridge({ tabId }).catch((error) => {
      console.warn(`[MCP Extension] Failed to auto-inject bridge into tab ${tabId}:`, error.message);
    });
  }
});

// ─── Start Connection ───────────────────────────────────────────────

connectWebSocket();
console.log(`[MCP Extension] Service worker started. ClientID: ${CLIENT_ID}`);
