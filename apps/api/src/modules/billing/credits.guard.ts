import { getActionCostCredits } from "@socialchef/shared";
import { prisma } from "../../lib/prisma";

export type PaywallAction =
    | "RESTYLE_PREVIEW"
    | "RESTYLE_TRY_AGAIN"
    | "DISH_CUTOUT_PIC"
    | "EXPAND_BACKGROUND"
    | "APPLY_PRESET"
    | "ADD_STYLE"
    | "ADD_BRANDSTYLE"
    | "BAKE_BRANDSTYLE"
    | "COMBO_PREVIEW";

export type PaywallErrorCode = "INSUFFICIENT_CREDITS" | "UPGRADE_REQUIRED";

export class PaywallError extends Error {
    status = 402 as const;
    code: PaywallErrorCode;
    payload: any;

    constructor(code: PaywallErrorCode, payload: any) {
        super(code);
        this.code = code;
        this.payload = payload;
    }
}

export const FREE_START_CREDITS = 5;

export async function ensureCreditsOrThrow(params: {
  tenantId: string;
  action: PaywallAction;
  formatId?: string;
  userId?: string;
}) {
  const { tenantId, action, formatId } = params;

  const cost = getActionCostCredits(action); // теперь всегда number
  if (cost <= 0) return { charged: 0, creditsBalance: undefined as number | undefined };

  const result = await prisma.$transaction(async (tx) => {
    const bal = await tx.tenantCreditBalance.findUnique({
      where: { tenantId },
      select: { balanceCredits: true },
    });

    const current = bal?.balanceCredits ?? 0;

    if (current < cost) {
      throw new PaywallError("INSUFFICIENT_CREDITS", {
        action,
        requiredCredits: cost,
        balanceCredits: current,
        creditsBalance: current, // важно для фронта
        reason: "NOT_ENOUGH_CREDITS",
      });
    }

    const updated = await tx.tenantCreditBalance.update({
      where: { tenantId },
      data: { balanceCredits: { decrement: cost } },
      select: { balanceCredits: true },
    });

    await tx.creditLedger.create({
      data: {
        tenantId,
        action,
        deltaCredits: -cost,
        metaJson: { formatId },
      },
    });

    return { charged: cost, creditsBalance: updated.balanceCredits };
  });

  return result;
}

