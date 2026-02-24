import fs from "fs";
import path from "path";
import { GlobalFonts } from "@napi-rs/canvas";
import { PRO_FONTS } from "@socialchef/pro-fonts";

let done = false;

function findFontsDirFromPackageEntry(): string {
  // entrypoint пакета (например .../node_modules/@socialchef/pro-fonts/dist/index.js)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const entry = require.resolve("@socialchef/pro-fonts");

  let dir = path.dirname(entry);

  // поднимаемся вверх максимум 8 уровней и ищем папку "fonts"
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "fonts");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    dir = path.dirname(dir);
  }

  throw new Error(`[fonts] cannot find "fonts" dir starting from entry: ${entry}`);
}

export function ensureFontsRegistered(): void {
  if (done) return;

  let fontsDir: string;
  try {
    fontsDir = findFontsDirFromPackageEntry();
  } catch (e) {
    console.error("[fonts] failed to locate fonts dir:", e);
    // важно: не ставим done=true, чтобы не “закэшировать” фейл
    return;
  }

  console.log("[fonts] fontsDir =", fontsDir);

  let okCount = 0;
  let missCount = 0;

  for (const f of PRO_FONTS) {
    if (!f.file) continue;

    const abs = path.join(fontsDir, f.file);
    if (!fs.existsSync(abs)) {
      missCount++;
      console.warn("[fonts] missing file:", abs);
      continue;
    }

    const ok = GlobalFonts.registerFromPath(abs, f.family);
    if (!ok) {
      console.warn("[fonts] registerFromPath returned false:", abs, "family:", f.family);
      continue;
    }

    okCount++;
  }

  console.log("[fonts] registered files:", okCount, "missing:", missCount);
  console.log("[fonts] families visible to canvas:", GlobalFonts.families);

  done = true;
}
