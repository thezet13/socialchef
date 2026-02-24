// apps/web/src/features/fonts/CustomFontsStyle.tsx
"use client";

import type { CustomFont } from "./useFonts";

export function CustomFontsStyle({
  customFonts,
  apiBase,
}: {
  customFonts: CustomFont[];
  apiBase: string;
}) {
  if (!customFonts.length) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: customFonts
          .map(
            (f) => `
@font-face {
  font-family: '${f.family}';
  src: url('${apiBase}${f.url}') format('truetype');
  font-weight: 100 900;
  font-style: normal;
}
`
          )
          .join("\n"),
      }}
    />
  );
}
