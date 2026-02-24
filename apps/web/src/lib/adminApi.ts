import { apiFetch } from "@/lib/apiClient";

export function adminFetch<T>(path: string, init?: { method?: string; body?: unknown }) {
  return apiFetch<T>(`/admin${path}`, {
    method: (init?.method as any) ?? "GET",
    body: init?.body,
  });
}
