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
  const format = payload.format || 'jpeg';
  const quality = payload.quality ?? 50;

  // Ensure the tab is active and focused before capturing
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

  // Strip the data URL prefix (e.g. "data:image/jpeg;base64," or "data:image/png;base64,")
  const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
  return {
    tabId,
    format,
    base64: base64Data,
  };
}

// ─── Get HTML ───────────────────────────────────────────────────────

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
  return {
    tabId,
    selector: selector || null,
    html: scriptResult.html,
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

// ─── Click Element ──────────────────────────────────────────────────

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
      if (!element) {
        return { __error: true, message: `No element found for selector: ${selector}` };
      }
      // Scroll element into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Dispatch mouse events for full compatibility
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
      };
      element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
      element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
      element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      element.dispatchEvent(new MouseEvent('click', eventOptions));
      return {
        tagName: element.tagName,
        textContent: (element.textContent || '').substring(0, 200),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    },
    args: [payload.selector],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) {
    throw new Error(rawResult.message);
  }
  return { tabId, selector: payload.selector, clicked: true, element: rawResult };
}

// ─── Type Text ──────────────────────────────────────────────────────

async function handleTypeText(payload) {
  if (!payload.selector) {
    throw new Error('Missing required field: selector');
  }
  if (payload.text === undefined || payload.text === null) {
    throw new Error('Missing required field: text');
  }
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (selector, text, clearBefore, pressEnter) => {
      const element = document.querySelector(selector);
      if (!element) {
        return { __error: true, message: `No element found for selector: ${selector}` };
      }
      // Focus the element
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Clear existing content if requested (default: true)
      if (clearBefore !== false) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.value = '';
        } else if (element.isContentEditable) {
          element.textContent = '';
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Set the value
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        // Use native setter to bypass React/Vue controlled component guards
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(element, text);
        } else {
          element.value = text;
        }
      } else if (element.isContentEditable) {
        element.textContent = text;
      }

      // Dispatch events so frameworks detect the change
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      // Optionally press Enter
      if (pressEnter) {
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        // Also submit the form if inside one
        const form = element.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }

      return {
        tagName: element.tagName,
        value: element.value || element.textContent || '',
      };
    },
    args: [payload.selector, payload.text, payload.clearBefore, payload.pressEnter],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) {
    throw new Error(rawResult.message);
  }
  return { tabId, selector: payload.selector, typed: true, element: rawResult };
}

// ─── Scroll Page ────────────────────────────────────────────────────

async function handleScrollPage(payload) {
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (direction, selector, pixels) => {
      const scrollAmount = pixels || 500;

      // If selector is provided, scroll that element into view
      if (selector) {
        const element = document.querySelector(selector);
        if (!element) {
          return { __error: true, message: `No element found for selector: ${selector}` };
        }
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const rect = element.getBoundingClientRect();
        return {
          scrolledTo: selector,
          elementRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          scrollY: window.scrollY,
          scrollX: window.scrollX,
        };
      }

      // Otherwise scroll by direction
      switch (direction) {
        case 'down':
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          break;
        case 'up':
          window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
          break;
        case 'right':
          window.scrollBy({ left: scrollAmount, behavior: 'smooth' });
          break;
        case 'left':
          window.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
          break;
        case 'top':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'bottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          break;
        default:
          // Default to scrolling down
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          break;
      }

      return {
        direction: direction || 'down',
        pixels: scrollAmount,
        scrollY: window.scrollY,
        scrollX: window.scrollX,
        pageHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    },
    args: [payload.direction, payload.selector, payload.pixels],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) {
    throw new Error(rawResult.message);
  }
  return { tabId, scrolled: true, ...rawResult };
}

// ─── Hover Element ──────────────────────────────────────────────────

async function handleHoverElement(payload) {
  if (!payload.selector) {
    throw new Error('Missing required field: selector');
  }
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return { __error: true, message: `No element found for selector: ${selector}` };
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
      };
      element.dispatchEvent(new MouseEvent('mouseenter', { ...eventOptions, bubbles: false }));
      element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
      element.dispatchEvent(new MouseEvent('mousemove', eventOptions));
      return {
        tagName: element.tagName,
        textContent: (element.textContent || '').substring(0, 200),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    },
    args: [payload.selector],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) {
    throw new Error(rawResult.message);
  }
  return { tabId, selector: payload.selector, hovered: true, element: rawResult };
}

// ─── Mouse Click at Coordinates ─────────────────────────────────────

async function handleMouseClickAt(payload) {
  if (payload.x === undefined || payload.y === undefined) {
    throw new Error('Missing required fields: x and y');
  }
  const tabId = await resolveTabId(payload);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (x, y, button, doubleClick) => {
      const buttonMap = { left: 0, middle: 1, right: 2 };
      const buttonCode = buttonMap[button] || 0;
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: buttonCode,
      };

      // Find the element at the coordinates
      const targetElement = document.elementFromPoint(x, y);
      if (!targetElement) {
        return { __error: true, message: `No element found at coordinates (${x}, ${y})` };
      }

      // Dispatch mouse events
      targetElement.dispatchEvent(new MouseEvent('mouseover', eventOptions));
      targetElement.dispatchEvent(new MouseEvent('mousedown', eventOptions));
      targetElement.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      targetElement.dispatchEvent(new MouseEvent('click', eventOptions));

      if (doubleClick) {
        targetElement.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        targetElement.dispatchEvent(new MouseEvent('mouseup', eventOptions));
        targetElement.dispatchEvent(new MouseEvent('click', eventOptions));
        targetElement.dispatchEvent(new MouseEvent('dblclick', eventOptions));
      }

      return {
        tagName: targetElement.tagName,
        textContent: (targetElement.textContent || '').substring(0, 200),
        id: targetElement.id || null,
        className: targetElement.className || null,
        coordinates: { x, y },
      };
    },
    args: [payload.x, payload.y, payload.button, payload.doubleClick],
  });
  const rawResult = results[0]?.result;
  if (rawResult && rawResult.__error) {
    throw new Error(rawResult.message);
  }
  return { tabId, clickedAt: { x: payload.x, y: payload.y }, clicked: true, element: rawResult };
}

// ─── Start Connection ───────────────────────────────────────────────

connectWebSocket();
console.log(`[MCP Extension] Service worker started. ClientID: ${CLIENT_ID}`);
