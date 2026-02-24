import fs from "fs";
import path from "path";
import crypto from "crypto";
import { loadImage } from "@napi-rs/canvas";
import { UPLOADS_DIR_ABS } from "@/lib/uploadsPaths";

export type SavePngResult = {
  relativeUrl: string;
  absPath: string;
  width: number;
  height: number;
};

type SaveBrandPngParams = {
  buffer: Buffer;
  folder: "brand-previews" | "brand-stickers";
  filename?: string;
};

export async function saveBrandPng({
  buffer,
  folder,
  filename,
}: SaveBrandPngParams): Promise<SavePngResult> {
  const targetDir = path.join(UPLOADS_DIR_ABS, folder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const finalFilename =
    filename ??
    crypto.createHash("sha1").update(buffer).digest("hex") + ".png";

  const absPath = path.join(targetDir, finalFilename);
  fs.writeFileSync(absPath, buffer);

  // ✅ правильный способ получить размеры
  const img = await loadImage(buffer);

  const relativeUrl = `/uploads/${folder}/${finalFilename}`;

  return {
    relativeUrl,
    absPath,
    width: img.width,
    height: img.height,
  };
}

export function readBrandFile(relativeUrl: string): Buffer {
  if (!relativeUrl.startsWith("/uploads/")) {
    throw new Error(`Invalid uploads url: ${relativeUrl}`);
  }

  const relPath = relativeUrl.replace("/uploads/", "");
  const absPath = path.join(UPLOADS_DIR_ABS, relPath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${relativeUrl}`);
  }

  return fs.readFileSync(absPath);
}

export function deleteBrandFile(relativeUrl: string): void {
  if (!relativeUrl.startsWith("/uploads/")) return;

  const relPath = relativeUrl.replace("/uploads/", "");
  const absPath = path.join(UPLOADS_DIR_ABS, relPath);

  if (fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
}
