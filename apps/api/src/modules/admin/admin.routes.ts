import { Router } from "express";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/requireAuth";
import { requireSuperAdmin } from "../../middleware/requireSuperAdmin";
import { adminAuditLog } from "./admin.audit";
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { getEffectivePlan } from "../billing/billing.service";
import { runRetention } from "../../jobs/retention";
import { UPLOADS_DIR_ABS } from "../../lib/uploadsPaths";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireSuperAdmin);

type RetentionOptsDto = {
    previewTtlHours?: number;
    orphanAfterDays?: number;
    purgeDeletedBatch?: number;
    runInactiveTenantsPurge?: boolean;
};

function toInt(v: any, def: number) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}


adminRouter.get("/tenants", requireAuth, requireSuperAdmin, async (req, res) => {
    const take = Math.min(Number(req.query.take ?? 30), 100);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    const plan = typeof req.query.plan === "string" ? req.query.plan : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const country = typeof req.query.country === "string" ? req.query.country : "";

    const where: any = { deletedAt: null };

    if (query) {
        where.OR = [
            { name: { contains: query, mode: "insensitive" } },
            // можно добавить поиск по owner email/fullName через relation, если хочешь
            // { owner: { email: { contains: query, mode: "insensitive" } } },
            // { owner: { fullName: { contains: query, mode: "insensitive" } } },
        ];
    }

    if (country) where.lastCountryCode = country;
    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    // ✅ plan-filter при варианте B идёт через subscription
    if (plan) {
        // показываем только тех, у кого subscription.plan = plan и подписка в "платном" состоянии
        where.subscription = {
            is: {
                plan: plan as PlanType,
                status: SubscriptionStatus.ACTIVE, // при желании расширь
            },
        };
    }

    const tenants = await prisma.tenant.findMany({
        where,
        include: {
            owner: { select: { email: true, fullName: true } },
            subscription: { select: { plan: true, status: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = tenants.length > take;
    const items = hasMore ? tenants.slice(0, take) : tenants;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    const tenantIds = items.map((t) => t.id);

    // ✅ Credits balances (source of truth)
    const balances = await prisma.tenantCreditBalance.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { tenantId: true, balanceCredits: true },
    });
    const balanceMap = new Map<string, number>(balances.map((b) => [b.tenantId, b.balanceCredits]));

    // ✅ Last activity from CreditLedger (fallback if Tenant.lastActivityAt is null)
    const lastLedger = await prisma.creditLedger.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds } },
        _max: { createdAt: true },
    });
    const lastActMap = new Map<string, Date | null>(
        lastLedger.map((r) => [r.tenantId, r._max.createdAt ?? null])
    );

    const [presetsCounts, stylesCounts, brandCounts, genCounts] = await Promise.all([
        prisma.preset
            .groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } })
            .catch(() => [] as any),
        prisma.style
            .groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } })
            .catch(() => [] as any),
        prisma.brandStyle
            .groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } })
            .catch(() => [] as any),
        prisma.generatedImage
            .groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds } }, _count: { _all: true } })
            .catch(() => [] as any),
    ]);

    const countMap = (rows: any[]) => new Map(rows.map((r) => [r.tenantId, r._count._all as number]));
    const presetMap = countMap(presetsCounts);
    const styleMap = countMap(stylesCounts);
    const brandMap = countMap(brandCounts);
    const genMap = countMap(genCounts);

    return res.json({
        items: items.map((t) => {
            const effPlan = getEffectivePlan(t.subscription);
            return {
                id: t.id,
                ownerName: t.owner?.fullName ?? null,
                ownerEmail: t.owner?.email ?? null,
                restaurantName: t.name,

                plan: effPlan,
                creditsBalance: balanceMap.get(t.id) ?? 0,

                isActive: (t as any).isActive ?? true,
                lastActivityAt: (t as any).lastActivityAt ?? lastActMap.get(t.id) ?? null,
                country: (t as any).lastCountryCode ?? null,

                qtyPresets: presetMap.get(t.id) ?? 0,
                qtyImageStyles: styleMap.get(t.id) ?? 0,
                qtyBrandStyles: brandMap.get(t.id) ?? 0,
                qtyGeneratedImages: genMap.get(t.id) ?? 0,
            };
        }),
        nextCursor,
    });
});

adminRouter.get("/overview", requireAuth, requireSuperAdmin, async (req, res) => {
    const range = (String(req.query.range ?? "7d") as "24h" | "7d" | "30d");
    const ms =
        range === "24h" ? 24 * 3600_000 :
            range === "30d" ? 30 * 24 * 3600_000 :
                7 * 24 * 3600_000;

    const since = new Date(Date.now() - ms);

    const [tenantsTotal, tenantsActive, usersTotal] = await Promise.all([
        prisma.tenant.count({ where: { deletedAt: null } }),
        prisma.tenant.count({ where: { deletedAt: null, isActive: true } }),
        prisma.user.count(),
    ]);

    // Credits spent = sum of negative deltas in window
    const spentAgg = await prisma.creditLedger.aggregate({
        where: { createdAt: { gte: since }, deltaCredits: { lt: 0 } },
        _sum: { deltaCredits: true },
    });

    const creditsSpent = Math.abs(spentAgg._sum.deltaCredits ?? 0);

    // Top tenants by spent credits (most negative sum)
    const top = await prisma.creditLedger.groupBy({
        by: ["tenantId"],
        where: { createdAt: { gte: since }, deltaCredits: { lt: 0 } },
        _sum: { deltaCredits: true },
        orderBy: { _sum: { deltaCredits: "asc" } }, // most negative first
        take: 10,
    });

    const topTenantIds = top.map(r => r.tenantId);

    const topTenantsRows = await prisma.tenant.findMany({
        where: { id: { in: topTenantIds } },
        include: { owner: { select: { fullName: true, email: true } } },
    });

    const tMap = new Map(topTenantsRows.map(t => [t.id, t]));

    const topTenants = top.map(r => {
        const t = tMap.get(r.tenantId);
        return {
            tenantId: r.tenantId,
            tenantName: t?.name ?? "—",
            ownerName: t?.owner?.fullName ?? null,
            ownerEmail: t?.owner?.email ?? null,
            creditsSpent: Math.abs(r._sum.deltaCredits ?? 0),
        };
    });

    // Recent usage from ledger
    const recent = await prisma.creditLedger.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { tenant: { select: { id: true, name: true } } },
    });

    const recentUsage = recent.map(e => ({
        id: e.id,
        createdAt: e.createdAt.toISOString(),
        actionType: e.action,
        creditsCost: Math.abs(e.deltaCredits),
        tenant: { id: e.tenant.id, name: e.tenant.name },
        user: null as any, // no userId in CreditLedger
    }));

    return res.json({
        range,
        kpi: { tenantsTotal, usersTotal, tenantsActive, creditsSpent },
        topTenants,
        recentUsage,
    });
});

adminRouter.get("/tenants/:id/usage", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.params.id;
    const take = Math.min(Number(req.query.take ?? 80) || 80, 200);

    // (опционально) проверяем что tenant существует
    const t = await prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { id: true },
    });
    if (!t) return res.status(404).json({ error: "Tenant not found" });

    // 🔹 последние события (как в global /admin/usage, только с tenantId)
    const events = await prisma.creditLedger.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
            id: true,
            createdAt: true,
            action: true,
            deltaCredits: true,
        },
    });

    // фронт ждёт creditsCost (положительное число)
    const mappedEvents = events.map(e => ({
        id: e.id,
        createdAt: e.createdAt,
        actionType: e.action,
        creditsCost: Math.abs(e.deltaCredits),
    }));

    // 🔹 summary 30d
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await prisma.creditLedger.groupBy({
        by: ["action"],
        where: { tenantId, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { deltaCredits: true },
    });

    const summary30d = rows
        .map(r => ({
            actionType: r.action,
            count: r._count._all,
            creditsSpent: Math.abs(r._sum.deltaCredits ?? 0),
        }))
        .sort((a, b) => b.creditsSpent - a.creditsSpent);

    return res.json({
        events: mappedEvents,
        summary30d,
    });
}
);

adminRouter.get("/tenants/:id", requireAuth, requireSuperAdmin, async (req, res) => {

    const id = req.params.id;

    const t = await prisma.tenant.findFirst({
        where: { id, deletedAt: null },
        select: {
            id: true,
            name: true,
            isActive: true,
            lastActivityAt: true,
            lastCountryCode: true,
        },
    });

    if (!t) return res.status(404).json({ error: "Tenant not found" });

    // 🔹 credits
    const credit = await prisma.tenantCreditBalance.findUnique({
        where: { tenantId: t.id },
        select: { balanceCredits: true },
    });

    // 🔹 active subscription
    const sub = await prisma.subscription.findFirst({
        where: {
            tenantId: t.id,
            status: "ACTIVE",
        },
        orderBy: { createdAt: "desc" },
        select: { plan: true },
    });

    return res.json({
        id: t.id,
        restaurantName: t.name,
        plan: sub?.plan ?? "FREE",
        creditsBalance: credit?.balanceCredits ?? 0,
        isActive: t.isActive ?? true,
        lastActivityAt: t.lastActivityAt ?? null,
        country: t.lastCountryCode ?? null,
    });
});

adminRouter.get("/usage", requireAuth, requireSuperAdmin, async (req, res) => {
    const range = String(req.query.range ?? "7d");
    const ms =
        range === "24h" ? 24 * 3600_000 :
            range === "30d" ? 30 * 24 * 3600_000 :
                7 * 24 * 3600_000;

    const since = new Date(Date.now() - ms);

    const take = Math.min(Number(req.query.take ?? 50), 200);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

    const actionType = typeof req.query.actionType === "string" ? req.query.actionType : "";
    const tenantQuery = typeof req.query.tenantQuery === "string" ? req.query.tenantQuery.trim() : "";

    // optional: find matching tenantIds if tenantQuery provided
    let tenantIds: string[] | null = null;
    if (tenantQuery) {
        const rows = await prisma.tenant.findMany({
            where: { deletedAt: null, name: { contains: tenantQuery, mode: "insensitive" } },
            select: { id: true },
            take: 50,
        });
        tenantIds = rows.map(r => r.id);
        if (tenantIds.length === 0) tenantIds = ["__none__"];
    }

    const where: any = { createdAt: { gte: since } };
    if (actionType) where.actionType = actionType;
    if (tenantIds) where.tenantId = { in: tenantIds };

    const events = await prisma.usageEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
            tenant: { select: { id: true, name: true } },
            user: { select: { id: true, email: true } },
        },
    });

    const hasMore = events.length > take;
    const items = hasMore ? events.slice(0, take) : events;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    const summary = await prisma.usageEvent.groupBy({
        by: ["actionType"],
        where,
        _count: { _all: true },
        _sum: { creditsCost: true },
        orderBy: { _sum: { creditsCost: "desc" } },
        take: 50,
    });

    const totalCredits = summary.reduce((a, r) => a + (r._sum.creditsCost ?? 0), 0);
    const totalEvents = summary.reduce((a, r) => a + (r._count._all ?? 0), 0);

    // unique tenants
    const tenantsDistinct = await prisma.usageEvent.findMany({
        where,
        distinct: ["tenantId"],
        select: { tenantId: true },
    });
    const uniqueTenants = tenantsDistinct.length;

    return res.json({
        range,
        kpi: { totalEvents, creditsSpent: totalCredits, uniqueTenants },
        summary: summary.map(r => ({
            actionType: r.actionType,
            count: r._count._all,
            creditsSpent: r._sum.creditsCost ?? 0,
        })),
        items: items.map(e => ({
            id: e.id,
            createdAt: e.createdAt.toISOString(),
            actionType: e.actionType,
            creditsCost: e.creditsCost,
            tenant: { id: e.tenant.id, name: e.tenant.name },
            user: e.user ? { id: e.user.id, email: e.user.email } : null,
            meta: e.metaJson ?? null,
        })),
        nextCursor,
    });
});

adminRouter.get("/tenants/:id/assets", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.params.id;
    const type = (req.query.type as string | undefined) ?? "PRESET";
    const take = Math.min(Number(req.query.take ?? 30) || 30, 100);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

    if (type === "PRESET") {
        const rows = await prisma.preset.findMany({
            where: { tenantId },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true, title: true, thumbnailUrl: true, createdAt: true },
        });

        const hasMore = rows.length > take;
        const items = hasMore ? rows.slice(0, take) : rows;
        const nextCursor = hasMore ? items[items.length - 1]!.id : null;

        return res.json({ items, nextCursor });
    }

    if (type === "STYLE") {
        const rows = await prisma.style.findMany({
            where: { tenantId },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            // ✅ по схеме
            select: { id: true, title: true, thumbnailUrl: true, createdAt: true },
        });

        const hasMore = rows.length > take;
        const items = hasMore ? rows.slice(0, take) : rows;
        const nextCursor = hasMore ? items[items.length - 1]!.id : null;

        return res.json({
            items: items.map(r => ({
                id: r.id,
                title: r.title,
                thumbnailUrl: r.thumbnailUrl,
                createdAt: r.createdAt,
            })),
            nextCursor,
        });
    }

    if (type === "BRAND_STYLE") {
        const rows = await prisma.brandStyle.findMany({
            where: { tenantId },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            // ✅ по схеме
            select: { id: true, name: true, thumbnailUrl: true, createdAt: true },
        });

        const hasMore = rows.length > take;
        const items = hasMore ? rows.slice(0, take) : rows;
        const nextCursor = hasMore ? items[items.length - 1]!.id : null;

        return res.json({
            items: items.map(r => ({
                id: r.id,
                title: r.name,
                thumbnailUrl: r.thumbnailUrl ?? null,
                createdAt: r.createdAt,
            })),
            nextCursor,
        });
    }

    if (type === "GENERATED") {
        const rows = await prisma.generatedImage.findMany({
            where: { tenantId },
            orderBy: { createdAt: "desc" },
            take: take + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: { id: true, imageUrl: true, createdAt: true },
        });

        const hasMore = rows.length > take;
        const items = hasMore ? rows.slice(0, take) : rows;
        const nextCursor = hasMore ? items[items.length - 1]!.id : null;

        return res.json({
            items: items.map(r => ({
                id: r.id,
                title: "Generated",
                thumbnailUrl: r.imageUrl,
                createdAt: r.createdAt,
            })),
            nextCursor,
        });
    }

    return res.status(400).json({ error: "Unknown type" });
});

adminRouter.post("/tenants/:id/activate", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.params.id;
    const t = await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: true } });

    await adminAuditLog({
        actorUserId: req.auth!.userId,
        actorTenantId: req.auth!.tenantId,
        action: "TENANT_ACTIVATE",
        targetTenantId: tenantId,
    });

    return res.json({ ok: true, tenant: { id: t.id, isActive: (t as any).isActive } });
});

adminRouter.post("/tenants/:id/deactivate", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.params.id;
    const t = await prisma.tenant.update({ where: { id: tenantId }, data: { isActive: false } });

    await adminAuditLog({
        actorUserId: req.auth!.userId,
        actorTenantId: req.auth!.tenantId,
        action: "TENANT_DEACTIVATE",
        targetTenantId: tenantId,
    });

    return res.json({ ok: true, tenant: { id: t.id, isActive: (t as any).isActive } });
});

adminRouter.post("/tenants/:id/add-credits", requireAuth, requireSuperAdmin, async (req, res) => {
    const schema = z.object({
        amount: z.number().int().min(1).max(1_000_000),
        note: z.string().max(300).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

    const tenantId = req.params.id;

    // Если у тебя есть CreditLedger — лучше делать через него.
    const t = await prisma.tenantCreditBalance.update({
        where: { tenantId: tenantId },
        data: { balanceCredits: { increment: parsed.data.amount } as any },
    });

    await adminAuditLog({
        actorUserId: req.auth!.userId,
        actorTenantId: req.auth!.tenantId,
        action: "TENANT_ADD_CREDITS",
        targetTenantId: tenantId,
        detailsJson: { amount: parsed.data.amount, note: parsed.data.note ?? "" },
    });

    return res.json({ ok: true, creditsBalance: (t as any).creditsBalance ?? 0 });
});

adminRouter.post("/tenants/:id/delete-soft", requireAuth, requireSuperAdmin, async (req, res) => {
    const tenantId = req.params.id;

    await prisma.tenant.update({
        where: { id: tenantId },
        data: { deletedAt: new Date(), isActive: false },
    });

    await adminAuditLog({
        actorUserId: req.auth!.userId,
        actorTenantId: req.auth!.tenantId,
        action: "TENANT_DELETE_SOFT",
        targetTenantId: tenantId,
    });

    return res.json({ ok: true });
});

adminRouter.get("/files/overview", requireAuth, requireSuperAdmin, async (req, res) => {
    const activeCount = await prisma.asset.count({
        where: { status: "ACTIVE", deletedAt: null },
    });

    const deletedPending = await prisma.asset.count({
        where: { status: "DELETED", deletedAt: null },
    });

    const purgedCount = await prisma.asset.count({
        where: { deletedAt: { not: null } },
    });

    const activeBytes = await prisma.asset.aggregate({
        where: { status: "ACTIVE", deletedAt: null },
        _sum: { bytes: true },
    });

    const deletedBytes = await prisma.asset.aggregate({
        where: { status: "DELETED", deletedAt: null },
        _sum: { bytes: true },
    });

    return res.json({
        activeCount,
        deletedPending,
        purgedCount,
        activeBytes: activeBytes._sum.bytes ?? 0,
        deletedBytes: deletedBytes._sum.bytes ?? 0,
    });
}
);

adminRouter.get("/files/assets", requireAuth, requireSuperAdmin, async (req, res) => {
    const {
        status,
        kind,
        tenantId,
        take = "50",
        cursor,
    } = req.query as Record<string, string>;

    const where: any = {};

    if (status) where.status = status;
    if (kind) where.kind = kind;
    if (tenantId) where.tenantId = tenantId;

    const limit = Math.min(Number(take) || 50, 200);

    const rows = await prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
            presetLinks: true,
            designLinks: true,
        },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]!.id : null;

    return res.json({
        items: items.map(a => ({
            id: a.id,
            tenantId: a.tenantId,
            kind: a.kind,
            status: a.status,
            bytes: a.bytes,
            storagePath: a.storagePath,
            createdAt: a.createdAt,
            lastUsedAt: a.lastUsedAt,
            presetLinks: a.presetLinks.length,
            designLinks: a.designLinks.length,
        })),
        nextCursor,
    });
}
);

adminRouter.post("/files/assets/mark-deleted", requireAuth, requireSuperAdmin, async (req, res) => {
    const { ids } = req.body as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No ids provided" });
    }

    await prisma.asset.updateMany({
        where: { id: { in: ids } },
        data: { status: "DELETED" },
    });

    res.json({ ok: true });
}
);

adminRouter.post("/files/assets/purge", requireAuth, requireSuperAdmin, async (req, res) => {
    const { ids } = req.body as { ids: string[] };

    const assets = await prisma.asset.findMany({
        where: { id: { in: ids }, status: "DELETED", deletedAt: null },
    });

    for (const a of assets) {
        try {
            const abs = path.join(process.cwd(), a.storagePath);
            await fs.unlink(abs).catch(() => { });
            await prisma.asset.update({
                where: { id: a.id },
                data: { deletedAt: new Date() },
            });
        } catch { }
    }

    res.json({ purged: assets.length });
}
);

adminRouter.post("/files/retention/preview", requireAuth, requireSuperAdmin, async (req, res) => {
    const body = req.body ?? {};

    const previewTtlHours = Number(body.previewTtlHours ?? 24);
    const orphanAfterDays = Number(body.orphanAfterDays ?? 14);
    const purgeDeletedBatch = Number(body.purgeDeletedBatch ?? 500);
    const runInactiveTenantsPurge = !!body.runInactiveTenantsPurge;

    // 1️⃣ Dry run твоих retention jobs
    const result = await runRetention({
        dryRun: true,
        previewTtlHours,
        orphanAfterDays,
        purgeDeletedBatch,
        runInactiveTenantsPurge,
    });

    // 2️⃣ Pending deleted assets (status=DELETED, но не purged)
    const pendingDeleted = await prisma.asset.findMany({
        where: {
            status: "DELETED",
            deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
            id: true,
            tenantId: true,
            kind: true,
            bytes: true,
            storagePath: true,
            createdAt: true,
            lastUsedAt: true,
        },
    });

    // 3️⃣ Orphan candidates (что БЫЛО БЫ помечено DELETED)
    const cutoff = new Date(
        Date.now() - orphanAfterDays * 24 * 60 * 60 * 1000
    );

    const orphanCandidates = await prisma.asset.findMany({
        where: {
            status: "ACTIVE",
            OR: [
                { lastUsedAt: { lt: cutoff } },
                { lastUsedAt: null, createdAt: { lt: cutoff } },
            ],
            presetLinks: { none: {} },
            designLinks: { none: {} },
        },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
            id: true,
            tenantId: true,
            kind: true,
            bytes: true,
            storagePath: true,
            createdAt: true,
            lastUsedAt: true,
        },
    });

    // 4️⃣ Получаем tenant names (БЕЗ owner)
    const tenantIds = Array.from(
        new Set([
            ...pendingDeleted.map(a => a.tenantId),
            ...orphanCandidates.map(a => a.tenantId),
        ])
    );

    const tenants = await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
    });

    const tenantMap = Object.fromEntries(
        tenants.map(t => [t.id, t.name])
    );

    console.log("process.cwd() =", process.cwd());
    console.log("UPLOADS_DIR_ABS =", UPLOADS_DIR_ABS);

    return res.json({
        opts: {
            previewTtlHours,
            orphanAfterDays,
            purgeDeletedBatch,
            runInactiveTenantsPurge,
        },
        result,

        pendingDeleted: pendingDeleted.map(a => ({
            id: a.id,
            tenantId: a.tenantId,
            tenantName: tenantMap[a.tenantId] ?? null,
            kind: a.kind,
            bytes: a.bytes ?? null,
            storagePath: a.storagePath,
            createdAt: a.createdAt,
            lastUsedAt: a.lastUsedAt,
        })),

        orphanCandidates: orphanCandidates.map(a => ({
            id: a.id,
            tenantId: a.tenantId,
            tenantName: tenantMap[a.tenantId] ?? null,
            kind: a.kind,
            bytes: a.bytes ?? null,
            storagePath: a.storagePath,
            createdAt: a.createdAt,
            lastUsedAt: a.lastUsedAt,
        })),
    });
}
);

adminRouter.post("/files/retention/run", requireAuth, requireSuperAdmin, async (req, res) => {
    const body = (req.body ?? {}) as RetentionOptsDto;

    const opts = {
        dryRun: false,
        previewTtlHours: toInt(body.previewTtlHours, 24),
        orphanAfterDays: toInt(body.orphanAfterDays, 14),
        purgeDeletedBatch: toInt(body.purgeDeletedBatch, 500),
        runInactiveTenantsPurge: !!body.runInactiveTenantsPurge,
    };

    const result = await runRetention(opts);

    // audit
    try {
        await prisma.adminAuditLog.create({
            data: {
                actorUserId: req.auth!.userId,
                actorTenantId: req.auth!.tenantId ?? null,
                action: "RETENTION_RUN",
                detailsJson: { opts, result },
            },
        });
    } catch {
        // best-effort
    }

    res.json({ opts, result });
});
