"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { useGlobalDialog } from "@/components/GlobalDialogProvider";
import { useAuth } from "@/context/AuthContext";

type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault?: boolean;
};

export default function AddCreditsModal(props: {
  open: boolean;
  onClose: () => void;
  defaultPaymentMethodId: string;
  paymentMethods: PaymentMethod[];
  onAddPaymentMethod: () => void;
  onAdded: () => void;
}) {

  const { user, me } = useAuth();
  const authed = !!user;

  const dlg = useGlobalDialog();
  const [amount, setAmount] = useState<string>("10");
  const [methodId, setMethodId] = useState<string>("");

  const [phase, setPhase] = useState<"idle" | "loading">("idle");

  const canSubmit = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 && (methodId || props.defaultPaymentMethodId);
  }, [amount, methodId, props.defaultPaymentMethodId]);

  if (!props.open) return null;

  const selectedId = methodId || props.defaultPaymentMethodId;

  async function submit() {
    if (!authed) {
      await dlg.alert("Not authorized", { title: "Error" });
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;

    try {
      setPhase("loading");
      await apiFetch<{ ok: true }>("/billing/credits/add", {
        method: "POST",
        body: { amount: n, paymentMethodId: selectedId },
      });
      props.onAdded();
    } catch (e: unknown) {
      await dlg.alert(getErrorMessage(e), { title: "Failed to add credits" });
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Add credits</div>
            <div className="text-xs text-slate-500 mt-1">Top up your credit balance.</div>
          </div>
          <button
            className="rounded-lg border border-slate-800 px-2 py-1 text-sm hover:bg-slate-900"
            onClick={props.onClose}
            disabled={phase === "loading"}
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Amount to add</div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-blue-600"
              inputMode="decimal"
              placeholder="10"
            />
          </div>

          <div>
            <div className="text-xs text-slate-500 mb-1">Card</div>

            {props.paymentMethods.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                <div className="text-sm text-slate-300">No payment methods.</div>
                <button
                  className="mt-2 text-sm text-blue-300 hover:text-blue-200"
                  onClick={props.onAddPaymentMethod}
                >
                  Add payment method
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedId}
                  onChange={(e) => setMethodId(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm outline-none focus:border-blue-600"
                >
                  {props.paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.brand.toUpperCase()} •••• {m.last4} (exp {String(m.expMonth).padStart(2, "0")}/{m.expYear})
                      {m.isDefault ? " — default" : ""}
                    </option>
                  ))}
                </select>

                <button
                  className="text-sm text-blue-300 hover:text-blue-200"
                  onClick={props.onAddPaymentMethod}
                >
                  Add payment method
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <button
            className="rounded-xl border border-slate-800 px-3 py-2 text-sm hover:bg-slate-900"
            onClick={props.onClose}
            disabled={phase === "loading"}
          >
            Cancel
          </button>
          <button
            className={[
              "rounded-xl px-3 py-2 text-sm font-medium",
              canSubmit ? "bg-blue-500/70 hover:bg-blue-500/85" : "bg-slate-800 text-slate-500 cursor-not-allowed",
            ].join(" ")}
            onClick={() => void submit()}
            disabled={!canSubmit || phase === "loading"}
          >
            {phase === "loading" ? "Processing…" : "Add credits"}
          </button>
        </div>
      </div>
    </div>
  );
}
