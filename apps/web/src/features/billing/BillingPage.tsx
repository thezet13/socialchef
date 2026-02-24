"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useGlobalDialog } from "@/components/GlobalDialogProvider";

import PlansPicker, { Interval, PaidPlan } from "@/components/PlansPicker";

type Plan = "FREE" | "PRO" | "PRO_PLUS";

const BILLING_ENABLED = false;

export default function BillingPage() {
  const { tenant, loading } = useAuth();
  const dlg = useGlobalDialog();

  // оставляем эти стейты, если хочешь позже вернуть auto-open через query
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan | null>(null);
  const [checkoutInterval, setCheckoutInterval] = useState<Interval>("MONTH");

  const plan: Plan = (tenant?.plan as Plan | undefined) ?? "FREE";
  const creditsBalance = tenant?.creditsBalance ?? 0;

  const isFree = plan === "FREE";

  useEffect(() => {
    // stub: если кто-то сетает checkoutPlan (например из query) — показываем заглушку
    if (!checkoutPlan) return;

    void (async () => {
      if (!BILLING_ENABLED) {
        await dlg.alert("Billing is coming soon (Paddle verification in progress).", {
          title: "Coming soon",
        });
        setCheckoutPlan(null);
        return;
      }

      // TODO: тут будет Paddle checkout open(priceId...)
    })();
  }, [checkoutPlan, checkoutInterval, dlg]);

  if (loading || !tenant) {
    return <div className="p-10 text-slate-400">Loading...</div>;
  }

  async function startSubscriptionCheckout(p: PaidPlan, interval: Interval) {
    setCheckoutPlan(p);
    setCheckoutInterval(interval);
  }

  async function startTopupCheckout() {
    if (isFree) {
      await dlg.alert("Top-ups are available after subscribing to Pro or Pro+.", {
        title: "Upgrade required",
      });
      return;
    }

    if (!BILLING_ENABLED) {
      await dlg.alert("Credit top-ups are coming soon (Paddle verification in progress).", {
        title: "Coming soon",
      });
      return;
    }

    // TODO: Paddle top-up checkout open(priceId...)
  }

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-10 pb-16 text-slate-200">
      <div className="flex items-end justify-between gap-4 mt-8">
        <div>
          <h1 className="text-2xl font-semibold">Billing & Subscription</h1>
          <div className="text-sm text-slate-400 mt-1">View and manage your subscription, billing and credits.</div>
        </div>
      </div>

      {/* Current Plan */}
      <div className="mt-6 border border-slate-800 rounded-2xl p-6 bg-slate-900/50 flex justify-between">
        <div className="">
          <div className="text-sm text-slate-400">Current plan</div>
          <div className="text-4xl mt-1">{plan === "FREE" ? "Free" : plan === "PRO" ? "Pro" : "Pro+"}</div>
        </div>
        <div className="">
          <div className="mt-2 text-md">
            Credits remaining: <span className="text-orange-500">{creditsBalance}</span>
          </div>

          {isFree ? (
            <div className="mt-6">
            </div>
          ) : (
            <div className="flex gap-3 mt-2 justify-end">
              <button
                onClick={() => void startSubscriptionCheckout("PRO", "MONTH")}
                className="hidden border border-slate-700 px-4 py-2 rounded-md"
              >
                Change plan
              </button>

              <button
                onClick={() => void startTopupCheckout()}
                className="bg-blue-500/50 hover:bg-blue-500/70 px-4 py-2 rounded-md text-sm"
              >
                Add credits
              </button>
            </div>
          )}
        </div>
      </div>
      {/* plans for paid too */}
      {!isFree ? (
        <div className="mt-8">
          <PlansPicker
            currentPlan={plan} // ✅ тоже
            //showFree={false}
            onChoose={(p, interval) => {
              void startSubscriptionCheckout(p, interval);
            }}
          />
        </div>
      ) : (
        <div className="mt-8">
          <PlansPicker
            currentPlan={plan} // ✅ тоже
            onChoose={(p, interval) => {
              void startSubscriptionCheckout(p, interval);
            }}
          />
        </div>

      )}
    </div>
  );
}
