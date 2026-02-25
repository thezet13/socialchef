"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/apiClient";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../lib/getErrorMessage";
import { useGlobalDialog } from "../../components/GlobalDialogProvider";

type Plan = "FREE" | "PRO" | "PRO_PLUS";
type PaidPlan = Exclude<Plan, "FREE">;

type MeResponse = {
  user: { email: string; fullName: string | null };
  tenant: {
    name: string;
    plan: Plan;
    creditsBalance: number;
  };
};

function planLabel(p: Plan) {
  if (p === "FREE") return "Free";
  if (p === "PRO") return "Pro";
  return "Pro+";
}

export default function AccountPage() {
  const { user } = useAuth();
  const authed = !!user;

  const dlg = useGlobalDialog();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Billing modals
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan | null>(null);
  const [showTopup, setShowTopup] = useState(false);

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [tenantName, setTenantName] = useState("");

  const [savingName, setSavingName] = useState(false);
  const [savingTenant, setSavingTenant] = useState(false);

  // Change password
  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    async function load() {
      if (!authed) return;
      try {
        setLoading(true);
        const r = await apiFetch<MeResponse>("/auth/me");
        setMe(r);
        setFullName(r.user.fullName ?? "");
        setTenantName(r.tenant.name ?? "");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authed]);

  const email = me?.user.email ?? "";
  const isFree = me?.tenant.plan === "FREE";

  const dirtyName = useMemo(() => {
    if (!me) return false;
    return (me.user.fullName ?? "") !== fullName.trim();
  }, [me, fullName]);

  const dirtyTenant = useMemo(() => {
    if (!me) return false;
    return (me.tenant.name ?? "") !== tenantName.trim();
  }, [me, tenantName]);

  async function reloadMe() {
    if (!authed) return;
    const r = await apiFetch<MeResponse>("/auth/me");
    setMe(r);
    setFullName(r.user.fullName ?? "");
    setTenantName(r.tenant.name ?? "");
  }

  async function saveName() {
    if (!authed || !me) return;
    const next = fullName.trim();
    setSavingName(true);
    try {
      await apiFetch("/auth/profile", {method: "POST", body: { fullName: next } });
      await reloadMe();
      await dlg.alert("Saved.", { title: "Done", okText: "OK" });
    } catch (e) {
      await dlg.alert(getErrorMessage(e), { title: "Error", okText: "OK" });
    } finally {
      setSavingName(false);
    }
  }

  async function saveTenant() {
    if (!authed || !me) return;
    const next = tenantName.trim();
    setSavingTenant(true);
    try {
      await apiFetch("/auth/restaurant", { method: "POST", body: { name: next } });
      await reloadMe();
      await dlg.alert("Saved.", { title: "Done", okText: "OK" });
    } catch (e) {
      await dlg.alert(getErrorMessage(e), { title: "Error", okText: "OK" });
    } finally {
      setSavingTenant(false);
    }
  }

  async function changePassword() {
    if (!authed) return;

    const cur = pwdCurrent;
    const n = pwdNew;
    const c = pwdConfirm;

    if (!cur || !n || !c) {
      await dlg.alert("Please fill all password fields.", { title: "Warning", okText: "OK" });
      return;
    }
    if (n.length < 8) {
      await dlg.alert("New password must be at least 8 characters.", { title: "Warning", okText: "OK" });
      return;
    }
    if (n !== c) {
      await dlg.alert("New password and confirmation do not match.", { title: "Warning", okText: "OK" });
      return;
    }

    const ok = await dlg.confirm("Change password now?", {
      title: "Confirm",
      okText: "Change",
      cancelText: "Cancel",
    });
    if (!ok) return;

    setChangingPwd(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: { currentPassword: cur, newPassword: n },
      });

      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");

      await dlg.alert("Password updated.", { title: "Done", okText: "OK" });
    } catch (e) {
      await dlg.alert(getErrorMessage(e), { title: "Error", okText: "OK" });
    } finally {
      setChangingPwd(false);
    }
  }

  if (loading || !me) {
    return <div className="p-10 text-slate-400">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-8 pt-10 pb-16 text-slate-200">
      <div className="flex items-end justify-between gap-4 mt-8">
        <div>
          <h1 className="text-2xl font-semibold">User settings</h1>
          <div className="text-sm text-slate-400 mt-1">Manage profile, restaurant and security</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile */}
          <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg text-slate-200">Profile</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="md:col-span-1">
                <label className="text-xs text-slate-400">Name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  placeholder="Your name"
                />
              </div>

              {/* Email disabled */}
              <div className="md:col-span-1">
                <label className="text-xs text-slate-400">Email</label>
                <input
                  value={email}
                  disabled
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/20 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFullName(me.user.fullName ?? "")}
                  disabled={!dirtyName || savingName}
                  className={[
                    "rounded-md px-4 py-2 text-sm border border-slate-800",
                    dirtyName && !savingName
                      ? "hover:border-slate-700 hover:bg-slate-950/40"
                      : "opacity-50 cursor-not-allowed",
                  ].join(" ")}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => void saveName()}
                  disabled={!dirtyName || savingName}
                  className={[
                    "rounded-md px-4 py-2 text-sm font-medium border",
                    dirtyName && !savingName
                      ? "border-blue-500/50 bg-blue-500/50 hover:bg-blue-500/70"
                      : "opacity-50 cursor-not-allowed border-slate-800",
                  ].join(" ")}
                >
                  {savingName ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* Restaurant */}
          <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/50">
            <div className="text-lg text-slate-200">Restaurant / Cafe</div>

            <div className="mt-3">
              <input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
                placeholder="Restaurant name"
              />

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setTenantName(me.tenant.name ?? "")}
                  disabled={!dirtyTenant || savingTenant}
                  className={[
                    "rounded-md px-4 py-2 text-sm border border-slate-800",
                    dirtyTenant && !savingTenant
                      ? "hover:border-slate-700 hover:bg-slate-950/40"
                      : "opacity-50 cursor-not-allowed",
                  ].join(" ")}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => void saveTenant()}
                  disabled={!dirtyTenant || savingTenant}
                  className={[
                    "rounded-md px-4 py-2 text-sm font-medium border",
                    dirtyTenant && !savingTenant
                      ? "border-blue-500/50 bg-blue-500/50 hover:bg-blue-500/70"
                      : "opacity-50 cursor-not-allowed border-slate-800",
                  ].join(" ")}
                >
                  {savingTenant ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/50">
            <div className="text-lg text-slate-200">Change password</div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400">Current password</label>
                <input
                  type="password"
                  value={pwdCurrent}
                  onChange={(e) => setPwdCurrent(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">New password</label>
                <input
                  type="password"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400">Confirm new password</label>
                <input
                  type="password"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-slate-600"
                  placeholder="Repeat new password"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPwdCurrent("");
                    setPwdNew("");
                    setPwdConfirm("");
                  }}
                  disabled={changingPwd}
                  className={[
                    "rounded-md px-4 py-2 text-sm border border-slate-800",
                    !changingPwd ? "hover:border-slate-700 hover:bg-slate-950/40" : "opacity-50 cursor-not-allowed",
                  ].join(" ")}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => void changePassword()}
                  disabled={changingPwd}
                  className={[
                    "rounded-md px-4 py-2 text-sm font-medium border",
                    !changingPwd
                      ? "border-blue-500/50 bg-blue-500/50 hover:bg-blue-500/70"
                      : "opacity-50 cursor-not-allowed border-slate-800",
                  ].join(" ")}
                >
                  {changingPwd ? "Updating..." : "Update password"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-1">
          <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/50 sticky top-24">
            <div className="text-sm text-slate-300">Current plan</div>

            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="text-[24px] leading-none">{planLabel(me.tenant.plan)}</div>
            </div>

            <div className="mt-4">
              {isFree ? (
                <button
                  onClick={() => setCheckoutPlan("PRO")}
                  className="rounded-md px-4 py-2 text-sm font-medium border border-blue-500/50 bg-blue-500/50 hover:bg-blue-500/70"
                >
                  Upgrade
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setCheckoutPlan("PRO")}
                    className="rounded-nd px-4 py-2 text-sm border border-slate-800 hover:border-slate-700 hover:bg-slate-950/40"
                  >
                    Change plan
                  </button>

                  <button
                    onClick={() => setShowTopup(true)}
                    className="rounded-nd px-4 py-2 text-sm font-medium border border-blue-500/50 bg-blue-500/50 hover:bg-blue-500/70"
                  >
                    Add credits
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 text-xs text-slate-500">
              Plan changes and top-ups open the billing modal.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
