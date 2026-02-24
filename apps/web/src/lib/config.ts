export function hexToRgba(hex: string, alpha?: number): string {
  const clean = hex.replace("#", "");

  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;

  // ✅ поддержка и 0..1, и 0..100
  const aRaw = Number(alpha);
  const a01 = aRaw > 1 ? aRaw / 100 : aRaw;
  const a = Math.max(0, Math.min(1, a01));

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

// rgba(10,20,30,0.4) -> 0.4
export function rgbaToAlpha(input: string, fallback = 1) {
  const s = (input ?? "").toString().trim();
  const m = s.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/i);
  if (!m) return fallback;
  return clamp01(Number(m[1]));
}

// rgba(10,20,30,0.4) -> #0a141e
export function rgbaToHex(input: string, fallback = "#000000") {
  const s = (input ?? "").toString().trim();

  // если вдруг уже hex:
  if (/^#([0-9a-f]{3}){1,2}$/i.test(s)) {
    if (s.length === 4) {
      const r = s[1], g = s[2], b = s[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return s.toLowerCase();
  }

  const m = s.match(/^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*[0-9.]+)?\s*\)$/i);
  if (!m) return fallback;

  const r = Math.max(0, Math.min(255, Number(m[1]) || 0));
  const g = Math.max(0, Math.min(255, Number(m[2]) || 0));
  const b = Math.max(0, Math.min(255, Number(m[3]) || 0));

  const toHex = (x: number) => x.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

// hex + alpha -> rgba(...)
export function hexToRgbaString(hex: string, alpha: number) {
  return hexToRgba(hex, clamp01(alpha));
}

export function opacityToAlpha(opacity?: number) {
  return 1 - Math.min(100, Math.max(0, opacity ?? 0)) / 100;
}