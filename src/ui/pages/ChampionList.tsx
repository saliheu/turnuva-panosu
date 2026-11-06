import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChampionRecord } from '../../engine/types';
import { Trophy } from '../common';

/** Yıl ve branşa göre filtrelenebilen şampiyonlar listesi */
export function ChampionList({ items, limit }: { items: ChampionRecord[]; limit?: number }) {
  const [year, setYear] = useState('');
  const [sport, setSport] = useState('');
  const years = useMemo(() => [...new Set(items.map((c) => c.schoolYear))].sort().reverse(), [items]);
  const sports = useMemo(() => [...new Set(items.map((c) => c.sport))].sort((a, b) => a.localeCompare(b, 'tr')), [items]);
  const filtered = items
    .filter((c) => (!year || c.schoolYear === year) && (!sport || c.sport === sport))
    .sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || a.sport.localeCompare(b.sport, 'tr'));
  const shown = limit && !year && !sport ? filtered.slice(0, limit) : filtered;
  if (!items.length) return <div className="empty">Henüz şampiyon kaydı yok.</div>;
  return (
    <>
      <div className="filters">
        <select className="input" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Öğretim yılı">
          <option value="">Tüm yıllar</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select className="input" value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Branş">
          <option value="">Tüm branşlar</option>
          {sports.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <div className="empty">Bu filtreye uygun kayıt yok.</div>
      ) : (
        <div className="champ-list">
          {shown.map((c) => (
            <div className="champ" key={c.id}>
              <div className="trophy">
                <Trophy />
              </div>
              <div className="grow">
                <div className="yr">
                  {c.schoolYear} · <b>{c.champion}</b>
                </div>
                <div className="small muted">
                  {c.sport}
                  {c.category ? ` · ${c.category}` : ''}
                  {c.runnerUp ? ` · İkinci: ${c.runnerUp}` : ''}
                </div>
                {c.tournamentId && (
                  <Link className="tiny" to={`/t/${c.tournamentId}`}>
                    {c.tournamentName ?? 'Turnuvayı gör'} →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {limit && !year && !sport && filtered.length > limit && (
        <p style={{ marginTop: '0.75rem' }}>
          <Link to="/sampiyonlar">Tüm şampiyonlar ({filtered.length}) →</Link>
        </p>
      )}
    </>
  );
}
