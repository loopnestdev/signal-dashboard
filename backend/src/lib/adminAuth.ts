import type { NextFunction, Request, Response } from 'express';
import { selectRows } from './supabaseRest.js';

// Write endpoints are public on Railway, so they require the caller's Supabase session (Authorization: Bearer <access token>)
// and an admin profile in signal.user_profiles.
//   - Locally (not on Railway) a loopback request without a token is allowed, so the no-auth dev preview can save
//   - The token is verified by Supabase itself (/auth/v1/user), never decoded locally
export function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

const onRailway = () => Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME);

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    if (!onRailway() && isLoopback(req.socket.remoteAddress)) {
      res.locals.adminEmail = 'local-dev';
      return next();
    }
    res.status(401).json({ error: 'Sign in as an admin to change settings' });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !apiKey) {
    res.status(503).json({ error: 'Supabase not configured on the server' });
    return;
  }

  try {
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!userRes.ok) {
      res.status(401).json({ error: 'Session expired - sign in again' });
      return;
    }
    const user = (await userRes.json()) as { id?: string; email?: string };
    const [profile] = await selectRows<{ is_admin: boolean }>('user_profiles', `select=is_admin&id=eq.${encodeURIComponent(user.id ?? '')}`);
    if (!profile?.is_admin) {
      res.status(403).json({ error: 'Only admins can change settings' });
      return;
    }
    res.locals.adminEmail = user.email ?? user.id;
    next();
  } catch (err) {
    console.warn('[auth] admin check failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Could not verify sign-in' });
  }
}
