import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'tp_oturum';
const SESSION_DAYS = 14;

export interface AuthEnv {
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
}

function secret(env: AuthEnv): string {
  // Ayrı bir anahtar verilmezse şifreden türetilir: şifre değişince tüm oturumlar düşer.
  return env.SESSION_SECRET || `tp:${env.ADMIN_PASSWORD ?? ''}`;
}

function sign(payload: string, env: AuthEnv): string {
  return createHmac('sha256', secret(env)).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string, env: AuthEnv): boolean {
  if (!env.ADMIN_PASSWORD) return false;
  return safeEqual(input, env.ADMIN_PASSWORD);
}

export function createSessionCookie(env: AuthEnv, secure: boolean): string {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const token = `${exp}.${sign(String(exp), env)}`;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function isAdmin(req: Request, env: AuthEnv): boolean {
  if (!env.ADMIN_PASSWORD) return false;
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!m) return false;
  const token = m.slice(COOKIE_NAME.length + 1);
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp, env));
}
