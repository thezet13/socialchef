// apps/api/src/modules/ai/ai.routes.ts
import { Router } from 'express';
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { PlanType } from "@prisma/client";
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import multer from 'multer';

import { prisma } from '../../lib/prisma';

import { requireAuth } from '../../middleware/requireAuth';
import { withTenant } from '../../middleware/withTenant';
import { openai } from '../../lib/openai';
import { resolveCurrentPeriodForTenant, getMaxExportPxForPlan } from "../../modules/ai/ai.usage";

import { ImageAdjustments, renderCompositeImage } from "./renderCompositeImage";
import { getTenantPlan } from "./helpers/getTenantPlan";
import { assertLibraryQuota } from "../assets/libraryQuota";
import { UPLOADS_DIR_ABS, uploadsImagesDir } from "../../lib/uploadsPaths";
import { uploadPic, uploadSingleImage } from "../../lib/uploads";

import { drawImageCover, drawImageRenderContain, MAX_CANVAS_SIZE, clampOutSize } from "./ai.render";
import { buildRestylePrompt } from '../styles/prompts/buildRestylePrompt';
import { drawContain } from '../../lib/drawContain';
import { ensureCreditsOrThrow, PaywallError } from '../billing/credits.guard';
import { alignMaskToImageUniversal } from './helpers/alignMaskToImageUniversal';

import { resolveAiEditSize, savePngToUploads } from "./helpers/ai.service";

import { RESERVED_FAMILIES, fontsDir, uploadFont } from './helpers/fonts.service'
import {
  designImportBodySchema,
  designImportModelSchema,
  BakeBodySchema,
  GeneratePostBody,

  type FormatId, type BaseTransform, type GenerateImageBody, type OverlayTextConfig, type OverlayPicConfig, type OverlayRectConfig, type RenderOverlay, type RestyleGpt15Body,
  BakeCommitSchema,
  CommitPreviewBody,
  UpscaleBody,
} from "../ai/types/ai.types"

import {
  normalizeOverlay, stripHidden, runBakeBrandStyleEdit
} from "../ai/helpers/bake.service"

import {
  makeInpaintMaskPng, safeToDataUrl, readAsPngBuffer, callOpenAIImageEditViaFetch, loadUploadsImageBuffer, loadUploadsAnyAsPng, fileFromPng,
  enforceExportHistory,
  EXPORT_CAP
} from "./helpers/images.service"

import { inferFormatId } from "./helpers/restyle.service"
import {
  generateDishMaskCutout, makeDishCutoutPng, thresholdAndDilateMask, fillMaskHoles, shrinkBinaryMask, makeSoftMaskPng
} from "./helpers/swapcut.service"
import { ComboGpt15Body } from './types/combo.types';
import { buildComboPrompt } from '../combo/buildComboPrompt';

import { ensureAssetForUploadsUrl, uploadsUrlToAbsPath, linkAssetToProDesign } from "../../lib/assets";

const aiRouter: import("express").Router = Router();

aiRouter.post("/pro-images/commit-preview",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      const { userId, tenantId } = req.auth;

      const body = req.body as CommitPreviewBody;
      if (!body.proDesignId) return res.status(400).json({ error: "proDesignId is required" });
      if (!body.previewImageUrl) return res.status(400).json({ error: "previewImageUrl is required" });

      // ✅ важно: ограничим только uploads/images
      if (!body.previewImageUrl.startsWith("/uploads/images/")) {
        return res.status(400).json({ error: "previewImageUrl must be in /uploads/images/..." });
      }

      const design = await prisma.proDesign.findFirst({
        where: { id: body.proDesignId, tenantId, userId },
        select: { id: true },
      });
      if (!design) return res.status(404).json({ error: "ProDesign not found" });

      // ✅ опционально: проверим, что файл реально есть на диске
      const srcName = body.previewImageUrl.split("/").pop();
      if (!srcName) return res.status(400).json({ error: "Invalid previewImageUrl" });

      const srcPath = path.join(process.cwd(), "uploads", "images", srcName);
      if (!fs.existsSync(srcPath)) return res.status(404).json({ error: "File not found" });

      const updated = await prisma.proDesign.update({
        where: { id: design.id },
        data: {
          baseImageUrl: body.previewImageUrl, // ✅ без копии
          status: "DRAFT",
        },
        select: { id: true, baseImageUrl: true },
      });

      return res.status(200).json({
        proDesignId: updated.id,
        baseImageUrl: updated.baseImageUrl,
      });
    } catch (err) {
      console.error("[POST /ai/pro-images/commit-preview] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.post("/pro-images/restyle-gpt15", requireAuth, withTenant,
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const { userId, tenantId } = req.auth;

      const body = req.body as RestyleGpt15Body;

      if (!body.proDesignId) {
        return res.status(400).json({ error: "proDesignId is required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server" });
      }

      const design = await prisma.proDesign.findFirst({
        where: { id: body.proDesignId, tenantId, userId },
      });

      if (!design) return res.status(404).json({ error: "ProDesign not found" });
      if (!design.baseImageUrl) return res.status(400).json({ error: "ProDesign has no baseImageUrl" });

      const mode = body.mode ?? "final";
      const isPreview = mode === "preview";


      const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
        tenantId,
        userId,
        action: body.mode === "preview" ? "RESTYLE_PREVIEW" : "RESTYLE_TRY_AGAIN",
        formatId: body.formatId,
      });

      // Final sizes (requested)
      const widthFinal = Number(body.width ?? design.width ?? 1024);
      const heightFinal = Number(body.height ?? design.height ?? 1024);

      const formatId = (body.formatId as FormatId | undefined) ?? inferFormatId(widthFinal, heightFinal);


      if (!Number.isFinite(widthFinal) || !Number.isFinite(heightFinal) || widthFinal <= 0 || heightFinal <= 0) {
        return res.status(400).json({ error: "Invalid width/height" });
      }

      // Preview sizes (cheap)
      function previewSize(w: number, h: number, maxSide = 768) {
        const m = Math.max(w, h);
        const k = maxSide / m;
        return {
          w: Math.max(64, Math.round(w * k)),
          h: Math.max(64, Math.round(h * k)),
        };
      }

      const { w: width, h: height } = isPreview
        ? previewSize(widthFinal, heightFinal, 768)
        : { w: widthFinal, h: heightFinal };


      // Quality (cheap for preview)
      const quality = isPreview ? "low" : (body.quality ?? "auto");

      // const width = Number(body.width ?? design.width ?? 1024);
      // const height = Number(body.height ?? design.height ?? 1024);

      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return res.status(400).json({ error: "Invalid width/height" });
      }


      // load base image from disk (same approach as your expand-background endpoint)
      const uploadsStylesDir = path.join(process.cwd(), "uploads", "image-styles");
      const uploadsBaseDir = path.join(process.cwd(), "uploads", "images");

      const baseFilename = design.baseImageUrl.split("/").pop();
      if (!baseFilename) return res.status(500).json({ error: "Invalid baseImageUrl" });

      const basePath = path.join(uploadsBaseDir, baseFilename);
      if (!fs.existsSync(basePath)) return res.status(404).json({ error: "Base image file not found on disk" });

      const imgBuf = fs.readFileSync(basePath);

      const ext = path.extname(baseFilename).toLowerCase();
      const mime =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : "image/png";

      // Build a strict prompt (style rules + preserve dish identity)
      const userDetails = (body.prompt || "").trim();

      const dbStyle = await prisma.style.findFirst({
        where: {
          id: body.styleId,
          status: "PUBLISHED",
          OR: [
            { scope: "SYSTEM", tenantId: null },
            { scope: "TENANT", tenantId, userId }, // ✅ приватные стили пользователя
          ],
        },
        select: { id: true, prompt: true, title: true, referenceImageUrl: true },
      });

      if (!dbStyle) {
        return res.status(404).json({ error: "Style not found" });
      }

      //APPLY REFERENCE IMAGE
      const styleFilename = dbStyle.referenceImageUrl.split("/").pop();
      if (!styleFilename) return res.status(500).json({ error: "Invalid referenceImageUrl" });

      const styleAbs = path.join(uploadsStylesDir, styleFilename);
      if (!fs.existsSync(styleAbs)) return res.status(404).json({ error: "Style reference file not found on disk" });

      const styleBuf = fs.readFileSync(styleAbs);
      const styleMime = "image/png"; // или определяй по ext как у base
      const styleFile = new File([new Uint8Array(styleBuf)], styleFilename, { type: styleMime });
      /////////

      const resolvedStyleId = dbStyle.id;
      const styleText = dbStyle.prompt;

      const fullPrompt = buildRestylePrompt({
        styleText,
        userDetails,
        formatId,
        behavior: body.behavior,
      });

      // IMPORTANT: Use File([Uint8Array]) like in your expand-background endpoint
      const imageFile = new File([new Uint8Array(imgBuf)], baseFilename, { type: mime });

      const edited = await openai.images.edit({
        model: "gpt-image-1.5",
        prompt: fullPrompt,
        image: [imageFile, styleFile],
        output_format: "png",
        // size rules differ; we keep "auto" and then resize via canvas below
        size: "auto",
        quality,
      } as any);

      const b64 = (edited as any)?.data?.[0]?.b64_json;
      if (!b64) {
        console.error("No b64_json from GPT Image (edit)", edited);
        return res.status(500).json({ error: "AI did not return an image" });
      }

      const outBytes = Buffer.from(b64, "base64");

      // Resize/crop to requested size exactly (like your other endpoints)
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      const outImg = await loadImage(outBytes);

      // drawCover(ctx, outImg, width, height);
      // ctx.drawImage(outImg as any, 0, 0, width, height);
      drawContain(ctx, outImg, width, height);


      // save restyled base image
      if (!fs.existsSync(uploadsBaseDir)) fs.mkdirSync(uploadsBaseDir, { recursive: true });

      const finalId = `${isPreview ? "preview" : "restyle"}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const finalFilename = `${finalId}.png`;
      const finalPath = path.join(uploadsBaseDir, finalFilename);

      const finalPng = await canvas.encode("png");
      fs.writeFileSync(finalPath, finalPng);

      const newBaseImageUrl = `/uploads/images/${finalFilename}`;

      if (isPreview) {
        // Preview: do NOT update ProDesign.baseImageUrl and do NOT count usage
        return res.status(200).json({
          proDesignId: design.id,
          previewImageUrl: newBaseImageUrl,
          width,
          height,
          styleId: resolvedStyleId,
          mode: "preview",
          creditsBalance: creditsBalanceAfter,
        });
      }

      // update design (same pattern as expand-background)
      const updated = await prisma.proDesign.update({
        where: { id: design.id },
        data: {
          baseImageUrl: newBaseImageUrl,
          width,
          height,
          baseWidth: width,
          baseHeight: height,
          style: resolvedStyleId,
          // store user details as prompt if provided (optional; tweak if you prefer)
          ...(userDetails ? { prompt: userDetails } : {}),
          status: "DRAFT",
        },
      });

      // track usage
      const { periodStart, periodEnd } = await resolveCurrentPeriodForTenant(tenantId);
      await prisma.aIUsagePeriod.upsert({
        where: { tenantId_periodStart_periodEnd: { tenantId, periodStart, periodEnd } },
        update: { imageCount: { increment: 1 } },
        create: { tenantId, periodStart, periodEnd, textCount: 0, imageCount: 1, planCount: 0 },
      });

      return res.status(200).json({
        proDesignId: updated.id,
        baseImageUrl: updated.baseImageUrl,
        width: updated.width,
        height: updated.height,
        style: updated.style,
        styleId: body.styleId ?? null,
        prompt: updated.prompt,
        mode: "final",
        creditsBalance: creditsBalanceAfter
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        return res.status(402).json({
          code: err.code,
          ...err.payload
        });
      }

      console.error("[POST /ai/pro-images/restyle-gpt15] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.post("/pro-images/dish-cutout",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body as { proDesignId?: string, formatId: string };
      if (!body.proDesignId) return res.status(400).json({ error: "proDesignId is required" });

      const { tenantId, userId } = req.auth;

      const design = await prisma.proDesign.findFirst({
        where: { id: body.proDesignId, tenantId, userId },
        select: {
          id: true,
          baseImageUrl: true,
          width: true,
          height: true,
          baseWidth: true,
          baseHeight: true,
        },
      });

      if (!design) return res.status(404).json({ error: "ProDesign not found" });
      if (!design.baseImageUrl) return res.status(400).json({ error: "No baseImageUrl" });


      const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
        tenantId,
        userId,
        action: "DISH_CUTOUT_PIC",
        formatId: body.formatId,
      });

      const w = Number(design.width ?? 1024);
      const h = Number(design.height ?? 1024);

      const editorW = Number(design.baseWidth ?? w);
      const editorH = Number(design.baseHeight ?? h);

      if (!Number.isFinite(editorW) || !Number.isFinite(editorH) || editorW <= 0 || editorH <= 0) {
        return res.status(400).json({ error: "Invalid editor baseWidth/baseHeight on design" });
      }
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        return res.status(400).json({ error: "Invalid width/height" });
      }

      // ✅ source buffer first
      const srcBuf = loadUploadsImageBuffer(uploadsImagesDir, design.baseImageUrl);

      // ✅ resolve AI size (allowed sizes only)
      const { w: aiW, h: aiH } = resolveAiEditSize(editorW, editorH);

      // ✅ render source into aiW×aiH so OpenAI gets allowed size + stable input
      const aiCanvas = createCanvas(aiW, aiH);
      const aictx = aiCanvas.getContext("2d");
      const srcImg = await loadImage(srcBuf);
      drawImageCover(aictx, srcImg as any, aiW, aiH, { scale: 1, offsetX: 0, offsetY: 0 });

      // ---------- SOURCE ----------
      const aiSrcPng = Buffer.from(await aiCanvas.encode("png"));

      // ---------- RAW MASK (OpenAI) ----------
      const rawMask = await generateDishMaskCutout({
        openai,
        aiBytesPng: aiSrcPng,
        aiW,
        aiH,
      });

      // ---------- THRESHOLD + DILATE ----------
      let mask = await thresholdAndDilateMask({
        maskPng: rawMask,
        w: aiW,
        h: aiH,
        dilatePx: 2,
      });

      // ---------- ALIGN (to SOURCE IMAGE) ----------
      const aligned = await alignMaskToImageUniversal({
        sourcePng: aiSrcPng, // ⚠️ именно фото
        maskPng: mask,       // ⚠️ именно обработанная маска
        w: aiW,
        h: aiH,
        coarseTopEdgePct: 0.90,
        fineRadiusPx: 8,
        lambda: 0.002,
      });

      mask = aligned.alignedMaskPng;

      // ---------- FILL HOLES (binary) ----------
      mask = await fillMaskHoles(mask, aiW, aiH);

      // ---------- SHRINK (erosion) ----------
      const shrinkPx = Math.round(Math.max(aiW, aiH) * 0.005);
      mask = await shrinkBinaryMask({
        maskPng: mask,
        w: aiW,
        h: aiH,
        px: shrinkPx,
      });

      // ---------- SOFT (feather LAST) ----------
      mask = await makeSoftMaskPng({
        maskPng: mask,
        w: aiW,
        h: aiH,
        expandPx: 2,
        featherPx: 2,
      });

      // ---------- CUTOUT ----------
      const cutout = await makeDishCutoutPng({
        sourcePng: aiSrcPng,
        maskPng: mask,
        w: aiW,
        h: aiH,
      });

      const saved = savePngToUploads({
        uploadsImagesDir,
        prefix: "dish_cutout",
        png: cutout,
      });

      return res.status(200).json({
        proDesignId: design.id,
        cutoutUrl: saved.url,
        creditsBalance: creditsBalanceAfter,
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        return res.status(402).json({
          code: err.code,
          ...err.payload,
        });
      }
      console.error("[dish-cutout-error] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});
aiRouter.post(
  "/pro-images/dish-cutout-upload",
  requireAuth,
  withTenant,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const { tenantId, userId } = req.auth;

      const formatId = String((req.body as { formatId?: string }).formatId ?? "");
      if (!formatId) return res.status(400).json({ error: "formatId is required" });

      const file = req.file;
      if (!file?.buffer?.length) return res.status(400).json({ error: "file is required" });

      const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
        tenantId,
        userId,
        action: "DISH_CUTOUT_PIC",
        formatId,
      });

      // 1) Определи editorW/editorH из formatId (как у тебя принято в проекте)
      // ВАЖНО: тут я не знаю твою реализацию форматов, поэтому вставь свою.
      // Например: const fmt = getFormatDefById(formatId); const editorW = fmt.width; const editorH = fmt.height;


      //const { editorW, editorH } = getEditorSizeFromFormatIdOrThrow(formatId);

      // 2) allowed AI size
      const { w: aiW, h: aiH } = resolveAiEditSize(1024, 1024);

      // 3) render uploaded photo -> aiW×aiH (cover)
      const aiCanvas = createCanvas(aiW, aiH);
      const aictx = aiCanvas.getContext("2d");

      const srcImg = await loadImage(file.buffer);
      drawImageCover(aictx, srcImg as any, aiW, aiH, { scale: 1, offsetX: 0, offsetY: 0 });

      const aiSrcPng = Buffer.from(await aiCanvas.encode("png"));

      // 4) mask pipeline (то же самое что у тебя)
      const rawMask = await generateDishMaskCutout({
        openai,
        aiBytesPng: aiSrcPng,
        aiW,
        aiH,
      });

      let mask = await thresholdAndDilateMask({
        maskPng: rawMask,
        w: aiW,
        h: aiH,
        dilatePx: 2,
      });

      const aligned = await alignMaskToImageUniversal({
        sourcePng: aiSrcPng,
        maskPng: mask,
        w: aiW,
        h: aiH,
        coarseTopEdgePct: 0.90,
        fineRadiusPx: 8,
        lambda: 0.002,
      });

      mask = aligned.alignedMaskPng;
      mask = await fillMaskHoles(mask, aiW, aiH);

      const shrinkPx = Math.round(Math.max(aiW, aiH) * 0.005);
      mask = await shrinkBinaryMask({ maskPng: mask, w: aiW, h: aiH, px: shrinkPx });

      mask = await makeSoftMaskPng({
        maskPng: mask,
        w: aiW,
        h: aiH,
        expandPx: 2,
        featherPx: 2,
      });

      const cutout = await makeDishCutoutPng({
        sourcePng: aiSrcPng,
        maskPng: mask,
        w: aiW,
        h: aiH,
      });

      const saved = savePngToUploads({
        uploadsImagesDir,
        prefix: "dish_cutout",
        png: cutout,
      });

      return res.status(200).json({
        cutoutUrl: saved.url,
        w: aiW,
        h: aiH,
        creditsBalance: creditsBalanceAfter,
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        return res.status(402).json({ code: err.code, ...err.payload });
      }
      console.error("[dish-cutout-upload] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.post("/pro-images/:id/expand-background",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const tenantId = res.locals.tenantId as string;
      const userId = req.auth.userId;
      const { id } = req.params;

      type Body = {
        outputWidth: number;
        outputHeight: number;
        baseTransform?: BaseTransform;
        formatId?: string;
      };

      const body = req.body as Body;

      const outW = Number(body.outputWidth);
      const outH = Number(body.outputHeight);

      if (!Number.isFinite(outW) || !Number.isFinite(outH) || outW <= 0 || outH <= 0) {
        return res.status(400).json({ error: "Invalid outputWidth/outputHeight" });
      }

      const design = await prisma.proDesign.findFirst({ where: { id, tenantId } });
      if (!design) return res.status(404).json({ error: "ProDesign not found" });

      const baseTransform =
        (body.baseTransform ?? (design as any).baseTransformJson ?? { scale: 1, offsetX: 0, offsetY: 0, fitMode: "contain" }) as BaseTransform;

      // load base image from disk
      const uploadsDirLocal = path.join(process.cwd(), "uploads", "images");
      const baseFilename = design.baseImageUrl.split("/").pop();
      if (!baseFilename) return res.status(500).json({ error: "Invalid baseImageUrl" });

      const basePath = path.join(uploadsDirLocal, baseFilename);
      const imgBuf = fs.readFileSync(basePath);
      const img = await loadImage(imgBuf);

      // 1) composite canvas: transparent background + base image drawn by transform
      const comp = createCanvas(outW, outH);
      const cctx = comp.getContext("2d");
      cctx.clearRect(0, 0, outW, outH);

      if (baseTransform.fitMode === "cover") {
        // cover обычно уже заполняет весь кадр => expand не имеет смысла
        // но если ты хочешь разрешить — просто не делай return, а маску делай пустой (всё protected)
        return res.status(400).json({ error: "Expand background works with Fit/contain (when empty zones exist)." });
      } else {
        drawImageRenderContain(cctx, img as any, outW, outH, {
          scale: baseTransform.scale,
          offsetX: baseTransform.offsetX,
          offsetY: baseTransform.offsetY,
        });
      }

      const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
        tenantId,
        userId,
        action: "EXPAND_BACKGROUND",
        formatId: body.formatId,
      });

      const compPng = await comp.encode("png");

      // 2) mask canvas:
      // прозрачное = можно редактировать (дорисовать),
      // чёрное (непрозрачное) = нельзя редактировать (сохраняем оригинал)
      const mask = createCanvas(outW, outH);
      const mctx = mask.getContext("2d");
      mctx.clearRect(0, 0, outW, outH);

      // вычисляем bbox отрисовки contain (как в drawImageRenderContain)
      const iw = (img as any).width;
      const ih = (img as any).height;

      const zoom = baseTransform.scale ?? 1;
      const offsetX = baseTransform.offsetX ?? 0;
      const offsetY = baseTransform.offsetY ?? 0;

      const s = Math.min(outW / iw, outH / ih) * zoom;
      const dw = iw * s;
      const dh = ih * s;

      const dx = (outW - dw) / 2 + offsetX;
      const dy = (outH - dh) / 2 + offsetY;

      // пересечение bbox с canvas
      const x0 = Math.max(0, dx);
      const y0 = Math.max(0, dy);
      const x1 = Math.min(outW, dx + dw);
      const y1 = Math.min(outH, dy + dh);

      if (x1 <= x0 || y1 <= y0) {
        return res.status(400).json({ error: "Image is fully outside the canvas." });
      }

      // protected area (original image zone)
      mctx.fillStyle = "rgba(0,0,0,1)";
      mctx.fillRect(x0, y0, x1 - x0, y1 - y0);

      const maskPng = await mask.encode("png");


      // 3) OpenAI outpaint
      const prompt =
        "Expand the background into the empty transparent areas naturally and seamlessly. " +
        "Do NOT change the dish/food or any pixels in the existing (non-transparent) area. " +
        "Match lighting, perspective, colors, and textures. No text, no logos, no watermark.";

      const imageFile = new File([new Uint8Array(compPng)], "comp.png", { type: "image/png" });
      const maskFile = new File([new Uint8Array(maskPng)], "mask.png", { type: "image/png" });

      const edited = await openai.images.edit({
        model: "gpt-image-1.5",
        prompt,
        image: imageFile,
        mask: maskFile,
        output_format: "png",
      } as any);

      const b64 = (edited as any)?.data?.[0]?.b64_json;
      if (!b64) return res.status(500).json({ error: "AI did not return an image" });

      const outBytes = Buffer.from(b64, "base64");

      // 4) save expanded base image
      if (!fs.existsSync(uploadsDirLocal)) fs.mkdirSync(uploadsDirLocal, { recursive: true });

      const finalId = `expanded_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const finalFilename = `${finalId}.png`;
      const finalPath = path.join(uploadsDirLocal, finalFilename);

      fs.writeFileSync(finalPath, outBytes);

      const newBaseImageUrl = `/uploads/images/${finalFilename}`;

      // 5) update design
      const neutralTransform: BaseTransform = { scale: 1, offsetX: 0, offsetY: 0, fitMode: "cover" };

      await prisma.proDesign.update({
        where: { id: design.id },
        data: {
          baseImageUrl: newBaseImageUrl,
          width: outW,
          height: outH,
          baseWidth: outW,
          baseHeight: outH,
          baseTransformJson: neutralTransform as any,
        },
      });

      return res.status(200).json({
        proDesignId: design.id,
        baseImageUrl: newBaseImageUrl,
        width: outW,
        height: outH,
        creditsBalance: creditsBalanceAfter,
      });
    } catch (err) {

      if (err instanceof PaywallError) {
        return res.status(402).json({
          code: err.code,
          ...err.payload,
        });
      }
      console.error("[POST /ai/pro-images/:id/expand-background] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.post("/design-import/analyze",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const parsed = designImportBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid body",
          details: parsed.error.issues,
        });
      }

      const { imageUrl, width, height, format } = parsed.data;

      // strict: only local uploads
      // if (!imageUrl.startsWith("/uploads/")) {
      //   return res.status(400).json({ error: "imageUrl must be a /uploads/... path" });
      // }

      const filePath = path.join(process.cwd(), imageUrl.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Image file not found" });
      }

      // If size wasn't provided — read it from image
      let imgW = width;
      let imgH = height;
      if (!imgW || !imgH) {
        const img = await loadImage(fs.readFileSync(filePath));
        // @napi-rs/canvas returns an Image-like object with width/height
        imgW = imgW ?? (img as any).width;
        imgH = imgH ?? (img as any).height;
      }

      if (!imgW || !imgH) {
        return res.status(500).json({ error: "Could not detect image dimensions" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server" });
      }

      const visionModel = (process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini").trim();
      const dataUrl = safeToDataUrl(filePath);

      const instructions = [
        "You are a layout extraction engine for a design editor.",
        "Given a raster image, detect TEXT blocks, RECT/PLAQ blocks, and IMAGE placeholders.",
        "Return ONLY valid JSON (no markdown, no commentary, no extra keys).",
        "All coordinates must be in pixels relative to the ORIGINAL image size.",
        "Prefer fewer, high-confidence elements (MVP).",
        "For pics: return placeholders only (bounding boxes); do NOT attempt segmentation.",
        "For texts: keep the text content EXACTLY as visible.",
        "For each text block return bounding box x,y,w,h in pixels."
      ].join(" ");

      // schema hint to steer the model into correct JSON shape
      const schemaHint = {
        width: imgW,
        height: imgH,
        texts: [
          {
            text: "Burger",
            x: 120,
            y: 80,
            fontSize: 72,
            fontWeight: 700,
            fontFamily: "Inter",
            fontStyle: "normal",
            color: "#ffffff",
            textAlign: "left",
            lineHeight: 1.2,
            textOpacity: 1,
            rotationDeg: 0,
          },
        ],
        rects: [
          {
            x: 90,
            y: 430,
            width: 260,
            height: 90,
            opacity: 1,
            fill: { kind: "solid", color: "#ff0000" },
            borderRadius: 0,
            rotationDeg: 0,
          },
        ],
        pics: [
          {
            x: 400,
            y: 300,
            width: 520,
            height: 520,
            opacity: 1,
            rotationDeg: 0,
          },
        ],
      };

      const userPrompt = [
        `Image size: ${imgW}x${imgH}.`,
        format ? `Target format hint: ${format}.` : "",
        "Output JSON schema example:",
        JSON.stringify(schemaHint),
      ]
        .filter(Boolean)
        .join("\n");

      // ---- OpenAI vision call (Responses API) ----
      const resp = await openai.responses.create({
        model: visionModel,
        instructions,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: userPrompt },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ] as any,
      });

      const raw = ((resp as any).output_text ?? "").trim();
      if (!raw) {
        return res.status(500).json({ error: "AI did not return any output" });
      }

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return res.status(500).json({
          error: "AI returned non-JSON output",
          raw: raw.slice(0, 5000),
        });
      }

      const modelParsed = designImportModelSchema.safeParse(json);
      if (!modelParsed.success) {
        return res.status(500).json({
          error: "AI output did not match schema",
          details: modelParsed.error.issues,
          raw: raw.slice(0, 5000),
        });
      }

      const out = modelParsed.data;

      out.texts = out.texts.map((t: any) => {
        const fs0 = String(t.fontStyle ?? "normal").toLowerCase();

        // если модель пишет bold в fontStyle — переводим это в fontWeight
        if (fs0 === "bold") {
          return { ...t, fontStyle: "normal", fontWeight: t.fontWeight ?? 700 };
        }

        // оставляем только normal/italic
        if (fs0 !== "normal" && fs0 !== "italic") {
          return { ...t, fontStyle: "normal" };
        }

        return { ...t, fontStyle: fs0 };
      });


      // Fill missing text bounding boxes (w/h) using canvas measureText()
      function estimateTextBox(t: any) {
        const fontSize = Number(t.fontSize ?? 48);
        const fontWeight = t.fontWeight ? String(t.fontWeight) : "400";
        const fontStyle = t.fontStyle ?? "normal";
        const fontFamily = t.fontFamily ?? "Inter";

        const lineHeight = Number(t.lineHeight ?? 1.2);
        const text = String(t.text ?? "");

        // make a tiny canvas just to measure text
        const c = createCanvas(10, 10);
        const ctx = c.getContext("2d");

        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

        // multi-line support (rare but safe)
        const lines = text.split("\n");
        const widths = lines.map((ln) => ctx.measureText(ln).width);
        const w = Math.max(1, Math.ceil(Math.max(...widths, 1)));
        const h = Math.max(1, Math.ceil(lines.length * fontSize * lineHeight));

        return { w, h };
      }

      out.texts = out.texts.map((t: any) => {
        if (typeof t.w === "number" && typeof t.h === "number") return t;
        const est = estimateTextBox(t);
        return { ...t, w: est.w, h: est.h };
      });




      const { clean, maskPad } = parsed.data;

      let cleanBaseImageUrl: string | null = null;

      const textsWithBox = out.texts as Array<{
        x: number;
        y: number;
        w: number;
        h: number;
      }>;



      if (clean && out.texts.length > 0) {
        // Build mask boxes from model output
        const boxes = textsWithBox.map((t) => ({
          x: t.x,
          y: t.y,
          width: t.w,
          height: t.h,
        }));

        const maskPng = makeInpaintMaskPng(imgW, imgH, boxes, maskPad);

        // делаем PNG буфер для исходника (надежно)
        const imagePng = await readAsPngBuffer(filePath);

        const editPrompt =
          "Remove all visible text from the image. Reconstruct the background naturally. " +
          "Do not add new text, logos, or watermarks. Keep everything else unchanged.";

        const bytes = await callOpenAIImageEditViaFetch({
          apiKey: process.env.OPENAI_API_KEY!,
          model: (process.env.OPENAI_INPAINT_MODEL ?? "gpt-image-1").trim(),
          prompt: editPrompt,
          imagePng,
          maskPng,
        });

        const cleanName = `clean_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const cleanPath = path.join(UPLOADS_DIR_ABS, cleanName);
        fs.writeFileSync(cleanPath, bytes);

        cleanBaseImageUrl = `/uploads/images/${cleanName}`;


        // Save mask to temp file (easiest for OpenAI SDK file inputs)
        const tmpMaskName = `mask_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const tmpMaskPath = path.join(UPLOADS_DIR_ABS, tmpMaskName);
        fs.writeFileSync(tmpMaskPath, maskPng);

        try {
          // Edits endpoint supports mask PNG for inpainting. :contentReference[oaicite:2]{index=2}
          const editPrompt =
            "Remove all visible text from the image. Reconstruct the background naturally. " +
            "Do not add new text, logos, or watermarks. Keep everything else unchanged.";

          const imageBuf = fs.readFileSync(filePath);
          const maskBuf = fs.readFileSync(tmpMaskPath);

          const imageFile = new File([imageBuf], path.basename(filePath), { type: "image/png" });
          const maskFile = new File([maskBuf], path.basename(tmpMaskPath), { type: "image/png" });

          const edited = await openai.images.edit({
            model: (process.env.OPENAI_INPAINT_MODEL ?? "gpt-image-1").trim(),
            prompt: editPrompt,
            image: imageFile,
            mask: maskFile,
          });


          // const edited = await openai.images.edit({
          //   model: (process.env.OPENAI_INPAINT_MODEL ?? "gpt-image-1").trim(),
          //   prompt: editPrompt,

          //   image: {
          //     data: fs.readFileSync(filePath),
          //     name: path.basename(filePath), // <- КЛЮЧЕВО
          //   } as any,

          //   mask: {
          //     data: fs.readFileSync(tmpMaskPath),
          //     name: path.basename(tmpMaskPath), // <- КЛЮЧЕВО
          //   } as any,

          // } as any);

          const b64 = (edited as any)?.data?.[0]?.b64_json;
          if (!b64) throw new Error("OpenAI edit returned no image");

          const bytes = Buffer.from(b64, "base64");
          const cleanName = `clean_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
          const cleanPath = path.join(UPLOADS_DIR_ABS, cleanName);
          fs.writeFileSync(cleanPath, bytes);

          cleanBaseImageUrl = `/uploads/images/${cleanName}`;
        } finally {
          // cleanup temp mask
          fs.unlink(tmpMaskPath, () => { });
        }
      }


      // ---- map model output -> твоё overlay (SocialChef style) ----
      // MVP positioning: x/y => marginLeft/marginTop, align="top-left"
      const texts: OverlayTextConfig[] = out.texts.map((t, idx) => ({
        z: 20 + idx,
        text: t.text,
        align: "top-left",
        textAlign: t.textAlign ?? "left",

        color: t.color ?? "#ffffff",
        fontFamily: t.fontFamily ?? "Inter",
        fontSize: Math.round(t.fontSize ?? 48),
        fontStyle: (t.fontStyle === "italic" ? "italic" : "normal"),
        fontWeight: Math.round((t.fontStyle === "bold" ? 700 : (t.fontWeight ?? 400))),

        lineHeight: t.lineHeight ?? 1.2,
        textOpacity: t.textOpacity ?? 1,

        marginLeft: t.x,
        marginTop: t.y,
        marginRight: 0,
        marginBottom: 0,

        // plaque defaults OFF
        plaqueColor: "#ffffff",
        plaqueOpacity: 0,
        plaqueBorderColor: "#000000",
        plaqueBorderOpacity: 1,
        plaqueBorderWidth: 0,
        borderRadius: 0,

        // padding defaults
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,

        // shadow defaults OFF
        shadowColor: "#000000",
        shadowOpacity: 0,
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,

        rotationDeg: t.rotationDeg ?? 0,
      }));

      const rects: OverlayRectConfig[] = out.rects.map((r, idx) => ({
        id: `rect_${Date.now()}_${idx}`,
        z: 10 + idx,

        width: Math.round(r.width),
        height: Math.round(r.height),
        opacity: r.opacity ?? 1,

        align: "top-left",
        marginLeft: r.x,
        marginTop: r.y,
        marginRight: 0,
        marginBottom: 0,

        fill:
          r.fill.kind === "linear"
            ? {
              kind: "linear",
              from: r.fill.from ?? "#000000",
              to: r.fill.to ?? "#ffffff",
              angle: r.fill.angle ?? 0,
            }
            : {
              kind: "solid",
              color: r.fill.color ?? "#ffffff",
            },

        borderEnabled: false,
        borderColor: "#000000",
        borderWidth: 0,
        borderRadius: r.borderRadius ?? 0,

        rotationDeg: r.rotationDeg ?? 0,
      }));

      // MVP: do not return pics yet (avoid broken image URLs)
      const pics: OverlayPicConfig[] = [];

      return res.json({
        overlay: { meta: { version: 1 }, texts, rects, pics },
        cleanBaseImageUrl, // NEW
        meta: {
          width: out.width,
          height: out.height,
          notes: cleanBaseImageUrl ? ["clean base image created via inpaint"] : [],
        },
      });

    } catch (e) {
      console.error("[POST /ai/design-import/analyze] error", e);
      const msg = e instanceof Error ? e.message : "Internal error";
      return res.status(500).json({ error: msg });
    }
  }
);

aiRouter.post('/posts/generate',
  requireAuth, withTenant, async (req, res) => {
    try {
      if (!req.auth) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { userId, tenantId } = req.auth;
      const { type, language, tone, dishName, dishDescription, idea } =
        req.body as GeneratePostBody;

      if (!type) {
        return res.status(400).json({ error: 'type is required' });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          locale: true,
        },
      });

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const lang = language ?? (tenant.locale as 'en' | 'ru' | 'az' | undefined) ?? 'en';
      const usedTone = tone ?? 'friendly';
      const restaurantName = tenant.name;

      // Собираем текст запроса для модели
      const userPromptParts: string[] = [];

      userPromptParts.push(
        `You are a social media copywriter for a restaurant named "${restaurantName}".`
      );
      userPromptParts.push(
        `Write 1 short social media post for ${type} in ${lang.toUpperCase()} language.`
      );
      userPromptParts.push(
        `The tone should be: "${usedTone}".`
      );
      userPromptParts.push(
        `Keep it concise (max 70–90 words), suitable for Instagram / Facebook caption.`
      );

      if (dishName) {
        userPromptParts.push(`Dish name: "${dishName}".`);
      }
      if (dishDescription) {
        userPromptParts.push(`Dish description: ${dishDescription}.`);
      }
      if (idea) {
        userPromptParts.push(`Post idea / context: ${idea}.`);
      }

      userPromptParts.push(
        `Do NOT add hashtags in the main text. Only plain text.`
      );

      const userPrompt = userPromptParts.join('\n');

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          error: 'OPENAI_API_KEY is not configured on the server',
        });
      }

      // Вызов OpenAI через Responses API (рекомендуемый способ)
      const response = await openai.responses.create({
        model: 'gpt-4.1-mini',
        instructions:
          'You are an AI assistant helping to generate high-quality social media posts for restaurants.',
        input: userPrompt,
      });

      // helper из SDK — склеивает весь текст
      // (доступен согласно официальному README openai-node)
      const mainText = (response as any).output_text as string | undefined;

      if (!mainText) {
        console.error('No output_text from OpenAI', response);
        return res.status(500).json({ error: 'AI did not return any text' });
      }

      // Пока хэштеги не генерируем отдельно — поле заполним пустой строкой
      const hashtags = '';

      // Сохраняем в БД GeneratedPost
      const generated = await prisma.generatedPost.create({
        data: {
          tenantId,
          type,
          language: lang,
          tone: usedTone,
          prompt: userPrompt,
          mainText,
          shortText: null,
          hashtags,
          cta: null,
          meta: {
            openaiResponseId: (response as any).id ?? null,
            model: (response as any).model ?? 'gpt-4.1-mini',
            createdByUserId: userId,
          },
        },
      })

      const { periodStart, periodEnd } = await resolveCurrentPeriodForTenant(tenantId);
      await prisma.aIUsagePeriod.upsert({
        where: {
          tenantId_periodStart_periodEnd: {
            tenantId,
            periodStart,
            periodEnd,
          },
        },
        update: {
          textCount: {
            increment: 1,
          },
        },
        create: {
          tenantId,
          periodStart,
          periodEnd,
          textCount: 1,
          imageCount: 0,
          planCount: 0,
        },
      });

      return res.status(201).json({
        id: generated.id,
        type: generated.type,
        language: generated.language,
        tone: generated.tone,
        mainText: generated.mainText,
        hashtags: generated.hashtags,
        tenantId: generated.tenantId,
        createdAt: generated.createdAt,
      });
    } catch (err) {
      console.error('[POST /ai/posts/generate] error', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

aiRouter.post("/pro-images/upload",
  requireAuth,
  withTenant,
  uploadSingleImage("file"),
  async (req, res) => {
    try {
      if (!req.auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { tenantId, userId } = req.auth;

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res.status(400).json({ error: "file is required" });
      }

      const style =
        typeof (req.body?.style as string | undefined) === "string"
          ? (req.body.style as string)
          : undefined;

      const baseImageBuffer = fs.readFileSync(path.join(UPLOADS_DIR_ABS, "images", file.filename));

      const img = await loadImage(baseImageBuffer);

      const width = img.width;
      const height = img.height;

      const baseImageUrl = `/uploads/images/${file.filename}`;

      const design = await prisma.proDesign.create({
        data: {
          tenantId,
          userId,
          prompt: (req.body?.prompt as string | undefined) || "Uploaded image",
          style,
          width,
          height,
          baseImageUrl,
          finalImageUrl: undefined,
          overlayJson: undefined,
          status: "DRAFT",
        },
      });

      // ✅ Asset registry + link to design (reliable)
      try {
        const asset = await ensureAssetForUploadsUrl({
          tenantId,
          uploadsUrl: baseImageUrl,
          kind: "DESIGN_SOURCE_UPLOAD",
        });

        await linkAssetToProDesign({
          proDesignId: design.id,
          assetId: asset.id,
          kind: asset.kind,
        });
      } catch (e) {
        console.warn("[upload] ensure/link asset failed (ignored):", e);
      }

      return res.status(201).json({
        id: design.id,
        baseImageUrl,
        width,
        height,
      });
    } catch (err) {
      console.error("[POST /ai/pro-images/upload] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.post("/pro-images/:id/bake-gpt15/preview", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const { userId, tenantId } = req.auth;

    const proDesignId = String(req.params.id || "").trim();
    if (!proDesignId) return res.status(400).json({ error: "Missing proDesignId" });

    const parsed = BakeBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const body = parsed.data;

    const design = await prisma.proDesign.findFirst({
      where: { id: proDesignId, tenantId, userId },
      select: { id: true, baseImageUrl: true, width: true, height: true, overlayJson: true },
    });
    if (!design) return res.status(404).json({ error: "ProDesign not found" });

    // overlay visible
    const overlayAll =
      body.overlay == null
        ? normalizeOverlay(design.overlayJson)
        : typeof body.overlay === "string"
          ? normalizeOverlay(JSON.parse(body.overlay))
          : normalizeOverlay(body.overlay);

    const overlayVisible = stripHidden(overlayAll);
    const all = overlayVisible;

    const hasAny =
      (all.texts?.length ?? 0) > 0 ||
      (all.rects?.length ?? 0) > 0 ||
      (all.pics?.length ?? 0) > 0;
    if (!hasAny) return res.status(400).json({ error: "No overlay elements to bake" });

    // ✅ charge preview credits (новый action)
    const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
      tenantId,
      userId,
      action: "BAKE_BRANDSTYLE",
    });

    const { finalPng, aiSize } = await runBakeBrandStyleEdit({
      designBaseImageUrl: design.baseImageUrl,
      styleRefImageUrl: body.styleRefImageUrl,
      overlayAllVisible: all,
      baseWidth: body.baseWidth,
      baseHeight: body.baseHeight,
      outputWidth: body.outputWidth,
      outputHeight: body.outputHeight,
      quality: body.quality ?? "low",
      behavior: body.behavior,
      safeInsetPct: body.safeInsetPct,
    });

    

    // save preview png (в uploads)
    const { url: previewImageUrl } = savePngToUploads({
      uploadsImagesDir,
      prefix: "bake_preview",
      png: finalPng,
    });

    return res.status(200).json({
      mode: "preview",
      proDesignId: design.id,
      previewImageUrl,
      aiSize,
      outputWidth: body.outputWidth,
      outputHeight: body.outputHeight,
      creditsBalance: creditsBalanceAfter,
    });
  } catch (err) {
    if (err instanceof PaywallError) return res.status(402).json({ code: err.code, ...err.payload });
    console.error("[POST /ai/pro-images/:id/bake-gpt15/preview]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


aiRouter.post("/pro-images/:id/bake-gpt15/commit", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const { userId, tenantId } = req.auth;

    const proDesignId = String(req.params.id || "").trim();
    if (!proDesignId) return res.status(400).json({ error: "Missing proDesignId" });

    const parsed = BakeCommitSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const body = parsed.data;

    const design = await prisma.proDesign.findFirst({
      where: { id: proDesignId, tenantId, userId },
      select: { id: true },
    });
    if (!design) return res.status(404).json({ error: "ProDesign not found" });

    await prisma.proDesign.update({
      where: { id: design.id },
      data: {
        baseImageUrl: body.previewImageUrl,
        overlayJson: { texts: [], pics: [], rects: [] } as any,
        finalImageUrl: null,
        status: "DRAFT",
      },
    });

    return res.status(200).json({
      mode: "commit",
      proDesignId: design.id,
      baseImageUrl: body.previewImageUrl,
    });
  } catch (err) {
    console.error("[POST /ai/pro-images/:id/bake-gpt15/commit]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});


aiRouter.get("/pro-images/:id",
  requireAuth, withTenant, async (req, res) => {
    const { tenantId } = req.auth!;
    const { id } = req.params;

    const design = await prisma.proDesign.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        width: true,
        height: true,
        baseImageUrl: true,
        overlayJson: true,
        baseTransformJson: true,
        imageAdjustmentsJson: true,
        baseWidth: true,
        baseHeight: true,
      },
    });

    if (!design) return res.status(404).json({ error: "Not found" });
    res.json(design);
  });

aiRouter.get("/me/capabilities",
  requireAuth, withTenant, async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const { tenantId } = req.auth;

      const plan = await getTenantPlan(tenantId);
      await assertLibraryQuota(tenantId, plan);

      const maxPx = getMaxExportPxForPlan(plan);
      const watermark = !(plan === PlanType.EDITOR || plan === PlanType.PRO || plan === PlanType.PRO_PLUS);

      return res.json({
        plan,
        export: {
          maxPx,
          watermark,
        },
      });
    } catch (e) {
      console.error("[GET /ai/me/capabilities] error", e);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

// aiRouter.post("/images/generate",
//   requireAuth,
//   withTenant,
//   async (req, res) => {
//     try {
//       if (!req.auth) {
//         return res.status(401).json({ error: "Unauthorized" });
//       }

//       const { userId, tenantId } = req.auth;
//       const body = req.body as GenerateImageBody;

//       if (!body.prompt) {
//         return res.status(400).json({ error: "prompt is required" });
//       }

//       const width = body.width ?? 1024;
//       const height = body.height ?? 1024;

//       const aspect = width / height;

//       const style = body.style ?? "instagram_dark";

//       const fullPrompt = `
//     Food photography of a dish for a restaurant social media.
//     Style: ${style}.
//     ${body.prompt}
//     Dark, high contrast, instagram-friendly composition.
//     No text in the image.
//     `.trim();

//       /* IMAGE API */


//       console.log("🔥 /images/generate USING SDXL");

//       const baseImageBuffer = await generateWithSDXL(fullPrompt, width, height);


//       const canvas = createCanvas(width, height);
//       const ctx = canvas.getContext("2d");

//       const baseImage = await loadImage(baseImageBuffer);

//       ctx.drawImage(baseImage, 0, 0, width, height);


//       const fileId = `img_${Date.now()}_${Math.random()
//         .toString(36)
//         .slice(2, 8)}`;
//       const filename = `${fileId}.png`;
//       const filePath = path.join(UPLOADS_DIR_ABS, filename);

//       const pngBuffer = await canvas.encode("png");
//       fs.writeFileSync(filePath, pngBuffer);

//       const baseImageUrl = `/uploads/images/${filename}`;

//       // создаём ProDesign
//       const design = await prisma.proDesign.create({
//         data: {
//           tenantId,
//           userId,
//           prompt: body.prompt,
//           style,
//           width,
//           height,
//           baseImageUrl,
//           finalImageUrl: undefined,
//           overlayJson: undefined,
//           status: "DRAFT",
//         },
//       });

//       const { periodStart, periodEnd } =
//         await resolveCurrentPeriodForTenant(tenantId);

//       await prisma.aIUsagePeriod.upsert({
//         where: {
//           tenantId_periodStart_periodEnd: {
//             tenantId,
//             periodStart,
//             periodEnd,
//           },
//         },
//         update: {
//           imageCount: {
//             increment: 1,
//           },
//         },
//         create: {
//           tenantId,
//           periodStart,
//           periodEnd,
//           textCount: 0,
//           imageCount: 1,
//           planCount: 0,
//         },
//       });

//       return res.status(201).json({
//         id: design.id,
//         baseImageUrl,
//         width,
//         height,
//         prompt: design.prompt,
//         style: design.style,
//         tenantId: design.tenantId,
//         createdAt: design.createdAt,
//       });

//     } catch (err) {
//       console.error("[POST /ai/images/generate] error", err);
//       return res.status(500).json({ error: "Internal server error" });
//     }
//   }
// );

aiRouter.post("/pro-fonts/upload",
  requireAuth,
  withTenant,
  uploadFont.single("file"),
  async (req, res) => {
    try {
      const auth = (req as any).auth as { tenantId: string; userId: string };
      if (!auth?.tenantId) return res.status(401).json({ error: "Unauthorized" });

      const tenantId = auth.tenantId;
      const userId = auth.userId;

      const family = typeof req.body?.family === "string" ? req.body.family.trim() : "";
      if (!family) return res.status(400).json({ error: "family is required" });

      if (RESERVED_FAMILIES.has(family)) {
        return res.status(400).json({ error: "This font family name is reserved. Choose another name." });
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "file is required" });

      const provider = "UPLOAD" as const;
      const style = "NORMAL" as const;
      const weight = 400; // важно для unique

      // сохраним в БД (upsert по unique(tenantId,family))
      const record = await prisma.fontAsset.upsert({
        where: {
          tenantId_provider_family_style_weight: {
            tenantId,
            provider,
            family,
            style,
            weight,
          },
        },
        update: {
          fileName: file.filename,
          mimeType: file.mimetype,
          userId: userId ?? null,
        },
        create: {
          tenantId,
          userId: userId ?? null,
          provider,
          family,
          style,
          weight,
          fileName: file.filename,
          mimeType: file.mimetype,
        },
      });

      // регистрируем для RenderPro
      const fullPath = path.join(fontsDir, record.fileName);
      GlobalFonts.registerFromPath(fullPath, record.family);

      return res.status(201).json({
        item: {
          family: record.family,
          url: `/uploads/fonts/${record.fileName}`,
        },
      });
    } catch (err) {
      console.error("[POST /ai/pro-fonts/upload] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.get("/pro-fonts",
  requireAuth,
  withTenant,
  async (_req, res) => {
    try {
      const tenantId = res.locals.tenantId as string;

      const items = await prisma.fontAsset.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: { family: true, fileName: true },
      });

      return res.json({
        items: items.map((x) => ({
          family: x.family,
          url: `/uploads/fonts/${x.fileName}`,
        })),
      });
    } catch (err) {
      console.error("[GET /ai/pro-fonts] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.post("/pro-assets/upload-image",
  requireAuth,
  withTenant,
  uploadPic.single("file"),
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      if (!req.file) return res.status(400).json({ error: "file is required" });

      const { tenantId } = req.auth;

      const plan = await getTenantPlan(tenantId);
      await assertLibraryQuota(tenantId, plan);

      const uploadsDir = path.join(process.cwd(), "uploads", "images");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const id = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const filename = `${id}.png`;
      const absPath = path.join(uploadsDir, filename);

      let outBuf = req.file.buffer;

      if (req.file.mimetype === "image/jpeg") {
        const img = await loadImage(req.file.buffer);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img as any, 0, 0);
        outBuf = Buffer.from(await canvas.encode("png"));
      }

      fs.writeFileSync(absPath, outBuf);

      const url = `/uploads/images/${filename}`;

      const asset = await prisma.asset.create({
        data: {
          tenantId,
          kind: "LIBRARY_OVERLAY_PIC",
          status: "ACTIVE",
          storagePath: url,
          bytes: req.file.size ?? null,
        },
        select: { id: true },
      });

      return res.status(201).json({ url, assetId: asset.id });
    } catch (err: unknown) {
      console.error("[POST /ai/pro-assets/upload-image] error", err);

      const msg = err instanceof Error ? err.message : "Internal server error";

      // quota error → 409 (Conflict) или 402 (Payment Required, но обычно 409/403)
      if (msg.toLowerCase().includes("quota exceeded")) {
        return res.status(409).json({ error: msg });
      }

      return res.status(500).json({ error: msg });
    }
  }
);

aiRouter.post("/pro-images/combo-gpt15",
  requireAuth, withTenant, async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      const { userId, tenantId } = req.auth;

      const body = req.body as ComboGpt15Body;

      if (!body.proDesignId) return res.status(400).json({ error: "proDesignId is required" });
      if (!body.styleId) return res.status(400).json({ error: "styleId is required" });

      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length < 2 || items.length > 4) {
        return res.status(400).json({ error: "items length must be 2..4" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server" });
      }

      // ✅ design нужен только чтобы не дать чужой proDesignId
      const design = await prisma.proDesign.findFirst({
        where: { id: body.proDesignId, tenantId, userId },
        select: { id: true, width: true, height: true },
      });
      if (!design) return res.status(404).json({ error: "ProDesign not found" });

      const mode = body.mode ?? "preview";
      if (mode !== "preview") return res.status(400).json({ error: "Only preview mode is supported" });

      // credits
      const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
        tenantId,
        userId,
        action: "COMBO_PREVIEW",
        formatId: body.formatId,
      });

      // target size (cheap)
      const widthFinal = Number(body.width ?? design.width ?? 1024);
      const heightFinal = Number(body.height ?? design.height ?? 1024);

      function previewSize(w: number, h: number, maxSide = 768) {
        const m = Math.max(w, h);
        const k = maxSide / m;
        return { w: Math.max(64, Math.round(w * k)), h: Math.max(64, Math.round(h * k)) };
      }

      const { w: width, h: height } = previewSize(widthFinal, heightFinal, 768);
      const quality = body.quality ?? "low";

      const formatId = (body.formatId as FormatId | undefined) ?? inferFormatId(widthFinal, heightFinal);

      // load style reference from disk
      const uploadsStylesDir = path.join(process.cwd(), "uploads", "image-styles");
      const uploadsImagesDir = path.join(process.cwd(), "uploads", "images");

      const dbStyle = await prisma.style.findFirst({
        where: {
          id: body.styleId,
          status: "PUBLISHED",
          OR: [
            { scope: "SYSTEM", tenantId: null },
            { scope: "TENANT", tenantId, userId },
          ],
        },
        select: { id: true, prompt: true, title: true, referenceImageUrl: true },
      });
      if (!dbStyle) return res.status(404).json({ error: "Style not found" });

      const styleFilename = dbStyle.referenceImageUrl.split("/").pop();
      if (!styleFilename) return res.status(500).json({ error: "Invalid referenceImageUrl" });

      const styleAbs = path.join(uploadsStylesDir, styleFilename);
      if (!fs.existsSync(styleAbs)) return res.status(404).json({ error: "Style reference file not found on disk" });

      const styleBuf = fs.readFileSync(styleAbs);
      const styleFile = new File([new Uint8Array(styleBuf)], styleFilename, { type: "image/png" });

      // load combo item images from disk
      const imageFiles: File[] = [];
      for (const it of items) {
        const rel = (it.imageUrl || "").trim();
        const filename = rel.split("/").pop();
        if (!filename) return res.status(400).json({ error: `Invalid imageUrl: ${rel}` });

        const abs = path.join(uploadsImagesDir, filename);
        if (!fs.existsSync(abs)) return res.status(404).json({ error: `Combo image not found on disk: ${rel}` });

        const buf = fs.readFileSync(abs);
        const ext = path.extname(filename).toLowerCase();
        const mime =
          ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : "image/png";

        imageFiles.push(new File([new Uint8Array(buf)], filename, { type: mime }));
      }

      const userDetails = (body.prompt || "").trim();

      const fullPrompt = buildComboPrompt({
        styleText: dbStyle.prompt || "",
        userDetails,
        formatId,
        layout: body.layout ?? "AUTO",
        bgStrictness: body.bgStrictness ?? "STRICT",
        itemCount: items.length,
      });

      const edited = await openai.images.edit({
        model: "gpt-image-1.5",
        prompt: fullPrompt,
        // ✅ порядок: items..., style last
        image: [...imageFiles, styleFile],
        output_format: "png",
        size: "auto",
        quality,
      } as any);

      const b64 = (edited as any)?.data?.[0]?.b64_json;
      if (!b64) {
        console.error("No b64_json from GPT Image (combo edit)", edited);
        return res.status(500).json({ error: "AI did not return an image" });
      }

      const outBytes = Buffer.from(b64, "base64");

      // resize/contain to requested preview size
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      const outImg = await loadImage(outBytes);
      drawContain(ctx, outImg, width, height);

      if (!fs.existsSync(uploadsImagesDir)) fs.mkdirSync(uploadsImagesDir, { recursive: true });

      const finalId = `combo_preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const finalFilename = `${finalId}.png`;
      const finalPath = path.join(uploadsImagesDir, finalFilename);

      const finalPng = await canvas.encode("png");
      fs.writeFileSync(finalPath, finalPng);

      const previewImageUrl = `/uploads/images/${finalFilename}`;

      return res.status(200).json({
        proDesignId: design.id,
        previewImageUrl,
        width,
        height,
        styleId: dbStyle.id,
        mode: "preview",
        creditsBalance: creditsBalanceAfter,
      });
    } catch (err) {
      if (err instanceof PaywallError) {
        return res.status(402).json({ code: err.code, ...err.payload });
      }
      console.error("[POST /ai/pro-images/combo-gpt15] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

aiRouter.post("/pro-images/upload-combo",
  requireAuth,
  withTenant,
  uploadSingleImage("file"),
  async (req, res) => {
    try {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "file is required" });

      const abs = path.join(UPLOADS_DIR_ABS, "images", file.filename);
      const buf = fs.readFileSync(abs);

      const img = await loadImage(buf);
      const width = img.width;
      const height = img.height;

      const imageUrl = `/uploads/images/${file.filename}`;

      const { tenantId } = (req as any).auth as { tenantId: string; userId: string };

      const proDesignId =
        typeof req.body?.proDesignId === "string" && req.body.proDesignId.trim()
          ? req.body.proDesignId.trim()
          : null;

      // ✅ register + optional link
      try {
        const asset = await ensureAssetForUploadsUrl({
          tenantId,
          uploadsUrl: imageUrl,
          kind: "DESIGN_SOURCE_UPLOAD",
        });

        if (proDesignId) {
          await linkAssetToProDesign({
            proDesignId,
            assetId: asset.id,
            kind: asset.kind,
          });
        }
      } catch (e) {
        console.warn("[upload-combo] ensure/link asset failed (ignored):", e);
      }


      return res.status(201).json({
        imageUrl,
        width,
        height,
      });
    } catch (err) {
      console.error("[POST /ai/pro-images/upload-combo] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

aiRouter.post("/images/upscale", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
    const { tenantId, userId } = req.auth;

    const body = req.body as UpscaleBody;

    const sourceImageUrl = (body.sourceImageUrl || "").trim();
    const targetMaxSide = Number(body.targetMaxSide);

    if (!sourceImageUrl.startsWith("/uploads/images/")) {
      return res.status(400).json({ error: "sourceImageUrl must be in /uploads/images/..." });
    }
    if (!Number.isFinite(targetMaxSide) || targetMaxSide <= 0) {
      return res.status(400).json({ error: "Invalid targetMaxSide" });
    }

    // ✅ credits (по желанию можешь включить сразу)
    // const { creditsBalance: creditsBalanceAfter } = await ensureCreditsOrThrow({
    //   tenantId,
    //   userId,
    //   action: 
    //   // action: targetMaxSide >= 4096 ? "UPSCALE_4K" : "UPSCALE_2K", // ⚠️ добавишь в shared
    // });

    const filename = path.basename(sourceImageUrl);
    const srcAbs = path.join(UPLOADS_DIR_ABS, "images", filename);

    if (!fs.existsSync(srcAbs)) {
      return res.status(404).json({ error: "Source image not found on disk" });
    }

    const meta = await sharp(srcAbs).metadata();
    const srcW = meta.width ?? 0;
    const srcH = meta.height ?? 0;
    if (!srcW || !srcH) return res.status(400).json({ error: "Failed to read image metadata" });

    // уже достаточно большое — просто вернём как есть
    const srcMaxSide = Math.max(srcW, srcH);
    if (srcMaxSide >= targetMaxSide) {
      return res.status(200).json({
        imageUrl: sourceImageUrl,
        width: srcW,
        height: srcH,
        //creditsBalance: creditsBalanceAfter,
        note: "No upscale needed",
      });
    }

    // вычисляем target w/h с сохранением aspect
    const k = targetMaxSide / srcMaxSide;
    const outW = Math.max(64, Math.round(srcW * k));
    const outH = Math.max(64, Math.round(srcH * k));

    const outId = `upscale_${targetMaxSide}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const outFilename = `${outId}.png`;
    const outAbs = path.join(UPLOADS_DIR_ABS, "images", outFilename);

    await sharp(srcAbs)
      .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toFile(outAbs);

    const imageUrl = `/uploads/images/${outFilename}`;

    return res.status(200).json({
      imageUrl,
      width: outW,
      height: outH,
      //creditsBalance: creditsBalanceAfter,
    });
  } catch (err) {
    if (err instanceof PaywallError) {
      return res.status(402).json({ code: err.code, ...err.payload });
    }
    console.error("[POST /ai/images/upscale] error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

aiRouter.post("/pro-images/create-empty-design", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

    const { tenantId, userId } = req.auth;

    const width = Number(req.body?.width ?? 0) || 10;
    const height = Number(req.body?.height ?? 0) || 10;

    const blankBaseImageUrl = "/uploads/system/blank-24.png";

    const design = await prisma.proDesign.create({
      data: {
        tenantId,
        userId,
        baseImageUrl: blankBaseImageUrl,
        width,
        height,
        baseWidth: width,
        baseHeight: height,
        overlayJson: null,
        prompt: "",
        status: "DRAFT",
      } as any,
    });

    return res.json({
      id: design.id,
      baseImageUrl: design.baseImageUrl,
      width: design.width,
      height: design.height,
    });
  } catch (e) {
    console.error("[ai/create-empty-design]", e);
    return res.status(500).json({ error: "Internal error" });
  }
});


// aiRouter.post("/pro-images/generate-dalle",
//   requireAuth,
//   withTenant,
//   async (req, res) => {
//     try {
//       if (!req.auth) {
//         return res.status(401).json({ error: "Unauthorized" });
//       }

//       const { userId, tenantId } = req.auth;
//       const body = req.body as GenerateImageBody;

//       if (!body.prompt) {
//         return res.status(400).json({ error: "prompt is required" });
//       }

//       const width = body.width ?? 1024;
//       const height = body.height ?? 1024;

//       const aspect = width / height;

//       const style = body.style ?? "instagram_dark";

//       const fullPrompt = `
//          ${style}.
//         ${body.prompt}

//         `.trim();

//       /* IMAGE API */
//       let dalleSize: "1024x1024" | "1024x1792" | "1792x1024" = "1024x1024";

//       if (aspect < 0.9) dalleSize = "1024x1792";      // portrait
//       else if (aspect > 1.1) dalleSize = "1792x1024"; // landscape
//       else dalleSize = "1024x1024";                   // square

//       if (!process.env.OPENAI_API_KEY) {
//         return res.status(500).json({
//           error: "OPENAI_API_KEY is not configured on the server",
//         });
//       }
//       /** */


//       const imageResponse = await openai.images.generate({
//         model: "dall-e-3",
//         prompt: fullPrompt,
//         size: dalleSize,
//         response_format: "b64_json",
//       });
//       const b64 = imageResponse.data?.[0]?.b64_json;
//       if (!b64) {
//         console.error("No b64_json from OpenAI images", imageResponse);
//         return res.status(500).json({ error: "AI did not return an image" });
//       }


//       console.log("🤖 /pro-images/generate USING DALL·E");

//       const baseImageBuffer = Buffer.from(b64, "base64");

//       const canvas = createCanvas(width, height);
//       const ctx = canvas.getContext("2d");

//       const baseImage = await loadImage(baseImageBuffer);

//       ctx.drawImage(baseImage, 0, 0, width, height);


//       const fileId = `ai_base_${Date.now()}_${Math.random()
//         .toString(36)
//         .slice(2, 8)}`;
//       const filename = `${fileId}.png`;
//       const filePath = path.join(UPLOADS_DIR_ABS, filename);

//       const pngBuffer = await canvas.encode("png");
//       fs.writeFileSync(filePath, pngBuffer);

//       const baseImageUrl = `/uploads/images/${filename}`;

//       // создаём ProDesign
//       const design = await prisma.proDesign.create({
//         data: {
//           tenantId,
//           userId,
//           prompt: body.prompt,
//           style,
//           width,
//           height,
//           baseImageUrl,
//           finalImageUrl: undefined,
//           overlayJson: undefined,
//           status: "DRAFT",
//         },
//       });


//       const { periodStart, periodEnd } =
//         await resolveCurrentPeriodForTenant(tenantId);

//       await prisma.aIUsagePeriod.upsert({
//         where: {
//           tenantId_periodStart_periodEnd: {
//             tenantId,
//             periodStart,
//             periodEnd,
//           },
//         },
//         update: {
//           imageCount: {
//             increment: 1,
//           },
//         },
//         create: {
//           tenantId,
//           periodStart,
//           periodEnd,
//           textCount: 0,
//           imageCount: 1,
//           planCount: 0,
//         },
//       });


//       return res.status(201).json({
//         id: design.id,
//         baseImageUrl,
//         width,
//         height,
//         prompt: design.prompt,
//         style: design.style,
//         tenantId: design.tenantId,
//         createdAt: design.createdAt,
//       });
//     } catch (err) {
//       console.error("[POST /ai/pro-images/generate] error", err);
//       return res.status(500).json({ error: "Internal server error" });
//     }
//   }
// );

// aiRouter.post("/pro-images/generate-gpt15",
//   requireAuth,
//   withTenant,
//   async (req, res) => {
//     try {
//       if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

//       const { userId, tenantId } = req.auth;
//       const body = req.body as GenerateImageBody;

//       if (!body.prompt) return res.status(400).json({ error: "prompt is required" });

//       const width = body.width ?? 1024;
//       const height = body.height ?? 1024;
//       const aspect = width / height;
//       const style = body.style ?? "instagram_dark";

//       const fullPrompt = `
//         Food photography of a dish for a restaurant social media.
//         Style: ${style}.
//         ${body.prompt}
//         Dark, high contrast, instagram-friendly composition.
//         No text in the image.
//         `.trim();

//       // gpt-image-1.5 via Images API :contentReference[oaicite:1]{index=1}
//       if (!process.env.OPENAI_API_KEY) {
//         return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server" });
//       }

//       console.log("🧠 /pro-images/generate-gpt15 USING gpt-image-1.5");

//       // sizes: GPT Image models support output_format and different sizing rules than DALL·E;
//       // simplest: generate at "auto" and then draw into your canvas size
//       const imageResponse = await openai.images.generate({
//         model: "gpt-image-1.5",
//         prompt: fullPrompt,
//         size: "auto",
//         output_format: "png",
//       } as any);

//       const b64 = (imageResponse as any).data?.[0]?.b64_json;
//       if (!b64) {
//         console.error("No b64_json from GPT Image", imageResponse);
//         return res.status(500).json({ error: "AI did not return an image" });
//       }

//       const baseImageBuffer = Buffer.from(b64, "base64");

//       // дальше — 1-в-1 как у тебя в /pro-images/generate:
//       const canvas = createCanvas(width, height);
//       const ctx = canvas.getContext("2d");

//       const baseImage = await loadImage(baseImageBuffer);
//       ctx.drawImage(baseImage, 0, 0, width, height);

//       const fileId = `ai_base_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
//       const filename = `${fileId}.png`;
//       const filePath = path.join(UPLOADS_DIR_ABS, filename);

//       const pngBuffer = await canvas.encode("png");
//       fs.writeFileSync(filePath, pngBuffer);

//       const baseImageUrl = `/uploads/images/${filename}`;

//       const design = await prisma.proDesign.create({
//         data: {
//           tenantId,
//           userId,
//           prompt: body.prompt,
//           style,
//           width,
//           height,
//           baseImageUrl,
//           finalImageUrl: undefined,
//           overlayJson: undefined,
//           status: "DRAFT",
//         },
//       });

//       const { periodStart, periodEnd } = await resolveCurrentPeriodForTenant(tenantId);
//       await prisma.aIUsagePeriod.upsert({
//         where: { tenantId_periodStart_periodEnd: { tenantId, periodStart, periodEnd } },
//         update: { imageCount: { increment: 1 } },
//         create: { tenantId, periodStart, periodEnd, textCount: 0, imageCount: 1, planCount: 0 },
//       });

//       return res.status(201).json({
//         id: design.id,
//         baseImageUrl,
//         width,
//         height,
//         prompt: design.prompt,
//         style: design.style,
//         tenantId: design.tenantId,
//         createdAt: design.createdAt,
//       });
//     } catch (err) {
//       console.error("[POST /ai/pro-images/generate-gpt15] error", err);
//       return res.status(500).json({ error: "Internal server error" });
//     }
//   }
// );


export { aiRouter };
