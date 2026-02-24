import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR_ABS, uploadsImagesDir } from "./uploadsPaths";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function ensureDir(absDir: string): void {
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
}

export function ensureUploadsImagesDir(): void {
  ensureDir(uploadsImagesDir);
}

// твой upload instance (как есть)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsImagesDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      cb(null, `${id}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const brandStylesUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(UPLOADS_DIR_ABS, "brand-styles"));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || ".png");
      cb(null, `brand_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const styleUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(UPLOADS_DIR_ABS, "image-styles"));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || ".png");
      cb(null, `style_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

type UploadErrorBody = {
  error: string;
  code?: string;
  maxBytes?: number;
  allowedTypes?: readonly string[];
  details?: string;
};

export function uploadSingleImage(field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    ensureUploadsImagesDir();
    upload.single(field)(req, res, (err: unknown) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          const body: UploadErrorBody = {
            error: "File is too large",
            code: "LIMIT_FILE_SIZE",
            maxBytes: MAX_UPLOAD_BYTES,
            allowedTypes: ALLOWED_IMAGE_TYPES,
          };
          return res.status(413).json(body);
        }
        const body: UploadErrorBody = { error: "Upload error", code: err.code, details: err.message };
        return res.status(400).json(body);
      }

      if (err instanceof Error) {
        const body: UploadErrorBody = {
          error: err.message,
          code: "UNSUPPORTED_MEDIA_TYPE",
          allowedTypes: ALLOWED_IMAGE_TYPES,
        };
        return res.status(415).json(body);
      }

      return res.status(500).json({ error: "Upload failed", code: "UNKNOWN_UPLOAD_ERROR" } satisfies UploadErrorBody);
    });
  };
}

export function uploadBrandStyleImage(field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    ensureDir(path.join(UPLOADS_DIR_ABS, "brand-styles"));
    brandStylesUpload.single(field)(req, res, (err: unknown) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          const body: UploadErrorBody = {
            error: "File is too large",
            code: "LIMIT_FILE_SIZE",
            maxBytes: MAX_UPLOAD_BYTES,
            allowedTypes: ALLOWED_IMAGE_TYPES,
          };
          return res.status(413).json(body);
        }
        const body: UploadErrorBody = { error: "Upload error", code: err.code, details: err.message };
        return res.status(400).json(body);
      }

      if (err instanceof Error) {
        const body: UploadErrorBody = {
          error: err.message,
          code: "UNSUPPORTED_MEDIA_TYPE",
          allowedTypes: ALLOWED_IMAGE_TYPES,
        };
        return res.status(415).json(body);
      }

      return res.status(500).json({ error: "Upload failed", code: "UNKNOWN_UPLOAD_ERROR" } satisfies UploadErrorBody);
    });
  };
}

export function uploadStyleImage(field: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    ensureDir(path.join(UPLOADS_DIR_ABS, "image-styles"));
    styleUpload.single(field)(req, res, (err: unknown) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          const body: UploadErrorBody = {
            error: "File is too large",
            code: "LIMIT_FILE_SIZE",
            maxBytes: MAX_UPLOAD_BYTES,
            allowedTypes: ALLOWED_IMAGE_TYPES,
          };
          return res.status(413).json(body);
        }
        const body: UploadErrorBody = { error: "Upload error", code: err.code, details: err.message };
        return res.status(400).json(body);
      }

      if (err instanceof Error) {
        const body: UploadErrorBody = {
          error: err.message,
          code: "UNSUPPORTED_MEDIA_TYPE",
          allowedTypes: ALLOWED_IMAGE_TYPES,
        };
        return res.status(415).json(body);
      }

      return res.status(500).json({ error: "Upload failed", code: "UNKNOWN_UPLOAD_ERROR" } satisfies UploadErrorBody);
    });
  };
}

export const uploadPic = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "image/png" || file.mimetype === "image/jpeg";
    if (!ok) return cb(new Error("Only PNG or JPEG is allowed"));
    cb(null, true);
  },
});

// import path from "path";
// import fs from "fs/promises";

// export function isUploadPath(p: string) {
//   return typeof p === "string" && p.startsWith("/uploads/");
// }

// export function uploadRelToAbs(rel: string) {
//   return path.join(process.cwd(), rel.replace(/^\//, ""));
// }

// export async function safeUnlinkUpload(rel: string) {
//   if (!isUploadPath(rel)) return { ok: false as const, reason: "not_upload_path" };
//   try {
//     await fs.unlink(uploadRelToAbs(rel));
//     return { ok: true as const };
//   } catch (e: any) {
//     if (e?.code === "ENOENT") return { ok: true as const }; // уже нет — норм
//     return { ok: false as const, reason: e?.message ?? String(e) };
//   }
// }
