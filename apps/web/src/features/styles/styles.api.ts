import { readCookie } from "../../lib/apiClient";

export async function deleteStyle(opts: {
  apiBase: string;
  styleId: string;
}) {
  const csrf = readCookie("sc_csrf");
  const rsp = await fetch(`${opts.apiBase}/styles/${opts.styleId}`, {
    method: "DELETE",
    credentials: "include",
    headers: csrf ? { "x-csrf-token": csrf } : {},
  });

  if (rsp.status === 204) return;

  const data = (await rsp.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error || `Delete failed (${rsp.status})`);
}
