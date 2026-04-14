// background.js — Chrome Extension Service Worker
// Handles browser-level actions (tabs, screenshots) directly via Chrome APIs.
// Page-level DOM actions are handled by the injected mcp-bridge.js script
// which connects to the MCP server via its own WebSocket.

const WS_URL = 'ws://localhost:7890';
const CLIENT_ID = self.crypto.randomUUID();

// URL of the remotely-hosted bridge script. Override via storage or env.
// When developing locally, you can serve inject/mcp-bridge.js yourself.
const DEFAULT_BRIDGE_SCRIPT_URL = 'https://files.codecuatui.com/share/mqVNS4Nr';

let ws = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

// ─── Keep-Alive Mechanism ───────────────────────────────────────────
// MV3 service workers get suspended after ~30s of inactivity.
// Use chrome.alarms to periodically wake the service worker and keep
// the WebSocket connection alive.

const KEEP_ALIVE_ALARM = 'mcp-keep-alive';
const KEEP_ALIVE_INTERVAL_MINUTES = 0.4; // ~24 seconds, under the 30s suspension limit

chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: KEEP_ALIVE_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    // If WebSocket is not open, reconnect
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[MCP Extension] Keep-alive: WebSocket not open, reconnecting...');
      reconnectDelay = 1000;
      connectWebSocket();
    } else {
      // Send a ping to keep the connection alive
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }
});

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
    // ── Browser-level actions (Chrome APIs) ──
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
    // ── Page-level fallback actions (when bridge is not connected) ──
    case 'get_html':
      return await handleGetHtml(payload);
    case 'get_text':
      return await handleGetText(payload);
    case 'get_element':
      return await handleGetElement(payload);
    case 'click_element':
      return await handleClickElement(payload);
    case 'type_text':
      return await handleTypeText(payload);
    case 'scroll_page':
      return await handleScrollPage(payload);
    case 'hover_element':
      return await handleHoverElement(payload);
    case 'mouse_click_at':
      return await handleMouseClickAt(payload);
    case 'execute_js':
      return await handleExecuteJs(payload);
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

// ─── Page-level Fallback Handlers ────────────────────────────────────
// These handlers use chrome.scripting.executeScript with proper function
// injection (no eval) as a fallback when the bridge script is not connected.

async function handleGetHtml(payload) {
  const tabId = await resolveTabId(payload);
  const selector = payload.selector;
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => {
      if (sel) {
        const element = document.querySelector(sel);
        if (!element) return { html: '', found: false };
        return { html: element.outerHTML, found: true };
      }
      return { html: document.documentElement.outerHTML, found: true };
    },
    args: [selector || null],
  });
  const scriptResult = results[0]?.result || { html: '', found: false };
  if (selector && !scriptResult.found) {
    throw new Error(`No element found matching selector: "${selector}"`);
  }
  return { tabId, selector: selector || null, html: scriptResult.html };
}

async function handleGetText(payload) {
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.body.innerText,
  });
  return { tabId, text: results[0]?.result || '' };
}

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
      return { outerHTML: element.outerHTML, textContent: element.textContent || '', tagName: element.tagName };
    },
    args: [payload.selector],
  });
  return { tabId, selector: payload.selector, element: results[0]?.result || null };
}

async function handleClickElement(payload) {
  if (!payload.selector) {
    throw new Error('Missing required field: selector');
  }
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (selector) => {
      const element = document.querySelector(selector);
      if (!element) return { __error: true, message: `No element found for selector: ${selector}` };
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: centerX, clientY: centerY };
      element.dispatchEvent(new MouseEvent('mouseover', opts));
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new MouseEvent('mouseup', opts));
      element.dispatchEvent(new MouseEvent('click', opts));
      return { tagName: element.tagName, textContent: (element.textContent || '').substring(0, 200), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    },
    args: [payload.selector],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) throw new Error(rawResult.message);
  return { tabId, selector: payload.selector, clicked: true, element: rawResult };
}

async function handleTypeText(payload) {
  if (!payload.selector) throw new Error('Missing required field: selector');
  if (payload.text === undefined || payload.text === null) throw new Error('Missing required field: text');
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (selector, text, clearBefore, pressEnter) => {
      const element = document.querySelector(selector);
      if (!element) return { __error: true, message: `No element found for selector: ${selector}` };
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (clearBefore !== false) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.value = '';
        else if (element.isContentEditable) element.textContent = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
          || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(element, text);
        else element.value = text;
      } else if (element.isContentEditable) {
        element.textContent = text;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      if (pressEnter) {
        const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true };
        element.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        element.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        element.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
        const form = element.closest('form');
        if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      return { tagName: element.tagName, value: element.value || element.textContent || '' };
    },
    args: [payload.selector, payload.text, payload.clearBefore ?? true, payload.pressEnter ?? false],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) throw new Error(rawResult.message);
  return { tabId, selector: payload.selector, typed: true, element: rawResult };
}

async function handleScrollPage(payload) {
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (direction, selector, pixels) => {
      const scrollAmount = pixels || 500;
      if (selector) {
        const element = document.querySelector(selector);
        if (!element) return { __error: true, message: `No element found for selector: ${selector}` };
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const rect = element.getBoundingClientRect();
        return { scrolledTo: selector, elementRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, scrollY: window.scrollY, scrollX: window.scrollX };
      }
      switch (direction) {
        case 'down': window.scrollBy({ top: scrollAmount, behavior: 'smooth' }); break;
        case 'up': window.scrollBy({ top: -scrollAmount, behavior: 'smooth' }); break;
        case 'right': window.scrollBy({ left: scrollAmount, behavior: 'smooth' }); break;
        case 'left': window.scrollBy({ left: -scrollAmount, behavior: 'smooth' }); break;
        case 'top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'bottom': window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); break;
        default: window.scrollBy({ top: scrollAmount, behavior: 'smooth' }); break;
      }
      return { direction: direction || 'down', pixels: scrollAmount, scrollY: window.scrollY, scrollX: window.scrollX, pageHeight: document.body.scrollHeight, viewportHeight: window.innerHeight };
    },
    args: [payload.direction || 'down', payload.selector || null, payload.pixels || 500],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) throw new Error(rawResult.message);
  return { tabId, scrolled: true, ...rawResult };
}

async function handleHoverElement(payload) {
  if (!payload.selector) throw new Error('Missing required field: selector');
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (selector) => {
      const element = document.querySelector(selector);
      if (!element) return { __error: true, message: `No element found for selector: ${selector}` };
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: centerX, clientY: centerY };
      element.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }));
      element.dispatchEvent(new MouseEvent('mouseover', opts));
      element.dispatchEvent(new MouseEvent('mousemove', opts));
      return { tagName: element.tagName, textContent: (element.textContent || '').substring(0, 200), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    },
    args: [payload.selector],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) throw new Error(rawResult.message);
  return { tabId, selector: payload.selector, hovered: true, element: rawResult };
}

async function handleMouseClickAt(payload) {
  if (payload.x === undefined || payload.y === undefined) throw new Error('Missing required fields: x and y');
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (x, y, button, doubleClick) => {
      const buttonMap = { left: 0, middle: 1, right: 2 };
      const buttonCode = buttonMap[button] || 0;
      const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: buttonCode };
      const targetElement = document.elementFromPoint(x, y);
      if (!targetElement) return { __error: true, message: `No element found at coordinates (${x}, ${y})` };
      targetElement.dispatchEvent(new MouseEvent('mouseover', opts));
      targetElement.dispatchEvent(new MouseEvent('mousedown', opts));
      targetElement.dispatchEvent(new MouseEvent('mouseup', opts));
      targetElement.dispatchEvent(new MouseEvent('click', opts));
      if (doubleClick) {
        targetElement.dispatchEvent(new MouseEvent('mousedown', opts));
        targetElement.dispatchEvent(new MouseEvent('mouseup', opts));
        targetElement.dispatchEvent(new MouseEvent('click', opts));
        targetElement.dispatchEvent(new MouseEvent('dblclick', opts));
      }
      return { tagName: targetElement.tagName, textContent: (targetElement.textContent || '').substring(0, 200), id: targetElement.id || null, className: targetElement.className || null, coordinates: { x, y } };
    },
    args: [payload.x, payload.y, payload.button || 'left', payload.doubleClick || false],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) throw new Error(rawResult.message);
  return { tabId, clickedAt: { x: payload.x, y: payload.y }, clicked: true, element: rawResult };
}

async function handleExecuteJs(payload) {
  if (!payload.script) throw new Error('Missing required field: script');
  const tabId = await resolveTabId(payload);
  // Use Function constructor instead of eval — more permissive under some CSP configs
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (scriptText) => {
      try {
        const fn = new Function(scriptText);
        const result = fn();
        if (result && typeof result.then === 'function') {
          return result.then((resolved) => ({ result: resolved }));
        }
        return { result: result !== undefined ? result : null };
      } catch (execError) {
        return { __error: true, message: execError.message };
      }
    },
    args: [payload.script],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) throw new Error(rawResult.message);
  return { tabId, result: rawResult?.result ?? null };
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
