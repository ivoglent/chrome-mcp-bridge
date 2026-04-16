// tools/executeJs.js — MCP tool: execute JavaScript in a browser tab
import { resolveEffectiveTabId } from '../tabState.js';

export function executeJsTool(wsServer) {
  return {
    name: 'execute_js',
    description: 'Execute arbitrary JavaScript code in the context of a browser tab. Returns the result of the execution. Use with caution.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab. If omitted, uses the active tab.',
        },
        script: {
          type: 'string',
          description: 'The JavaScript code to execute in the page context.',
        },
      },
      required: ['script'],
    },
    async handler(params) {
      const result = await wsServer.sendCommand('execute_js', {
        tabId: resolveEffectiveTabId(params.tabId),
        script: params.script,
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.result, null, 2) ?? 'undefined',
          },
        ],
      };
    },
  };
}