// tools/closeTab.js — MCP tool: close a browser tab

export function closeTabTool(wsServer) {
  return {
    name: 'close_tab',
    description: 'Close a browser tab by its tab ID.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to close.',
        },
      },
      required: ['tabId'],
    },
    async handler(params) {
      const result = await wsServer.sendCommand('close_tab', {
        tabId: params.tabId,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Tab ${result.tabId} closed successfully.`,
          },
        ],
      };
    },
  };
}
