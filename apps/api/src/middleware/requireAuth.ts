import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { COOKIE_AUTH } from "../config/cookies";

type AuthPayload = {
  userId: string;
  tenantId: string;
  role: "USER" | "SUPERADMIN";
};

function readBearer(req: Request): string | null {
  const authHeader = req.header("authorization") || req.header("Authorization");
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const cookieToken = req.cookies?.[COOKIE_AUTH] as string | undefined;
    const bearer = readBearer(req);

    const token = cookieToken ?? bearer;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ error: "JWT_SECRET missing" });

    const payload = jwt.verify(token, secret) as any;

    const userId = payload.userId ?? payload.sub; // ✅ support sub
    const tenantId = payload.tenantId;
    const role = payload.role ?? "USER";

    if (!userId || !tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    (req as any).auth = { userId, tenantId, role };

    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}