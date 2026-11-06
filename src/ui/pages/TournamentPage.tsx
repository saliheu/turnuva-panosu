import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Tournament } from '../../engine/types';
import { clone } from '../../engine/util';
import { api, ApiError } from '../api';
import { Spinner, StatusBadge, useDocumentTitle, useToast } from '../common';
import { useSession } from '../session';
import { BracketView } from '../tournament/BracketView';
import { ChampionTab, HistoryTab } from '../tournament/ChampionTab';
import { TournamentCtx, type TournamentCtxValue } from '../tournament/ctx';
import { FormatTab } from '../tournament/FormatTab';
import { MatchesView } from '../tournament/MatchesView';
import { Overview, ShareButton } from '../tournament/Overview';
import { SettingsTab } from '../tournament/SettingsTab';
import { StagesTab } from '../tournament/StagesTab';
import { StandingsView } from '../tournament/StandingsView';
import { TeamsTab } from '../tournament/TeamsTab';

type TabDef = { id: string; label: string; admin?: boolean };

export default function TournamentPage() {
  const { id } = useParams();
  const { admin, ready } = useSession();
  const toast = useToast();
  const [t, setT] = useState<Tournament | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useSearchParams();
  const tRef = useRef<Tournament | null>(null);
  tRef.current = t;
  useDocumentTitle(t ? t.name : 'Turnuva');

  const load = useCallback(async () => {
    try {
      setT(await api.tournament(id!));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, admin, load]);

  const mutate = useCallback(
    async (label: string, fn: (d: Tournament) => void) => {
      const cur = tRef.current;
      if (!cur) return false;
      const draft = clone(cur);
      try {
        fn(draft);
      } catch (e) {
        toast((e as Error).message, 'error');
        return false;
      }
      setSaving(true);
      try {
        const saved = await api.save(draft, cur.version, label);
        setT(saved);
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const current = (e.data as { current?: Tournament })?.current;
          if (current) setT(current);
          toast('Turnuva başka bir pencerede değişmiş; en güncel hâli yüklendi. İşlemi tekrar yapın.', 'error');
        } else if (e instanceof ApiError && e.status === 401) {
          toast('Oturumunuz kapanmış. Yeniden giriş yapın.', 'error');
        } else toast((e as Error).message, 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [toast],
  );

  const ctx: TournamentCtxValue | null = useMemo(
    () => (t ? { t, admin, mutate, saving, reload: load, replace: setT } : null),
    [t, admin, mutate, saving, load],
  );

  if (error) {
    return (
      <div className="empty" style={{ marginTop: '2rem' }}>
        {error}. <Link to="/">Ana sayfaya dön</Link>
      </div>
    );
  }
  if (!t || !ctx) return <Spinner />;

  const hasTables = t.stages.some((s) => (s.type === 'grup' || s.type === 'lig') && s.groups?.length);
  const hasBracket = t.stages.some((s) => (s.type === 'eleme' || s.type === 'on-eleme') && s.matches.length);
  const tabs: TabDef[] = [
    { id: 'ozet', label: 'Özet' },
    { id: 'maclar', label: 'Maçlar' },
    ...(hasTables ? [{ id: 'puan', label: t.stages.some((s) => s.type === 'grup') ? 'Gruplar' : 'Puan Durumu' }] : []),
    ...(hasBracket ? [{ id: 'agac', label: 'Eleme Ağacı' }] : []),
    { id: 'takimlar', label: 'Takımlar' },
    ...(admin
      ? [
          { id: 'asamalar', label: 'Kura & Aşamalar', admin: true },
          { id: 'format', label: 'Format', admin: true },
          { id: 'sampiyon', label: 'Şampiyon', admin: true },
          { id: 'ayarlar', label: 'Ayarlar', admin: true },
          { id: 'gecmis', label: 'Geçmiş', admin: true },
        ]
      : []),
  ];
  const defaultTab = admin && t.stages.length === 0 ? (t.teams.length < 2 ? 'takimlar' : 'format') : 'ozet';
  const tab = tabs.some((x) => x.id === params.get('sekme')) ? params.get('sekme')! : defaultTab;
  const setTab = (id: string) => setParams((p) => (p.set('sekme', id), p), { replace: true });

  return (
    <TournamentCtx.Provider value={ctx}>
      <div className="t-hero">
        <div>
          <div className="eyebrow">
            {t.sport} · {t.schoolYear}
            {t.category ? ` · ${t.category}` : ''}
          </div>
          <h1>{t.name}</h1>
          <div className="meta">
            <StatusBadge status={t.status} archived={t.archived} />
            <span className="badge">{t.teams.filter((x) => !x.withdrawn).length} takım</span>
          </div>
        </div>
        <ShareButton />
      </div>
      <nav className="tabs" aria-label="Turnuva sekmeleri">
        {tabs.map((x, i) => (
          <span key={x.id} style={{ display: 'contents' }}>
            {x.admin && !tabs[i - 1]?.admin && <span className="tab-sep" />}
            <button className={`tab${tab === x.id ? ' active' : ''}${x.admin ? ' admin' : ''}`} onClick={() => setTab(x.id)}>
              {x.label}
            </button>
          </span>
        ))}
      </nav>
      {saving && <div className="saving">Kaydediliyor…</div>}
      {tab === 'ozet' && <Overview />}
      {tab === 'maclar' && <MatchesView />}
      {tab === 'puan' && <StandingsView />}
      {tab === 'agac' && <BracketView />}
      {tab === 'takimlar' && <TeamsTab />}
      {admin && tab === 'asamalar' && <StagesTab />}
      {admin && tab === 'format' && <FormatTab key={t.version} />}
      {admin && tab === 'sampiyon' && <ChampionTab key={t.version} />}
      {admin && tab === 'ayarlar' && <SettingsTab key={t.version} />}
      {admin && tab === 'gecmis' && <HistoryTab />}
    </TournamentCtx.Provider>
  );
}
