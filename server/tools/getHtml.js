// tools/getHtml.js — MCP tool: get HTML source of a page or element
import { resolveEffectiveTabId } from '../tabState.js';

const DEFAULT_MAX_LENGTH = 100000;

export function getHtmlTool(wsServer) {
  return {
    name: 'get_html',
    description:
      'Get the HTML source of a browser tab. By default returns the full page outerHTML. ' +
      'Use "selector" to get only a specific element\'s HTML. ' +
      'Use "maxLength" to truncate large results (default: 100000 chars).',
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
            'CSS selector to get HTML of a specific element instead of the full page. ' +
            'Recommended for large pages to reduce response size.',
        },
        maxLength: {
          type: 'number',
          description:
            `Maximum character length of the returned HTML (default: ${DEFAULT_MAX_LENGTH}). ` +
            'If the HTML exceeds this limit, it will be truncated with a notice.',
        },
      },
    },
    async handler(params) {
      const result = await wsServer.sendCommand('get_html', {
        tabId: resolveEffectiveTabId(params.tabId),
        selector: params.selector,
      });

      let html = result.html || '';
      const maxLength = params.maxLength ?? DEFAULT_MAX_LENGTH;
      let truncated = false;
      const originalLength = html.length;

      if (html.length > maxLength) {
        html = html.substring(0, maxLength);
        truncated = true;
      }

      const meta = [];
      if (result.selector) {
        meta.push(`Selector: ${result.selector}`);
      }
      meta.push(`Tab: ${result.tabId}`);
      meta.push(`Length: ${originalLength} chars`);
      if (truncated) {
        meta.push(`⚠️ Truncated to ${maxLength} chars. Use a more specific "selector" or reduce "maxLength" to get smaller results.`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `[${meta.join(' | ')}]\n\n${html}`,
          },
        ],
      };
    },
  };
}