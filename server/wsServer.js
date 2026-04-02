// wsServer.js — WebSocket Server for Chrome Extension communication
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

/** @type {Map<string, import('ws').WebSocket>} clientId → WebSocket */
const clients = new Map();

/** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} requestId → pending promise */
const pendingRequests = new Map();

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Start the WebSocket server on the given HTTP server or port.
 * @param {import('http').Server} httpServer
 * @returns {{ sendCommand: Function, getClients: Function }}
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

      // Handle identification message from extension
      if (message.type === 'identify' && message.clientId) {
        clientId = message.clientId;
        clients.set(clientId, socket);
        console.error(`[WS] Client identified: ${clientId} (total: ${clients.size})`);
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
          pending.reject(new Error(message.error || 'Unknown extension error'));
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

  return {
    /**
     * Send a command to a connected extension client and await the response.
     * @param {string} action - The action name (e.g., 'capture_screenshot')
     * @param {object} payload - The action payload
     * @param {string} [targetClientId] - Specific client to target (optional, defaults to first available)
     * @returns {Promise<any>}
     */
    sendCommand(action, payload = {}, targetClientId = null) {
      return new Promise((resolve, reject) => {
        // Find target client
        let socket;
        if (targetClientId) {
          socket = clients.get(targetClientId);
          if (!socket) {
            return reject(new Error(`Client not found: ${targetClientId}`));
          }
        } else {
          // Use first available client
          const firstEntry = clients.entries().next().value;
          if (!firstEntry) {
            return reject(new Error('No Chrome extension clients connected'));
          }
          socket = firstEntry[1];
        }

        const requestId = uuidv4();
        const message = { requestId, action, payload };

        console.error(`[WS] Sending command: ${action} (requestId: ${requestId})`);

        // Set timeout
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
     * Get list of connected client IDs.
     * @returns {string[]}
     */
    getClients() {
      return Array.from(clients.keys());
    },
  };
}
