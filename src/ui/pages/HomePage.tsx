import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TournamentSummary } from '../../engine/types';
import { api, type PublicData } from '../api';
import { Spinner, StatusBadge, useDocumentTitle } from '../common';
import { useSession } from '../session';
import { ChampionList } from './ChampionList';

export function TournamentCard({ t }: { t: TournamentSummary }) {
  return (
    <Link to={`/t/${t.id}`} className="card t-card">
      <div className="meta">
        <StatusBadge status={t.status} archived={t.archived} />
        <span className="badge">{t.sport}</span>
        {t.category && <span className="badge">{t.category}</span>}
      </div>
      <h3>{t.name}</h3>
      <div className="small muted">
        {t.schoolYear} · {t.teamCount} takım
        {t.currentStage && t.status === 'devam' ? ` · ${t.currentStage}` : ''}
      </div>
      {t.champion && (
        <div className="small" style={{ marginTop: '0.35rem' }}>
          🏆 <b>{t.champion}</b>
        </div>
      )}
    </Link>
  );
}

export default function HomePage() {
  const { settings, admin } = useSession();
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<TournamentSummary[]>([]);
  useDocumentTitle(settings.siteTitle);
  useEffect(() => {
    api.publicData().then(setData).catch((e) => setError(e.message));
  }, []);
  // Taslaklar herkese kapalıdır; yönetici ana sayfada kendi taslaklarını görür
  useEffect(() => {
    if (!admin) return setDrafts([]);
    api
      .listAll()
      .then((all) => setDrafts(all.filter((t) => t.status === 'taslak' && !t.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
      .catch(() => setDrafts([]));
  }, [admin]);

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <Spinner />;
  const ongoing = data.tournaments.filter((t) => t.status === 'devam').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const past = data.tournaments
    .filter((t) => t.status === 'bitti')
    .sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <section className="hero">
        <h1>{settings.siteTitle}</h1>
        <p>{settings.schoolName ? `${settings.schoolName} — fikstürler` : 'Fikstürler'}, maç sonuçları, puan durumları ve şampiyonlar.</p>
        {admin && (
          <Link to="/yeni-turnuva" className="btn accent hero-btn">
            + Yeni turnuva
          </Link>
        )}
      </section>

      {admin && drafts.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Taslak turnuvalarınız</h2>
            <span className="small muted">Yalnızca siz görüyorsunuz. Yayınlamak için turnuvanın Ayarlar sekmesinden “Devam ediyor” yapın.</span>
          </div>
          <div className="grid">
            {drafts.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Devam eden turnuvalar</h2>
        </div>
        {ongoing.length ? (
          <div className="grid">
            {ongoing.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </div>
        ) : (
          <div className="empty">Şu anda devam eden turnuva yok.</div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Geçmiş turnuvalar</h2>
        </div>
        {past.length ? (
          <div className="grid">
            {past.map((t) => (
              <TournamentCard key={t.id} t={t} />
            ))}
          </div>
        ) : (
          <div className="empty">Henüz biten turnuva yok.</div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Şampiyonlar</h2>
        </div>
        <ChampionList items={data.champions} limit={12} />
      </section>
    </>
  );
}
