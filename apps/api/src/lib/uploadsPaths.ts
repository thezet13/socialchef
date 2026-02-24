import path from "path";

function resolveUploadsDirAbs(): string {
  const raw = (process.env.UPLOADS_DIR_ABS || "").trim();

  if (raw) {
    // если путь относительный — делаем абсолютным от cwd процесса
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }

  // fallback
  return path.resolve(process.cwd(), "uploads");
}

export const UPLOADS_DIR_ABS = resolveUploadsDirAbs();

export const uploadsImagesDir = path.join(UPLOADS_DIR_ABS, "images");
export const uploadsBrandPreviewsDir = path.join(UPLOADS_DIR_ABS, "brand-previews");
export const uploadsPresetImagesDir = path.join(UPLOADS_DIR_ABS, "preset");
