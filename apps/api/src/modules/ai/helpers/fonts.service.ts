import { PRO_FONTS } from "@socialchef/pro-fonts";
import path from "path";
import fs from "fs";
import { GlobalFonts } from '@napi-rs/canvas';
import { prisma } from "@/lib/prisma";
import multer from "multer";

export const fontsDir = path.join(process.cwd(), "uploads", "fonts");
fs.mkdirSync(fontsDir, { recursive: true });


export const RESERVED_FAMILIES = new Set(["Inter", "Montserrat", "Roboto", "Oswald", "Lora"]);


export async function registerAllTenantFontsOnce() {
  const fonts = await prisma.fontAsset.findMany({
    select: { family: true, fileName: true },
  });

  for (const f of fonts) {
    const fullPath = path.join(fontsDir, f.fileName);
    if (fs.existsSync(fullPath)) {
      GlobalFonts.registerFromPath(fullPath, f.family);
    }
  }
}

registerAllTenantFontsOnce().catch((e) =>
  console.error("[fonts bootstrap] error", e)
);


export const uploadFont = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, fontsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const id = `font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      cb(null, `${id}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".ttf" || ext === ".otf") cb(null, true);
    else cb(new Error("Only .ttf/.otf fonts are allowed"));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

