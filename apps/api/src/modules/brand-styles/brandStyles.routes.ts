import fs from "fs";
import path from "path";
import { prisma } from "../../lib/prisma";

import { Router } from "express";
import { z } from "zod";
import { openai } from "../../lib/openai";

import { requireAuth } from "../../middleware/requireAuth";
import { withTenant } from "../../middleware/withTenant";


import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureDir, uploadBrandStyleImage } from "../../lib/uploads";
import { UPLOADS_DIR_ABS } from "../../lib/uploadsPaths";
import { ensureCreditsOrThrow, PaywallError } from "../../modules/billing/credits.guard";
import { drawCover } from "../../lib/drawCover";
import { fileToDataUrl, isLocalhostUrl, normalizeStyleRecipeFromAi, normalizeUploadsUrl, toAbsoluteUrl, toListItem, uploadsAbsPathWithFolder } from "./brandStyles.service";

import { analyzeBodySchema, createBodySchema, listQuerySchema,
  type AnalyzeBrandStyleBody,
  type AnalyzeBrandStyleResponse,
  type CreateBrandStyleBody,
  type CreateBrandStyleResponse,
  type ListBrandStylesResponse,
  type UploadBrandStyleResponse,
 } from "./brandStyles.types"

export const brandStylesRouter = Router();


brandStylesRouter.post("/upload",
  requireAuth,
  withTenant,
  uploadBrandStyleImage("file"),
  async (req, res) => {
    try {

      if (!(req as any).auth) return res.status(401).json({ error: "Unauthorized" });

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "file is required" });

      const brandThumbsDir = path.join(UPLOADS_DIR_ABS, "brand-styles", "brand-thumbs");

      ensureDir(UPLOADS_DIR_ABS);
      ensureDir(brandThumbsDir);

      const baseImagePath = path.join(UPLOADS_DIR_ABS, "brand-styles", file.filename);
      const buf = fs.readFileSync(baseImagePath);

      const baseImageUrl = `/uploads/brand-styles/${file.filename}`;
      const img = await loadImage(buf);

      const TW = 512, TH = 512;
      const canvas = createCanvas(TW, TH);
      const ctx = canvas.getContext("2d");
      drawCover(ctx, img, TW, TH);

      const thumbBuf = canvas.toBuffer("image/jpeg");

      const baseName = file.filename.replace(/\.(png|jpe?g|webp)$/i, "");
      const thumbName = `${baseName}-512.jpg`;
      const thumbAbs = path.join(brandThumbsDir, thumbName);

      fs.writeFileSync(thumbAbs, thumbBuf);

      const thumbUrl = `/uploads/brand-styles/brand-thumbs/${thumbName}`;

      const resp: UploadBrandStyleResponse = {
        imageUrl: baseImageUrl,
        thumbnailUrl: thumbUrl,
        imageW: img.width,
        imageH: img.height,
        thumbW: 512,
        thumbH: 512,
      };

      return res.status(201).json(resp);
    } catch (err) {
      console.error("[POST /brand-styles/upload] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

brandStylesRouter.post("/analyze", requireAuth, withTenant, async (req, res) => {
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

    const body: AnalyzeBrandStyleBody = parsed.data;

    const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
      tenantId,
      userId,
      action: "ADD_BRANDSTYLE",
    });

    // нормализуем, если прилетает absolute uploads url
    const normalized = normalizeUploadsUrl(body.imageUrl);

    // для Vision нужен абсолютный URL
    const absoluteUrl = toAbsoluteUrl(normalized);


    let visionImageUrl: string;

    if (isLocalhostUrl(absoluteUrl) && normalized.startsWith("/uploads/brand-styles/")) {
      // локальная разработка: читаем файл и шлём data URL
      const abs = uploadsAbsPathWithFolder(normalized);
      visionImageUrl = fileToDataUrl(abs);
    } else {
      // прод: публичный URL (или уже не localhost)
      visionImageUrl = absoluteUrl;
    }


    const sys = `
You are analyzing a brand reference image.

Your task is to extract a BRAND STYLE RECIPE in JSON format.

IMPORTANT:
- Do NOT invent visual elements.
- Do NOT design layouts.
- Do NOT draw images.
- Only describe style tokens.

OUTPUT (STRICT JSON ONLY):

Top-level fields:
- name: short brand style name (2–5 words)
- palette
- tokens
- fonts

1) Palette (DOMINANT COLORS ONLY):
Extract EXACTLY 3 dominant colors that occupy the largest visible areas of the reference image.
These must be the main brand colors, not tiny accent pixels.

Output palette keys:
- primary
- secondary
- accent

Rules (STRICT):
- Use HEX colors only (e.g. #1A2B3C).
- Do NOT use black (#000000) or white (#FFFFFF) as primary/secondary/accent unless they are clearly dominant areas.
- Do NOT pick colors from small fine print text or tiny details.
- Prioritize large blocks: background fills, big shapes, big headings, major badges.
- The 3 colors must be clearly present and dominant.

Also output:
- textOnDark and textOnLight must be readable neutrals derived from the reference:
  - If the reference uses off-white, use off-white (not pure white).
  - If the reference uses dark gray, use that (not pure black).

Do NOT output any extra palette keys beyond:
primary, secondary, accent, textOnDark, textOnLight, muted.
Muted must be a desaturated version of a dominant color, not a new hue.


2) Text Style Tokens:
For each role, define 1–3 style variants.

Roles:
- headline
- value
- subline
- fineprint

Each variant may include:
- fontRef: "primary" | "secondary" | "extra0"
- weight (number)
- italic (true/false)
- textFillRole (palette key)
- badge (optional): { shape: "none"|"pill"|"rect", fillRole, opacity (0–1), paddingPct (0–0.3) }
- outline (optional): { enabled, colorRole, widthPctOfFont }
- shadow (optional): { enabled, colorRole, dyPctOfFont, blurPctOfFont }

CRITICAL TOKEN COMPLETENESS RULE:
- You MUST output tokens for ALL roles: headline, value, subline, fineprint.
- For EACH role you MUST include:
  - variants: an array with AT LEAST 1 variant object (never empty).
  - sizeRangePx: { min: number, max: number }.
- NEVER omit a role.
- NEVER return variants: [].
- If the reference image does not clearly show a role, still provide a conservative default variant:
  - fontRef: "primary" (or "secondary" if primary is display-heavy)
  - weight: 400
  - italic: false
  - textFillRole: "textOnLight" (or "textOnDark" when applicable)

Rules:
- Prefer consistency over variety.
- If unsure, choose simpler variants.
- Do NOT invent effects not clearly present.

NO-EXTRAS RULE (VERY IMPORTANT):
- Do NOT invent effects or decorations.
- Only include outline/shadow/badge if they are CLEARLY present in the reference.
- If not obvious, set them to disabled / none.


3) Size Ranges:
For each role provide:
- sizeRangePx { min, max }
- lineHeight

4) Fonts (STRICT DOMINANT FONTS ONLY):
You MUST output exactly 2 font groups: fonts.primary and fonts.secondary.
Do NOT include extra fonts.

CRITICAL:
- Choose the fonts that appear in the LARGEST, MOST DOMINANT text in the reference.
- Ignore tiny disclaimers, fine print, small UI labels.
- If the reference includes a decorative script font only in small words, do NOT choose it as primary/secondary.
- Choose fonts that define the brand look.

For each font group output:
- familyGuess: string | null (ONLY if confident; otherwise null)
- category: "sans" | "serif" | "display" | "script" | "mono"
- tags: 3–8 tags describing the EXACT look (e.g. "condensed", "rounded", "retro", "geometric", "brush-script", "high-contrast-serif")
- weightHints: array of weights that match the dominant text (e.g. [700, 800])
- uppercasePreferred
- contrast
- notes (optional)

STRICT RULES:
- Do NOT say "similar" or "approx". Describe what you SEE.
- Weight hints must match the dominant text (if it's heavy, include 700–900).
- If the dominant text is not italic, italic must be false in tokens by default.

5) Shapes (optional but recommended):
If the reference contains badges/panels/frames/ornaments, describe them as SHAPE TOKENS (no drawing).
Output shapes as an array with 1–3 items, each:
- type: "pill" | "rect" | "roundedRect" | "ribbon" | "burst" | "underline" | "frame"
- fillRole: palette key
- stroke: { enabled, colorRole, widthPct } or null
- cornerRadiusPct (0..0.5) when applicable
- paddingPct (0..0.3)
- styleNotes (short)

STRICT:
- Only include shapes clearly visible and dominant.
- Do not invent new shapes.



Return ONLY valid JSON.
`.trim();
    const userText = `
Analyze the visual style of the brand reference image.

Use the image as the only source of truth.

Optional brand hint / name:
${body.hintName ?? "(none)"}

Return ONLY valid JSON that matches the required structure.
`.trim();

    const r = await openai.responses.create({
      model: "gpt-4o",
      input: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "input_text", text: userText },
            { type: "input_image", image_url: visionImageUrl, detail: "high" },
          ],
        },
      ],
    });

    let raw = (r.output_text ?? "").trim();
    if (!raw) return res.status(500).json({ error: "Failed to analyze brand style (empty response)" });

    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    raw = raw.replace(/:\s*bold\b/g, ": 800");
    raw = raw.replace(/:\s*regular\b/g, ": 400");

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(raw);
    } catch (e) {
      const resp: AnalyzeBrandStyleResponse = {
        name: body.hintName,
        styleRecipeJson: { raw },
        fontMetaJson: null,
        creditsBalance: creditsBalanceAfter,
      };
      return res.status(200).json(resp);
    }

    const normalizedJSON = normalizeStyleRecipeFromAi(parsedJson);

    const resp: AnalyzeBrandStyleResponse = {
      name: normalizedJSON.name,
      styleRecipeJson: normalizedJSON,
      fontMetaJson: parsedJson?.fonts ?? null,
      creditsBalance: creditsBalanceAfter,
    };


    return res.status(200).json(resp);
  } catch (err) {
    if (err instanceof PaywallError) {
      return res.status(402).json({
        code: err.code,
        ...err.payload,
      });
    }
    console.error("[POST /brand-styles/analyze] error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

brandStylesRouter.post("/", requireAuth, withTenant, async (req, res) => {
  try {
    const auth = (req as any).auth as {
      tenantId: string;
      userId: string;
      role?: "TENANT" | "SUPERADMIN";
    };
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    }

    const body: CreateBrandStyleBody = parsed.data;
    const isSuper = auth.role === "SUPERADMIN";

    if (body.scope === "SYSTEM" && !isSuper) {
      return res.status(403).json({ error: "Only SUPERADMIN can create SYSTEM brand styles" });
    }

    const name = body.name.trim();
    const sourceImageUrl = normalizeUploadsUrl(body.sourceImageUrl.trim());
    const thumbnailUrl = body.thumbnailUrl ? normalizeUploadsUrl(body.thumbnailUrl.trim()) : null;


    const created = await prisma.brandStyle.create({
      data:
        body.scope === "SYSTEM"
          ? {
            scope: "SYSTEM",
            status: "ACTIVE",
            tenantId: null,
            userId: null,
            name,
            sourceImageUrl,
            sourceW: body.sourceW ?? null,
            sourceH: body.sourceH ?? null,
            thumbnailUrl,
            styleRecipeJson: body.styleRecipeJson as any,
            fontMetaJson: (body.fontMetaJson ?? null) as any,
            version: 1,
          }
          : {
            scope: "TENANT",
            status: "ACTIVE",
            tenantId: auth.tenantId,
            userId: auth.userId,
            name,
            sourceImageUrl,
            sourceW: body.sourceW ?? null,
            sourceH: body.sourceH ?? null,
            thumbnailUrl,
            styleRecipeJson: body.styleRecipeJson as any,
            fontMetaJson: (body.fontMetaJson ?? null) as any,
            version: 1,
          },
      select: { id: true },
    });

    const resp: CreateBrandStyleResponse = { id: created.id };
    return res.status(201).json(resp);
  } catch (err) {
    console.error("[POST /brand-styles] error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

brandStylesRouter.get("/:id", requireAuth, withTenant, async (req, res) => {
  const auth = (req as any).auth as { tenantId: string; userId: string; role?: "TENANT" | "SUPERADMIN" };
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const id = z.string().min(8).parse(req.params.id);

  // доступ: SYSTEM всегда видим, USER только свой tenantId+userId (как у тебя в list)
  const row = await prisma.brandStyle.findFirst({
    where: {
      id,
      OR: [
        { scope: "SYSTEM", tenantId: null },
        { scope: "TENANT", tenantId: auth.tenantId, userId: auth.userId },
      ],
    },
    select: {
      id: true,
      scope: true,
      status: true,
      name: true,
      sourceImageUrl: true,
      thumbnailUrl: true,
      version: true,
      styleRecipeJson: true,
      fontsResolvedJson: true,
      updatedAt: true,
    },
  });

  if (!row) return res.status(404).json({ error: "BrandStyle not found" });

  const styleRecipe = row.styleRecipeJson as any;
  const palette = styleRecipe?.palette ?? null;

  return res.json({
    id: row.id,
    scope: row.scope,
    status: row.status,
    name: row.name,
    sourceImageUrl: row.sourceImageUrl,
    thumbnailUrl: row.thumbnailUrl,
    version: row.version,
    updatedAt: new Date(row.updatedAt).toISOString(),
    palette,               // <-- вот это тебе нужно для чипов
    // можно полезно на будущее:
    // styleRecipeJson: row.styleRecipeJson,
    fontsResolvedJson: row.fontsResolvedJson,
  });
});

// brandStylesRouter.get("/list-admin", requireAuth, withTenant, async (req, res) => {
//   const parsed = listQuerySchema.safeParse(req.query);
//   if (!parsed.success) {
//     return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
//   }

//   const auth = (req as any).auth as { tenantId: string; userId: string; role?: "USER" | "SUPERADMIN" };
//   if (!auth) return res.status(401).json({ error: "Unauthorized" });

//   const { scope = "ALL", status = "ACTIVE", q, take = 100, skip = 0 } = parsed.data;

//   const whereOr: any[] = [];

//   if (scope === "SYSTEM" || scope === "ALL") {
//     whereOr.push({ scope: "SYSTEM", tenantId: null });
//   }

//   if (scope === "TENANT" || scope === "ALL") {
//     whereOr.push({ scope: "TENANT", tenantId: auth.tenantId, userId: auth.userId });
//   }

//   const where: any = {
//     OR: whereOr,
//     status,
//   };

//   if (q) {
//     where.AND = [
//       {
//         OR: [{ name: { contains: q, mode: "insensitive" } }],
//       },
//     ];
//   }

//   const rows = await prisma.brandStyle.findMany({
//     where,
//     orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
//     skip,
//     take,
//     select: {
//       id: true,
//       scope: true,
//       status: true,
//       name: true,
//       sourceImageUrl: true,
//       //thumbnailUrl: true,
//       version: true,
//       updatedAt: true,
//     },
//   });

//   const resp: ListBrandStylesResponse = { items: rows.map(toListItem) };
//   return res.json(resp);
// });

brandStylesRouter.get("/", requireAuth, withTenant, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
  }

  const auth = (req as any).auth as { tenantId: string; userId: string; role?: "USER" | "SUPERADMIN" };
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { scope = "ALL", status = "ACTIVE", q, take = 10, skip = 0 } = parsed.data;

  const whereOr: any[] = [];

  if (scope === "SYSTEM" || scope === "ALL") {
    whereOr.push({ scope: "SYSTEM", tenantId: null });
  }
  if (scope === "TENANT" || scope === "ALL") {
    whereOr.push({ scope: "TENANT", tenantId: auth.tenantId, userId: auth.userId });
  }

  const where: any = { OR: whereOr, status };

  if (q) {
    where.AND = [{ OR: [{ name: { contains: q, mode: "insensitive" } }] }];
  }

  const rows = await prisma.brandStyle.findMany({
    where,
    orderBy: [{ scope: "asc" }, { updatedAt: "desc" }],
    skip,
    take,
    select: {
      id: true,
      scope: true,
      status: true,
      name: true,
      thumbnailUrl: true,
      sourceImageUrl: true,
      version: true,
      updatedAt: true,
    },
  });

  const items = rows.map(toListItem);

  // nextCursor: если пришло меньше, чем take — больше страниц нет
  const nextCursor = items.length === take ? skip + items.length : null;

  // (опционально) counts — удобно для табов "all/system/mine"
  // Можно убрать, если не нужно
  const [systemCount, mineCount] = await Promise.all([
    prisma.brandStyle.count({
      where: {
        status,
        ...(q
          ? { AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }] }] }
          : {}),
        scope: "SYSTEM",
        tenantId: null,
      },
    }),
    prisma.brandStyle.count({
      where: {
        status,
        ...(q
          ? { AND: [{ OR: [{ name: { contains: q, mode: "insensitive" } }] }] }
          : {}),
        scope: "TENANT",
        tenantId: auth.tenantId,
        userId: auth.userId,
      },
    }),
  ]);

  const resp: ListBrandStylesResponse = {
    items,
    nextCursor,
    counts: { system: systemCount, mine: mineCount, all: systemCount + mineCount },
  };

  return res.json(resp);
});

brandStylesRouter.delete("/:id", requireAuth, withTenant, async (req, res) => {
  try {
    const auth = (req as any).auth as { tenantId: string; userId: string; role?: "USER" | "SUPERADMIN" };
    if (!auth) return res.status(401).json({ error: "Unauthorized" });

    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const bs = await prisma.brandStyle.findUnique({
      where: { id },
      select: { id: true, scope: true, tenantId: true, userId: true },
    });

    if (!bs) return res.status(404).json({ error: "BrandStyle not found" });

    // SYSTEM может удалять только SUPERADMIN (или запретить вовсе)
    if (bs.scope === "SYSTEM") {
      if (auth.role !== "SUPERADMIN") return res.status(403).json({ error: "Forbidden" });
      await prisma.brandStyle.delete({ where: { id } });
      return res.status(204).send();
    }

    // USER: только владелец в своём tenant
    if (bs.tenantId !== auth.tenantId || bs.userId !== auth.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await prisma.brandStyle.delete({ where: { id } });
    return res.status(204).send();
  } catch (err) {
    console.error("[DELETE /brand-styles/:id] error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

