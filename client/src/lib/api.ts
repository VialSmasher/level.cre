// Prefer same-origin `/api` in production deployments (e.g., Vercel with rewrites)
// to avoid CORS issues. Allow cross-origin only when explicitly enabled.
const ENV_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
const ALLOW_CROSS_ORIGIN = String(import.meta.env.VITE_ALLOW_CROSS_ORIGIN || '0').toLowerCase();

let EFFECTIVE_BASE = ENV_BASE.replace(/\/$/, '');
try {
  if (typeof window !== 'undefined') {
    const isAbsolute = /^https?:\/\//i.test(EFFECTIVE_BASE);
    const allowCross = (ALLOW_CROSS_ORIGIN === '1' || ALLOW_CROSS_ORIGIN === 'true');
    if (isAbsolute && !allowCross) {
      const baseOrigin = new URL(EFFECTIVE_BASE).origin;
      // If the configured base is cross-origin, default back to same-origin '/api'
      if (baseOrigin !== window.location.origin) {
        EFFECTIVE_BASE = '/api';
      }
    }
  }
} catch {
  // Ignore errors (e.g., invalid URL), and just keep EFFECTIVE_BASE as-is.
}

const API_BASE = EFFECTIVE_BASE;

// Returns a full URL, handling these cases:
// - Local dev (API_BASE === '/api'): apiUrl('/api/x') => '/api/x'
// - External base without /api (e.g., https://api.example.com): provide '/api/x'
// - External base with /api (e.g., https://api.example.com/api): avoid double '/api/api'
export const apiUrl = (p: string) => {
  const path = p.startsWith('/') ? p : `/${p}`;
  if (!API_BASE) return path;
  if (API_BASE.endsWith('/api') && path.startsWith('/api')) {
    return `${API_BASE}${path.slice(4)}`; // remove leading '/api'
  }
  return `${API_BASE}${path}`;
};
