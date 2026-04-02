#!/usr/bin/env node
// index.js — Entry point: starts WebSocket server + MCP server
import http from 'node:http';
import express from 'express';
import { createWsServer } from './wsServer.js';
import { startMcpServer } from './mcpServer.js';

const WS_PORT = parseInt(process.env.WS_PORT || '7890', 10);

// ─── Express app for health check ───────────────────────────────────
const app = express();

app.get('/health', (_req, res) => {
  const wsClients = wsServer.getClients();
  res.json({
    status: 'ok',
    connectedClients: wsClients.length,
    clients: wsClients,
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
