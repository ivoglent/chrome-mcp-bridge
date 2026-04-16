// tools/pinTab.js — MCP tool: pin a tab so all subsequent tool calls target it
import { pinTab, getPinnedTabId } from '../tabState.js';

export function pinTabTool(wsServer) {
  return {
    name: 'pin_tab',
    description:
      'Pin a specific browser tab by its ID. Once pinned, all subsequent tool calls ' +
      '(execute_js, get_html, click_element, etc.) will automatically target this tab ' +
      'without needing to pass tabId each time. Use list_tabs to find the tab ID first.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to pin as the default target.',
        },
      },
      required: ['tabId'],
    },
    async handler(params) {
      pinTab(params.tabId);
      return {
        content: [
          {
            type: 'text',
            text: `Tab ${params.tabId} is now pinned. All tool calls will target this tab by default.`,
          },
        ],
      };
    },
  };
}
