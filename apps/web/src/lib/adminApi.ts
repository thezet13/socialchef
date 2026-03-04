import { apiFetch } from "../lib/apiClient";
import type { HttpMethod } from "../lib/apiClient";

type AdminFetchInit = {
  method?: HttpMethod;
  body?: unknown;
};

export function adminFetch<T>(path: string, init?: AdminFetchInit) {
  return apiFetch<T>(`/admin${path}`, {
    method: init?.method ?? "GET",
    body: init?.body,
  });
}

export function publicUrl(u?: string | null) {
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/api/uploads/")) return u.replace("/api", ""); // защита от старых багов
  return u.startsWith("/") ? u : `/${u}`;
}