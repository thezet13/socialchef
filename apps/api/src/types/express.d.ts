import "express";

export type AuthRole = "USER" | "SUPERADMIN";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string;
        role: AuthRole;
      };
    }
  }
}

export {};