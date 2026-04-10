// wsServer.js — WebSocket Server for Chrome Extension + Bridge communication
// Supports two client types:
//   - "extension": Chrome extension service worker (handles tabs, screenshots)
//   - "bridge":    Injected page script (handles DOM actions: click, type, scroll, etc.)
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {Object} ClientInfo
 * @property {import('ws').WebSocket} socket
 * @property {string} clientType - 'extension' | 'bridge'
 * @property {string} [url] - Page URL (bridge clients only)
 * @property {string} [title] - Page title (bridge clients only)
 */

/** @type {Map<string, ClientInfo>} clientId → ClientInfo */
const clients = new Map();

/** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const pendingRequests = new Map();

const REQUEST_TIMEOUT_MS = 30000;

// Actions that must be handled by the Chrome extension (require Chrome APIs)
const EXTENSION_ACTIONS = new Set([
  'capture_screenshot',
  'open_tab',
  'close_tab',
  'list_tabs',
  'focus_tab',
  'inject_bridge',
]);

/**
 * Start the WebSocket server on the given HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {{ sendCommand: Function, getClients: Function, getBridgeClients: Function, getExtensionClients: Function }}
 */
export function createWsServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/' });

  wss.on('connection', (socket, request) => {
    const origin = request.headers.origin || 'unknown';
    console.error(`[WS] New connection from origin: ${origin}`);

    let clientId = null;

    socket.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (error) {
        console.error('[WS] Failed to parse message:', error);
        return;
      }

      // Handle identification message from extension or bridge
      if (message.type === 'identify' && message.clientId) {
        clientId = message.clientId;
        clients.set(clientId, {
          socket,
          clientType: message.clientType || 'extension',
          url: message.url || null,
          title: message.title || null,
        });
        console.error(`[WS] Client identified: ${clientId} (type: ${message.clientType || 'extension'}, total: ${clients.size})`);
        return;
      }

      // Handle response to a pending request
      if (message.requestId && pendingRequests.has(message.requestId)) {
        const pending = pendingRequests.get(message.requestId);
        clearTimeout(pending.timer);
        pendingRequests.delete(message.requestId);

        if (message.success) {
          console.error(`[WS] Response received for ${message.requestId}: success`);
          pending.resolve(message.data);
        } else {
          console.error(`[WS] Response received for ${message.requestId}: error`);
          pending.reject(new Error(message.error || 'Unknown error'));
        }
        return;
      }

      console.error('[WS] Unhandled message:', message);
    });

    socket.on('close', () => {
      if (clientId) {
        clients.delete(clientId);
        console.error(`[WS] Client disconnected: ${clientId} (total: ${clients.size})`);
      }
    });

    socket.on('error', (error) => {
      console.error(`[WS] Socket error for ${clientId || 'unknown'}:`, error.message);
    });
  });

  console.error('[WS] WebSocket server attached to HTTP server');

  /**
   * Find the best client to handle a given action.
   * Extension actions → route to an extension client.
   * Page-level actions → route to a bridge client (optionally matching by tabId/URL).
   */
  function findClientForAction(action, payload = {}, targetClientId = null) {
    // If a specific client is requested, use it directly
    if (targetClientId) {
      const clientInfo = clients.get(targetClientId);
      if (!clientInfo) {
        throw new Error(`Client not found: ${targetClientId}`);
      }
      return clientInfo.socket;
    }

    const isExtensionAction = EXTENSION_ACTIONS.has(action);

    if (isExtensionAction) {
      // Find first extension client
      for (const [, clientInfo] of clients) {
        if (clientInfo.clientType === 'extension') {
          return clientInfo.socket;
        }
      }
      throw new Error('No Chrome extension clients connected. Is the extension installed and running?');
    }

    // For page-level actions, find a bridge client
    // If tabId is provided, we can't match by tabId directly (bridge doesn't know its tabId),
    // but we can try to match by URL if provided
    for (const [, clientInfo] of clients) {
      if (clientInfo.clientType === 'bridge') {
        return clientInfo.socket;
      }
    }

    // Fallback: try extension client (it may still handle some actions via chrome.scripting)
    for (const [, clientInfo] of clients) {
      if (clientInfo.clientType === 'extension') {
        return clientInfo.socket;
      }
    }

    throw new Error('No clients connected (neither extension nor bridge).');
  }

  return {
    /**
     * Send a command to the appropriate client and await the response.
     * Automatically routes to extension or bridge based on the action type.
     * @param {string} action - The action name
     * @param {object} payload - The action payload
     * @param {string} [targetClientId] - Specific client to target (optional)
     * @returns {Promise<any>}
     */
    sendCommand(action, payload = {}, targetClientId = null) {
      return new Promise((resolve, reject) => {
        let socket;
        try {
          socket = findClientForAction(action, payload, targetClientId);
        } catch (findError) {
          return reject(findError);
        }

        const requestId = uuidv4();
        const message = { requestId, action, payload };

        console.error(`[WS] Sending command: ${action} (requestId: ${requestId})`);

        const timer = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms (action: ${action})`));
        }, REQUEST_TIMEOUT_MS);

        pendingRequests.set(requestId, { resolve, reject, timer });

        try {
          socket.send(JSON.stringify(message));
        } catch (sendError) {
          clearTimeout(timer);
          pendingRequests.delete(requestId);
          reject(new Error(`Failed to send command: ${sendError.message}`));
        }
      });
    },

    /**
     * Get list of all connected client IDs.
     * @returns {string[]}
     */
    getClients() {
      return Array.from(clients.keys());
    },

    /**
     * Get bridge client details (for health check / debugging).
     * @returns {Array<{ clientId: string, url: string, title: string }>}
     */
    getBridgeClients() {
      const result = [];
      for (const [clientId, info] of clients) {
        if (info.clientType === 'bridge') {
          result.push({ clientId, url: info.url, title: info.title });
        }
      }
      return result;
    },

    /**
     * Get extension client IDs.
     * @returns {string[]}
     */
    getExtensionClients() {
      const result = [];
      for (const [clientId, info] of clients) {
        if (info.clientType === 'extension') {
          result.push(clientId);
        }
      }
      return result;
    },
  };
}
