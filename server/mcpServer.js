// mcpServer.js — MCP Server that exposes browser control tools to AI Agents
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { captureScreenshotTool } from './tools/captureScreenshot.js';
import { getHtmlTool } from './tools/getHtml.js';
import { executeJsTool } from './tools/executeJs.js';
import { openTabTool } from './tools/openTab.js';
import { listTabsTool } from './tools/listTabs.js';
import { closeTabTool } from './tools/closeTab.js';
import { clickElementTool } from './tools/clickElement.js';
import { typeTextTool } from './tools/typeText.js';
import { scrollPageTool } from './tools/scrollPage.js';
import { hoverElementTool } from './tools/hoverElement.js';
import { mouseClickAtTool } from './tools/mouseClickAt.js';

/**
 * Create and start the MCP server.
 * @param {object} wsServer - The WebSocket server instance with sendCommand method
 */
export async function startMcpServer(wsServer) {
  const server = new McpServer({
    name: 'chrome-extension-mcp',
    version: '1.0.0',
  });

  // Register all tools
  const tools = [
    captureScreenshotTool(wsServer),
    getHtmlTool(wsServer),
    executeJsTool(wsServer),
    openTabTool(wsServer),
    listTabsTool(wsServer),
    closeTabTool(wsServer),
    clickElementTool(wsServer),
    typeTextTool(wsServer),
    scrollPageTool(wsServer),
    hoverElementTool(wsServer),
    mouseClickAtTool(wsServer),
  ];

  for (const tool of tools) {
    // Convert JSON Schema properties to Zod schema
    const zodShape = {};
    const properties = tool.inputSchema.properties || {};
    const required = tool.inputSchema.required || [];

    for (const [key, prop] of Object.entries(properties)) {
      let zodType;
      switch (prop.type) {
        case 'number':
          zodType = z.number().describe(prop.description || '');
          break;
        case 'string':
          zodType = z.string().describe(prop.description || '');
          break;
        case 'boolean':
          zodType = z.boolean().describe(prop.description || '');
          break;
        default:
          zodType = z.any().describe(prop.description || '');
      }
      if (!required.includes(key)) {
        zodType = zodType.optional();
      }
      zodShape[key] = zodType;
    }

    server.tool(tool.name, tool.description, zodShape, async (params) => {
      try {
        return await tool.handler(params);
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Server started on stdio transport');
}
