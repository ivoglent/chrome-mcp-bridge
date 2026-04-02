// tools/typeText.js — MCP tool: type text into an input element

export function typeTextTool(wsServer) {
  return {
    name: 'type_text',
    description:
      'Type text into an input field, textarea, or contenteditable element identified by CSS selector. ' +
      'Optionally clear existing content before typing. ' +
      'Dispatches proper input/change events so frameworks (React, Vue, etc.) detect the change.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab. If omitted, uses the active tab.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for the input element (e.g., "input[name=\'email\']", "#search-box", "textarea.comment").',
        },
        text: {
          type: 'string',
          description: 'The text to type into the element.',
        },
        clearBefore: {
          type: 'boolean',
          description: 'Whether to clear existing content before typing. Defaults to true.',
        },
        pressEnter: {
          type: 'boolean',
          description: 'Whether to press Enter after typing. Useful for search boxes and forms.',
        },
      },
      required: ['selector', 'text'],
    },
    async handler(params) {
      const result = await wsServer.sendCommand('type_text', {
        tabId: params.tabId,
        selector: params.selector,
        text: params.text,
        clearBefore: params.clearBefore,
        pressEnter: params.pressEnter,
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
