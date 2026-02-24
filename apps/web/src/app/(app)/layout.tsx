import type { ReactNode } from "react";
import RequireAuth from "./_components/RequireAuth";
import AppShell from "./_components/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
