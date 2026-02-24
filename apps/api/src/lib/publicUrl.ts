export function publicUrl(relativePath: string) {
  const base = process.env.NEXT_PUBLIC_API_URL;

  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }

  if (relativePath.startsWith("http")) {
    return relativePath;
  }

  // гарантируем один /
  return `${base.replace(/\/$/, "")}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;
}
