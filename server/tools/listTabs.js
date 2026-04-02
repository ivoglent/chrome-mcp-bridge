// tools/listTabs.js — MCP tool: list all open browser tabs

export function listTabsTool(wsServer) {
  return {
    name: 'list_tabs',
    description: 'List all open browser tabs with their id, title, url, and active status.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async handler() {
      const result = await wsServer.sendCommand('list_tabs', {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  };
}
