// apps/api/src/middleware/requireSuperAdmin.ts
import type { Request, Response, NextFunction } from "express";

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

  if (req.auth.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}
