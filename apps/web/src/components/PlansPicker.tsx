"use client";

import React, { useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import Image from "next/image";

export type PaidPlan = "PRO" | "PRO_PLUS";
export type Plan = "FREE" | PaidPlan;
export type Interval = "MONTH" | "YEAR";

const PRICES = {
  PRO: { month: 19, year: 179, creditsPerMonth: 200 },
  PRO_PLUS: { month: 39, year: 369, creditsPerMonth: 500 },
} as const;

export default function PlansPicker(props: {
  defaultInterval?: Interval;
  onChoose: (plan: PaidPlan, interval: Interval) => void;
  showFree?: boolean;
  currentPlan?: Plan; // ✅ NEW
}) {
  const [interval, setInterval] = useState<Interval>(props.defaultInterval ?? "MONTH");
  const currentPlan: Plan = props.currentPlan ?? "FREE";

  return (
    <div>
      <div className="px-5 pt-5 flex justify-center">
        {/* toggle */}
        <div className="inline-flex rounded-2xl border border-slate-800 bg-slate-950/50 gap-1">
          <button
            type="button"
            onClick={() => setInterval("MONTH")}
            className={[
              "px-3 py-2 rounded-2xl text-md font-medium transition",
              interval === "MONTH"
                ? "bg-blue-500/15 text-blue-200 border border-blue-500"
                : "text-slate-300",
            ].join(" ")}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("YEAR")}
            className={[
              "px-3 py-2 rounded-2xl text-md font-medium transition",
              interval === "YEAR"
                ? "bg-blue-500/15 text-blue-200 border border-blue-500"
                : "text-slate-300",
            ].join(" ")}
          >
            Yearly <span className="text-orange-500">(-20%)</span>
          </button>
        </div>
      </div>

      {/* cards */}
      <div
        className={[
          "mt-4 grid grid-cols-1 gap-4",
          props.showFree === false ? "md:grid-cols-2" : "md:grid-cols-3", // ✅ FIX Tailwind dynamic class
        ].join(" ")}
      >
        {props.showFree === false ? null : (
          <PlanCard
            badge="Free"
            price="$0"
            priceNote="/ month"
            icon={<Lock className="w-4 h-4" />}
            items={[
              "5 credits (one-time bonus)",
              "Watermark",
              "AI features locked",
              "No credit top-up",
              "Limited editor",
            ]}
            cta={currentPlan === "FREE" ? "Current plan" : "Free"} // ✅ FIX
            disabled
            onClick={() => {}}
          />
        )}

        <PlanCard
          badge="Pro"
          price={formatPrice("PRO", interval)}
          priceNote={interval === "MONTH" ? "/ month" : "/ year"}
          icon={
            <Image
              src="/logos/sc-icon2.png"
              alt="SocialChef logo"
              width={36}
              height={36}
              style={{ height: "auto" }}
              priority
            />
          }
          highlight
          items={[
            `${PRICES.PRO.creditsPerMonth} credits / month`,
            "Restyle images",
            "Brand styles",
            "Expand background",
            "Full features editor",
            "Templates",
            "HD export",
            "No watermark",
          ]}
          cta={currentPlan === "PRO" ? "Current plan" : "Get Pro"} // ✅ FIX
          onClick={() => props.onChoose("PRO", interval)}
          disabled={currentPlan === "PRO"} // ✅ prevent re-choosing same plan
        />

        <PlanCard
          badge="Pro+"
          price={formatPrice("PRO_PLUS", interval)}
          priceNote={interval === "MONTH" ? "/ month" : "/ year"}
          icon={
            <Image
              src="/logos/sc-icon2.png"
              alt="SocialChef logo"
              width={36}
              height={36}
              style={{ height: "auto" }}
              priority
            />
          }
          highlight
          items={[
            `${PRICES.PRO_PLUS.creditsPerMonth} credits / month`,
            "Everything in Pro",
            "4K export",
            "Larger storage",
            "Early access features",
          ]}
          cta={currentPlan === "PRO_PLUS" ? "Current plan" : "Get Pro+"} // ✅ FIX
          onClick={() => props.onChoose("PRO_PLUS", interval)}
          disabled={currentPlan === "PRO_PLUS"} // ✅ prevent re-choosing same plan
        />
      </div>
    </div>
  );
}

function formatPrice(plan: PaidPlan, interval: Interval) {
  const v = PRICES[plan];
  const n = interval === "MONTH" ? v.month : v.year;
  return `$${n.toFixed(0)}`;
}

function PlanCard({
  badge,
  price,
  priceNote,
  icon,
  items,
  cta,
  onClick,
  highlight,
  disabled,
}: {
  badge: string;
  price: string;
  priceNote: string;
  icon: React.ReactNode;
  items: string[];
  cta: string;
  onClick: () => void;
  highlight?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-4 relative overflow-hidden bg-slate-950",
        highlight ? "border-slate-800" : "border-slate-800",
        disabled ? "opacity-45" : "",
      ].join(" ")}
    >
      {highlight ? (
        <div className="hidden pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-orange-500/10 blur-2xl" />
      ) : null}

      <div className="flex items-center justify-between relative">
        <div className="text-[24px]">{badge}</div>
        <div className="w-10 h-10 flex items-center justify-center">{icon}</div>
      </div>

      <div className="mt-3 flex items-end gap-1 relative">
        <div className="text-[32px] text-blue-500">{price}</div>
        <div className="text-xs text-slate-500 mb-3">{priceNote}</div>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={[
          "my-3 w-full px-3 py-2 rounded-md border text-sm transition flex items-center justify-center gap-2 relative",
          disabled
            ? "border-slate-800 bg-slate-900 text-slate-500"
            : highlight
              ? "border-blue-500/35 bg-blue-500/50 text-blue-200 hover:bg-blue-500/70"
              : "border-blue-500/35 bg-blue-500/50 text-blue-200 hover:bg-blue-500/70",
        ].join(" ")}
      >
        {cta} {!disabled ? <ArrowRight className="w-4 h-4" /> : null}
      </button>

      <ul className="mt-4 space-y-2 text-sm text-slate-300 relative p-3">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span
              className={[
                "mt-[7px] w-1.5 h-1.5 rounded-full",
                highlight ? "bg-orange-500/70" : "bg-slate-600",
              ].join(" ")}
            />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
