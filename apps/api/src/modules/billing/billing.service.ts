import { PlanType, SubscriptionStatus } from "@prisma/client";

export function getEffectivePlan(sub: { plan: PlanType; status: SubscriptionStatus } | null): PlanType {
  if (!sub) return PlanType.FREE;

  // минимально строго:
  if (sub.status === SubscriptionStatus.ACTIVE) return sub.plan;

  // если хочешь считать как платный ещё и PAST_DUE/TRIALING — добавь сюда
  // if (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.PAST_DUE) return sub.plan;

  return PlanType.FREE;
}
