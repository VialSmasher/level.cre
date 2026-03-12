import type { RequestHandler } from 'express';
import { randomUUID } from 'crypto';

export const devUser = (): RequestHandler => {
  return (req, res, next) => {
    // Only active in development (use Express env fallback)
    const nodeEnv = process.env.NODE_ENV || req.app?.get('env');
    if (nodeEnv !== 'development') return next();

    // Preserve real auth and explicit demo mode. This middleware is only a local fallback.
    if (req.headers.authorization?.startsWith('Bearer ') || req.headers['x-demo-mode'] === 'true') {
      return next();
    }

    const signed = (req as any).signedCookies;
    let uid = signed?.dev_uid;
    if (!uid) {
      uid = randomUUID();
      res.cookie('dev_uid', uid, {
        httpOnly: true,
        sameSite: 'lax',
        signed: true,
      });
    }

    // 1 user = 1 org in dev so data naturally scopes
    (req as any).user = { id: uid, user_id: uid, org_id: uid };
    next();
  };
};
