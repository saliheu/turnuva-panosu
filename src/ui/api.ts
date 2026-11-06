import type { ChampionRecord, Tournament, TournamentSummary } from '../engine/types';

export interface SiteSettings {
  siteTitle: string;
  schoolName: string;
}

export interface PublicData {
  settings: SiteSettings;
  tournaments: TournamentSummary[];
  champions: ChampionRecord[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* boş yanıt */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `İstek başarısız (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export const api = {
  publicData: () => request<PublicData>('GET', '/public'),
  tournament: (id: string) => request<Tournament>('GET', `/t/${id}`),
  me: () => request<{ admin: boolean; configured: boolean }>('GET', '/me'),
  login: (password: string) => request<{ ok: true }>('POST', '/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/logout', {}),
  listAll: () => request<TournamentSummary[]>('GET', '/admin/tournaments'),
  create: (t: Tournament) => request<Tournament>('POST', '/admin/tournaments', { tournament: t }),
  save: (t: Tournament, baseVersion: number, label: string) =>
    request<Tournament>('PUT', `/admin/tournaments/${t.id}`, { tournament: t, baseVersion, label }),
  revisions: (id: string) => request<{ version: number; label: string; savedAt: string }[]>('GET', `/admin/tournaments/${id}/revisions`),
  restore: (id: string, version: number) => request<Tournament>('POST', `/admin/tournaments/${id}/restore`, { version }),
  champions: () => request<{ version: number; items: ChampionRecord[] }>('GET', '/admin/champions'),
  saveChampions: (items: ChampionRecord[], baseVersion: number) =>
    request<{ version: number; items: ChampionRecord[] }>('PUT', '/admin/champions', { items, baseVersion }),
  saveSettings: (s: SiteSettings) => request<SiteSettings>('PUT', '/admin/settings', s),
  backup: () => request<unknown>('GET', '/admin/backup'),
  importBackup: (data: unknown) => request<{ ok: true; tournaments: number; champions: number }>('POST', '/admin/import', data),
};
