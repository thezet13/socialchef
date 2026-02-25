import { readCookie } from "../../lib/apiClient";

type UploadResp = {
  imageUrl: string;
  thumbnailUrl: string;
};

type AnalyzeResp = {
  prompt: string;
  title?: string;
  description?: string;
  creditsBalance?: number;
};

export async function createUserStyleFromImage(opts: {
  apiBase: string;
  file: File;

  // optional hint, можно пустым
  hintTitle?: string;
}): Promise<{ createdStyleId: string, creditsBalance?: number }> {
  // 1) upload
  const fd = new FormData();
  fd.append("file", opts.file);

  const csrf = readCookie("sc_csrf");

  const up = await fetch(`${opts.apiBase}/styles/upload`, {
    method: "POST",
    body: fd,
    credentials: "include",
    headers: csrf ? { "x-csrf-token": csrf } : {},
  });

  const upData = (await up.json()) as UploadResp & { error?: string };
  if (!up.ok) throw new Error(upData.error || `Upload failed (${up.status})`);

  // 2) analyze
  const an = await fetch(`${opts.apiBase}/styles/analyze`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify({
      imageUrl: upData.imageUrl,
      hintTitle: opts.hintTitle?.trim() || undefined,
    }),
  });

  const anData = (await an.json()) as AnalyzeResp & { error?: string };

  const creditsBalance = anData.creditsBalance;

  if (!an.ok) throw new Error(anData.error || `Analyze failed (${an.status})`);
  if (!anData.prompt?.trim()) throw new Error("Analyze returned empty prompt");

  // fallback title
  const title = (anData.title?.trim() || "My style").slice(0, 60);

  // 3) save USER style
  const sv = await fetch(`${opts.apiBase}/styles`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify({
      scope: "TENANT",
      title,
      description: anData.description?.trim() || undefined,
      previewUrl: upData.thumbnailUrl,
      sourceUrl: upData.imageUrl,
      prompt: anData.prompt.trim(),
    }),
  });

  const svData = (await sv.json()) as { id?: string; error?: string };
  if (!sv.ok) throw new Error(svData.error || `Save failed (${sv.status})`);
  if (!svData.id) throw new Error("Save did not return style id");

  return { createdStyleId: svData.id, creditsBalance };
}
