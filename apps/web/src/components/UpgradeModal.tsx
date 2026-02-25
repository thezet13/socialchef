"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import PlansPicker, { Plan } from "./PlansPicker";
import { useAuth } from "../context/AuthContext"; 

type PaywallPayload = {
  code?: "INSUFFICIENT_CREDITS" | "UPGRADE_REQUIRED";
  action?: string;
  plan?: string;
  requiredPlan?: string;
  reason?: string;
  requiredCredits?: number;
  balanceCredits?: number;
};

export function UpgradeModal({
  data,
  onClose,
}: {
  data: PaywallPayload;
  onClose: () => void;
}) {
  const router = useRouter();

  // ✅ берем me/tenant прямо из AuthContext
  const { tenant } = useAuth();

  const currentPlan: Plan = (tenant?.plan as Plan | undefined) ?? "FREE";

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* modal */}
      <div className="bg-slate-900 relative mx-auto mt-16 w-[min(980px,calc(100%-24px))] rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
        {/* top accent bar */}
        <div className="w-full" />

        {/* header */}
        <div className="flex items-start justify-between gap-1 p-5 pb-0 border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center">
              <div className="min-w-0">
                <h2 className="text-2xl text-slate-100 leading-tight">
                  Upgrade required
                </h2>

                {data?.code === "INSUFFICIENT_CREDITS" ? (
                  <div className="mt-1 text-sm text-slate-400">
                    Need {data.requiredCredits ?? "—"} credits, you have{" "}
                    {data.balanceCredits ?? "—"}.
                  </div>
                ) : data?.code === "UPGRADE_REQUIRED" ? (
                  <div className="mt-1 text-sm text-slate-400">
                    This feature is not available on your current plan.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md border border-slate-800 hover:bg-slate-800/50 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 m-3 mb-7">
          <PlansPicker
            currentPlan={currentPlan}
            onChoose={(plan, interval) => {
              router.push(`/billing?plan=${plan}&interval=${interval}`);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}