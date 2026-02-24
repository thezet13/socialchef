// apps/web/src/lib/paddle/prices.ts

export type PaidPlan = "PRO" | "PRO_PLUS";
export type Interval = "MONTH" | "YEAR";
export type TopUpPack = 200 | 500 | 1000;

/**
 * Получить priceId для подписки
 */
export function getSubscriptionPriceId(
  plan: PaidPlan,
  interval: Interval
): string {
  switch (plan) {
    case "PRO":
      return interval === "MONTH"
        ? mustEnv(
            process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTH,
            "NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTH"
          )
        : mustEnv(
            process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEAR,
            "NEXT_PUBLIC_PADDLE_PRICE_PRO_YEAR"
          );

    case "PRO_PLUS":
      return interval === "MONTH"
        ? mustEnv(
            process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_PLUS_MONTH,
            "NEXT_PUBLIC_PADDLE_PRICE_PRO_PLUS_MONTH"
          )
        : mustEnv(
            process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_PLUS_YEAR,
            "NEXT_PUBLIC_PADDLE_PRICE_PRO_PLUS_YEAR"
          );

    default:
      return assertNever(plan);
  }
}

/**
 * Получить priceId для top-up пакетов
 */
export function getTopupPriceId(pack: TopUpPack): string {
  switch (pack) {
    case 200:
      return mustEnv(
        process.env.NEXT_PUBLIC_PADDLE_PRICE_TOPUP_200,
        "NEXT_PUBLIC_PADDLE_PRICE_TOPUP_200"
      );
    case 500:
      return mustEnv(
        process.env.NEXT_PUBLIC_PADDLE_PRICE_TOPUP_500,
        "NEXT_PUBLIC_PADDLE_PRICE_TOPUP_500"
      );
    case 1000:
      return mustEnv(
        process.env.NEXT_PUBLIC_PADDLE_PRICE_TOPUP_1000,
        "NEXT_PUBLIC_PADDLE_PRICE_TOPUP_1000"
      );
    default:
      return assertNever(pack);
  }
}

/**
 * Helper: гарантирует наличие ENV
 */
function mustEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * Exhaustive type safety
 */
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}
