/**
 * API base URL for backend. Set VITE_API_URL in production (e.g. Railway).
 * Falls back to local backend for development.
 */
export const API_BASE =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/**
 * WebSocket base URL derived from API_BASE (http -> ws, https -> wss).
 */
export const WS_BASE = API_BASE.replace(/^http/, "ws");
