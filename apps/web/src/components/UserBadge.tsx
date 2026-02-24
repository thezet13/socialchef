"use client";

import * as React from "react";
import { useAuth } from "@/context/AuthContext";
import { useCapabilities } from "@/features/auth/useCapabilities";
import { Flame } from "lucide-react";

export function UserBadge() {
  const { me, user } = useAuth();
  const { cap, loading, error } = useCapabilities();

  if (!me && !user) return null;

  const fullName = user?.fullName?.trim();
  const userLabel = fullName || user?.email || "User";
  const tenantLabel = me?.tenant?.name || "—";
  const plan = loading ? "…" : cap.plan;

  const credits =
    typeof me?.tenant?.creditsBalance === "number"
      ? me.tenant.creditsBalance
      : null;

  return (
    
    <div className="flex gap-3 text-xs items-center">
      <div className="font-bold text-slate-100">{plan}</div>
      <span className="text-slate-600">|</span>
      <div className="text-slate-100 flex gap-1">
        <Flame className="w-4 h-4 text-orange-500" />{" "}
        <span className={credits !== null && credits <= 0 ? "text-sm text-red-500" : "text-sm text-orange-500"}>
          {credits ?? "—"}
        </span>
      </div>
      <span className="text-slate-600">|</span>
      <div className="text-slate-100 font-medium">{userLabel}</div>
      <div className="text-slate-400">({tenantLabel})</div>

      {error && (
        <div className="ml-2 text-red-300" title={error}>
          !
        </div>
      )}
    </div>
  );
}
