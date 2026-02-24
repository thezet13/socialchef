import fs from "fs";
import path from "path";

import { UPLOADS_DIR_ABS } from "@/lib/uploadsPaths";
import { BrandStyleListItem } from "@socialchef/shared/brand-styles";
import { FontCategory, FontHint, FontRef, NormalizedStyleRecipe, TokenBlock, TokenVariant } from "./brandStyles.types";

export function isLocalhostUrl(u: string) {
    try {
        const x = new URL(u);
        return x.hostname === "localhost" || x.hostname === "127.0.0.1";
    } catch {
        return false;
    }
}

export function normalizeUploadsUrl(url: string) {
    try {
        const u = new URL(url);
        if (u.pathname.startsWith("/uploads/brand-styles/")) return u.pathname;
        return url;
    } catch {
        return url;
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

export function toAbsoluteUrl(imageUrl: string): string {
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;

    const origin = process.env.APP_ORIGIN;
    if (!origin) throw new Error("APP_ORIGIN is not configured on the server");

    const rel = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
    return `${origin}${rel}`;
}

export function toListItem(row: any): BrandStyleListItem {
    return {
        id: row.id,
        scope: row.scope,
        status: row.status,
        name: row.name,
        sourceImageUrl: row.sourceImageUrl,
        thumbnailUrl: row.thumbnailUrl ?? null,
        version: row.version,
        updatedAt: new Date(row.updatedAt).toISOString(),
    };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object";
}

function asString(v: unknown, fallback: string): string {
    return typeof v === "string" && v.trim() ? v : fallback;
}

function asNumber(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] | null {
    if (!Array.isArray(v)) return null;
    const out: string[] = [];
    for (const x of v) if (typeof x === "string" && x.trim()) out.push(x.trim());
    return out;
}

function asFontCategory(v: unknown): FontCategory | null {
    return v === "sans" || v === "serif" || v === "display" || v === "script" || v === "mono" ? v : null;
}

function asContrast(v: unknown): "low" | "medium" | "high" | null {
    return v === "low" || v === "medium" || v === "high" ? v : null;
}

function normalizeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tags) {
        const k = t.trim().toLowerCase();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}

function parseFontHint(v: unknown): FontHint | null {
    if (!isRecord(v)) return null;
    const category = asFontCategory(v.category);
    const tagsRaw = asStringArray(v.tags);
    if (!category || !tagsRaw) return null;

    const weightHintsRaw = asStringArray(v.weightHints)?.map((x) => Number(x)).filter((n) => Number.isFinite(n)) ?? null;
    const weightHintsNum =
        Array.isArray(v.weightHints)
            ? v.weightHints
                .filter((x) => typeof x === "number" && Number.isFinite(x))
                .map((x) => Math.round(x))
            : null;

    const uppercasePreferred = typeof v.uppercasePreferred === "boolean" ? v.uppercasePreferred : undefined;

    const contrast = asContrast(v.contrast) ?? undefined;
    const notes = typeof v.notes === "string" ? v.notes : undefined;

    return {
        category,
        tags: normalizeTags(tagsRaw),
        weightHints: weightHintsNum ?? (weightHintsRaw?.length ? weightHintsRaw.map((n) => Math.round(n)) : undefined),
        uppercasePreferred,
        contrast,
        notes,
    };
}



function parseTokenVariants(tokenObj: unknown): TokenVariant[] {
    // Accept both shapes:
    // A) token is { variants: [...] }
    // B) token is directly an array (legacy)
    if (Array.isArray(tokenObj)) {
        return tokenObj.filter(isRecord) as unknown as TokenVariant[];
    }
    if (!isRecord(tokenObj)) return [];
    const variants = tokenObj.variants;
    if (!Array.isArray(variants)) return [];
    return variants.filter(isRecord) as unknown as TokenVariant[];
}

function applyFontHintsToVariants(params: {
    variants: TokenVariant[];
    primaryHint: FontHint | null;
    secondaryHint: FontHint | null;
}) {
    const { variants, primaryHint, secondaryHint } = params;

    for (const v of variants) {
        const ref: FontRef = v.fontRef === "secondary" ? "secondary" : "primary";
        const hint = ref === "secondary" ? secondaryHint : primaryHint;

        // ✅ fill missing fontCategory/fontTags from hint
        if (!v.fontCategory && hint?.category) v.fontCategory = hint.category;
        if ((!v.fontTags || v.fontTags.length === 0) && hint?.tags?.length) v.fontTags = hint.tags.slice();

        // optional uppercase preference
        if (typeof v.uppercase !== "boolean" && typeof hint?.uppercasePreferred === "boolean") {
            v.uppercase = hint.uppercasePreferred;
        }
    }
}

function stripVariantDupes(v: TokenVariant): TokenVariant {
    // remove duplicates that must live only on token level
    const { sizeRangePx, lineHeight, ...rest } = v as TokenVariant & {
        sizeRangePx?: unknown;
        lineHeight?: unknown;
    };
    return rest as TokenVariant;
}

function stripVariantDupesInPlace(variants: TokenVariant[]) {
    for (let i = 0; i < variants.length; i++) {
        variants[i] = stripVariantDupes(variants[i]!);
    }
}


export function normalizeStyleRecipeFromAi(ai: unknown): NormalizedStyleRecipe {
    const o = isRecord(ai) ? ai : {};

    const paletteRaw = isRecord(o.palette) ? o.palette : {};

    // sizeRangePx can be either top-level or nested. keep your current shape:
    const sr = isRecord(o.sizeRangePx) ? o.sizeRangePx : {};
    const tokensRaw = isRecord(o.tokens) ? o.tokens : {};

    // --- fonts: new preferred shape: fonts.primary = hint object
    const fontsRaw = isRecord(o.fonts) ? o.fonts : {};
    const primaryHint = parseFontHint(fontsRaw.primary);
    const secondaryHint = parseFontHint(fontsRaw.secondary);

    function tokenBlock(
        key: "headline" | "value" | "subline" | "fineprint",
        defMin: number,
        defMax: number,
        defLH: number
    ): TokenBlock {
        const tokenObj = tokensRaw[key];
        const variants = parseTokenVariants(tokenObj);

        // attach hints...
        applyFontHintsToVariants({ variants, primaryHint, secondaryHint });

        // ✅ remove duplicated fields coming from AI variants
        stripVariantDupesInPlace(variants);

        // attach hints into variants so resolver can work even if AI didn't copy tags into each variant
        applyFontHintsToVariants({ variants, primaryHint, secondaryHint });

        const s = isRecord(sr[key]) ? (sr[key] as Record<string, unknown>) : {};
        const min = asNumber(s.min) ?? defMin;
        const max = asNumber(s.max) ?? defMax;
        const lineHeight = asNumber(s.lineHeight) ?? defLH;

        return {
            variants,
            sizeRangePx: { min, max },
            lineHeight,
        };
    }

    const normalized: NormalizedStyleRecipe = {
        name: typeof o.name === "string" ? o.name : undefined,
        palette: {
            primary: asString(paletteRaw.primary, "#111827"),
            secondary: asString(paletteRaw.secondary, "#ffffff"),
            accent: asString(paletteRaw.accent, "#b92910"),
            muted: asString(paletteRaw.muted, "#94a3b8"),
            textOnDark: asString(paletteRaw.textOnDark, "#ffffff"),
            textOnLight: asString(paletteRaw.textOnLight, "#111827"),
        },
        tokens: {
            headline: tokenBlock("headline", 40, 110, 1.05),
            value: tokenBlock("value", 60, 180, 1.0),
            subline: tokenBlock("subline", 18, 40, 1.1),
            fineprint: tokenBlock("fineprint", 14, 28, 1.1),
        },
        fonts: {
            primary: primaryHint
                ? { hint: primaryHint }
                : { key: "inter", source: "whitelist" },
            secondary: secondaryHint
                ? { hint: secondaryHint }
                : { key: "oswald", source: "whitelist" },
            extra: [],
        },
    };

    return normalized;
}