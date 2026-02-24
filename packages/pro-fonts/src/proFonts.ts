// proFonts.ts

export interface ProFontConfig {
  id: string;          // уникальный id
  family: string;      // CSS/canvas family name (важно!)
  label: string;       // отображаемое имя
  file?: string;       // filename в /fonts (нужно на бэке)
  weight?: number;     // 100..900 (если это конкретный вес)
  italic?: boolean;    // если это italic-face (опционально)
}

// proFonts.ts

export const PRO_FONTS: ProFontConfig[] = [
  { id: "aboreto", family: "Aboreto", label: "Aboreto", file: "Aboreto.ttf" },
  { id: "barlow", family: "Barlow", label: "Barlow", file: "Barlow.ttf" },

  { id: "barriecito", family: "Barriecito", label: "Barriecito", file: "Barriecito.ttf" },
  { id: "bbh-bartle", family: "BBH Bartle", label: "BBH Bartle", file: "BBHBartle.ttf" },
  { id: "bbh-hegarte", family: "BBH Hegarte", label: "BBH Hegarte", file: "BBHHegarte.ttf" },
  { id: "bebas-neue", family: "Bebas Neue", label: "Bebas Neue", file: "BebasNeue.ttf" },

  { id: "chewy", family: "Chewy", label: "Chewy", file: "Chewy.ttf" },
  { id: "codystar", family: "Codystar", label: "Codystar", file: "Codystar.ttf" },

  { id: "dancing-script-400", family: "Dancing Script", label: "Dancing Script Regular", file: "DancingScript-Regular.ttf", weight: 400 },
  { id: "dancing-script-500", family: "Dancing Script", label: "Dancing Script Medium", file: "DancingScript-Medium.ttf", weight: 500 },
  { id: "dancing-script-600", family: "Dancing Script", label: "Dancing Script SemiBold", file: "DancingScript-SemiBold.ttf", weight: 600 },
  { id: "dancing-script-700", family: "Dancing Script", label: "Dancing Script Bold", file: "DancingScript-Bold.ttf", weight: 700 },
  
  { id: "ewert", family: "Ewert", label: "Ewert", file: "Ewert.ttf" },
  { id: "fascinate", family: "Fascinate", label: "Fascinate", file: "Fascinate.ttf" },

  { id: "iansui", family: "Iansui", label: "Iansui", file: "Iansui.ttf" },

  // =========================
  // Inter (static weights) ✅
  // =========================
  // Эти файлы должны реально лежать в /fonts
  { id: "inter-100", family: "Inter", label: "Inter Thin", file: "Inter-Thin.ttf", weight: 100 },
  { id: "inter-200", family: "Inter", label: "Inter ExtraLight", file: "Inter-ExtraLight.ttf", weight: 200 },
  { id: "inter-300", family: "Inter", label: "Inter Light", file: "Inter-Light.ttf", weight: 300 },
  { id: "inter-400", family: "Inter", label: "Inter Regular", file: "Inter-Regular.ttf", weight: 400 },
  { id: "inter-500", family: "Inter", label: "Inter Medium", file: "Inter-Medium.ttf", weight: 500 },
  { id: "inter-600", family: "Inter", label: "Inter SemiBold", file: "Inter-SemiBold.ttf", weight: 600 },
  { id: "inter-700", family: "Inter", label: "Inter Bold", file: "Inter-Bold.ttf", weight: 700 },
  { id: "inter-800", family: "Inter", label: "Inter ExtraBold", file: "Inter-ExtraBold.ttf", weight: 800 },

  { id: "inter-italic", family: "Inter", label: "Inter Italic", file: "Inter-Italic.ttf", weight: 400 },
  // если у тебя есть Inter-Black.ttf — раскомментируй:
  // { id: "inter-900", family: "Inter", label: "Inter Black", file: "Inter-Black.ttf", weight: 900 },

  // если тебе нужны italic-версии (реальные файлы), добавляй так:
  // { id: "inter-400i", family: "Inter", label: "Inter Italic", file: "Inter-Italic.ttf", weight: 400, italic: true },
  // { id: "inter-700i", family: "Inter", label: "Inter Bold Italic", file: "Inter-BoldItalic.ttf", weight: 700, italic: true },

  { id: "jua", family: "Jua", label: "Jua", file: "Jua.ttf" },
  { id: "katibeh", family: "Katibeh", label: "Katibeh", file: "Katibeh.ttf" },

  { id: "lora-400", family: "Lora", label: "Lora Regular", file: "Lora-Regular.ttf", weight: 400 },
  { id: "lora-500", family: "Lora", label: "Lora Medium", file: "Lora-Medium.ttf", weight: 500 },
  { id: "lora-600", family: "Lora", label: "Lora SemiBold", file: "Lora-SemiBold.ttf", weight: 600 },
  { id: "lora-700", family: "Lora", label: "Lora Bold", file: "Lora-Bold.ttf", weight: 700 },
  { id: "lora-800", family: "Lora", label: "Lora ExtraBold", file: "Lora-ExtraBold.ttf", weight: 800 }, 
  
  { id: "lugrasimo", family: "Lugrasimo", label: "Lugrasimo", file: "Lugrasimo.ttf" },

  { id: "montserrat-100", family: "Montserrat", label: "Montserrat Thin", file: "Montserrat-Thin.ttf", weight: 100 },
  { id: "montserrat-200", family: "Montserrat", label: "Montserrat ExtraLight", file: "Montserrat-ExtraLight.ttf", weight: 200 },
  { id: "montserrat-300", family: "Montserrat", label: "Montserrat Light", file: "Montserrat-Light.ttf", weight: 300 },
  { id: "montserrat-400", family: "Montserrat", label: "Montserrat Regular", file: "Montserrat-Regular.ttf", weight: 400 },
  { id: "montserrat-500", family: "Montserrat", label: "Montserrat Medium", file: "Montserrat-Medium.ttf", weight: 500 },
  { id: "montserrat-600", family: "Montserrat", label: "Montserrat SemiBold", file: "Montserrat-SemiBold.ttf", weight: 600 },
  { id: "montserrat-700", family: "Montserrat", label: "Montserrat Bold", file: "Montserrat-Bold.ttf", weight: 700 },
  { id: "montserrat-800", family: "Montserrat", label: "Montserrat ExtraBold", file: "Montserrat-ExtraBold.ttf", weight: 800 },

  { id: "notosanskr", family: "Noto Sans KR", label: "Noto Sans KR", file: "NotoSansKR.ttf" },
  { id: "notosanssymbols", family: "Noto Sans Symbols", label: "Noto Sans Symbols", file: "NotoSansSymbols.ttf" },
  { id: "notosanstc", family: "Noto Sans TC", label: "Noto Sans TC", file: "NotoSansTC.ttf" },

  { id: "oswald", family: "Oswald", label: "Oswald", file: "Oswald.ttf" },

  
  { id: "outfit-400", family: "Outfit", label: "Outfit Regular", file: "Outfit-Regular.ttf", weight: 400 },
  { id: "outfit-500", family: "Outfit", label: "Outfit Medium", file: "Outfit-Medium.ttf", weight: 500 },
  { id: "outfit-600", family: "Outfit", label: "Outfit SemiBold", file: "Outfit-SemiBold.ttf", weight: 600 },
  { id: "outfit-700", family: "Outfit", label: "Outfit Bold", file: "Outfit-Bold.ttf", weight: 700 },
  
  { id: "permanent-marker", family: "Permanent Marker", label: "Permanent Marker", file: "PermanentMarker.ttf" },
  { id: "playfair-display", family: "Playfair Display", label: "Playfair Display", file: "PlayfairDisplay.ttf" },

  { id: "pridi", family: "Pridi", label: "Pridi", file: "Pridi.ttf" },
  { id: "pt-serif", family: "PT Serif", label: "PT Serif", file: "PTSerif.ttf" },

  { id: "rampart-one", family: "Rampart One", label: "Rampart One", file: "RampartOne-Regular.ttf" },

  { id: "roboto-100", family: "Roboto", label: "Roboto Thin", file: "Roboto-Thin.ttf", weight: 100 },
  { id: "roboto-200", family: "Roboto", label: "Roboto ExtraLight", file: "Roboto-ExtraLight.ttf", weight: 200 },
  { id: "roboto-300", family: "Roboto", label: "Roboto Light", file: "Roboto-Light.ttf", weight: 300 },
  { id: "roboto-400", family: "Roboto", label: "Roboto Regular", file: "Roboto-Regular.ttf", weight: 400 },
  { id: "roboto-500", family: "Roboto", label: "Roboto Medium", file: "Roboto-Medium.ttf", weight: 500 },
  { id: "roboto-600", family: "Roboto", label: "Roboto SemiBold", file: "Roboto-SemiBold.ttf", weight: 600 },
  { id: "roboto-700", family: "Roboto", label: "Roboto Bold", file: "Roboto-Bold.ttf", weight: 700 },
  { id: "roboto-800", family: "Roboto", label: "Roboto ExtraBold", file: "Roboto-ExtraBold.ttf", weight: 800 },
  
  { id: "roboto-flex-100", family: "Roboto Flex", label: "Roboto Flex Thin", file: "RobotoFlex-Thin.ttf", weight: 100 },
  { id: "roboto-flex-200", family: "Roboto Flex", label: "Roboto Flex ExtraLight", file: "RobotoFlex-ExtraLight.ttf", weight: 200 },
  { id: "roboto-flex-300", family: "Roboto Flex", label: "Roboto Flex Light", file: "RobotoFlex-Light.ttf", weight: 300 },
  { id: "roboto-flex-400", family: "Roboto Flex", label: "Roboto Flex Regular", file: "RobotoFlex-Regular.ttf", weight: 400 },
  { id: "roboto-flex-500", family: "Roboto Flex", label: "Roboto Flex Medium", file: "RobotoFlex-Medium.ttf", weight: 500 },
  { id: "roboto-flex-600", family: "Roboto Flex", label: "Roboto Flex SemiBold", file: "RobotoFlex-SemiBold.ttf", weight: 600 },
  { id: "roboto-flex-700", family: "Roboto Flex", label: "Roboto Flex Bold", file: "RobotoFlex-Bold.ttf", weight: 700 },
  { id: "roboto-flex-800", family: "Roboto Flex", label: "Roboto Flex ExtraBold", file: "RobotoFlex-ExtraBold.ttf", weight: 800 },

  { id: "roboto-condensed-100", family: "Roboto Condensed", label: "Roboto Condensed Thin", file: "RobotoCondensed-Thin.tiff", weight: 100 },
  { id: "roboto-condensed-200", family: "Roboto Condensed", label: "Roboto Condensed ExtraLight", file: "RobotoCondensed-ExtraLight.ttf", weight: 200 },
  { id: "roboto-condensed-300", family: "Roboto Condensed", label: "Roboto Condensed Light", file: "RobotoCondensed-Light.ttf", weight: 300 },
  { id: "roboto-condensed-400", family: "Roboto Condensed", label: "Roboto Condensed Regular", file: "RobotoCondensed-Regular.ttf", weight: 400 },
  { id: "roboto-condensed-500", family: "Roboto Condensed", label: "Roboto Condensed Medium", file: "RobotoCondensed-Medium.ttf", weight: 500 },
  { id: "roboto-condensed-600", family: "Roboto Condensed", label: "Roboto Condensed SemiBold", file: "RobotoCondensed-SemiBold.ttf", weight: 600 },
  { id: "roboto-condensed-700", family: "Roboto Condensed", label: "Roboto Condensed Bold", file: "RobotoCondensed-Bold.ttf", weight: 700 },
  { id: "roboto-condensed-800", family: "Roboto Condensed", label: "Roboto Condensed ExtraBold", file: "RobotoCondensed-ExtraBold.ttf", weight: 800 },
    
  { id: "roboto-serif-100", family: "Roboto Serif", label: "Roboto Serif Thin", file: "RobotoSerif-Thin.ttf", weight: 100 },
  { id: "roboto-serif-200", family: "Roboto Serif", label: "Roboto Serif ExtraLight", file: "RobotoSerif-ExtraLight.ttf", weight: 200 },
  { id: "roboto-serif-300", family: "Roboto Serif", label: "Roboto Serif Light", file: "RobotoSerif-Light.ttf", weight: 300 },
  { id: "roboto-serif-400", family: "Roboto Serif", label: "Roboto Serif Regular", file: "RobotoSerif-Regular.ttf", weight: 400 },
  { id: "roboto-serif-500", family: "Roboto Serif", label: "Roboto Serif Medium", file: "RobotoSerif-Medium.ttf", weight: 500 },
  { id: "roboto-serif-600", family: "Roboto Serif", label: "Roboto Serif SemiBold", file: "RobotoSerif-SemiBold.ttf", weight: 600 },
  { id: "roboto-serif-700", family: "Roboto Serif", label: "Roboto Serif Bold", file: "RobotoSerif-Bold.ttf", weight: 700 },
  { id: "roboto-serif-800", family: "Roboto Serif", label: "Roboto Serif ExtraBold", file: "RobotoSerif-ExtraBold.ttf", weight: 800 },

  { id: "roboto-slab-100", family: "Roboto Slab", label: "Roboto Slab Thin", file: "RobotoSlab-Thin.ttf", weight: 100 },
  { id: "roboto-slab-200", family: "Roboto Slab", label: "Roboto Slab ExtraLight", file: "RobotoSlab-ExtraLight.ttf", weight: 200 },
  { id: "roboto-slab-300", family: "Roboto Slab", label: "Roboto Slab Light", file: "RobotoSlab-Light.ttf", weight: 300 },
  { id: "roboto-slab-400", family: "Roboto Slab", label: "Roboto Slab Regular", file: "RobotoSlab-Regular.ttf", weight: 400 },
  { id: "roboto-slab-500", family: "Roboto Slab", label: "Roboto Slab Medium", file: "RobotoSlab-Medium.ttf", weight: 500 },
  { id: "roboto-slab-600", family: "Roboto Slab", label: "Roboto Slab SemiBold", file: "RobotoSlab-SemiBold.ttf", weight: 600 },
  { id: "roboto-slab-700", family: "Roboto Slab", label: "Roboto Slab Bold", file: "RobotoSlab-Bold.ttf", weight: 700 },
  { id: "roboto-slab-800", family: "Roboto Slab", label: "Roboto Slab ExtraBold", file: "RobotoSlab-ExtraBold.ttf", weight: 800 },

  { id: "science-gothic", family: "Science Gothic", label: "Science Gothic", file: "ScienceGothic.ttf" },

  { id: "sekuya", family: "Sekuya", label: "Sekuya", file: "Sekuya.ttf" },
  { id: "shojumaru", family: "Shojumaru", label: "Shojumaru", file: "Shojumaru.ttf" },
  { id: "spicy-rice", family: "Spicy Rice", label: "Spicy Rice", file: "SpicyRice.ttf" },

  { id: "texturina", family: "Texturina", label: "Texturina", file: "Texturina.ttf" },
  { id: "ultra", family: "Ultra", label: "Ultra", file: "Ultra.ttf" },
  { id: "vast-shadow", family: "Vast Shadow", label: "Vast Shadow", file: "VastShadow.ttf" },
];

export type ProFontFamilyOption = { family: string; label: string };

export function getAvailableWeights(family: string): number[] {
  const weights = PRO_FONTS
    .filter((f) => f.family === family && typeof f.weight === "number")
    .map((f) => f.weight as number);

  return Array.from(new Set(weights)).sort((a, b) => a - b);
}

// ✅ НОВОЕ: уникальные family для dropdown Font
export const PRO_FONT_FAMILIES: ProFontFamilyOption[] = Array.from(
  new Map(
    PRO_FONTS.map((f) => [
      f.family,
      { family: f.family, label: f.family }, // можно label: f.label если хочешь “красивые” названия
    ])
  ).values()
).sort((a, b) => a.label.localeCompare(b.label));

