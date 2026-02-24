import express from "express";
import { requireAuth } from "../../middleware/requireAuth"; 
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin";
import { SYSTEM_TENANT_ID } from "../../config/system";
import { prisma } from "../../lib/prisma";

export const adminRouter = express.Router();

// sanity check
adminRouter.get("/system", requireAuth, requireSuperAdmin, async (_req, res) => {
  const t = await prisma.tenant.findUnique({ where: { id: SYSTEM_TENANT_ID } });
  return res.json({ ok: true, systemTenant: t });
});
