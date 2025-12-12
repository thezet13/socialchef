// apps/api/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { Secret } from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/requireAuth';

const authRouter = Router();

interface RegisterBody {
  email: string;
  password: string;
  fullName?: string;
  restaurantName: string;
}

// Вспомогалка: текущий биллинговый период (месяц)
function getCurrentPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

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

    return res.status(201).json({
      token,
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

interface LoginBody {
  email: string;
  password: string;
}

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

    // Выбираем tenant:
    // 1) если он owner хотя бы одного
    // 2) иначе первый из memberships
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
      },
      secret,
      { expiresIn: jwtExpiresIn as any }
    );

    return res.json({
      token,
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

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { userId, tenantId } = req.auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
      },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        locale: true,
        createdAt: true,
      },
    });

    if (!user || !tenant) {
      return res.status(404).json({ error: 'User or tenant not found' });
    }

    return res.json({
      user,
      tenant,
    });
  } catch (err) {
    console.error('[GET /auth/me] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


export { authRouter };
