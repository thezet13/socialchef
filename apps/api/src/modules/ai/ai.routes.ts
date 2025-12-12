// apps/api/src/modules/ai/ai.routes.ts
import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/requireAuth';
import { openai } from '../../lib/openai';
import { resolveCurrentPeriodForTenant } from "../../modules/ai/ai.usage";
import { withTenant } from '../../middleware/withTenant';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from "path";
import fs from "fs";
import { PRO_FONTS } from "../../config/proFonts";
import multer from "multer";

const fontDir = path.join(process.cwd(), "fonts");

for (const font of PRO_FONTS) {
  if (!font.file) continue;
  GlobalFonts.registerFromPath(
    path.join(fontDir, font.file),
    font.family
  );
}

// GlobalFonts.registerFromPath(path.join(fontDir, "Inter.ttf"), "Inter");
// GlobalFonts.registerFromPath(path.join(fontDir, "Roboto.ttf"), "Roboto");
// GlobalFonts.registerFromPath(path.join(fontDir, "Montserrat.ttf"), "Montserrat");
// GlobalFonts.registerFromPath(path.join(fontDir, "BebasNeue.ttf"), "Bebas Neue");
// GlobalFonts.registerFromPath(path.join(fontDir, "PlayfairDisplay.ttf"), "Playfair Display");
// GlobalFonts.registerFromPath(path.join(fontDir, "Oswald.ttf"), "Oswald");
// GlobalFonts.registerFromPath(path.join(fontDir, "Lora.ttf"), "Lora");


const aiRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads", "images");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      const id = `pro_upload_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      cb(null, `${id}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB — на всякий случай
  },
});



type PostType =
  | 'DISH'
  | 'PROMO'
  | 'BRAND_STORY'
  | 'TEAM'
  | 'SALES'
  | 'STORY_CAPTION';

interface GeneratePostBody {
  type: PostType;
  language?: 'en' | 'ru' | 'az';
  tone?: string; // "friendly", "premium", "street food" и т.д.
  dishName?: string;
  dishDescription?: string;
  idea?: string; // свободное описание идеи поста
}

type OverlayAlign =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface OverlayItemConfig {
  text: string;
  color?: string;          // цвет текста
  fontSize?: number;       // явный размер, px (напр. 48)
  fontWeight?: number;    
  fontFamily?: string;   
  align?: OverlayAlign;    // позиция на картинке
  textAlign?: "left" | "center" | "right";
  lineHeight: number,

  // Плашка
  plaqueWidth?: number;
  plaqueColor?: string;
  plaqueBorderColor?: string;
  borderRadius?: number;
  plaqueBorderWidth?: number;

  // Padding внутри плашки
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;

  // Margin от краёв картинки
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  
}

interface GenerateImageBody {
  prompt: string;
  style?: string;
  width?: number;
  height?: number;

  overlay?: {
    title?: OverlayItemConfig;
    subtitle?: OverlayItemConfig;
    price?: OverlayItemConfig;
  };
}

aiRouter.post('/posts/generate', requireAuth, withTenant, async (req, res) => {
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

function wrapText(ctx: any, text: string, maxWidth: number, fontSize: number) {
            const words = text.split(" ");
            const lines: string[] = [];
            let current = "";

            for (const word of words) {
                const testLine = current ? current + " " + word : word;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth) {
                lines.push(current);
                current = word;
                } else {
                current = testLine;
                }
            }
            if (current) lines.push(current);
            return lines;
        }

// function drawOverlayItem(
//     ctx: any,
//     canvasWidth: number,
//     canvasHeight: number,
//     cfg: OverlayItemConfig
//     ) {
//     const {
//         text,
//         color = "#ffffff",
//         fontSize = 50,
//         fontWeight,
//         align = "top-left",

//         textAlign = "left",

//         plaqueColor,
//         plaqueBorderColor,
//         plaqueBorderWidth,

//         borderRadius,

//         paddingTop,
//         paddingRight,
//         paddingBottom,
//         paddingLeft,

//         marginTop,
//         marginRight,
//         marginBottom,
//         marginLeft,

//         plaqueWidth,
//     } = cfg;

//     if (!text?.trim()) return;

//     ctx.save();

//     const weightValue = fontWeight ?? 400;

//     // Базовые настройки текста
//     let weightStr: string;
//     if (weightValue <= 300) weightStr = "300";           // light
//     else if (weightValue <= 400) weightStr = "400";      // regular
//     else if (weightValue <= 500) weightStr = "500";
//     else if (weightValue <= 600) weightStr = "600";
//     else if (weightValue <= 700) weightStr = "700";      // bold-ish
//     else if (weightValue <= 800) weightStr = "800";
//     else weightStr = "900";

//     ctx.font = `${weightStr} ${fontSize}px sans-serif`;    ctx.textBaseline = "top";
//     ctx.fillStyle = color;

//     ctx.shadowColor = "rgba(0,0,0,0.8)";
//     ctx.shadowBlur = 10;
//     ctx.shadowOffsetX = 2;
//     ctx.shadowOffsetY = 2;

//     // Padding
//     const padTop = paddingTop ?? 0;
//     const padRight = paddingRight ?? 0;
//     const padBottom = paddingBottom ?? 0;
//     const padLeft = paddingLeft ?? 0;

//     console.log(paddingTop);

//     // Формируем строки
//     const lineHeight = fontSize * 1.2;
//     let lines: string[] = [];
//     let maxLineWidth = 0;

//     if (plaqueWidth && plaqueWidth > 0) {
//         const innerWidth = plaqueWidth - padLeft - padRight;
//         lines = wrapText(ctx, text, innerWidth, fontSize);

//         for (const line of lines) {
//         const metrics = ctx.measureText(line);
//         if (metrics.width > maxLineWidth) {
//             maxLineWidth = metrics.width;
//         }
//         }
//     } else {
//         lines = [text];
//         const metrics = ctx.measureText(text);
//         maxLineWidth = metrics.width;
//     }

//     const contentWidth =
//         plaqueWidth && plaqueWidth > 0
//         ? plaqueWidth
//         : maxLineWidth + padLeft + padRight;

//     const contentHeight = lines.length * lineHeight + padTop + padBottom;

//     // Margin
//     const mTop = marginTop ?? 0;
//     const mRight = marginRight ?? 0;
//     const mBottom = marginBottom ?? 0;
//     const mLeft = marginLeft ?? 0;

//     let x = 0;
//     let y = 0;

//     // Горизонтальное позиционирование блока
//     if (align.endsWith("left")) {
//         x = mLeft;
//     } else if (align.endsWith("center")) {
//         x = (canvasWidth - contentWidth) / 2;
//     } else if (align.endsWith("right")) {
//         x = canvasWidth - contentWidth - mRight;
//     }

//     // Вертикальное позиционирование блока
//     if (align.startsWith("top")) {
//         y = mTop;
//     } else if (align.startsWith("middle")) {
//         y = (canvasHeight - contentHeight) / 2;
//     } else if (align.startsWith("bottom")) {
//         y = canvasHeight - contentHeight - mBottom;
//     }

//     // === Плашка =====================================================
//     if (plaqueColor) {
//         const radius = borderRadius ?? 18;

//         ctx.save();
//         ctx.shadowColor = "rgba(0,0,0,0.8)";
//         ctx.shadowBlur = 18;
//         ctx.shadowOffsetX = 4;
//         ctx.shadowOffsetY = 4;

//         const x2 = x + contentWidth;
//         const y2 = y + contentHeight;

//         ctx.beginPath();
//         ctx.moveTo(x + radius, y);
//         ctx.lineTo(x2 - radius, y);
//         ctx.quadraticCurveTo(x2, y, x2, y + radius);
//         ctx.lineTo(x2, y2 - radius);
//         ctx.quadraticCurveTo(x2, y2, x2 - radius, y2);
//         ctx.lineTo(x + radius, y2);
//         ctx.quadraticCurveTo(x, y2, x, y2 - radius);
//         ctx.lineTo(x, y + radius);
//         ctx.quadraticCurveTo(x, y, x + radius, y);
//         ctx.closePath();

//         ctx.fillStyle = plaqueColor;
//         ctx.fill();

//         if (plaqueBorderColor && (plaqueBorderWidth ?? 0) > 0) {
//         ctx.lineWidth = plaqueBorderWidth!;
//         ctx.strokeStyle = plaqueBorderColor;
//         ctx.stroke();
//         }

//         ctx.restore();
//     }

//     // === Текст построчно с выравниванием ===========================
//     ctx.fillStyle = color;

//     const innerWidth = contentWidth - padLeft - padRight;
//     let currentY = y + padTop;

//     for (const line of lines) {
//         const metrics = ctx.measureText(line);
//         const lineWidth = metrics.width;

//         let lineX = x + padLeft; // left по умолчанию

//         if (textAlign === "center") {
//         lineX = x + padLeft + (innerWidth - lineWidth) / 2;
//         } else if (textAlign === "right") {
//         lineX = x + padLeft + (innerWidth - lineWidth);
//         }

//         ctx.fillText(line, lineX, currentY);
//         currentY += lineHeight;
//     }

//     ctx.restore();
//     }

function drawOverlayItem(
  ctx: any,
  canvasWidth: number,
  canvasHeight: number,
  cfg: OverlayItemConfig
) {
  const {
    text,
    color = "#ffffff",
    fontSize = 50,
    fontWeight,
    align = "top-left",
    textAlign = "left",
    lineHeight,

    plaqueColor,
    plaqueBorderColor,
    plaqueBorderWidth,
    borderRadius,

    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,

    marginTop,
    marginRight,
    marginBottom,
    marginLeft,

    plaqueWidth,
  } = cfg;

  if (!text?.trim()) return;

  ctx.save();

  const weightValue = fontWeight ?? 400;
  let weightStr: string;
  if (weightValue <= 300) weightStr = "300";
  else if (weightValue <= 400) weightStr = "400";
  else if (weightValue <= 500) weightStr = "500";
  else if (weightValue <= 600) weightStr = "600";
  else if (weightValue <= 700) weightStr = "700";
  else if (weightValue <= 800) weightStr = "800";
  else weightStr = "900";

    const family = cfg.fontFamily ?? "Inter";
    ctx.font = `${weightStr} ${fontSize}px "${family}"`;  

    ctx.textBaseline = "alphabetic"; // теперь работаем в базовой системе baseline
    ctx.fillStyle = color;

  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const padTop = paddingTop ?? 0;
  const padRight = paddingRight ?? 0;
  const padBottom = paddingBottom ?? 0;
  const padLeft = paddingLeft ?? 0;

  // --- Разбивка на строки (как было)
  let lines: string[] = [];
  let maxLineWidth = 0;

  if (plaqueWidth && plaqueWidth > 0) {
    const innerWidth = plaqueWidth - padLeft - padRight;
    lines = wrapText(ctx, text, innerWidth, fontSize);
  } else {
    lines = [text];
  }

  // --- Реальные метрики строк
  let maxAscent = 0;
  let maxDescent = 0;

  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const ascent =
      (metrics.actualBoundingBoxAscent as number | undefined) ??
      fontSize * 0.8;
    const descent =
      (metrics.actualBoundingBoxDescent as number | undefined) ??
      fontSize * 0.2;
    const lineWidth = metrics.width;

    if (lineWidth > maxLineWidth) {
      maxLineWidth = lineWidth;
    }
    if (ascent > maxAscent) maxAscent = ascent;
    if (descent > maxDescent) maxDescent = descent;
  }

// Высота строки = ascent + descent
//   const lineBoxHeight = maxAscent + maxDescent;


// --- LINE HEIGHT -------------------------------------------------
const userLineHeight = cfg.lineHeight ?? 1.2;

// высота строки = (ascent + descent) * lineHeight
const lineBoxHeight = (maxAscent + maxDescent) * userLineHeight;

const contentHeight =
  lines.length * lineBoxHeight +
  padTop +
  padBottom;


  const contentWidth =
    plaqueWidth && plaqueWidth > 0
      ? plaqueWidth
      : maxLineWidth + padLeft + padRight;
  //const contentHeight = lines.length * lineBoxHeight + padTop + padBottom;

  // --- Margin
  const mTop = marginTop ?? 0;
  const mRight = marginRight ?? 0;
  const mBottom = marginBottom ?? 0;
  const mLeft = marginLeft ?? 0;

  let x = 0;
  let y = 0;

  // Горизонтальное позиционирование
  if (align.endsWith("left")) {
    x = mLeft;
  } else if (align.endsWith("center")) {
    x = (canvasWidth - contentWidth) / 2;
  } else if (align.endsWith("right")) {
    x = canvasWidth - contentWidth - mRight;
  }

  // Вертикальное позиционирование
  if (align.startsWith("top")) {
    y = mTop;
  } else if (align.startsWith("middle")) {
    y = (canvasHeight - contentHeight) / 2;
  } else if (align.startsWith("bottom")) {
    y = canvasHeight - contentHeight - mBottom;
  }

  // --- Рисуем плашку
  if (plaqueColor) {
    const radius = borderRadius ?? 18;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;

    const x2 = x + contentWidth;
    const y2 = y + contentHeight;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x2 - radius, y);
    ctx.quadraticCurveTo(x2, y, x2, y + radius);
    ctx.lineTo(x2, y2 - radius);
    ctx.quadraticCurveTo(x2, y2, x2 - radius, y2);
    ctx.lineTo(x + radius, y2);
    ctx.quadraticCurveTo(x, y2, x, y2 - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = plaqueColor;
    ctx.fill();

    if (plaqueBorderColor && (plaqueBorderWidth ?? 0) > 0) {
      ctx.lineWidth = plaqueBorderWidth!;
      ctx.strokeStyle = plaqueBorderColor;
      ctx.stroke();
    }

    ctx.restore();
  }

  // --- Рисуем текст так, чтобы он гарантированно был внутри
  ctx.fillStyle = color;

  const innerWidth = contentWidth - padLeft - padRight;
  // первый baseline на высоте y + padTop + maxAscent
  let currentBaselineY = y + padTop + maxAscent;

  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const lineWidth = metrics.width;

    let lineX = x + padLeft; // left

    if (textAlign === "center") {
      lineX = x + padLeft + (innerWidth - lineWidth) / 2;
    } else if (textAlign === "right") {
      lineX = x + padLeft + (innerWidth - lineWidth);
    }

    ctx.fillText(line, lineX, currentBaselineY);
    currentBaselineY += lineBoxHeight;
  }

  ctx.restore();
}


aiRouter.post(
  "/pro-images/upload",
  requireAuth,
  withTenant,

  upload.single("file"),
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

      // Можно в будущем принимать style/prompt в form-data, пока делаем простую версию.
      const style =
        typeof (req.body?.style as string | undefined) === "string"
          ? (req.body.style as string)
          : undefined;

      // Вся Pro-логика у нас завязана на 1024x1024, оставим так же,
      // чтобы совпадали масштабы с PREVIEW.
      const width = 1024;
      const height = 1024;

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



aiRouter.post(
  "/pro-images/base",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { userId, tenantId } = req.auth;
      const body = req.body as {
        prompt: string;
        style?: string;
        width?: number;
        height?: number;
      };

      if (!body.prompt) {
        return res.status(400).json({ error: "prompt is required" });
      }

      const width = body.width ?? 1024;
      const height = body.height ?? 1024;
      const style = body.style ?? "instagram_dark";

      const fullPrompt = `
        Food photography of a dish for a restaurant social media.
        Style: ${style}.
        ${body.prompt}
        Dark, high contrast, instagram-friendly composition.
        No text in the image.
      `.trim();

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          error: "OPENAI_API_KEY is not configured on the server",
        });
      }

      const imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt: fullPrompt,
        size: "1024x1024",
        response_format: "b64_json",
      });

      const b64 = imageResponse.data?.[0]?.b64_json;
      if (!b64) {
        console.error("No b64_json from OpenAI images", imageResponse);
        return res.status(500).json({ error: "AI did not return an image" });
      }

      const baseImageBuffer = Buffer.from(b64, "base64");

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      const baseImage = await loadImage(baseImageBuffer);
      ctx.drawImage(baseImage, 0, 0, width, height);

    //   const uploadsDir = path.join(process.cwd(), "uploads", "images");
    //   if (!fs.existsSync(uploadsDir)) {
    //     fs.mkdirSync(uploadsDir, { recursive: true });
    //   }
      
      const fileId = `pro_base_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const filename = `${fileId}.png`;
      const filePath = path.join(uploadsDir, filename);

      const pngBuffer = await canvas.encode("png");
      fs.writeFileSync(filePath, pngBuffer);

      const baseImageUrl = `/uploads/images/${filename}`;

      // создаём ProDesign
      const design = await prisma.proDesign.create({
        data: {
          tenantId,
          userId,
          prompt: body.prompt,
          style,
          width,
          height,
          baseImageUrl,
          finalImageUrl: undefined,
          overlayJson: undefined,
          status: "DRAFT",
        },
      });

      // (опционально) обновляем imageCount в AIUsagePeriod

      return res.status(201).json({
        id: design.id,
        baseImageUrl,
        width,
        height,
      });
    } catch (err) {
      console.error("[POST /ai/pro-images/base] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);


aiRouter.post(
  "/pro-images/:id/render",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { tenantId, userId } = req.auth;
      const { id } = req.params;
      const body = req.body as {
        overlay?: {
          title?: OverlayItemConfig;
          subtitle?: OverlayItemConfig;
          price?: OverlayItemConfig;
        };
      };

      const design = await prisma.proDesign.findFirst({
        where: { id, tenantId },
      });

      if (!design) {
        return res.status(404).json({ error: "ProDesign not found" });
      }

      const width = design.width;
      const height = design.height;

      // путь к base image
      const uploadsDir = path.join(process.cwd(), "uploads", "images");
      const baseFilename = design.baseImageUrl.split("/").pop();
      if (!baseFilename) {
        return res.status(500).json({ error: "Invalid baseImageUrl" });
      }
      const basePath = path.join(uploadsDir, baseFilename);

      if (!fs.existsSync(basePath)) {
        return res.status(500).json({ error: "Base image file not found" });
      }

      const baseImageBuffer = fs.readFileSync(basePath);
      const baseImage = await loadImage(baseImageBuffer);

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // рисуем фон
      ctx.drawImage(baseImage, 0, 0, width, height);

      // накладываем overlay
      const { overlay } = body;

      if (overlay) {
        if (overlay.title) {
          drawOverlayItem(ctx, width, height, overlay.title);
        }
        if (overlay.subtitle) {
          drawOverlayItem(ctx, width, height, overlay.subtitle);
        }
        if (overlay.price) {
          drawOverlayItem(ctx, width, height, overlay.price);
        }
      }

      // сохраняем финал
      const finalId = `pro_final_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const finalFilename = `${finalId}.png`;
      const finalPath = path.join(uploadsDir, finalFilename);

      const pngBuffer = await canvas.encode("png");
      fs.writeFileSync(finalPath, pngBuffer);

      const finalImageUrl = `/uploads/images/${finalFilename}`;

      // обновляем ProDesign
      const updated = await prisma.proDesign.update({
        where: { id: design.id },
        data: {
          finalImageUrl,
          overlayJson: overlay ? (overlay as any) : null,
          status: "RENDERED",
        },
      });

      // создаём запись GeneratedImage, чтобы твой список /images работал как раньше
      const generatedImage = await prisma.generatedImage.create({
        data: {
          tenantId,
          prompt: design.prompt,
          style: design.style ?? null,
          imageUrl: finalImageUrl,
          width,
          height,
          origin: "AI",
        },
      });

      // (опционально) +1 к imageCount в AIUsagePeriod

      return res.status(201).json({
        proDesignId: updated.id,
        finalImageUrl,
        generatedImageId: generatedImage.id,
      });
    } catch (err) {
      console.error("[POST /ai/pro-images/:id/render] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);



aiRouter.post("/images/generate",
  requireAuth,
  withTenant,
  async (req, res) => {
    try {
      if (!req.auth) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { userId, tenantId } = req.auth;
      const body = req.body as GenerateImageBody;

      if (!body.prompt) {
        return res.status(400).json({ error: "prompt is required" });
      }

      const width = body.width ?? 1024;
      const height = body.height ?? 1024;

      // 1) Собираем промпт для модели
      const style = body.style ?? "instagram_dark";

      const fullPrompt = `
        Food photography of a dish for a restaurant social media.
        Style: ${style}.
        ${body.prompt}
        Dark, high contrast, instagram-friendly composition.
        No text in the image.
            `.trim();

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          error: "OPENAI_API_KEY is not configured on the server",
        });
      }

      // 2) Генерация изображения через OpenAI (base64)
      const imageResponse = await openai.images.generate({
        model: "dall-e-3",
        prompt: fullPrompt,
        size: "1024x1024",
        response_format: "b64_json",
      });

      

      const b64 = imageResponse.data?.[0]?.b64_json;
      if (!b64) {
        console.error("No b64_json from OpenAI images", imageResponse);
        return res.status(500).json({ error: "AI did not return an image" });
      }

      const baseImageBuffer = Buffer.from(b64, "base64");

      // 3) Рисуем через Canvas: фон + текст
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // Загружаем сгенерированную картинку как фон
      const baseImage = await loadImage(baseImageBuffer);
      ctx.drawImage(baseImage, 0, 0, width, height);

      const { overlay } = body;
        if (overlay) {
        if (overlay.title) {
            drawOverlayItem(ctx, width, height, overlay.title);
        }
        if (overlay.subtitle) {
            drawOverlayItem(ctx, width, height, overlay.subtitle);
        }
        if (overlay.price) {
            drawOverlayItem(ctx, width, height, overlay.price);
        }
        }   
      
    //     // 4) Сохраняем финальную картинку в файл
    //   const uploadsDir = path.join(process.cwd(), "uploads", "images");
    //   if (!fs.existsSync(uploadsDir)) {
    //     fs.mkdirSync(uploadsDir, { recursive: true });
    //   }

      const fileId = `img_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const filename = `${fileId}.png`;
      const filePath = path.join(uploadsDir, filename);

      const pngBuffer = await canvas.encode("png"); // у @napi-rs/canvas такой метод
      fs.writeFileSync(filePath, pngBuffer);

      const imageUrl = `/uploads/images/${filename}`;

      // 5) Пишем в БД GeneratedImage
      const generatedImage = await prisma.generatedImage.create({
        data: {
          tenantId,
          prompt: body.prompt,
          style,
          imageUrl,
          width,
          height,
          origin: "AI",
        },
      });

      // 6) Обновляем usage (imageCount++)
      const { periodStart, periodEnd } =
        await resolveCurrentPeriodForTenant(tenantId);

      await prisma.aIUsagePeriod.upsert({
        where: {
          tenantId_periodStart_periodEnd: {
            tenantId,
            periodStart,
            periodEnd,
          },
        },
        update: {
          imageCount: {
            increment: 1,
          },
        },
        create: {
          tenantId,
          periodStart,
          periodEnd,
          textCount: 0,
          imageCount: 1,
          planCount: 0,
        },
      });

      return res.status(201).json({
        id: generatedImage.id,
        imageUrl: generatedImage.imageUrl,
        width: generatedImage.width,
        height: generatedImage.height,
        prompt: generatedImage.prompt,
        style: generatedImage.style,
        tenantId: generatedImage.tenantId,
        createdAt: generatedImage.createdAt,
      });
    } catch (err) {
      console.error("[POST /ai/images/generate] error", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { aiRouter };
