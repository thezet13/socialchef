"use client";

import * as React from "react";
import type { FoodSceneTemplate, FoodSceneTemplateId } from "@/features/aiTemplates/foodSceneTemplates";
import Image from "next/image";

type Props = {
  templates: readonly FoodSceneTemplate[];
  value: FoodSceneTemplateId | null;
  onChange: (id: FoodSceneTemplateId) => void;
};

export function TemplatePickerGrid({ templates, value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {templates.map((t) => {
        const active = t.id === value;

        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              "group relative overflow-hidden rounded-xl border transition",
              active ? "border-blue-400/60 ring-2 ring-blue-400/30" : "border-slate-800 hover:border-slate-700",
              "bg-slate-950",
            ].join(" ")}
          >
            <div className="aspect-square w-full">
              <Image
                src={t.previewUrl}
                alt={t.id}
                fill
                sizes="(max-width: 640px) 50vw, 33vw"
                className={[
                    "object-cover",
                    "transition-transform duration-200",
                    active ? "scale-[1.02]" : "group-hover:scale-[1.02]",
                ].join(" ")}
                draggable={false}
                />

            </div>

            {/* subtle bottom gradient for “pro” feel */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/40 to-transparent" />

            {/* selected badge */}
            {active ? (
              <div className="absolute top-2 right-2 rounded-full bg-blue-400/90 px-2 py-0.5 text-[10px] font-semibold text-black">
                Selected
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
