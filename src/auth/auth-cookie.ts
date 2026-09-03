import { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE = 'refresh_token';

function parseDurationMs(v: string | undefined, fallbackMs: number): number {
  const m = /^(\d+)\s*([smhd])$/.exec((v ?? '').trim());
  if (!m) return fallbackMs;
  const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2]]!;
  return Number(m[1]) * mult;
}

function cookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd, // required whenever sameSite is 'none'
    sameSite: isProd ? 'none' : 'lax', // cross-site (Vercel<->Render) in prod
    path: '/api/v1/auth', // only sent to auth routes, not every request
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(),
    maxAge: parseDurationMs(process.env.JWT_REFRESH_TOKEN_EXPIRY, 7 * 864e5),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}
