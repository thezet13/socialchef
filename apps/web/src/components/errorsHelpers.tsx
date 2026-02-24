// apps/web/src/components/errorsHelpers.ts

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function describeFile(file: File): string {
  return `${file.name} (${file.type || "unknown"}, ${formatBytes(file.size)})`;
}

/* ---------------------------------------------
 * Client-side validation BEFORE upload
 * --------------------------------------------- */
export function validateImageFile(
  file: File,
  opts: {
    allow: readonly string[];
    maxBytes: number;
    action: string;
  }
): string | null {
  if (!file) return `${opts.action}: no file selected.`;

  const type = file.type.toLowerCase();
  if (!opts.allow.includes(type)) {
    return `${opts.action}: unsupported format "${file.type || "unknown"}". Allowed: ${opts.allow.join(", ")}.`;
  }

  if (file.size > opts.maxBytes) {
    return `${opts.action}: file is too large (${formatBytes(file.size)}). Max allowed: ${formatBytes(opts.maxBytes)}.`;
  }

  return null;
}

/* ---------------------------------------------
 * Typed server error payload (optional fields)
 * --------------------------------------------- */
type HttpErrorPayload = {
  error?: string;
  message?: string;
  details?: string;
  maxBytes?: number;
  allowedTypes?: string[];
};

/* ---------------------------------------------
 * Build readable HTTP error for UI
 * --------------------------------------------- */
export async function buildHttpErrorMessage(
  res: Response,
  fallback: string,
  ctx?: {
    file?: File;
    action?: string;
  }
): Promise<string> {
  const actionPrefix = ctx?.action ? `${ctx.action}: ` : "";
  const fileInfo = ctx?.file ? ` File: ${describeFile(ctx.file)}.` : "";

  let hint = "";
  switch (res.status) {
    case 400:
      hint = " Please check the file and try again.";
      break;
    case 401:
      hint = " You are not authorized. Please sign in again.";
      break;
    case 403:
      hint = " You don't have permission to perform this action.";
      break;
    case 413:
      hint = " The file is too large.";
      break;
    case 415:
      hint = " Unsupported file type.";
      break;
    default:
      if (res.status >= 500) {
        hint = " Server error. Please try again later.";
      }
  }

  const contentType = res.headers.get("content-type") ?? "";

  /* ---------- JSON error ---------- */
  if (contentType.includes("application/json")) {
    let data: HttpErrorPayload | null = null;

    try {
      data = (await res.json()) as HttpErrorPayload;
    } catch {
      data = null;
    }

    const serverMsg =
      (typeof data?.error === "string" && data.error.trim()) ||
      (typeof data?.message === "string" && data.message.trim()) ||
      fallback;

    let extra = "";

    if (typeof data?.maxBytes === "number") {
      extra += ` Max allowed: ${formatBytes(data.maxBytes)}.`;
    }

    if (Array.isArray(data?.allowedTypes) && data.allowedTypes.length > 0) {
      extra += ` Allowed formats: ${data.allowedTypes.join(", ")}.`;
    }

    if (typeof data?.details === "string" && data.details.trim()) {
      extra += ` Details: ${data.details.trim()}`;
    }

    return `${actionPrefix}${serverMsg} (HTTP ${res.status}).${hint}${extra}${fileInfo}`;
  }

  /* ---------- Text / unknown ---------- */
  let text = "";
  try {
    text = await res.text();
  } catch {
    text = "";
  }

  const cleanText = text.trim();
  const message = cleanText.length > 0 ? cleanText.slice(0, 300) : fallback;

  return `${actionPrefix}${message} (HTTP ${res.status}).${hint}${fileInfo}`;
}