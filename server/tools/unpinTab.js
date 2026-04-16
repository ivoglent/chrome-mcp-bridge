// tools/unpinTab.js — MCP tool: unpin the current tab, reverting to active-tab behavior
import { unpinTab, getPinnedTabId } from '../tabState.js';

export function unpinTabTool(wsServer) {
  return {
    name: 'unpin_tab',
    description:
      'Unpin the currently pinned tab. After unpinning, tool calls will revert to ' +
      'targeting the active tab (default Chrome behavior) unless a tabId is explicitly provided.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async handler() {
      const previousTabId = getPinnedTabId();
      unpinTab();
      const message = previousTabId
        ? `Tab ${previousTabId} has been unpinned. Tools will now target the active tab by default.`
        : 'No tab was pinned. Tools will target the active tab by default.';
      return {
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      };
    },
  };
}
