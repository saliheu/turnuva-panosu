import { summarize } from '../src/engine/tournament';
import type { ChampionRecord, Tournament, TournamentSummary } from '../src/engine/types';
import { checkPassword, clearSessionCookie, createSessionCookie, isAdmin, type AuthEnv } from './auth';
import type { KV } from './store';

export interface SiteSettings {
  siteTitle: string;
  schoolName: string;
}

interface ChampionsDoc {
  version: number;
  items: ChampionRecord[];
}

interface RevEntry {
  version: number;
  label: string;
  savedAt: string;
}

const MAX_BODY = 3 * 1024 * 1024;
const MAX_REVISIONS = 40;
const DEFAULT_SETTINGS: SiteSettings = { siteTitle: 'Turnuva Panosu', schoolName: '' };

const K = {
  index: 'index',
  champions: 'champions',
  settings: 'settings',
  tournament: (id: string) => `t/${id}`,
  rev: (id: string, v: number) => `rev/${id}/${String(v).padStart(6, '0')}`,
  revlog: (id: string) => `revlog/${id}`,
  fails: 'auth/fails',
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function readBody<T>(req: Request): Promise<T> {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new HttpError(415, 'JSON bekleniyor');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Veri çok büyük');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Geçersiz JSON');
  }
}

function isPublic(t: Pick<Tournament, 'status' | 'archived'>): boolean {
  return t.status !== 'taslak' && !t.archived;
}

function validateTournament(t: Tournament): void {
  const ok =
    t &&
    typeof t.id === 'string' &&
    /^[a-z0-9-]{3,60}$/.test(t.id) &&
    typeof t.name === 'string' &&
    t.name.trim().length > 0 &&
    typeof t.sport === 'string' &&
    typeof t.schoolYear === 'string' &&
    ['taslak', 'devam', 'bitti'].includes(t.status) &&
    Array.isArray(t.teams) &&
    Array.isArray(t.stages) &&
    t.scoring &&
    typeof t.scoring === 'object';
  if (!ok) throw new HttpError(400, 'Turnuva verisi geçersiz');
}

async function loadIndex(store: KV): Promise<TournamentSummary[]> {
  return (await store.get<TournamentSummary[]>(K.index)) ?? [];
}

async function updateIndex(store: KV, t: Tournament): Promise<void> {
  const idx = await loadIndex(store);
  const s = summarize(t);
  const i = idx.findIndex((x) => x.id === t.id);
  if (i >= 0) idx[i] = s;
  else idx.push(s);
  await store.set(K.index, idx);
}

async function saveTournament(store: KV, t: Tournament, label: string): Promise<Tournament> {
  await store.set(K.tournament(t.id), t);
  await store.set(K.rev(t.id, t.version), t);
  const log = (await store.get<RevEntry[]>(K.revlog(t.id))) ?? [];
  log.push({ version: t.version, label: label.slice(0, 200), savedAt: t.updatedAt });
  while (log.length > MAX_REVISIONS) {
    const old = log.shift()!;
    await store.delete(K.rev(t.id, old.version));
  }
  await store.set(K.revlog(t.id), log);
  await updateIndex(store, t);
  return t;
}

async function loadChampions(store: KV): Promise<ChampionsDoc> {
  return (await store.get<ChampionsDoc>(K.champions)) ?? { version: 0, items: [] };
}

async function loadSettings(store: KV): Promise<SiteSettings> {
  return { ...DEFAULT_SETTINGS, ...((await store.get<SiteSettings>(K.settings)) ?? {}) };
}

/** Basit kaba kuvvet koruması: 15 dakikada 10 hatalı denemeden sonra kilit */
async function checkLock(store: KV): Promise<void> {
  const f = (await store.get<{ count: number; since: number }>(K.fails)) ?? { count: 0, since: Date.now() };
  if (Date.now() - f.since > 15 * 60_000) return;
  if (f.count >= 10) throw new HttpError(429, 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
}

async function registerFail(store: KV): Promise<void> {
  const f = (await store.get<{ count: number; since: number }>(K.fails)) ?? { count: 0, since: Date.now() };
  const fresh = Date.now() - f.since > 15 * 60_000;
  await store.set(K.fails, fresh ? { count: 1, since: Date.now() } : { count: f.count + 1, since: f.since });
}

export interface ApiEnv extends AuthEnv {
  /** Çerezlerde Secure bayrağı (https) */
  secureCookies?: boolean;
}

export async function handleApi(req: Request, store: KV, env: ApiEnv): Promise<Response> {
  try {
    return await route(req, store, env);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Sunucu hatası' }, 500);
  }
}

async function route(req: Request, store: KV, env: ApiEnv): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '/api').replace(/\/+$/, '');
  const method = req.method.toUpperCase();
  const admin = isAdmin(req, env);
  const secure = env.secureCookies ?? url.protocol === 'https:';
  const requireAdmin = () => {
    if (!admin) throw new HttpError(401, 'Yönetici girişi gerekli');
  };
  let m: RegExpMatchArray | null;

  // ---- Herkese açık ----
  if (path === '/api/public' && method === 'GET') {
    const [index, champions, settings] = await Promise.all([loadIndex(store), loadChampions(store), loadSettings(store)]);
    return json({ settings, tournaments: index.filter(isPublic), champions: champions.items });
  }
  if ((m = path.match(/^\/api\/t\/([a-z0-9-]+)$/)) && method === 'GET') {
    const t = await store.get<Tournament>(K.tournament(m[1]));
    if (!t || (!isPublic(t) && !admin)) throw new HttpError(404, 'Turnuva bulunamadı');
    if (admin) return json(t);
    // Güç puanları yalnızca yöneticiye görünür (öğrencilerin sınıfları "zayıf" diye etiketlenmesin)
    return json({ ...t, teams: t.teams.map((tm) => ({ ...tm, power: 0 })) });
  }
  if (path === '/api/me' && method === 'GET') {
    return json({ admin, configured: !!env.ADMIN_PASSWORD });
  }
  if (path === '/api/login' && method === 'POST') {
    if (!env.ADMIN_PASSWORD) throw new HttpError(500, 'ADMIN_PASSWORD ortam değişkeni tanımlı değil. README’deki kurulum adımlarına bakın.');
    await checkLock(store);
    const body = await readBody<{ password?: string }>(req);
    if (!checkPassword(String(body.password ?? ''), env)) {
      await registerFail(store);
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(401, 'Şifre hatalı');
    }
    await store.delete(K.fails);
    return json({ ok: true }, 200, { 'set-cookie': createSessionCookie(env, secure) });
  }
  if (path === '/api/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(secure) });
  }

  // ---- Yönetici ----
  if (!path.startsWith('/api/admin/')) throw new HttpError(404, 'Bulunamadı');
  requireAdmin();
  if (method !== 'GET' && !(req.headers.get('content-type') ?? '').includes('application/json')) {
    throw new HttpError(415, 'JSON bekleniyor');
  }

  if (path === '/api/admin/tournaments' && method === 'GET') {
    return json(await loadIndex(store));
  }
  if (path === '/api/admin/tournaments' && method === 'POST') {
    const body = await readBody<{ tournament: Tournament }>(req);
    const t = body.tournament;
    validateTournament(t);
    if (await store.get(K.tournament(t.id))) throw new HttpError(409, 'Bu kimlikte turnuva zaten var');
    const now = new Date().toISOString();
    t.version = 1;
    t.createdAt = now;
    t.updatedAt = now;
    await saveTournament(store, t, 'Turnuva oluşturuldu');
    return json(t, 201);
  }
  if ((m = path.match(/^\/api\/admin\/tournaments\/([a-z0-9-]+)$/)) && method === 'PUT') {
    const body = await readBody<{ tournament: Tournament; baseVersion: number; label?: string }>(req);
    const t = body.tournament;
    validateTournament(t);
    if (t.id !== m[1]) throw new HttpError(400, 'Kimlik uyuşmuyor');
    const cur = await store.get<Tournament>(K.tournament(t.id));
    if (!cur) throw new HttpError(404, 'Turnuva bulunamadı');
    if (cur.version !== body.baseVersion) {
      return json({ error: 'Turnuva başka bir pencerede değiştirilmiş. Sayfayı yenileyip tekrar deneyin.', current: cur }, 409);
    }
    t.version = cur.version + 1;
    t.createdAt = cur.createdAt;
    t.updatedAt = new Date().toISOString();
    await saveTournament(store, t, body.label || 'Güncellendi');
    return json(t);
  }
  if ((m = path.match(/^\/api\/admin\/tournaments\/([a-z0-9-]+)\/revisions$/)) && method === 'GET') {
    const log = (await store.get<RevEntry[]>(K.revlog(m[1]))) ?? [];
    return json(log.slice().reverse());
  }
  if ((m = path.match(/^\/api\/admin\/tournaments\/([a-z0-9-]+)\/restore$/)) && method === 'POST') {
    const body = await readBody<{ version: number }>(req);
    const old = await store.get<Tournament>(K.rev(m[1], Number(body.version)));
    const cur = await store.get<Tournament>(K.tournament(m[1]));
    if (!old || !cur) throw new HttpError(404, 'Sürüm bulunamadı');
    const t: Tournament = { ...old, version: cur.version + 1, updatedAt: new Date().toISOString() };
    await saveTournament(store, t, `${body.version}. sürüm geri yüklendi`);
    return json(t);
  }
  if (path === '/api/admin/champions' && method === 'PUT') {
    const body = await readBody<{ items: ChampionRecord[]; baseVersion: number }>(req);
    const cur = await loadChampions(store);
    if (cur.version !== body.baseVersion) {
      return json({ error: 'Şampiyon listesi başka bir pencerede değişmiş. Sayfayı yenileyin.', current: cur }, 409);
    }
    if (!Array.isArray(body.items) || body.items.some((c) => !c.id || !c.champion || !c.schoolYear || !c.sport)) {
      throw new HttpError(400, 'Şampiyon kaydı eksik');
    }
    const doc = { version: cur.version + 1, items: body.items };
    await store.set(K.champions, doc);
    return json(doc);
  }
  if (path === '/api/admin/champions' && method === 'GET') {
    return json(await loadChampions(store));
  }
  if (path === '/api/admin/settings' && method === 'PUT') {
    const body = await readBody<Partial<SiteSettings>>(req);
    const s: SiteSettings = {
      siteTitle: String(body.siteTitle ?? DEFAULT_SETTINGS.siteTitle).slice(0, 80) || DEFAULT_SETTINGS.siteTitle,
      schoolName: String(body.schoolName ?? '').slice(0, 120),
    };
    await store.set(K.settings, s);
    return json(s);
  }
  if (path === '/api/admin/backup' && method === 'GET') {
    const index = await loadIndex(store);
    const tournaments = (await Promise.all(index.map((s) => store.get<Tournament>(K.tournament(s.id))))).filter(Boolean);
    const backup = {
      format: 'turnuva-panosu-yedek',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: await loadSettings(store),
      champions: (await loadChampions(store)).items,
      tournaments,
    };
    const date = new Date().toISOString().slice(0, 10);
    return json(backup, 200, { 'content-disposition': `attachment; filename="turnuva-yedek-${date}.json"` });
  }
  if (path === '/api/admin/import' && method === 'POST') {
    const body = await readBody<{ tournaments?: Tournament[]; champions?: ChampionRecord[]; settings?: SiteSettings; format?: string }>(req);
    if (body.format !== 'turnuva-panosu-yedek') throw new HttpError(400, 'Bu dosya bir yedek dosyası değil');
    let count = 0;
    for (const t of body.tournaments ?? []) {
      validateTournament(t);
      const cur = await store.get<Tournament>(K.tournament(t.id));
      const next = { ...t, version: (cur?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
      await saveTournament(store, next, 'Yedekten geri yüklendi');
      count++;
    }
    if (body.champions) {
      const cur = await loadChampions(store);
      const ids = new Set(cur.items.map((c) => c.id));
      const merged = [...cur.items, ...body.champions.filter((c) => !ids.has(c.id))];
      await store.set(K.champions, { version: cur.version + 1, items: merged });
    }
    if (body.settings) await store.set(K.settings, body.settings);
    return json({ ok: true, tournaments: count, champions: body.champions?.length ?? 0 });
  }
  throw new HttpError(404, 'Bulunamadı');
}
