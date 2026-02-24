"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useState, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { UserBadge } from "@/components/UserBadge";
import { Portal } from "@/lib/portal";
import Image from "next/image";
import { Globe } from "lucide-react";
import { useI18n } from "@/i18n/LanguageProvider";
import type { Lang } from "@/i18n/i18n";


export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();

  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [langOpen, setLangOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const { lang, setLang, t } = useI18n();

  // refs for "outside click"
  const langRef = useRef<HTMLDivElement | null>(null);
  const userRef = useRef<HTMLDivElement | null>(null);

  // refs to anchor buttons (for positioning)
  const langBtnRef = useRef<HTMLButtonElement | null>(null);
  const userBtnRef = useRef<HTMLButtonElement | null>(null);

  // menu positions in viewport coords
  const [langPos, setLangPos] = useState<{ top: number; right: number } | null>(null);
  const [userPos, setUserPos] = useState<{ top: number; right: number } | null>(null);

  // if you need to know superadmin globally for menu
  const isSuperAdmin = user?.role === "SUPERADMIN";

  const langItems = useMemo(
    () =>
      [
        { code: "en", label: t("lang.en") ?? "English" },
        { code: "ru", label: t("lang.ru") ?? "Русский" },
      ] as const satisfies ReadonlyArray<{ code: Lang; label: string }>,
    [t]
  );

  const nav = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/kitchen", label: "Editor" },
  ];

  function computeRightTopFromButton(btn: HTMLButtonElement) {
    const r = btn.getBoundingClientRect();
    // fixed dropdown anchored to the button's bottom-right
    const top = r.bottom + 8; // gap
    const right = window.innerWidth - r.right; // distance from viewport right
    return { top, right };
  }


  useEffect(() => {
    const onScroll = () => {
      document.documentElement.style.setProperty(
        "--nav-hidden",
        window.scrollY >= 10 ? "1" : "0"
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // open / close + compute initial position
  useEffect(() => {
    function updatePositions() {
      if (langOpen && langBtnRef.current) setLangPos(computeRightTopFromButton(langBtnRef.current));
      if (userOpen && userBtnRef.current) setUserPos(computeRightTopFromButton(userBtnRef.current));
    }

    // When open: compute once, and keep updated on scroll/resize (important!)
    if (langOpen || userOpen) {
      updatePositions();
      window.addEventListener("resize", updatePositions);
      // capture scroll from any scroll container (your <main> is scrollable)
      window.addEventListener("scroll", updatePositions, true);

      return () => {
        window.removeEventListener("resize", updatePositions);
        window.removeEventListener("scroll", updatePositions, true);
      };
    }
  }, [langOpen, userOpen]);

  // close on outside click / ESC
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;

      if (langRef.current && !langRef.current.contains(t)) setLangOpen(false);
      if (userRef.current && !userRef.current.contains(t)) setUserOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLangOpen(false);
        setUserOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* HEADER (top) */}
      <header className="fixed top-0 left-0 right-0 z-1 px-6 pt-4 pb-4 flex items-center justify-between
      g-slate-900/0 backdrop-blur-md border-none border-slate-900/80"
      >
        <div className="">
          <h1 className="text-lg font-semibold">
            <Link href="/kitchen">
              <Image
                src="/logos/sc-logo-v7.png"
                alt="SocialChef logo"
                width={250}
                height={100}
                style={{ height: "auto" }}
                priority
              />
            </Link>
          </h1>
          <p className="hidden text-xs text-slate-400">{user?.fullName || user?.email}</p>
        </div>

        <div className="nav bg-slate-950/70 rounded-lg backdrop-blur-md p-2 px-0">
          <div className="flex w-auto justify-end mr-10 gap-2">
            
            <nav className="space-y-1 gap-2">
              {isSuperAdmin && (<>
              {nav.map((x) => {
                const active = pathname === x.href || pathname?.startsWith(x.href + "/");
                return (
                  <Link
                    key={x.href}
                    href={x.href}
                    className={
                      "rounded-md px-3 py-2 text-sm " +
                      (active ? "bg-slate-800" : "hover:bg-slate-900")
                    }
                  >
                    {x.label}
                  </Link>
                );
              })}

              
                <Link
                  className="rounded-md px-3 py-2 text-sm hover:bg-slate-900 text-blue-500"
                  href="/presets"
                >
                  Presets
                </Link>
              </>)}
            </nav>
          </div>
        </div>

        <div className="flex gap-3 items-center">
          {/* 1) Language */}
          <div className="relative" ref={langRef}>
            <button
              ref={langBtnRef}
              type="button"
              onClick={() => {
                setLangOpen((v) => {
                  const next = !v;
                  if (next && langBtnRef.current) setLangPos(computeRightTopFromButton(langBtnRef.current));
                  return next;
                });
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border-none border-slate-700 hover:bg-slate-800"
              title="Language"
            >
              <span className="text-lg text-blue-500">
                <Globe size={22} />
              </span>
            </button>

            {langOpen && langPos && (
              <Portal>
                <div
                  className="fixed z-[9999] w-40 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl"
                  style={{ top: langPos.top, right: langPos.right }}
                >
                  {langItems.map((x) => (
                    <button
                      key={x.code}
                      type="button"
                      onClick={() => {
                        setLang(x.code);
                        setLangOpen(false);
                      }}
                      className={
                        "w-full px-3 py-2 text-left text-sm hover:bg-slate-900 " +
                        (lang === x.code ? "text-blue-500" : "text-slate-200")
                      }
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </Portal>
            )}
          </div>

          {/* 2) User menu */}
          <div className="relative" ref={userRef}>
            <button
              ref={userBtnRef}
              type="button"
              onClick={() => {
                setUserOpen((v) => {
                  const next = !v;
                  if (next && userBtnRef.current) setUserPos(computeRightTopFromButton(userBtnRef.current));
                  return next;
                });
              }}
              className="flex items-center gap-2 rounded-xl border border-slate-700 hover:bg-slate-800 px-3 py-2"
              title="User"
            >
              <UserBadge />
              <span className="text-slate-400 text-lg"></span>
            </button>

            {userOpen && userPos && (
              <Portal>
                <div
                  className="fixed z-[9999] w-44 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl"
                  style={{ top: userPos.top, right: userPos.right }}
                >
                  <Link
                    href="/billing"
                    onClick={() => setUserOpen(false)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-900"
                  >
                    Billing
                  </Link>


                  <div className="h-px bg-slate-800" />
                  <Link
                    href="/account"
                    onClick={() => setUserOpen(false)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-900"
                  >
                    User settings
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setUserOpen(false);
                      logout();
                      router.push("/login");
                    }}
                    className="z-100 top-40 left-40 w-full px-3 py-2 text-left text-sm hover:bg-slate-900"
                  >
                    Logout
                  </button>
                </div>
              </Portal>
            )}
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 min-h-0">
        {/* CONTENT */}
        <main className="flex-1 pt-0 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
