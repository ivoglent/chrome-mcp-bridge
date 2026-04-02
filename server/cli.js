#!/usr/bin/env node
// cli.js — Simple CLI to test MCP tools by sending WebSocket commands directly
// Usage: node cli.js <action> [json-payload]
// Example: node cli.js list_tabs
// Example: node cli.js open_tab '{"url":"https://google.com"}'
// Example: node cli.js capture_screenshot '{"title":"Google"}'

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createInterface } from 'node:readline';

const WS_URL = process.env.WS_URL || 'ws://localhost:7890';
const TIMEOUT_MS = 30000;

/** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const pendingRequests = new Map();

function printUsage() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Chrome Extension MCP — CLI Tester            ║
╚══════════════════════════════════════════════════════╝

Usage:
  node cli.js <action> [json-payload]

Available actions:
  list_tabs                          List all open browser tabs
  open_tab       {"url":"..."}       Open a new tab
  close_tab      {"tabId":123}       Close a tab
  focus_tab      {"tabId":123}       Focus a tab
  capture_screenshot                 Screenshot active tab
  capture_screenshot {"tabId":123}   Screenshot specific tab
  capture_screenshot {"title":"..."}  Screenshot tab by title
  get_html                           Get HTML of active tab
  get_html       {"tabId":123}       Get HTML of specific tab
  execute_js     {"script":"..."}    Execute JS in active tab
  get_text                           Get visible text of active tab
  get_element    {"selector":"..."}  Get element by CSS selector

Interactive mode:
  node cli.js                        Start interactive REPL

Environment:
  WS_URL=ws://host:port              WebSocket server URL (default: ws://localhost:7890)
`);
}

function sendCommand(ws, action, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = uuidv4();

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Timeout after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, reject, timer });

    const message = { requestId, action, payload };
    console.log(`\n→ Sending: ${JSON.stringify(message, null, 2)}`);
    ws.send(JSON.stringify(message));
  });
}

function handleResponse(raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch (error) {
    console.error('Failed to parse response:', error);
    return;
  }

  if (message.requestId && pendingRequests.has(message.requestId)) {
    const pending = pendingRequests.get(message.requestId);
    clearTimeout(pending.timer);
    pendingRequests.delete(message.requestId);

    if (message.success) {
      pending.resolve(message.data);
    } else {
      pending.reject(new Error(message.error || 'Unknown error'));
    }
  }
}

function formatResult(data) {
  if (!data) return 'null';

  // Truncate base64 screenshot data for display
  if (data.base64) {
    const truncated = { ...data, base64: `[${data.base64.length} chars base64 data]` };
    return JSON.stringify(truncated, null, 2);
  }

  // Truncate long HTML
  if (data.html && data.html.length > 500) {
    const truncated = { ...data, html: data.html.substring(0, 500) + `... [${data.html.length} total chars]` };
    return JSON.stringify(truncated, null, 2);
  }

  // Truncate long text
  if (data.text && data.text.length > 500) {
    const truncated = { ...data, text: data.text.substring(0, 500) + `... [${data.text.length} total chars]` };
    return JSON.stringify(truncated, null, 2);
  }

  return JSON.stringify(data, null, 2);
}

async function runSingleCommand(ws, action, payloadStr) {
  let payload = {};
  if (payloadStr) {
    try {
      payload = JSON.parse(payloadStr);
    } catch (error) {
      console.error(`Invalid JSON payload: ${payloadStr}`);
      process.exit(1);
    }
  }

  try {
    const result = await sendCommand(ws, action, payload);
    console.log(`\n✅ Success:\n${formatResult(result)}`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
  }
}

async function startInteractiveMode(ws) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nmcp> ',
  });

  console.log('Interactive mode. Type "help" for commands, "exit" to quit.\n');
  readline.prompt();

  readline.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      readline.prompt();
      return;
    }

    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log('Goodbye!');
      process.exit(0);
    }

    if (trimmed === 'help') {
      printUsage();
      readline.prompt();
      return;
    }

    // Parse: action [json-payload]
    const spaceIndex = trimmed.indexOf(' ');
    let action, payloadStr;
    if (spaceIndex === -1) {
      action = trimmed;
      payloadStr = null;
    } else {
      action = trimmed.substring(0, spaceIndex);
      payloadStr = trimmed.substring(spaceIndex + 1).trim();
    }

    await runSingleCommand(ws, action, payloadStr);
    readline.prompt();
  });

  readline.on('close', () => {
    process.exit(0);
  });
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  console.log(`Connecting to ${WS_URL}...`);

  const ws = new WebSocket(WS_URL);

  ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message}`);
    console.error('Make sure the server is running: cd server && node index.js');
    process.exit(1);
  });

  ws.on('message', handleResponse);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Identify as CLI client
  ws.send(JSON.stringify({ type: 'identify', clientId: `cli-${uuidv4().slice(0, 8)}` }));
  console.log('Connected!\n');

  if (args.length === 0) {
    // Interactive mode
    await startInteractiveMode(ws);
  } else {
    // Single command mode
    const action = args[0];
    const payloadStr = args[1] || null;
    await runSingleCommand(ws, action, payloadStr);
    ws.close();
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
