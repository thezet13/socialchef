import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma"; // ✅ поправь путь если у тебя иначе

function getHeaderTenantId(req: Request): string | null {
  const raw = req.header("x-tenant-id");
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (t.includes("..") || t.includes("/") || t.length > 100) return null;
  return t;
}

// ✅ throttle in-memory (ok for dev + good enough for prod)
const touched = new Map<string, number>();
const TOUCH_EVERY_MS = 5 * 60 * 1000; // 5 minutes

function touchTenantActivityBestEffort(tenantId: string) {
  const now = Date.now();
  const last = touched.get(tenantId) ?? 0;
  if (now - last < TOUCH_EVERY_MS) return;

  touched.set(tenantId, now);

  prisma.tenant
    .update({
      where: { id: tenantId },
      data: { lastActiveAt: new Date() },
    })
    .catch(() => {
      // ignore
    });
}

export function withTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: "Unauthorized (no auth info)" });
  }

  const { userId } = req.auth;
  let { tenantId } = req.auth;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: "Unauthorized (no userId/tenantId)" });
  }

  if (req.auth.role === "SUPERADMIN") {
    const headerTenantId = getHeaderTenantId(req);
    if (headerTenantId) tenantId = headerTenantId;
  }

  req.auth.tenantId = tenantId;

  res.locals.userId = userId;
  res.locals.tenantId = tenantId;

  // ✅ NEW: touch lastActiveAt (best-effort)
  touchTenantActivityBestEffort(tenantId);

  return next();
}


// import { Request, Response, NextFunction } from "express";

// //const SYSTEM_TENANT_ID = process.env.SYSTEM_TENANT_ID ?? "SYSTEM";

// function getHeaderTenantId(req: Request): string | null {
//   const raw = req.header("x-tenant-id");
//   const t = (raw ?? "").trim();
//   if (!t) return null;
//   // легкая защита от мусора
//   if (t.includes("..") || t.includes("/") || t.length > 100) return null;
//   return t;
// }

// export function withTenant(req: Request, res: Response, next: NextFunction) {
//   if (!req.auth) {
//     return res.status(401).json({ error: "Unauthorized (no auth info)" });
//   }

//   const { userId } = req.auth;
//   let { tenantId } = req.auth;

//   if (!userId || !tenantId) {
//     return res.status(401).json({ error: "Unauthorized (no userId/tenantId)" });
//   }

//   if (req.auth.role === "SUPERADMIN") {
//     const headerTenantId = getHeaderTenantId(req);
//     if (headerTenantId) {
//       tenantId = headerTenantId;
//     } else {
//       // если хочешь дефолт в админке — можно так:
//       // tenantId = SYSTEM_TENANT_ID;
//       // но я бы НЕ подменял молча, пусть UI явно шлёт заголовок
//     }
//   }

//   req.auth.tenantId = tenantId;

//   res.locals.userId = userId;
//   res.locals.tenantId = tenantId;

//   return next();
// }