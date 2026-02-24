"use client";

import { ReactNode, useMemo } from "react";
import { createPortal } from "react-dom";

export function Portal({ children }: { children: ReactNode }) {
  // На сервере document нет. На клиенте — есть.
  const el = useMemo(() => {
    if (typeof document === "undefined") return null;
    return document.body;
  }, []);

  if (!el) return null;
  return createPortal(children, el);
}
