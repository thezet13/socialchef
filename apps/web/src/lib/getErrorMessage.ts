export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    // иногда backend кидает JSON-строку или объект
    if (typeof error === "object" && error !== null) {
      const anyErr = error as { message?: string; error?: string };

      if (typeof anyErr.message === "string") return anyErr.message;
      if (typeof anyErr.error === "string") return anyErr.error;
    }
  } catch {
    // ignore
  }

  return "Unexpected error";
}
