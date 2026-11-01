import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Cloudflare adds X-Origin-Auth (Transform Rule) to every request for the API domain, so a request without it skipped Cloudflare's WAF:
//   - Off when ORIGIN_AUTH_SECRET is unset (local dev, or before the Cloudflare rule exists)
//   - /health is exempt: Railway's health check reaches the service directly, never through Cloudflare
//   - Both sides are trimmed: a secret copied with `| pbcopy` carries a trailing newline that Cloudflare's header value drops
export function originAuthorized(header: string | string[] | undefined, secret: string | undefined): boolean {
  if (!secret?.trim()) return true;
  if (typeof header !== 'string') return false;
  const a = Buffer.from(header.trim());
  const b = Buffer.from(secret.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireOriginAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health' || originAuthorized(req.headers['x-origin-auth'], process.env.ORIGIN_AUTH_SECRET)) return next();
  res.status(403).json({ error: 'Forbidden' });
}
