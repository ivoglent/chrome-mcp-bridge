// background.js — Chrome Extension Service Worker
// Connects to Node.js WebSocket server and handles browser control commands

const WS_URL = 'ws://localhost:7890';
const CLIENT_ID = self.crypto.randomUUID();

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
    // Identify this extension client
    ws.send(JSON.stringify({ type: 'identify', clientId: CLIENT_ID }));
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

  ws.onerror = (event) => {
    // In Chrome service workers, WebSocket onerror receives an Event, not an Error.
    // The actual error details appear in the console as a separate browser message.
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

async function handleAction(action, payload) {
  switch (action) {
    case 'capture_screenshot':
      return await handleCaptureScreenshot(payload);
    case 'get_html':
      return await handleGetHtml(payload);
    case 'execute_js':
      return await handleExecuteJs(payload);
    case 'open_tab':
      return await handleOpenTab(payload);
    case 'close_tab':
      return await handleCloseTab(payload);
    case 'list_tabs':
      return await handleListTabs();
    case 'focus_tab':
      return await handleFocusTab(payload);
    case 'get_text':
      return await handleGetText(payload);
    case 'get_element':
      return await handleGetElement(payload);
    default:
      throw new Error(`Unknown action: ${action}`);
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
  // Default: active tab in current window
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) {
    throw new Error('No active tab found');
  }
  return activeTab.id;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Screenshot ─────────────────────────────────────────────────────

async function handleCaptureScreenshot(payload) {
  const tabId = await resolveTabId(payload);

  // Ensure the tab is active and focused before capturing
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await delay(500);

  console.log(`[MCP Extension] Capturing screenshot of tab ${tabId}, window ${tab.windowId}`);

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
  });

  if (!dataUrl) {
    throw new Error('captureVisibleTab returned empty result');
  }

  console.log(`[MCP Extension] Screenshot captured, dataUrl length: ${dataUrl.length}`);

  // Return base64 data (strip the data:image/png;base64, prefix)
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  return {
    tabId,
    format: 'png',
    base64: base64Data,
  };
}

// ─── Get HTML ───────────────────────────────────────────────────────

async function handleGetHtml(payload) {
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML,
  });
  return {
    tabId,
    html: results[0]?.result || '',
  };
}

// ─── Execute JS ─────────────────────────────────────────────────────

async function handleExecuteJs(payload) {
  if (!payload.script) {
    throw new Error('Missing required field: script');
  }
  const tabId = await resolveTabId(payload);

  // Inject into the page's MAIN world so we can use eval in the page context
  // (the extension's service worker CSP blocks eval/new Function)
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (scriptText) => {
      try {
        // eslint-disable-next-line no-eval
        return eval(scriptText);
      } catch (evalError) {
        return { __error: true, message: evalError.message };
      }
    },
    args: [payload.script],
  });

  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) {
    throw new Error(rawResult.message);
  }
  return {
    tabId,
    result: rawResult ?? null,
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

// ─── Get Visible Text ───────────────────────────────────────────────

async function handleGetText(payload) {
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.body.innerText,
  });
  return {
    tabId,
    text: results[0]?.result || '',
  };
}

// ─── Get Element by Selector ────────────────────────────────────────

async function handleGetElement(payload) {
  if (!payload.selector) {
    throw new Error('Missing required field: selector');
  }
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      return {
        outerHTML: element.outerHTML,
        textContent: element.textContent || '',
        tagName: element.tagName,
      };
    },
    args: [payload.selector],
  });
  return {
    tabId,
    selector: payload.selector,
    element: results[0]?.result || null,
  };
}

// ─── Start Connection ───────────────────────────────────────────────

connectWebSocket();
console.log(`[MCP Extension] Service worker started. ClientID: ${CLIENT_ID}`);
