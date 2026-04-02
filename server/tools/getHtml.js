// tools/getHtml.js — MCP tool: get full HTML source of a page

export function getHtmlTool(wsServer) {
  return {
    name: 'get_html',
    description: 'Get the full HTML source (outerHTML) of a browser tab. Defaults to the active tab if no tabId is provided.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab. If omitted, uses the active tab.',
        },
      },
    },
    async handler(params) {
      const result = await wsServer.sendCommand('get_html', {
        tabId: params.tabId,
      });
      return {
        content: [
          {
            type: 'text',
            text: result.html,
          },
        ],
      };
    },
  };
}
