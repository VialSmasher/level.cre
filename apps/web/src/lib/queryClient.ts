import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { apiUrl } from "./api";

// Lightweight in-memory auth cache to avoid calling getSession repeatedly
let cachedAuthHeader: string | null = null;
let authListenerInitialized = false;

function initAuthHeaderCache() {
  if (authListenerInitialized) return;
  authListenerInitialized = true;

  try {
    // Initialize from current session once on boot
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const token = data.session?.access_token || null;
        cachedAuthHeader = token ? `Bearer ${token}` : null;
      }).catch(() => {
        cachedAuthHeader = null;
      });
      // Keep cache updated on changes (single subscription across HMR)
      const g: any = globalThis as any;
      if (!g.__AUTH_HDR_SUB__) {
        const { data } = supabase.auth.onAuthStateChange((_ev, session) => {
          const token = session?.access_token || null;
          cachedAuthHeader = token ? `Bearer ${token}` : null;
        });
        g.__AUTH_HDR_SUB__ = data.subscription;
      }
    }
  } catch {
    // Ignore errors during init; fall back to on-demand header resolution.
  }
}

initAuthHeaderCache();

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Helper function to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  // Prefer cached Authorization for speed and to avoid extra SDK calls
  if (cachedAuthHeader) {
    return { Authorization: cachedAuthHeader };
  }

  // Fallback to a one-off session fetch only if needed
  try {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || null;
      if (token) {
        cachedAuthHeader = `Bearer ${token}`;
        return { Authorization: cachedAuthHeader };
      }
    }
  } catch (_err) {
    // Ignore and fall through
  }

  // Demo mode header (stateless). Only used when explicitly enabled.
  try {
    const isDemoMode = localStorage.getItem('demo-mode') === 'true';
    if (isDemoMode) {
      return { 'X-Demo-Mode': 'true' };
    }
  } catch (_err) {
    // Accessing localStorage can throw in some sandboxed contexts; ignore.
  }

  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = apiUrl(url);
  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = { ...authHeaders };
  headers['Accept'] = 'application/json';
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  const logApi = (import.meta.env.VITE_LOG_API === '1' || import.meta.env.VITE_LOG_API === 'true');
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);

  // Guard against HTML fallthrough (e.g., dev proxy/back-end not handling route)
  const ct = res.headers.get('content-type') || '';
  if (res.ok && url.startsWith('/api') && ct.includes('text/html')) {
    // Convert a misleading 200 HTML fallback into an actionable error
    const body = await res.text();
    throw new Error(
      'Received HTML from API endpoint. Backend route may be missing or dev proxy not forwarding. ' +
      'Ensure the server is running and that Demo Mode is enabled or you are authenticated.'
    );
  }
  if (logApi) {
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // eslint-disable-next-line no-console
    console.log(`[api] ${method} ${url} -> ${res.status} in ${Math.round(t1 - t0)}ms`);
  }
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();
    const key = queryKey.join("/") as string;
    const url = apiUrl(key.startsWith('/api') ? key : `/api${key.startsWith('/') ? '' : '/'}${key}`);
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const res = await fetch(url, {
      headers: authHeaders,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const json = await res.json();
    const logApi = (import.meta.env.VITE_LOG_API === '1' || import.meta.env.VITE_LOG_API === 'true');
    if (logApi) {
      const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      // eslint-disable-next-line no-console
      console.log(`[api] GET ${url} -> ${res.status} in ${Math.round(t1 - t0)}ms`);
    }
    return json;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
