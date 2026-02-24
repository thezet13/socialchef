import { useAuth } from "@/context/AuthContext";

export function applyCreditsFromResponse(
  r: unknown,
  setCreditsBalance: (n: number) => void
): boolean {
  if (
    r &&
    typeof r === "object" &&
    "creditsBalance" in r &&
    typeof (r as { creditsBalance?: unknown }).creditsBalance === "number"
  ) {
    setCreditsBalance((r as { creditsBalance: number }).creditsBalance);
    return true;
  }
  return false;
}
