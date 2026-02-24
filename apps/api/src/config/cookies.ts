export const COOKIE_AUTH = "sc_auth";
export const COOKIE_CSRF = "sc_csrf";

export function getCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,        // в проде обязательно true (https)
    sameSite: "lax" as const,
    path: "/",
  };
}

export function getCsrfCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: false,       // csrf токен должен читаться JS
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
}