"use client";
import React from "react";

export function ProLockBadge({ label = "PRO" }: { label?: "PRO" | "EDITOR" }) {
  return (
    <span className="ml-2 rounded-md bg-purple-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {label}
    </span>
  );
}
