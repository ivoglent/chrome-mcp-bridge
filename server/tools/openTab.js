// tools/openTab.js — MCP tool: open a new browser tab

export function openTabTool(wsServer) {
  return {
    name: 'open_tab',
    description: 'Open a new browser tab with the specified URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to open in the new tab.',
        },
      },
      required: ['url'],
    },
    async handler(params) {
      const result = await wsServer.sendCommand('open_tab', {
        url: params.url,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Opened new tab (id: ${result.tabId}) with URL: ${result.url}`,
          },
        ],
      };
    },
  };
}
