import path from "path";
import fs from "fs";
import { UPLOADS_DIR_ABS } from "../../lib/uploadsPaths";
import { StyleListItem } from "./styles.types";

export function isLocalhostUrl(u: string) {
    try {
        const x = new URL(u);
        return x.hostname === "localhost" || x.hostname === "127.0.0.1";
    } catch {
        return false;
    }
}

export function uploadsAbsPathWithFolder(rel: string) {
    const clean = rel.startsWith("/") ? rel : `/${rel}`;
    if (!clean.startsWith("/uploads/")) throw new Error(`Not an uploads url: ${rel}`);

    const subPath = clean.slice("/uploads/".length);
    return path.join(UPLOADS_DIR_ABS, subPath);
}

export function fileToDataUrl(absPath: string) {
    const buf = fs.readFileSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
}

export function normalizeUploadsUrl(url: string) {
    try {
        const u = new URL(url);
        if (u.pathname.startsWith("/uploads/image-styles/")) return u.pathname;
        return url;
    } catch {
        return url;
    }
}

export function toAbsoluteUrl(imageUrl: string): string {
    if (imageUrl.includes(":\\") || imageUrl.startsWith("/mnt/")) {
        throw new Error(`Filesystem path passed as imageUrl: ${imageUrl}`);
    }

    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
        return imageUrl;
    }

    const origin = process.env.APP_ORIGIN;
    if (!origin) throw new Error("APP_ORIGIN is not configured on the server");

    const rel = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
    return `${origin}${rel}`;
}

export function isFilesystemPathLike(s: string) {
    // Windows drive or UNC
    if (/^[a-zA-Z]:[\\/]/.test(s)) return true;
    if (s.startsWith("\\\\")) return true;

    // Linux/macOS real fs paths (НЕ uploads-url)
    if (s.startsWith("/var/") || s.startsWith("/mnt/") || s.startsWith("/home/")) return true;

    return false;
}

export function toListItem(s: any): StyleListItem {
    return {
        id: s.id,
        scope: s.scope,
        status: s.status,
        title: s.title,
        thumbnailUrl: s.thumbnailUrl,
        referenceImageUrl: s.referenceImageUrl,
        prompt: s.prompt,
        updatedAt: new Date(s.updatedAt).toISOString(),
    };
}