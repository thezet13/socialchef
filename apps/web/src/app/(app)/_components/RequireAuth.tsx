"use client";

import { ReactNode, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import Image from "next/image";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/kitchen")}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="relative flex items-center justify-center">

          <Spinner size={96} thickness={8} />

          <div className="absolute inset-0 flex items-center justify-center">
            <Image
              src="/logos/sc-icon.png"
              alt="SocialChef logo"
              width={36}
              height={48}
              style={{ height: "auto" }}
              priority
            />
          </div>

        </div>
      </div>

    );
  }

  if (!user) return null;

  return <>{children}</>;
}
