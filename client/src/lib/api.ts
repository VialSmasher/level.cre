const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
const API_BASE = RAW_BASE.replace(/\/$/, '');

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
