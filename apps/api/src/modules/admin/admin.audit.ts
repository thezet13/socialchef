import { prisma } from "../../lib/prisma";

export async function adminAuditLog(params: {
  actorUserId: string;
  actorTenantId?: string;
  action: "TENANT_ACTIVATE" | "TENANT_DEACTIVATE" | "TENANT_DELETE_SOFT" | "TENANT_ADD_CREDITS" | "TENANT_CHANGE_PLAN" | "ASSET_DELETE" | "RETENTION_RUN";
  targetTenantId?: string;
  targetUserId?: string;
  detailsJson?: unknown;
}) {
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.actorUserId,
      actorTenantId: params.actorTenantId ?? null,
      action: params.action as any,
      targetTenantId: params.targetTenantId ?? null,
      targetUserId: params.targetUserId ?? null,
      detailsJson: params.detailsJson as any,
    },
  });
}
