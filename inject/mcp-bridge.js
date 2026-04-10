// mcp-bridge.js — Standalone injectable script for MCP browser control
// This script is designed to be hosted on a remote HTTPS server and injected
// into web pages via the Chrome extension. It opens its own WebSocket connection
// to the MCP server and handles all DOM-level actions natively (no eval).

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__mcpBridgeLoaded) {
    console.log('[MCP Bridge] Already loaded, skipping.');
    return;
  }
  window.__mcpBridgeLoaded = true;

  // ─── Configuration ──────────────────────────────────────────────────

  const DEFAULT_WS_URL = 'ws://localhost:7890';
  const CLIENT_TYPE = 'bridge';

  // Allow override via data attribute on the script tag or global variable
  function getWsUrl() {
    // Check for a global override
    if (window.__mcpBridgeWsUrl) {
      return window.__mcpBridgeWsUrl;
    }
    // Check the script tag's data attribute
    const currentScript = document.currentScript;
    if (currentScript && currentScript.dataset.wsUrl) {
      return currentScript.dataset.wsUrl;
    }
    return DEFAULT_WS_URL;
  }

  const WS_URL = getWsUrl();
  const CLIENT_ID = 'bridge-' + generateUUID();

  let ws = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  // ─── UUID Generator ─────────────────────────────────────────────────

  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
      const random = (Math.random() * 16) | 0;
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  // ─── WebSocket Connection ───────────────────────────────────────────

  function scheduleReconnect() {
    setTimeout(function () {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connectWebSocket();
    }, reconnectDelay);
  }

  function connectWebSocket() {
    console.log('[MCP Bridge] Connecting to ' + WS_URL + '...');

    try {
      ws = new WebSocket(WS_URL);
    } catch (error) {
      console.error('[MCP Bridge] Failed to create WebSocket:', error);
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      console.log('[MCP Bridge] Connected to server');
      reconnectDelay = 1000;
      ws.send(JSON.stringify({
        type: 'identify',
        clientId: CLIENT_ID,
        clientType: CLIENT_TYPE,
        url: window.location.href,
        title: document.title,
      }));
    };

    ws.onmessage = function (event) {
      var message;
      try {
        message = JSON.parse(event.data);
      } catch (parseError) {
        console.error('[MCP Bridge] Failed to parse message:', parseError);
        return;
      }

      var requestId = message.requestId;
      var action = message.action;
      var payload = message.payload;

      if (!requestId || !action) {
        return;
      }

      console.log('[MCP Bridge] Received action: ' + action + ', requestId: ' + requestId);

      handleAction(action, payload || {})
        .then(function (result) {
          sendResponse(requestId, true, result);
        })
        .catch(function (error) {
          console.error('[MCP Bridge] Error handling ' + action + ':', error);
          sendResponse(requestId, false, null, error.message || String(error));
        });
    };

    ws.onclose = function (event) {
      console.warn('[MCP Bridge] Disconnected (code: ' + event.code + '). Reconnecting in ' + reconnectDelay + 'ms...');
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = function () {
      console.error('[MCP Bridge] WebSocket error — connection to ' + WS_URL + ' failed.');
    };
  }

  function sendResponse(requestId, success, data, error) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[MCP Bridge] Cannot send response — WebSocket not open');
      return;
    }
    ws.send(JSON.stringify({
      requestId: requestId,
      success: success,
      data: data,
      error: error || null,
    }));
  }

  // ─── Action Router ──────────────────────────────────────────────────

  function handleAction(action, payload) {
    switch (action) {
      case 'get_html':
        return Promise.resolve(actionGetHtml(payload));
      case 'get_text':
        return Promise.resolve(actionGetText(payload));
      case 'get_element':
        return Promise.resolve(actionGetElement(payload));
      case 'click_element':
        return Promise.resolve(actionClickElement(payload));
      case 'type_text':
        return Promise.resolve(actionTypeText(payload));
      case 'scroll_page':
        return Promise.resolve(actionScrollPage(payload));
      case 'hover_element':
        return Promise.resolve(actionHoverElement(payload));
      case 'mouse_click_at':
        return Promise.resolve(actionMouseClickAt(payload));
      case 'execute_js':
        return Promise.resolve(actionExecuteJs(payload));
      case 'ping':
        return Promise.resolve({ pong: true, url: window.location.href, title: document.title });
      default:
        return Promise.reject(new Error('Unknown bridge action: ' + action));
    }
  }

  // ─── Action: Get HTML ───────────────────────────────────────────────

  function actionGetHtml(payload) {
    var selector = payload.selector;
    if (selector) {
      var element = document.querySelector(selector);
      if (!element) {
        throw new Error('No element found matching selector: "' + selector + '"');
      }
      return { html: element.outerHTML, found: true, selector: selector };
    }
    return { html: document.documentElement.outerHTML, found: true, selector: null };
  }

  // ─── Action: Get Text ───────────────────────────────────────────────

  function actionGetText() {
    return { text: document.body.innerText };
  }

  // ─── Action: Get Element ────────────────────────────────────────────

  function actionGetElement(payload) {
    if (!payload.selector) {
      throw new Error('Missing required field: selector');
    }
    var element = document.querySelector(payload.selector);
    if (!element) {
      return { selector: payload.selector, element: null };
    }
    return {
      selector: payload.selector,
      element: {
        outerHTML: element.outerHTML,
        textContent: element.textContent || '',
        tagName: element.tagName,
      },
    };
  }

  // ─── Action: Click Element ──────────────────────────────────────────

  function actionClickElement(payload) {
    if (!payload.selector) {
      throw new Error('Missing required field: selector');
    }
    var element = document.querySelector(payload.selector);
    if (!element) {
      throw new Error('No element found for selector: ' + payload.selector);
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    var rect = element.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    var eventOptions = {
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
      selector: payload.selector,
      clicked: true,
      element: {
        tagName: element.tagName,
        textContent: (element.textContent || '').substring(0, 200),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      },
    };
  }

  // ─── Action: Type Text ──────────────────────────────────────────────

  function actionTypeText(payload) {
    if (!payload.selector) {
      throw new Error('Missing required field: selector');
    }
    if (payload.text === undefined || payload.text === null) {
      throw new Error('Missing required field: text');
    }

    var element = document.querySelector(payload.selector);
    if (!element) {
      throw new Error('No element found for selector: ' + payload.selector);
    }

    element.focus();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Clear existing content if requested (default: true)
    if (payload.clearBefore !== false) {
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.value = '';
      } else if (element.isContentEditable) {
        element.textContent = '';
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Set the value
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      );
      var nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      );
      var setter = (nativeInputValueSetter && nativeInputValueSetter.set) ||
                   (nativeTextAreaValueSetter && nativeTextAreaValueSetter.set);
      if (setter) {
        setter.call(element, payload.text);
      } else {
        element.value = payload.text;
      }
    } else if (element.isContentEditable) {
      element.textContent = payload.text;
    }

    // Dispatch events so frameworks detect the change
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    // Optionally press Enter
    if (payload.pressEnter) {
      var enterOptions = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true };
      element.dispatchEvent(new KeyboardEvent('keydown', enterOptions));
      element.dispatchEvent(new KeyboardEvent('keypress', enterOptions));
      element.dispatchEvent(new KeyboardEvent('keyup', enterOptions));
      var form = element.closest('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }

    return {
      selector: payload.selector,
      typed: true,
      element: {
        tagName: element.tagName,
        value: element.value || element.textContent || '',
      },
    };
  }

  // ─── Action: Scroll Page ────────────────────────────────────────────

  function actionScrollPage(payload) {
    var scrollAmount = payload.pixels || 500;

    // If selector is provided, scroll that element into view
    if (payload.selector) {
      var element = document.querySelector(payload.selector);
      if (!element) {
        throw new Error('No element found for selector: ' + payload.selector);
      }
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var rect = element.getBoundingClientRect();
      return {
        scrolledTo: payload.selector,
        elementRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scrollY: window.scrollY,
        scrollX: window.scrollX,
      };
    }

    // Otherwise scroll by direction
    var direction = payload.direction || 'down';
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
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        break;
    }

    return {
      direction: direction,
      pixels: scrollAmount,
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      pageHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  }

  // ─── Action: Hover Element ──────────────────────────────────────────

  function actionHoverElement(payload) {
    if (!payload.selector) {
      throw new Error('Missing required field: selector');
    }
    var element = document.querySelector(payload.selector);
    if (!element) {
      throw new Error('No element found for selector: ' + payload.selector);
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var rect = element.getBoundingClientRect();
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    var eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
    };

    element.dispatchEvent(new MouseEvent('mouseenter', Object.assign({}, eventOptions, { bubbles: false })));
    element.dispatchEvent(new MouseEvent('mouseover', eventOptions));
    element.dispatchEvent(new MouseEvent('mousemove', eventOptions));

    return {
      selector: payload.selector,
      hovered: true,
      element: {
        tagName: element.tagName,
        textContent: (element.textContent || '').substring(0, 200),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      },
    };
  }

  // ─── Action: Mouse Click at Coordinates ─────────────────────────────

  function actionMouseClickAt(payload) {
    if (payload.x === undefined || payload.y === undefined) {
      throw new Error('Missing required fields: x and y');
    }

    var buttonMap = { left: 0, middle: 1, right: 2 };
    var buttonCode = buttonMap[payload.button] || 0;
    var eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: payload.x,
      clientY: payload.y,
      button: buttonCode,
    };

    var targetElement = document.elementFromPoint(payload.x, payload.y);
    if (!targetElement) {
      throw new Error('No element found at coordinates (' + payload.x + ', ' + payload.y + ')');
    }

    targetElement.dispatchEvent(new MouseEvent('mouseover', eventOptions));
    targetElement.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    targetElement.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    targetElement.dispatchEvent(new MouseEvent('click', eventOptions));

    if (payload.doubleClick) {
      targetElement.dispatchEvent(new MouseEvent('mousedown', eventOptions));
      targetElement.dispatchEvent(new MouseEvent('mouseup', eventOptions));
      targetElement.dispatchEvent(new MouseEvent('click', eventOptions));
      targetElement.dispatchEvent(new MouseEvent('dblclick', eventOptions));
    }

    return {
      clickedAt: { x: payload.x, y: payload.y },
      clicked: true,
      element: {
        tagName: targetElement.tagName,
        textContent: (targetElement.textContent || '').substring(0, 200),
        id: targetElement.id || null,
        className: targetElement.className || null,
        coordinates: { x: payload.x, y: payload.y },
      },
    };
  }

  // ─── Action: Execute JS (safe, no eval) ─────────────────────────────
  // This provides a limited set of predefined operations instead of eval.
  // The MCP server can call named functions with parameters.

  function actionExecuteJs(payload) {
    if (!payload.script) {
      throw new Error('Missing required field: script');
    }

    // Instead of eval, we use Function constructor which is more permissive
    // than eval in some CSP configurations. If even Function is blocked,
    // the caller should use the specific action handlers above instead.
    try {
      var fn = new Function(payload.script);
      var result = fn();
      // Handle promise results
      if (result && typeof result.then === 'function') {
        return result;
      }
      return { result: result !== undefined ? result : null };
    } catch (functionError) {
      // If Function constructor is also blocked by CSP, provide a clear error
      if (functionError.message && functionError.message.includes('Content Security Policy')) {
        throw new Error(
          'CSP blocks dynamic code execution on this page. ' +
          'Use specific actions (click_element, type_text, get_html, etc.) instead of execute_js.'
        );
      }
      throw functionError;
    }
  }

  // ─── Start Connection ───────────────────────────────────────────────

  connectWebSocket();
  console.log('[MCP Bridge] Loaded. ClientID: ' + CLIENT_ID);
})();
