export const SESSION_CLIENT_ID = typeof window !== 'undefined'
  ? ((window as any).__dndSessionId || ((window as any).__dndSessionId = Math.random().toString(36).substring(2)))
  : '';
