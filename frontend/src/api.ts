// Lightweight fetch-based API client. The auth token now comes live from the
// Supabase session, so each request always carries a fresh JWT.

import { supabase } from "@/src/supabase";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API_BASE = `${BASE}/api`;

type Opts = { params?: Record<string, any>; body?: any };

async function request(method: string, path: string, opts: Opts = {}): Promise<any> {
  let url = `${API_BASE}${path}`;
  if (opts.params) {
    const qs = new URLSearchParams(
      Object.entries(opts.params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(url, {
    method, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = (data && data.detail) || `Request failed (${res.status})`;
    const err: any = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { data };
}

export const api = {
  get: (path: string, params?: Record<string, any>) => request("GET", path, { params }),
  post: (path: string, body?: any) => request("POST", path, { body }),
  put: (path: string, body?: any) => request("PUT", path, { body }),
  patch: (path: string, body?: any) => request("PATCH", path, { body }),
  delete: (path: string) => request("DELETE", path),
};

// Compatibility shim — old code calls setAuthToken; with Supabase the token
// is managed by the session, so this is a no-op kept to avoid touching imports.
export function setAuthToken(_t: string | null) { /* no-op */ }
