// tools/captureScreenshot.js — MCP tool: capture browser tab screenshot

/**
 * @param {object} wsServer - The WebSocket server instance with sendCommand
 * @returns {{ name: string, description: string, inputSchema: object, handler: Function }}
 */
export function captureScreenshotTool(wsServer) {
  return {
    name: 'capture_screenshot',
    description: 'Capture a screenshot of a browser tab. Returns base64-encoded PNG image. Can target by tabId, by title search, or default to the active tab.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'The ID of the tab to capture. If omitted, captures the active tab.',
        },
        title: {
          type: 'string',
          description: 'Search for a tab by title (case-insensitive partial match).',
        },
      },
    },
    async handler(params) {
      console.error(`[capture_screenshot] Sending command with params:`, JSON.stringify(params));
      const result = await wsServer.sendCommand('capture_screenshot', {
        tabId: params.tabId,
        title: params.title,
      });
      console.error(`[capture_screenshot] Got result, base64 length: ${result?.base64?.length}, tabId: ${result?.tabId}`);

      const base64Data = result.base64;
      if (!base64Data) {
        throw new Error('No screenshot data received from extension');
      }

      // Return as both image content (for MCP clients that support it)
      // and text content with data URL (as fallback)
      const dataUrl = `data:image/png;base64,${base64Data}`;
      return {
        content: [
          {
            type: 'text',
            text: `Screenshot captured from tab ${result.tabId} (format: ${result.format}, ${base64Data.length} chars base64).\n\n![screenshot](${dataUrl})`,
          },
        ],
      };
    },
  };
}
