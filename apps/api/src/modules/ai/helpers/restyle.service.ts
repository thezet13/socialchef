import { FormatId } from "@/modules/styles/prompts/buildRestylePrompt";

export function inferFormatId(w: number, h: number): FormatId {
  const r = w / h;

  if (Math.abs(r - 1) < 0.05) return "1_1";
  if (Math.abs(r - 2 / 3) < 0.05) return "2_3";
  if (Math.abs(r - 3 / 2) < 0.05) return "3_2";
  if (Math.abs(r - 4 / 5) < 0.05) return "4_5";
  if (Math.abs(r - 5 / 4) < 0.05) return "5_4";
  if (Math.abs(r - 9 / 16) < 0.05) return "9_16";
  if (Math.abs(r - 16 / 9) < 0.05) return "16_9";

  return "1_1";
}