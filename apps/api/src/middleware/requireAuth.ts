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

// // apps/api/src/middleware/requireAuth.ts
// import { prisma } from '@/lib/prisma';
// import { Request, Response, NextFunction } from 'express';
// import jwt, { JwtPayload } from 'jsonwebtoken';
// import { SYSTEM_TENANT_ID } from "@/config/system";
// import { COOKIE_AUTH } from "../config/cookies";

// export type AuthRole = "USER" | "SUPERADMIN";

// export interface AuthInfo {
//   userId: string;
//   tenantId: string;
//   role: AuthRole;
// }

// // Дополняем тип Express.Request, чтобы был req.auth
// declare global {
//   namespace Express {
//     interface Request {
//       auth?: AuthInfo;
//     }
//   }
// }

// export async function requireAuth(req: Request, res: Response, next: NextFunction) {
//   try {
//     const header = req.headers['authorization'];

//     if (!header || !header.startsWith('Bearer ')) {
//       return res.status(401).json({ error: 'Authorization header is missing or invalid', code: "NO_TOKEN", });
//     }

//     const token = header.substring('Bearer '.length).trim();

//     const jwtSecret = process.env.JWT_SECRET;
//     if (!jwtSecret) {
//       console.error('JWT_SECRET is not set');
//       return res.status(500).json({ error: 'Server is not configured for JWT' });
//     }

//     const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

//     const userId = typeof decoded.sub === 'string' ? decoded.sub : undefined;
//     const jwtTenantId = typeof decoded.tenantId === "string" ? decoded.tenantId : undefined;

//     if (!userId || !jwtTenantId) {
//       return res.status(401).json({
//         error: "Unauthorized",
//         code: "INVALID_PAYLOAD",
//       });
//     }

//     // 🔹 получаем пользователя (нужно только email)
//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       select: { email: true },
//     });

//     if (!user) {
//       return res.status(401).json({
//         error: "Unauthorized",
//         code: "USER_NOT_FOUND",
//       });
//     }

//     // 🔹 определяем роль (MVP-хардкод)
//     const superAdminEmail = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
//     const role: AuthRole =
//       superAdminEmail && user.email.toLowerCase() === superAdminEmail ? "SUPERADMIN" : "USER";

//     const tenantId = role === "SUPERADMIN" ? SYSTEM_TENANT_ID : jwtTenantId;

//     req.auth = { userId, tenantId, role };
//     return next();
//   } catch (err: unknown) {
//     // token expired
//     if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "TokenExpiredError") {
//       const expiredAt = (err as { expiredAt?: unknown }).expiredAt;
//       console.warn("[requireAuth] token expired", expiredAt);

//       return res.status(401).json({
//         error: "Unauthorized",
//         code: "TOKEN_EXPIRED",
//         expiredAt,
//       });
//     }
//     console.warn("[requireAuth] invalid token", err);
//     return res.status(401).json({
//       error: "Unauthorized",
//       code: "INVALID_TOKEN",
//     });
//   }
// }