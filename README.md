# Chrome Extension MCP Bridge

> AI Agent controls Chrome browser via MCP protocol + Chrome Extension + WebSocket bridge

## Architecture

```
[AI Agent]
    ⇅ (MCP Tools via stdio)
[Node.js App — MCP Server + WebSocket Server]
    ⇅ (WebSocket on port 7890)
[Chrome Extension (Manifest V3)]
    ⇅ (chrome.* APIs)
[Browser Tabs]
```

### How It Works

1. **AI Agent** calls MCP tools (e.g., `capture_screenshot`, `execute_js`) via the MCP protocol (stdio transport)
2. **Node.js Server** receives the MCP tool call, generates a `requestId`, and sends a JSON command over WebSocket to the Chrome Extension
3. **Chrome Extension** (service worker) receives the command, executes the browser action using Chrome APIs, and sends back a JSON response with the same `requestId`
4. **Node.js Server** resolves the pending Promise and returns the result to the AI Agent

---

## Project Structure

```
/chrome-extension-mcp
├── extension/                  # Chrome Extension (Manifest V3)
│   ├── manifest.json           # Extension manifest
│   ├── background.js           # Service worker — WS client + action handlers
│   └── content.js              # Content script (placeholder)
├── server/                     # Node.js backend
│   ├── index.js                # Entry point — starts WS + MCP servers
│   ├── wsServer.js             # WebSocket server — client management + command dispatch
│   ├── mcpServer.js            # MCP server — tool registration via @modelcontextprotocol/sdk
│   ├── cli.js                  # CLI tool for testing commands
│   ├── tools/                  # MCP tool definitions
│   │   ├── captureScreenshot.js
│   │   ├── getHtml.js
│   │   ├── executeJs.js
│   │   ├── openTab.js
│   │   ├── listTabs.js
│   │   └── closeTab.js
│   └── package.json            # Server dependencies
├── package.json                # Root scripts
└── README.md                   # This file
```

---

## MCP Tools

| Tool | Description | Input |
|------|-------------|-------|
| `capture_screenshot` | Capture a tab screenshot as base64 PNG | `{ tabId?, title? }` |
| `get_html` | Get full HTML source of a page | `{ tabId? }` |
| `execute_js` | Execute JavaScript in page context | `{ tabId?, script }` |
| `open_tab` | Open a new browser tab | `{ url }` |
| `list_tabs` | List all open tabs | `{}` |
| `close_tab` | Close a tab by ID | `{ tabId }` |

### Additional Extension Actions (available via CLI/WebSocket)

| Action | Description | Payload |
|--------|-------------|---------|
| `focus_tab` | Focus/activate a tab | `{ tabId }` |
| `get_text` | Extract visible text from a page | `{ tabId? }` |
| `get_element` | Get element by CSS selector | `{ tabId?, selector }` |

---

## Communication Protocol

### Request (Server → Extension)

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "action": "capture_screenshot",
  "payload": {
    "tabId": 123
  }
}
```

### Response (Extension → Server)

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": true,
  "data": {
    "tabId": 123,
    "format": "png",
    "base64": "iVBORw0KGgo..."
  },
  "error": null
}
```

### Error Response

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "success": false,
  "data": null,
  "error": "No active tab found"
}
```

---

## Setup Instructions

### Prerequisites

- **Node.js** v18+ (LTS recommended)
- **Google Chrome** browser
- **npm** package manager

### 1. Install Server Dependencies

```bash
cd server
npm install
```

Or from the project root:

```bash
npm run install:server
```

### 2. Start the Node.js Server

The server runs two components simultaneously:
- **WebSocket Server** on port `7890` (configurable via `WS_PORT` env var)
- **MCP Server** on stdio (for AI Agent communication)

```bash
cd server
node index.js
```

Or from the project root:

```bash
npm start
```

You should see:

```
[WS] WebSocket server attached to HTTP server
[Server] HTTP + WebSocket server listening on port 7890
[MCP] Server started on stdio transport
```

### 3. Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `extension/` folder from this project
5. The extension will load and automatically connect to the WebSocket server

You can verify the connection:
- Open the extension's service worker console (click "Inspect views: service worker" on the extensions page)
- You should see: `[MCP Extension] Connected to server`

### 4. Verify the Health Check

```bash
curl http://localhost:7890/health
```

Expected response:

```json
{
  "status": "ok",
  "connectedClients": 1,
  "clients": ["<client-uuid>"]
}
```

---

## Testing MCP Tools

### Using the CLI Tool

The CLI tool connects directly to the WebSocket server and sends commands to the extension.

#### Single Command Mode

```bash
# List all open tabs
cd server
node cli.js list_tabs

# Open a new tab
node cli.js open_tab '{"url":"https://www.google.com"}'

# Capture screenshot of active tab
node cli.js capture_screenshot

# Capture screenshot by tab title
node cli.js capture_screenshot '{"title":"Google"}'

# Get HTML of active tab
node cli.js get_html

# Execute JavaScript
node cli.js execute_js '{"script":"return document.title"}'

# Close a tab (use tabId from list_tabs)
node cli.js close_tab '{"tabId":123}'

# Get visible text
node cli.js get_text

# Get element by selector
node cli.js get_element '{"selector":"h1"}'
```

#### Interactive Mode

```bash
cd server
node cli.js
```

This starts a REPL where you can type commands:

```
mcp> list_tabs
mcp> open_tab {"url":"https://github.com"}
mcp> capture_screenshot {"title":"GitHub"}
mcp> execute_js {"script":"return document.title"}
mcp> exit
```

### Using with an AI Agent (MCP Client)

Configure your MCP client (e.g., Claude Desktop, Cursor, etc.) to use this server:

#### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chrome-browser": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-extension-mcp/server/index.js"],
      "env": {
        "WS_PORT": "7890"
      }
    }
  }
}
```

#### Cursor Configuration

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "chrome-browser": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-extension-mcp/server/index.js"],
      "env": {
        "WS_PORT": "7890"
      }
    }
  }
}
```

After configuration, the AI Agent will have access to all 6 MCP tools to control your Chrome browser.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PORT` | `7890` | WebSocket + HTTP server port |
| `WS_URL` | `ws://localhost:7890` | WebSocket URL (CLI only) |

### Extension Settings

The WebSocket URL is hardcoded in `extension/background.js`:

```javascript
const WS_URL = 'ws://localhost:7890';
```

Change this if your server runs on a different host/port.

---

## Security Considerations

1. **Local-only by default**: The WebSocket server binds to `localhost`. The extension only connects to `localhost`.
2. **No arbitrary code execution without explicit tool call**: The `execute_js` tool requires an explicit `script` parameter — the extension won't execute code without a proper request.
3. **Request-response correlation**: Every command uses a unique `requestId` (UUID v4) to prevent response spoofing.
4. **Timeout protection**: Commands timeout after 30 seconds to prevent hanging.
5. **Client identification**: Each extension identifies itself with a unique `clientId` on connection.

### Production Recommendations

- Add authentication tokens to WebSocket connections
- Restrict `execute_js` to a whitelist of allowed scripts
- Use WSS (WebSocket Secure) with TLS certificates
- Add rate limiting to prevent abuse

---

## Error Handling

### Server-side

- **No clients connected**: Returns `"No Chrome extension clients connected"`
- **Request timeout**: Returns `"Request timed out after 30000ms"`
- **Send failure**: Returns `"Failed to send command: ..."`

### Extension-side

- **Unknown action**: Returns `"Unknown action: <action>"`
- **Missing required fields**: Returns `"Missing required field: <field>"`
- **Tab not found**: Returns `"No tab found matching title: <title>"`
- **Script execution error**: Returns the error message from the page context

---

## Development

### Debugging the Extension

1. Go to `chrome://extensions/`
2. Find "Chrome Extension MCP Bridge"
3. Click **"Inspect views: service worker"** to open DevTools
4. All logs are prefixed with `[MCP Extension]`

### Debugging the Server

All server logs go to `stderr` (so they don't interfere with MCP stdio communication):

- `[WS]` — WebSocket server events
- `[MCP]` — MCP server events
- `[Server]` — General server events

### Adding New Tools

1. Create a new file in `server/tools/` following the existing pattern
2. Export a factory function that takes `wsServer` and returns `{ name, description, inputSchema, handler }`
3. Import and register it in `server/mcpServer.js`
4. Add the corresponding action handler in `extension/background.js`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Extension won't connect | Make sure the server is running first (`node server/index.js`) |
| "No Chrome extension clients connected" | Check that the extension is loaded and the service worker is active |
| Screenshot returns error | Some pages (chrome://, file://) don't allow screenshots |
| execute_js fails | Some pages have CSP restrictions that block injected scripts |
| Service worker goes inactive | Chrome may suspend idle service workers; the auto-reconnect handles this |
| Port 7890 already in use | Change `WS_PORT` environment variable or kill the existing process |

---

## License

MIT
