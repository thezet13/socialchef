"use client";

import type { PaidPlan, Interval, TopUpPack } from "@/lib/billing/prices";
// позже этот импорт будет реальным:
// import { openPaddleCheckout } from "@/lib/paddle/paddleClient";
// import { getSubscriptionPriceId, getTopupPriceId } from "@/lib/paddle/prices";

export async function startSubscriptionCheckout(params: {
  enabled: boolean;
  plan: PaidPlan;
  interval: Interval;
  email?: string;
  tenantId?: string;
  alert: (msg: string, opts?: { title?: string }) => Promise<void>;
}) {
  if (!params.enabled) {
    await params.alert("Billing is coming soon (Paddle verification in progress).", {
      title: "Coming soon",
    });
    return;
  }

  // TODO (когда Paddle готов):
  // const priceId = getSubscriptionPriceId(params.plan, params.interval);
  // await openPaddleCheckout({
  //   priceId,
  //   customerEmail: params.email,
  //   customData: { tenantId: params.tenantId, plan: params.plan, interval: params.interval, kind: "SUBSCRIPTION" },
  // });
}

export async function startTopupCheckout(params: {
  enabled: boolean;
  pack: TopUpPack;
  email?: string;
  tenantId?: string;
  isFree: boolean;
  alert: (msg: string, opts?: { title?: string }) => Promise<void>;
}) {
  if (params.isFree) {
    await params.alert("Top-ups are available after subscribing to Pro or Pro+.", {
      title: "Upgrade required",
    });
    return;
  }

  if (!params.enabled) {
    await params.alert("Credit top-ups are coming soon (Paddle verification in progress).", {
      title: "Coming soon",
    });
    return;
  }

  // TODO (когда Paddle готов):
  // const priceId = getTopupPriceId(params.pack);
  // await openPaddleCheckout({
  //   priceId,
  //   customerEmail: params.email,
  //   customData: { tenantId: params.tenantId, pack: params.pack, kind: "TOPUP" },
  // });
}
