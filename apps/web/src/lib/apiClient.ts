// apps/web/src/lib/apiClient.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

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

// // apps/web/src/lib/apiClient.ts
// const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

// export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

// export interface ApiOptions {
//   method?: HttpMethod;
//   body?: unknown;
//   token?: string;
//   tenantId?: string;
// }

// export class ApiError extends Error {
//   status: number;
//   code?: string;
//   data?: unknown;

//   constructor(message: string, status: number, code?: string, data?: unknown) {
//     super(message);
//     this.name = "ApiError";
//     this.status = status;
//     this.code = code;
//     this.data = data;
//   }
// }

// function readCookie(name: string) {
//   const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
//   return m ? decodeURIComponent(m[1]) : null;
// }

// function safeJsonParse(raw: string): unknown {
//   try {
//     return raw ? JSON.parse(raw) : null;
//   } catch {
//     return null;
//   }
// }

// export async function apiFetch<T>(
//   path: string, 
//   options: ApiOptions = {}): 
//   Promise<T> {

//   const url = `${API_URL}${path}`;
//   const headers: Record<string, string> = {};

//   if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
//   if (options.tenantId) headers["X-Tenant-Id"] = options.tenantId; // ✅
//   if (options.body !== undefined) headers["Content-Type"] = "application/json";

//   const res = await fetch(url, {
//     method: options.method ?? "GET",
//     headers,
//     body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
//   });

//   const ct = res.headers.get("content-type") ?? "";
//   const raw = await res.text();

//   const data: unknown = ct.includes("application/json") ? safeJsonParse(raw) : (raw ? { error: raw } : null);

//  if (!res.ok) {
  
//   console.log("API ERROR", res.status, data ?? raw);

//   let message = `Request failed with status ${res.status}`;
//   let code: string | undefined;

//   if (data && typeof data === "object") {
//     const obj = data as Record<string, unknown>;
//     if (typeof obj.error === "string") message = obj.error;
//     if (typeof obj.code === "string") code = obj.code;
//   }

//   if (res.status === 401) {
//     try { localStorage.removeItem("token"); } catch {}
//     throw new ApiError(message, res.status, code ?? "UNAUTHORIZED", data);
//   }

//   // ✅ 402 (paywall) тоже сюда попадёт, и data сохранится
//   throw new ApiError(message, res.status, code, data);
// }
//   return (data as T) ?? ({} as T);
// }


// const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4001";

// export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

// export interface ApiOptions {
//   method?: HttpMethod;
//   body?: unknown;
//   token?: string;
// }

// export class ApiError extends Error {
//   status: number;
//   code?: string;

//   constructor(message: string, status: number, code?: string) {
//     super(message);
//     this.name = "ApiError";
//     this.status = status;
//     this.code = code;
//   }
// }

// export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
//   const url = `${API_URL}${path}`;
  
//   console.log("[apiFetch]", { url, method: options.method ?? "GET" });

//   const headers: Record<string, string> = {};

//   if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
//   if (options.body !== undefined) headers["Content-Type"] = "application/json";

//   const res = await fetch(url, {
//     method: options.method ?? "GET",
//     headers,
//     body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
//   });

//   let data: unknown = null;
//   const ct = res.headers.get("content-type") ?? "";

//   if (ct.includes("application/json")) {
//     try { data = await res.json(); } catch { data = null; }
//   } else {
//     try {
//       const text = await res.text();
//       data = text ? { error: text } : null;
//     } catch {
//       data = null;
//     }
//   }

//   if (!res.ok) {
//   const raw = await res.text();
//     let data: unknown = null;
//     try { data = raw ? JSON.parse(raw) : null; } catch {}
//     console.log("API ERROR", res.status, data ?? raw);

//   let message = `Request failed with status ${res.status}`;
//   let code: string | undefined;

//   if (data && typeof data === "object") {
//     if ("error" in data && typeof (data).error === "string") message = (data).error;
//     if ("code" in data && typeof (data).code === "string") code = (data).code;
//   }

//   if (res.status === 401) {
//     try { localStorage.removeItem("token"); } catch {}
//     throw new ApiError(message, res.status, code ?? "UNAUTHORIZED");
//   }

//   throw new ApiError(message, res.status, code);
// }

//   return (data as T) ?? ({} as T);
// }


