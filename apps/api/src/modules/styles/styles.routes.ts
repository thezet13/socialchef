import { Router } from "express";
import { z } from "zod";
import { openai } from '../../lib/openai';

import { requireAuth } from "../../middleware/requireAuth";
import { withTenant } from "../../middleware/withTenant";

import { prisma } from "../../lib/prisma";
import { StyleScope, StyleStatus } from "@prisma/client";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ensureDir, uploadStyleImage } from "../../lib/uploads";
import { UPLOADS_DIR_ABS } from "../../lib/uploadsPaths";
import { ensureCreditsOrThrow, PaywallError } from "../../modules/billing/credits.guard";

import {
    type AnalyzeStyleBody,
    type AnalyzeStyleResponse,
    type CreateStyleBody,
    type CreateStyleResponse,

    createBodySchema,
    analyzeBodySchema,
    listQueryLoadSchema,


} from "./styles.types";
import {
    isLocalhostUrl,
    uploadsAbsPathWithFolder,
    fileToDataUrl,
    normalizeUploadsUrl,
    toAbsoluteUrl,
    isFilesystemPathLike,
    toListItem,


} from "./styles.service";
import { drawCover } from "../../lib/drawCover";

export const stylesRouter = Router();

stylesRouter.post("/upload",
    requireAuth,
    withTenant,
    uploadStyleImage("file"),
    async (req, res) => {
        try {

            const styleThumbsDir = path.join(UPLOADS_DIR_ABS, "image-styles", "styles-thumbs");

            if (!(req as any).auth) return res.status(401).json({ error: "Unauthorized" });

            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) return res.status(400).json({ error: "file is required" });

            ensureDir(UPLOADS_DIR_ABS);
            ensureDir(styleThumbsDir);

            const baseImagePath = path.join(UPLOADS_DIR_ABS, "image-styles", file.filename);
            const buf = fs.readFileSync(baseImagePath);

            const baseImageUrl = `/uploads/image-styles/${file.filename}`;
            const img = await loadImage(buf);

            const TW = 512, TH = 512;
            const canvas = createCanvas(TW, TH);
            const ctx = canvas.getContext("2d");
            drawCover(ctx, img, TW, TH);

            const thumbBuf = canvas.toBuffer("image/jpeg");

            const baseName = file.filename.replace(/\.(png|jpe?g|webp)$/i, "");
            const thumbName = `${baseName}-512.jpg`;
            const thumbAbs = path.join(styleThumbsDir, thumbName);
            fs.writeFileSync(thumbAbs, thumbBuf);

            const thumbUrl = `/uploads/image-styles/styles-thumbs/${thumbName}`;

            return res.status(201).json({
                imageUrl: baseImageUrl,
                thumbnailUrl: thumbUrl,
                imageW: img.width,
                imageH: img.height,
                thumbW: 512,
                thumbH: 512,
            });
        } catch (err) {
            console.error("[POST /styles/upload] error", err);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

stylesRouter.post("/analyze", requireAuth, withTenant, async (req, res) => {
    try {
        if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
        const { tenantId, userId } = req.auth;

        const parsed = analyzeBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server" });
        }

        const body: AnalyzeStyleBody = parsed.data;

        const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
            tenantId: tenantId,
            userId: userId,
            action: "ADD_STYLE",
        });


        // if (path.isAbsolute(body.imageUrl)) {
        //     throw new Error(`imageUrl must be a URL, got filesystem path: ${body.imageUrl}`);
        // }

        if (isFilesystemPathLike(body.imageUrl)) {
            throw new Error(`imageUrl must be a URL, got filesystem path: ${body.imageUrl}`);
        }
        // нормализуем, если прилетает absolute uploads url
        const normalized = normalizeUploadsUrl(body.imageUrl);

        // для Vision нужен абсолютный URL
        const absoluteUrl = toAbsoluteUrl(normalized);


        let visionImageUrl: string;

        if (isLocalhostUrl(absoluteUrl) && normalized.startsWith("/uploads/image-styles/")) {
            // локальная разработка: читаем файл и шлём data URL
            const abs = uploadsAbsPathWithFolder(normalized);
            console.log("abs -", abs);

            visionImageUrl = fileToDataUrl(abs);
        } else {
            // прод: публичный URL (или уже не localhost)
            visionImageUrl = absoluteUrl;
        }

        const sys = `
You are a food photography art director.

Analyze the reference image and return ONLY valid JSON with:
- title: short style name (2-5 words)
- description: 1-2 sentences for humans
- prompt: 8-12 concise bullet lines for STYLE TRANSFER to other food photos.

Rules for prompt (CRITICAL):
- Split the bullets conceptually into two parts:
  (A) Environment: background, set, props, camera/lens, depth of field.
  (B) Subject interaction: how the lighting and atmosphere affect the FOOD itself
      (light direction, softness, highlights, reflections, shadows, color cast, contrast).
- Always include at least 4 bullets about Subject interaction (B).
- Treat any visible fire/neon/window/etc as a real light source and describe its effect on the food.
- No brand names. No copyrighted names. No dish guessing. Describe only visual style.
- Use plain text bullet lines, not nested JSON objects.

Return ONLY valid JSON. No markdown. No code fences.
`.trim();

        const userText = `
Reference style image: ${absoluteUrl}
Optional hint/title: ${body.hintTitle ?? "(none)"}
`.trim();
        console.log("visionImageUrl -", visionImageUrl);

        const r = await openai.responses.create({
            model: "gpt-4o-mini",
            input: [
                { role: "system", content: sys },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: userText },
                        { type: "input_image", image_url: visionImageUrl, detail: "low" },
                    ],
                },
            ],
        });

        let raw = (r.output_text ?? "").trim();
        if (!raw) return res.status(500).json({ error: "Failed to analyze style (empty response)" });

        raw = raw
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim();

        let parsedJson: any;
        try {
            parsedJson = JSON.parse(raw);
        } catch {
            const resp: AnalyzeStyleResponse = { prompt: raw };
            return res.status(200).json({ ...resp, creditsBalance: creditsBalanceAfter });
        }

        let promptText = "";
        const p = parsedJson.prompt;

        if (typeof p === "string") {
            promptText = p.trim();
        } else if (Array.isArray(p)) {
            promptText = p
                .map((x: unknown) => String(x).trim())
                .filter(Boolean)
                .map((x: string) => `- ${x}`)
                .join("\n");
        }

        const title = typeof parsedJson.title === "string" ? parsedJson.title.trim() : undefined;
        const description = typeof parsedJson.description === "string" ? parsedJson.description.trim() : undefined;

        if (!promptText) return res.status(500).json({ error: "Failed to analyze style (no prompt)" });

        const resp: AnalyzeStyleResponse = { prompt: promptText, title, description };
        return res.status(200).json({ ...resp, creditsBalance: creditsBalanceAfter });



    } catch (err) {
        if (err instanceof PaywallError) {
            return res.status(402).json({
                code: err.code,
                ...err.payload,
            });
        }
        console.error("[POST /ai/styles/analyze] error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

stylesRouter.post("/", requireAuth, withTenant, async (req, res) => {
    try {
        const auth = (req as any).auth as {
            tenantId: string;
            userId: string;
            role?: "USER" | "SUPERADMIN";
        };

        if (!auth) return res.status(401).json({ error: "Unauthorized" });

        const parsed = createBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
        }

        const body: CreateStyleBody = parsed.data;

        const isSuper = auth.role === "SUPERADMIN";

        // защита: SYSTEM может создавать только SUPERADMIN
        if (body.scope === "SYSTEM" && !isSuper) {
            return res.status(403).json({ error: "Only SUPERADMIN can create SYSTEM styles" });
        }

        const title = body.title.trim();
        const prompt = body.prompt.trim();

        // нормализуем /uploads
        const previewUrl = normalizeUploadsUrl(body.previewUrl.trim());
        const sourceUrlRaw = body.sourceUrl?.trim();
        const sourceUrl = sourceUrlRaw ? normalizeUploadsUrl(sourceUrlRaw) : null;

        // В БД: thumbnailUrl + referenceImageUrl
        // referenceImageUrl должен быть всегда: если sourceUrl нет — используем previewUrl
        const thumbnailUrl = previewUrl;
        const referenceImageUrl = sourceUrl ?? previewUrl;

        const created = await prisma.style.create({
            data:
                body.scope === "SYSTEM"
                    ? {
                        scope: StyleScope.SYSTEM,
                        status: StyleStatus.PUBLISHED,

                        tenantId: null,
                        userId: null,

                        title,
                        prompt,
                        description: body.description?.trim() ?? null,

                        thumbnailUrl,
                        referenceImageUrl,

                        // опционально:
                        tags: [],
                        sortOrder: 0,
                    }
                    : {
                        scope: StyleScope.TENANT,
                        status: StyleStatus.PUBLISHED,

                        tenantId: auth.tenantId,
                        userId: auth.userId,

                        title,
                        prompt,

                        thumbnailUrl,
                        referenceImageUrl,

                        tags: [],
                        sortOrder: 0,
                    },
            select: { id: true },
        });

        const resp: CreateStyleResponse = { id: created.id };
        return res.status(201).json(resp);
    } catch (err) {
        console.error("[POST /ai/styles] error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

stylesRouter.delete("/:id", requireAuth, withTenant, async (req, res) => {
    try {
        const auth = (req as any).auth as { tenantId: string; userId: string; role?: "USER" | "SUPERADMIN" };
        if (!auth) return res.status(401).json({ error: "Unauthorized" });

        const id = String(req.params.id || "").trim();
        if (!id) return res.status(400).json({ error: "id is required" });

        const style = await prisma.style.findUnique({
            where: { id },
            select: { id: true, scope: true, tenantId: true, userId: true },
        });

        if (!style) return res.status(404).json({ error: "Style not found" });

        // SYSTEM стили может удалять только SUPERADMIN (или вообще запретить)
        if (style.scope === "SYSTEM") {
            if (auth.role !== "SUPERADMIN") return res.status(403).json({ error: "Forbidden" });
            await prisma.style.delete({ where: { id } });
            return res.status(204).send();
        }

        if (style.tenantId !== auth.tenantId) {
            return res.status(403).json({ error: "Forbidden" });
        }

        await prisma.style.delete({ where: { id } });
        return res.status(204).send();
    } catch (err) {
        console.error("[DELETE /styles/:id] error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// stylesRouter.get("/", requireAuth, withTenant, async (req, res) => {
//     const parsed = listQuerySchema.safeParse(req.query);
//     if (!parsed.success) {
//         return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
//     }

//     const auth = (req as any).auth as { tenantId: string; userId: string; role?: "USER" | "SUPERADMIN" };
//     if (!auth) return res.status(401).json({ error: "Unauthorized" });

//     const { scope = "ALL", status = "PUBLISHED", q, take = 100, skip = 0 } = parsed.data;

//     const whereOr: any[] = [];

//     if (scope === "SYSTEM" || scope === "ALL") {
//         whereOr.push({ scope: StyleScope.SYSTEM, tenantId: null });
//     }

//     if (scope === "TENANT" || scope === "ALL") {
//         whereOr.push({ scope: StyleScope.TENANT, tenantId: auth.tenantId });
//     }


//     const where: any = {
//         OR: whereOr,
//         status: status as StyleStatus,
//     };

//     if (q) {
//         where.AND = [
//             {
//                 OR: [
//                     { title: { contains: q, mode: "insensitive" } },
//                     // tags — массив, contains не всегда удобно, можно позже
//                 ],
//             },
//         ];
//     }

//     const rows = await prisma.style.findMany({
//         where,
//         orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
//         skip,
//         take,
//         select: {
//             id: true,
//             scope: true,
//             status: true,
//             title: true,
//             thumbnailUrl: true,
//             referenceImageUrl: true,
//             prompt: true,
//             updatedAt: true,
//             sortOrder: true,
//         },
//     });

//     const resp: ListStylesResponse = { items: rows.map(toListItem) };
//     return res.json(resp);
// });

stylesRouter.get("/list", requireAuth, withTenant, async (req, res) => {

    const parsed = listQueryLoadSchema.safeParse(req.query);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    }

    const auth = (req as any).auth as { tenantId: string; userId: string; role?: "USER" | "SUPERADMIN" };
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const { scope, status, q, limit, cursor } = parsed.data;

    const qFilter = q
        ? { AND: [{ OR: [{ title: { contains: q, mode: "insensitive" } }] }] }
        : {};

    const whereOr: any[] = [];
    if (scope === "SYSTEM" || scope === "ALL") whereOr.push({ scope: StyleScope.SYSTEM, tenantId: null });
    if (scope === "TENANT" || scope === "ALL") whereOr.push({ scope: StyleScope.TENANT, tenantId: auth.tenantId });

    const where: any = { OR: whereOr, status: status as StyleStatus };

    if (qFilter.AND) {
        where.AND = [...(where.AND ?? []), ...qFilter.AND];
    }

    // ✅ keyset pagination
    if (cursor) {
        const [iso, cursorId] = cursor.split("|");
        const cursorDate = new Date(iso);

        if (!iso || !cursorId || Number.isNaN(cursorDate.getTime())) {
            return res.status(400).json({ error: "Invalid cursor" });
        }

        where.AND = [
            ...(where.AND ?? []),
            {
                OR: [
                    { updatedAt: { lt: cursorDate } },
                    { updatedAt: cursorDate, id: { lt: cursorId } },
                ],
            },
        ];
    }

    const rows = await prisma.style.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1, // берём на 1 больше, чтобы понять hasMore
        select: {
            id: true,
            scope: true,
            status: true,
            title: true,
            thumbnailUrl: true,
            referenceImageUrl: true,
            prompt: true,
            updatedAt: true,
            sortOrder: true,
        },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? `${last.updatedAt.toISOString()}|${last.id}` : null;

    const baseWhere: any = {
        status: status as StyleStatus,
        ...qFilter,
    };

    // counts должны быть НЕ по текущему scope таба, а всегда по system/mine/all
    const [systemCount, mineCount] = await Promise.all([
        prisma.style.count({
            where: {
                ...baseWhere,
                scope: StyleScope.SYSTEM,
                tenantId: null,
            },
        }),
        prisma.style.count({
            where: {
                ...baseWhere,
                scope: StyleScope.TENANT,
                tenantId: auth.tenantId,
            },
        }),
    ]);


    return res.json({
        items: page.map(toListItem),
        nextCursor,
        counts: { system: systemCount, mine: mineCount, all: systemCount + mineCount },
    });
});
