#!/usr/bin/env node
// index.js — Entry point: starts WebSocket server + MCP server
// Also serves the inject/mcp-bridge.js file for remote injection.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createWsServer } from './wsServer.js';
import { startMcpServer } from './mcpServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WS_PORT = parseInt(process.env.WS_PORT || '7890', 10);

// ─── Express app ────────────────────────────────────────────────────
const app = express();

// Serve the bridge script so the extension can inject it via <script src="...">
// In production, host this on a proper HTTPS CDN instead.
const injectDir = path.resolve(__dirname, '..', 'inject');
app.use('/mcp-bridge.js', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(injectDir, 'mcp-bridge.js'));
});

// Health check endpoint
app.get('/health', (_req, res) => {
  const allClients = wsServer.getClients();
  const bridgeClients = wsServer.getBridgeClients();
  const extensionClients = wsServer.getExtensionClients();
  res.json({
    status: 'ok',
    totalClients: allClients.length,
    extensionClients,
    bridgeClients,
  });
});

// ─── HTTP + WebSocket Server ────────────────────────────────────────
const httpServer = http.createServer(app);
const wsServer = createWsServer(httpServer);

httpServer.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${WS_PORT} is already in use. Kill the existing process or set WS_PORT env var.`);
  } else {
    console.error('[Server] HTTP server error:', error.message);
  }
  process.exit(1);
});

httpServer.listen(WS_PORT, () => {
  console.error(`[Server] HTTP + WebSocket server listening on port ${WS_PORT}`);
  console.error(`[Server] Bridge script available at http://localhost:${WS_PORT}/mcp-bridge.js`);
});

// ─── MCP Server (stdio) ────────────────────────────────────────────
startMcpServer(wsServer).catch((error) => {
  console.error('[Server] Failed to start MCP server:', error);
  process.exit(1);
});

// ─── Graceful shutdown ─────────────────────────────────────────────
process.on('SIGINT', () => {
  console.error('[Server] Shutting down...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[Server] Shutting down...');
  httpServer.close();
  process.exit(0);
});
