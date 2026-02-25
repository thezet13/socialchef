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