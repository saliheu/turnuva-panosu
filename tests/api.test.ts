import { describe, expect, it } from 'vitest';
import { handleApi } from '../server/api';
import { memoryStore } from '../server/store';
import { newTournament } from '../src/engine';

const env = { ADMIN_PASSWORD: 'gizli-sifre', secureCookies: false };
const base = 'http://localhost/api';

async function call(store: ReturnType<typeof memoryStore>, method: string, path: string, body?: unknown, cookie?: string) {
  const res = await handleApi(
    new Request(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    store,
    env,
  );
  return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie') };
}

describe('API', () => {
  it('giriş, yetki, taslak gizliliği, sürüm çakışması ve yedek', async () => {
    const store = memoryStore();
    // yanlış şifre
    expect((await call(store, 'POST', '/login', { password: 'x' })).status).toBe(401);
    // giriş yapmadan yönetici işlemi yok
    expect((await call(store, 'GET', '/admin/tournaments')).status).toBe(401);
    const login = await call(store, 'POST', '/login', { password: 'gizli-sifre' });
    expect(login.status).toBe(200);
    const cookie = login.cookie!.split(';')[0];
    expect(login.cookie).toMatch(/HttpOnly/);
    // sahte çerez reddedilir
    expect((await call(store, 'GET', '/admin/tournaments', undefined, 'tp_oturum=9999999999999.abc')).status).toBe(401);

    const t = newTournament({ name: 'Futbol Turnuvası', sport: 'Futbol' });
    t.teams.push({ id: 'ta', name: '9-A', power: 9, members: [] });
    const created = await call(store, 'POST', '/admin/tournaments', { tournament: t }, cookie);
    expect(created.status).toBe(201);
    expect(created.data.version).toBe(1);

    // taslak herkese kapalı
    expect((await call(store, 'GET', `/t/${t.id}`)).status).toBe(404);
    expect((await call(store, 'GET', '/public')).data.tournaments).toEqual([]);
    expect((await call(store, 'GET', `/t/${t.id}`, undefined, cookie)).status).toBe(200);

    const pub = { ...created.data, status: 'devam' };
    const upd = await call(store, 'PUT', `/admin/tournaments/${t.id}`, { tournament: pub, baseVersion: 1, label: 'Yayınlandı' }, cookie);
    expect(upd.status).toBe(200);
    expect(upd.data.version).toBe(2);
    // eski sürümle kaydetme çakışma verir
    const stale = await call(store, 'PUT', `/admin/tournaments/${t.id}`, { tournament: pub, baseVersion: 1 }, cookie);
    expect(stale.status).toBe(409);

    expect((await call(store, 'GET', `/t/${t.id}`)).status).toBe(200);
    expect((await call(store, 'GET', '/public')).data.tournaments.length).toBe(1);
    // güç puanları ziyaretçiye gönderilmez, yöneticiye gönderilir
    expect((await call(store, 'GET', `/t/${t.id}`)).data.teams[0].power).toBe(0);
    expect((await call(store, 'GET', `/t/${t.id}`, undefined, cookie)).data.teams[0].power).toBe(9);

    const revs = await call(store, 'GET', `/admin/tournaments/${t.id}/revisions`, undefined, cookie);
    expect(revs.data.map((r: { label: string }) => r.label)).toEqual(['Yayınlandı', 'Turnuva oluşturuldu']);
    const restored = await call(store, 'POST', `/admin/tournaments/${t.id}/restore`, { version: 1 }, cookie);
    expect(restored.data.status).toBe('taslak');
    expect(restored.data.version).toBe(3);

    // arşivlenen turnuva gizlenir ama silinmez
    const arch = await call(store, 'PUT', `/admin/tournaments/${t.id}`, { tournament: { ...restored.data, status: 'bitti', archived: true }, baseVersion: 3 }, cookie);
    expect(arch.status).toBe(200);
    expect((await call(store, 'GET', '/public')).data.tournaments).toEqual([]);
    expect((await call(store, 'GET', '/admin/tournaments', undefined, cookie)).data.length).toBe(1);

    const champs = await call(store, 'PUT', '/admin/champions', { baseVersion: 0, items: [{ id: 'c1', schoolYear: '2025-26', sport: 'Voleybol', champion: '10-B', createdAt: '' }] }, cookie);
    expect(champs.status).toBe(200);
    expect((await call(store, 'GET', '/public')).data.champions[0].champion).toBe('10-B');

    const backup = await call(store, 'GET', '/admin/backup', undefined, cookie);
    expect(backup.data.tournaments.length).toBe(1);
    expect(backup.data.champions.length).toBe(1);
    const store2 = memoryStore();
    const imp = await call(store2, 'POST', '/admin/import', backup.data, cookie);
    expect(imp.data.tournaments).toBe(1);
  });

  it('şifre tanımlı değilse giriş yapılamaz', async () => {
    const res = await handleApi(
      new Request(base + '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":""}' }),
      memoryStore(),
      {},
    );
    expect(res.status).toBe(500);
  });
});
