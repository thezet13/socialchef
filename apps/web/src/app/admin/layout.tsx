"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";


function NavItem(props: { href: string; label: string }) {
    const pathname = usePathname();
    const isDashboard = props.href === "/admin";

    const active = isDashboard
        ? pathname === "/admin" // только точное совпадение
        : pathname === props.href || pathname.startsWith(props.href + "/");

    return (
        <Link
            href={props.href}
            className={[
                "block rounded-xl px-3 py-2 text-sm border transition",
                active
                    ? "border-orange-500/50 bg-orange-500/10 text-slate-100"
                    : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700 hover:bg-slate-950/60",
            ].join(" ")}
        >
            {props.label}
        </Link>
    );
}


export default function AdminLayout({ children }: { children: ReactNode }) {

    const router = useRouter();

    const { user, logout } = useAuth();
    const authed = !!user;

    const [mounted, setMounted] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    // NOTE: Тут можно добавить проверку isSuperadmin, если в /auth/me ты возвращаешь role.
    // Если нет — просто показывай, а API всё равно не пустит.

    return (
        <div className="w-full bg-slate-950">
            <div className="max-w-10xl mx-auto px-4 py-6">
                <div className="flex items-start gap-4">
                    <aside className="w-64 shrink-0">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                            <div className="text-xs text-slate-400">Admin</div>
                            <div className="text-sm font-semibold text-slate-100 mt-1">SocialChef</div>

                            <div className="mt-3 space-y-2">
                                <NavItem href="/admin" label="Dashboard" />
                                <NavItem href="/admin/tenants" label="Tenants" />
                                <NavItem href="/admin/usage" label="Usage" />
                                <NavItem href="/admin/storage" label="Files & Retention" />
                                <NavItem href="/admin/audit" label="Audit Logs" />
                                <br /><br />
                                <button
                                    type="button"
                                    onClick={() => {
                                        logout();
                                        router.push("/login");
                                    }}
                                    className="z-100 top-40 left-40 w-full px-3 py-2 text-left text-sm hover:bg-slate-900"
                                >
                                    Logout
                                </button>
                            </div>

                            {!authed ? (
                                <div className="mt-3 text-xs text-red-300">
                                    Not authorized. Admin API will be locked.
                                </div>
                            ) : null}
                        </div>
                    </aside>

                    <main className="flex-1">{children}</main>
                </div>
            </div>
        </div>
    );
}
