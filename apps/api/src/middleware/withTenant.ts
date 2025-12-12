import { Request, Response, NextFunction } from 'express';

/**
 * Предполагает, что до него уже отработал requireAuth
 * и положил { userId, tenantId } в req.auth
 */
export function withTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Unauthorized (no auth info)' });
  }

  const { userId, tenantId } = req.auth;

  if (!userId || !tenantId) {
    return res.status(401).json({ error: 'Unauthorized (no userId/tenantId)' });
  }

  // Если хочешь, можно продублировать в res.locals:
  res.locals.userId = userId;
  res.locals.tenantId = tenantId;

  return next();
}
