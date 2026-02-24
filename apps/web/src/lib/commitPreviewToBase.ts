import { readCookie } from "./apiClient";

type CommitPreviewResponse = {
  proDesignId: string;
  baseImageUrl: string;
  error?: string;
};

export async function commitPreviewToBase(args: {
  apiBase: string;
  proDesignId: string;
  previewImageUrl: string;
}): Promise<{ proDesignId: string; baseImageUrl: string }> {
  const csrf = readCookie("sc_csrf");
  const rsp = await fetch(`${args.apiBase}/ai/pro-images/commit-preview`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify({
      proDesignId: args.proDesignId,
      previewImageUrl: args.previewImageUrl,
    }),
  });

  let data: CommitPreviewResponse | null = null;

  try {
    data = (await rsp.json()) as CommitPreviewResponse;
  } catch {
    // body may be empty
  }

  if (!rsp.ok) {
    throw new Error(data?.error || `Request failed (${rsp.status})`);
  }

  if (!data?.proDesignId || !data.baseImageUrl) {
    throw new Error("Invalid response from server");
  }

  return {
    proDesignId: data.proDesignId,
    baseImageUrl: data.baseImageUrl,
  };
}

