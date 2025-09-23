import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { apiUrl } from "./api";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Helper function to get auth headers
async function getAuthHeaders(): Promise<Record<string, string>> {
  // Check for Supabase session first (takes priority over demo mode)
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return {
        'Authorization': `Bearer ${session.access_token}`
      };
    }
  }
  
  // Only use demo mode if no Supabase session exists
  const isDemoMode = localStorage.getItem('demo-mode') === 'true';
  if (isDemoMode) {
    return {
      'X-Demo-Mode': 'true'
    };
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
    const res = await fetch(url, {
      headers: authHeaders,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
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
