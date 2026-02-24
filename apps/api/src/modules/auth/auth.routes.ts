// apps/api/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import crypto from "crypto";

import bcrypt from 'bcryptjs';
import jwt, { Secret } from 'jsonwebtoken';
import { z } from "zod";
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/requireAuth';
import { PlanType, SubscriptionStatus } from "@prisma/client";
import { withTenant } from "../../middleware/withTenant";
import { LoginBody, RegisterBody } from './auth.service';
import { FREE_START_CREDITS } from '../billing/credits.guard';
import { COOKIE_AUTH, COOKIE_CSRF, getCookieOptions, getCsrfCookieOptions } from "../../config/cookies";

const authRouter = Router();



function makeCsrfToken() {
  return crypto.randomBytes(24).toString("hex");
}

// Вспомогалка: текущий биллинговый период (месяц)
function getCurrentPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

authRouter.get("/csrf", (req, res) => {
  if (!req.csrfToken) return res.status(500).json({ error: "CSRF middleware not initialized" });
  res.json({ csrfToken: req.csrfToken() });
});

authRouter.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, restaurantName } = req.body as RegisterBody;

    if (!email || !password || !restaurantName) {
      return res.status(400).json({ error: 'email, password и restaurantName are required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'User with such e-mail already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { start, end } = getCurrentPeriod();

    const result = await prisma.$transaction(async (tx) => {
      // 1) User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: fullName ?? null,
        },
      });

      // 2) Tenant (ресторан)
      const tenant = await tx.tenant.create({
        data: {
          name: restaurantName,
          ownerId: user.id,
          locale: 'en', // потом можно сделать из body
        },
      });

      // 3) UserTenant (роль OWNER)
      await tx.userTenant.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'OWNER',
        },
      });

      // 4) Subscription (FREE)
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: 'FREE',
          interval: 'MONTH',
          priceCents: 0,
          currency: 'usd',
        },
      });

      // 5) AIUsagePeriod — текущий месяц
      await tx.aIUsagePeriod.create({
        data: {
          tenantId: tenant.id,
          periodStart: start,
          periodEnd: end,
        },
      });



      // 6) TenantCreditBalance — создаём сразу (НЕ лениво)
      await tx.tenantCreditBalance.create({
        data: {
          tenantId: tenant.id,
          balanceCredits: FREE_START_CREDITS, // 5
        },
      });

      // 7) CreditLedger — фиксируем “signup bonus”
      await tx.creditLedger.create({
        data: {
          tenantId: tenant.id,
          action: "SIGNUP_BONUS",
          deltaCredits: FREE_START_CREDITS,
          metaJson: {
            userId: user.id,
            plan: "FREE",
          },
        },
      });

      return { user, tenant };
    });

    const jwtSecret = process.env.JWT_SECRET;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

    if (!jwtSecret) {
      console.error('JWT_SECRET is not set');
      return res.status(500).json({ error: 'Server is not configured for JWT' });
    }

    const secret: Secret = jwtSecret;

    const token = jwt.sign(
      {
        sub: result.user.id,
        tenantId: result.tenant.id,
        role: 'OWNER',
      },
      secret,
      { expiresIn: jwtExpiresIn as any }
    );

    const csrf = makeCsrfToken();

    res.cookie(COOKIE_AUTH, token, getCookieOptions());
    res.cookie(COOKIE_CSRF, csrf, getCsrfCookieOptions());

    return res.status(201).json({
      ok: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
      },
    });
  } catch (err) {
    console.error('[POST /auth/register] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/login', async (req, res) => {

  try {
    const { email, password } = req.body as LoginBody;

    if (!email || !password) {
      return res.status(400).json({ error: 'email и password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            tenant: true,
          },
        },
        ownedTenants: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';

    if (!jwtSecret) {
      console.error('JWT_SECRET is not set');
      return res.status(500).json({ error: 'Server is not configured for JWT' });
    }

    const secret: Secret = jwtSecret;

    const tenant =
      user.ownedTenants[0] ??
      user.memberships[0]?.tenant ??
      null;

    if (!tenant) {
      return res
        .status(500)
        .json({ error: 'No workspaces (tenants) were found for the user.' });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        tenantId: tenant.id,
        role: user.role,
      },
      secret,
      { expiresIn: jwtExpiresIn as any }
    );

    const csrf = makeCsrfToken();

    res.cookie(COOKIE_AUTH, token, getCookieOptions());
    res.cookie(COOKIE_CSRF, csrf, getCsrfCookieOptions());

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
    });
  } catch (err) {
    console.error('[POST /auth/login] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get("/me", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.removeHeader("ETag");

    const userId = req.auth.userId;
    const tenantId = req.auth.tenantId;
    const role = req.auth.role;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
        role: true,
      },
    });

    let tenant: null | {
      id: string;
      name: string;
      locale: string | null;
      plan: PlanType;
      creditsBalance: number;
    } = null;

    if (tenantId) {
      const t = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, locale: true },
      });

      if (t) {
        const sub = await prisma.subscription.findUnique({
          where: { tenantId },
          select: { plan: true, status: true },
        });

        const plan: PlanType =
          sub && sub.status === SubscriptionStatus.ACTIVE ? sub.plan : PlanType.FREE;

        let creditsBalance = 0;

        const bal = await prisma.tenantCreditBalance.upsert({
          where: { tenantId },
          create: { tenantId, balanceCredits: FREE_START_CREDITS },
          update: {},
          select: { balanceCredits: true },
        });
        creditsBalance = bal.balanceCredits;


        tenant = { ...t, plan, creditsBalance };
      }
    }

    if (!user || !tenant) {
      return res.status(404).json({ error: "User or tenant not found" });
    }

    return res.json({
      user: { ...user, authRole: role },
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        creditsBalance: tenant.creditsBalance,
      } : null
    });
  } catch (err) {
    console.error("[GET /auth/me] error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/profile", requireAuth, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

    const userId = req.auth.userId;

    const schema = z.object({
      fullName: z.string().trim().min(1).max(120),
    });

    const { fullName } = schema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { fullName },
      select: { id: true, email: true, fullName: true },
    });

    return res.json({ user });
  } catch (err) {
    console.error("[POST /auth/profile] error", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/restaurant", requireAuth, withTenant, async (req, res) => {
  try {
    if (!req.auth) return res.status(401).json({ error: "Unauthorized" });

    const tenantId = req.auth.tenantId;
    if (!tenantId) return res.status(400).json({ error: "No tenant context" });

    const schema = z.object({
      name: z.string().trim().min(1).max(120),
    });

    const { name } = schema.parse(req.body);

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { name },
      select: { id: true, name: true, locale: true },
    });

    return res.json({ tenant });
  } catch (err) {
    console.error("[POST /auth/restaurant] error", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.auth.userId;

    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    });

    const { currentPassword, newPassword } = schema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[POST /auth/change-password] error", err);

    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input" });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_AUTH, getCookieOptions());
  res.clearCookie(COOKIE_CSRF, getCsrfCookieOptions());
  return res.json({ ok: true });
});


export { authRouter };
