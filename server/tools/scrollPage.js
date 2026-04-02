// tools/scrollPage.js — MCP tool: scroll the page or scroll to an element

export function scrollPageTool(wsServer) {
  return {
    name: 'scroll_page',
    description:
      'Scroll the page in a browser tab. Can scroll by direction (up/down/left/right), ' +
      'scroll to a specific element by CSS selector, or scroll to absolute coordinates. ' +
      'Useful for navigating long pages, revealing content below the fold, or scrolling to a specific section.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab. If omitted, uses the active tab.',
        },
        direction: {
          type: 'string',
          description: 'Scroll direction: "up", "down", "left", "right", "top" (page top), "bottom" (page bottom). Used when selector is not provided.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector of an element to scroll into view. Takes priority over direction.',
        },
        pixels: {
          type: 'number',
          description: 'Number of pixels to scroll when using direction. Defaults to 500.',
        },
      },
    },
    async handler(params) {
      const result = await wsServer.sendCommand('scroll_page', {
        tabId: params.tabId,
        direction: params.direction,
        selector: params.selector,
        pixels: params.pixels,
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
