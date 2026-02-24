import { useEffect, useState } from "react";

type Interval = "MONTH" | "YEAR";

export default function BillingCheckoutModal({
  plan,
  interval: initialInterval = "MONTH", // 👈 добавили
  onClose,
}: {
  plan: "PRO" | "PRO_PLUS";
  interval?: Interval; // 👈 добавили
  onClose: () => void;
}) {
  const [interval, setInterval] = useState<Interval>(initialInterval);

  // если проп изменится — синхронизируем
  useEffect(() => {
    setInterval(initialInterval);
  }, [initialInterval]);

  const isPro = plan === "PRO";

  const monthlyPrice = isPro ? 19 : 39;
  const yearlyPrice = isPro ? 179 : 369;

  const price =
    interval === "MONTH"
      ? `$${monthlyPrice.toFixed(2)}`
      : `$${yearlyPrice.toFixed(2)}`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 w-full max-w-lg">
        <div className="text-lg font-semibold">Order summary</div>

        {/* Interval toggle */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setInterval("MONTH")}
            className={`px-4 py-2 rounded-xl ${
              interval === "MONTH"
                ? "bg-blue-600"
                : "border border-slate-700"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("YEAR")}
            className={`px-4 py-2 rounded-xl ${
              interval === "YEAR"
                ? "bg-blue-600"
                : "border border-slate-700"
            }`}
          >
            Yearly (-20%)
          </button>
        </div>

        <div className="mt-6 text-2xl font-semibold">{price}</div>

        {interval === "MONTH" ? (
          <div className="text-sm text-slate-400">
            then {price} monthly
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            billed annually
          </div>
        )}

        <div className="mt-6 text-sm">
          Plan: {isPro ? "Pro" : "Pro+"}
        </div>

        <div className="mt-4 text-sm text-slate-400">
          VAT: Calculated at checkout
        </div>

        <div className="mt-4 text-sm">
          Due today: {price}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="border border-slate-700 bg-slate-900 px-4 py-2 rounded-md w-full"
          >
            Cancel
          </button>

          <button className="bg-blue-500/50 hover:bg-blue-500/70 px-4 py-2 rounded-md w-full">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
