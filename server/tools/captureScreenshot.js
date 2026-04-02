// tools/captureScreenshot.js — MCP tool: capture browser tab screenshot

/**
 * @param {object} wsServer - The WebSocket server instance with sendCommand
 * @returns {{ name: string, description: string, inputSchema: object, handler: Function }}
 */
export function captureScreenshotTool(wsServer) {
  return {
    name: 'capture_screenshot',
    description:
      'Capture a screenshot of a browser tab. Returns base64-encoded image. ' +
      'Can target by tabId, by title search, or default to the active tab. ' +
      'Use "format" and "quality" to control image size (jpeg with lower quality = smaller payload).',
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
        format: {
          type: 'string',
          enum: ['png', 'jpeg'],
          description: 'Image format. Use "jpeg" for smaller file size (default: "jpeg").',
        },
        quality: {
          type: 'number',
          description: 'JPEG quality 0-100. Lower = smaller size. Only applies when format is "jpeg" (default: 50).',
        },
      },
    },
    async handler(params) {
      const format = params.format || 'jpeg';
      const quality = params.quality ?? 50;

      console.error(`[capture_screenshot] Sending command with params:`, JSON.stringify(params));
      const result = await wsServer.sendCommand('capture_screenshot', {
        tabId: params.tabId,
        title: params.title,
        format,
        quality,
      });
      console.error(`[capture_screenshot] Got result, base64 length: ${result?.base64?.length}, tabId: ${result?.tabId}`);

      const base64Data = result.base64;
      if (!base64Data) {
        throw new Error('No screenshot data received from extension');
      }

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const sizeKB = Math.round((base64Data.length * 3) / 4 / 1024);

      return {
        content: [
          {
            type: 'text',
            text: `Screenshot captured from tab ${result.tabId} (${format}, ~${sizeKB} KB).`,
          },
          {
            type: 'image',
            data: base64Data,
            mimeType,
          },
        ],
      };
    },
  };
}
