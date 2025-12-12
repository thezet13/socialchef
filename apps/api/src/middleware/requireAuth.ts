// apps/api/src/middleware/requireAuth.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

export interface AuthInfo {
  userId: string;
  tenantId: string;
}

// Дополняем тип Express.Request, чтобы был req.auth
declare global {
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers['authorization'];

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header is missing or invalid' });
    }

    const token = header.substring('Bearer '.length).trim();

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set');
      return res.status(500).json({ error: 'Server is not configured for JWT' });
    }

    const decoded = jwt.verify(token, jwtSecret as any) as JwtPayload;

    const userId = typeof decoded.sub === 'string' ? decoded.sub : undefined;
    const tenantId = decoded.tenantId as string | undefined;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    req.auth = { userId, tenantId };
    return next();
  } catch (err) {
    console.error('[requireAuth] error', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
