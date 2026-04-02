// tools/mouseClickAt.js — MCP tool: click at specific x,y coordinates

export function mouseClickAtTool(wsServer) {
  return {
    name: 'mouse_click_at',
    description:
      'Click at specific x,y pixel coordinates on the page. ' +
      'Useful when you know the position from a screenshot but not the CSS selector. ' +
      'Coordinates are relative to the viewport (visible area). ' +
      'Supports left, right, and middle click, as well as double-click.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab. If omitted, uses the active tab.',
        },
        x: {
          type: 'number',
          description: 'X coordinate (pixels from left edge of viewport).',
        },
        y: {
          type: 'number',
          description: 'Y coordinate (pixels from top edge of viewport).',
        },
        button: {
          type: 'string',
          description: 'Mouse button: "left" (default), "right", or "middle".',
        },
        doubleClick: {
          type: 'boolean',
          description: 'Whether to perform a double-click instead of single click.',
        },
      },
      required: ['x', 'y'],
    },
    async handler(params) {
      const result = await wsServer.sendCommand('mouse_click_at', {
        tabId: params.tabId,
        x: params.x,
        y: params.y,
        button: params.button,
        doubleClick: params.doubleClick,
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
