export type PaywallAction =
  | "RESTYLE_PREVIEW"
  | "RESTYLE_TRY_AGAIN"
  | "DISH_CUTOUT_PIC"
  | "ADD_STYLE"
  | "EXPAND_BACKGROUND"
  | "APPLY_PRESET"
  | "ADD_BRANDSTYLE"
  | "BAKE_BRANDSTYLE"
  | "COMBO_PREVIEW"
  ;

export const CREDIT_COSTS: Record<PaywallAction, number> = {
  ADD_STYLE: 1,
  RESTYLE_PREVIEW: 2,
  RESTYLE_TRY_AGAIN: 2,
  DISH_CUTOUT_PIC: 1,
  EXPAND_BACKGROUND: 10,
  APPLY_PRESET: 0,
  ADD_BRANDSTYLE: 1,
  BAKE_BRANDSTYLE: 3,
  COMBO_PREVIEW: 2,
};

export function getActionCostCredits(action: PaywallAction) {
  return CREDIT_COSTS[action] ?? 0;
}

export function formatCredits(n: number) {
  return n === 1 ? "1" : `${n}`;
}

export type WithCreditsBalance = {
  creditsBalance?: number; 
};
