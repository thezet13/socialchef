// apps/web/src/lib/apiClient.ts
//const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";
 const API_URL =
   process.env.NODE_ENV === "development"
     ? (process.env.NEXT_PUBLIC_API_URL ?? "https://app.socialchef.net")
     : "/api";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface ApiOptions {
  method?: HttpMethod;
  body?: unknown;
  token?: string;      // legacy / transitional
  tenantId?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;

  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function safeJsonParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isWriteMethod(method: string) {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "DELETE" || m === "PATCH";
}

function getCsrfFromCookie(): string | null {
  // имя должно совпадать с COOKIE_CSRF на бэке
  return readCookie("sc_csrf");
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = `${API_URL}${path}`;
  const method = (options.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {};

  // ✅ tenant context stays as-is
  if (options.tenantId) headers["X-Tenant-Id"] = options.tenantId;

  if (options.body !== undefined) headers["Content-Type"] = "application/json";

if (isWriteMethod(method)) {
  const csrf = getCsrfFromCookie();
  if (csrf) headers["x-csrf-token"] = csrf;
}

  const res = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "include",
  });

  const ct = res.headers.get("content-type") ?? "";
  const raw = await res.text();

  const data: unknown = ct.includes("application/json")
    ? safeJsonParse(raw)
    : raw
      ? { error: raw }
      : null;

  if (!res.ok) {
    console.log("API ERROR", res.status, data ?? raw);

    let message = `Request failed with status ${res.status}`;
    let code: string | undefined;

    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (typeof obj.error === "string") message = obj.error;
      if (typeof obj.code === "string") code = obj.code;
    }

    // ✅ only clear localStorage token if the caller actually used token-based auth
    // (cookie-auth does not rely on localStorage)
    if (res.status === 401 && options.token) {
      try {
        localStorage.removeItem("token");
      } catch {}
    }

    throw new ApiError(message, res.status, code ?? (res.status === 401 ? "UNAUTHORIZED" : undefined), data);
  }

  return (data as T) ?? ({} as T);
}