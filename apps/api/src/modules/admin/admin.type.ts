export type AdminOverviewRange = "24h" | "7d" | "30d";

export type OverviewResponse = {
  range: AdminOverviewRange;

  kpi: {
    tenantsTotal: number;
    usersTotal: number;
    tenantsActive: number;
    creditsSpent: number; // sum of -deltaCredits (abs)
  };

  topTenants: {
    tenantId: string;
    tenantName: string;
    ownerName: string | null;
    ownerEmail: string | null;
    creditsSpent: number;
  }[];

  recentUsage: {
    id: string;
    createdAt: string; // ISO
    actionType: string; // CreditLedger.action
    creditsCost: number; // abs(deltaCredits)
    tenant: { id: string; name: string };
    user: { id: string; email: string } | null; // пока null (в CreditLedger нет userId)
  }[];
};