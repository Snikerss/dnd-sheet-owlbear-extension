export const SESSION_CLIENT_ID = typeof window !== 'undefined'
  ? (window.__dndSessionId || (window.__dndSessionId = Math.random().toString(36).substring(2)))
  : '';
