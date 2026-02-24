import { Request, Response, NextFunction } from "express";
import { COOKIE_CSRF } from "../config/cookies";

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  // ✅ allow auth entry points (no csrf cookie exists yet before login)
  const p = req.path; // when mounted globally, path is full path e.g. "/auth/login"
  if (p === "/auth/login" || p === "/auth/register") return next();

  const csrfCookie = req.cookies?.[COOKIE_CSRF];
  const csrfHeader = req.header("x-csrf-token");

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: "CSRF" });
  }

  next();
}