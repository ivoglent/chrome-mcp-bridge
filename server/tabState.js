// tabState.js — Shared pinned tab state for MCP tools
// When a tab is pinned, all tools that accept tabId will default to it
// instead of requiring the caller to pass tabId every time.

/** @type {number|null} */
let pinnedTabId = null;

/**
 * Pin a specific tab ID so all subsequent tool calls default to it.
 * @param {number} tabId
 */
export function pinTab(tabId) {
  pinnedTabId = tabId;
}

/**
 * Unpin the current tab, reverting to default "active tab" behavior.
 */
export function unpinTab() {
  pinnedTabId = null;
}

/**
 * Get the currently pinned tab ID, or null if none is pinned.
 * @returns {number|null}
 */
export function getPinnedTabId() {
  return pinnedTabId;
}

/**
 * Resolve the effective tab ID for a tool call.
 * If the caller explicitly provides a tabId, use it.
 * Otherwise, fall back to the pinned tab ID (which may be null,
 * meaning the extension will use the active tab).
 * @param {number|undefined} explicitTabId - tabId from tool params
 * @returns {number|undefined}
 */
export function resolveEffectiveTabId(explicitTabId) {
  if (explicitTabId !== undefined && explicitTabId !== null) {
    return explicitTabId;
  }
  return pinnedTabId ?? undefined;
}
