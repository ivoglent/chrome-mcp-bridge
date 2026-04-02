// tools/clickElement.js — MCP tool: click an element by CSS selector

export function clickElementTool(wsServer) {
  return {
    name: 'click_element',
    description:
      'Click on an element in a browser tab identified by CSS selector. ' +
      'Useful for clicking buttons, links, radio buttons, checkboxes, etc. ' +
      'The element is scrolled into view before clicking.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab. If omitted, uses the active tab.',
        },
        selector: {
          type: 'string',
          description:
            'CSS selector to find the element to click (e.g., "button.submit", "#next", "a[href=\'/page2\']").',
        },
      },
      required: ['selector'],
    },
    async handler(params) {
      const result = await wsServer.sendCommand('click_element', {
        tabId: params.tabId,
        selector: params.selector,
      });
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
