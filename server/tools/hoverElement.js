// tools/hoverElement.js — MCP tool: hover over an element
import { resolveEffectiveTabId } from '../tabState.js';

export function hoverElementTool(wsServer) {
  return {
    name: 'hover_element',
    description:
      'Hover over (mouseover) an element identified by CSS selector. ' +
      'Triggers mouseenter and mouseover events. Useful for revealing tooltips, dropdown menus, or hover-dependent UI.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab. If omitted, uses the active tab.',
        },
        selector: {
          type: 'string',
          description: 'CSS selector of the element to hover over.',
        },
      },
      required: ['selector'],
    },
    async handler(params) {
      const result = await wsServer.sendCommand('hover_element', {
        tabId: resolveEffectiveTabId(params.tabId),
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