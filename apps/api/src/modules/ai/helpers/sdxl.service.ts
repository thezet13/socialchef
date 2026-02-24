type SdxlSize = { w: number; h: number };

const SDXL_ALLOWED_SIZES: SdxlSize[] = [
  { w: 1024, h: 1024 },
  { w: 1152, h: 896 },
  { w: 1216, h: 832 },
  { w: 1344, h: 768 },
  { w: 1536, h: 640 },
  { w: 640, h: 1536 },
  { w: 768, h: 1344 },
  { w: 832, h: 1216 },
  { w: 896, h: 1152 },
];

// SDXL v1.0 supports only a fixed set of sizes (see engine-specific validation notes) :contentReference[oaicite:4]{index=4}
function pickClosestSdxlSize(targetAspect: number): SdxlSize {
  let best = SDXL_ALLOWED_SIZES[0];
  let bestDiff = Infinity;

  for (const s of SDXL_ALLOWED_SIZES) {
    const a = s.w / s.h;
    const diff = Math.abs(a - targetAspect);
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  return best;
}

async function generateWithSDXL(prompt: string, outW: number, outH: number): Promise<Buffer> {
  const apiKey = process.env.STABILITY_API_KEY;
  if (!apiKey) {
    throw new Error("STABILITY_API_KEY is not configured on the server");
  }

  const aspect = outW / outH;
  const { w, h } = pickClosestSdxlSize(aspect);

  const engineId = "stable-diffusion-xl-1024-v1-0";
  const url = `https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image`;

  // Response format: JSON with artifacts[].base64 :contentReference[oaicite:5]{index=5}
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      text_prompts: [{ text: prompt, weight: 1 }],
      width: w,
      height: h,
      steps: 30,
      cfg_scale: 7,
      samples: 1,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`SDXL request failed: ${resp.status} ${resp.statusText} ${txt}`);
  }

  const data = (await resp.json()) as any;
  const b64: string | undefined = data?.artifacts?.[0]?.base64;
  if (!b64) {
    throw new Error("SDXL did not return artifacts[0].base64");
  }

  return Buffer.from(b64, "base64");
}
/** */