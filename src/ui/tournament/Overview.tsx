import { useState } from 'react';
import { stageProgress } from '../../engine/qualify';
import { hasResult } from '../../engine/results';
import type { Match, Stage } from '../../engine/types';
import { Trophy, useToast } from '../common';
import { resolveAll, useT, type Resolved } from './ctx';
import { MatchCard } from './MatchCard';
import { MatchEditor } from './MatchEditor';

export function ShareButton() {
  const { t } = useT();
  const toast = useToast();
  const share = async () => {
    const url = `${location.origin}/t/${t.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t.name, url });
        return;
      }
    } catch {
      /* paylaşım iptal */
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Bağlantı kopyalandı', 'ok');
    } catch {
      prompt('Bağlantıyı kopyalayın:', url);
    }
  };
  return (
    <button className="btn ghost sm" onClick={share}>
      🔗 Paylaş
    </button>
  );
}

export function Overview() {
  const { t, admin } = useT();
  const [editing, setEditing] = useState<{ stage: Stage; m: Match } | null>(null);
  const all: { stage: Stage; m: Match; r: Resolved }[] = [];
  for (const s of t.stages) {
    const res = resolveAll(s);
    for (const m of s.matches) {
      if (m.a.kind === 'bye' || m.b.kind === 'bye') continue;
      all.push({ stage: s, m, r: res.get(m.id)! });
    }
  }
  const key = (x: Match) => `${x.date ?? '9999'} ${x.time ?? '99'}`;
  const upcoming = all
    .filter((x) => !hasResult(x.m) && x.r.a && x.r.b)
    .sort((a, b) => key(a.m).localeCompare(key(b.m)) || t.stages.indexOf(a.stage) - t.stages.indexOf(b.stage) || a.m.no - b.m.no)
    .slice(0, 6);
  const recent = all
    .filter((x) => hasResult(x.m))
    .sort((a, b) => key(b.m).localeCompare(key(a.m)) || t.stages.indexOf(b.stage) - t.stages.indexOf(a.stage) || b.m.no - a.m.no)
    .slice(0, 6);
  const live = editing && t.stages.find((s) => s.id === editing.stage.id);
  const liveMatch = live?.matches.find((m) => m.id === editing!.m.id);

  return (
    <>
      {t.champion && (
        <div className="card" style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', background: 'var(--amber-soft)', borderColor: '#efd28f' }}>
          <Trophy size={44} />
          <div>
            <div className="eyebrow">Şampiyon · {t.schoolYear}</div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '1.8rem', lineHeight: 1.05 }}>{t.champion.champion}</div>
            {(t.champion.runnerUp || t.champion.third) && (
              <div className="small muted">
                {t.champion.runnerUp && `İkinci: ${t.champion.runnerUp}`}
                {t.champion.third && ` · Üçüncü: ${t.champion.third}`}
              </div>
            )}
          </div>
        </div>
      )}
      {t.description && <p style={{ whiteSpace: 'pre-wrap' }}>{t.description}</p>}

      {t.stages.length > 0 && (
        <div className="section" style={{ marginTop: '1rem' }}>
          <div className="flow">
            {t.stages.map((s, i) => {
              const p = stageProgress(s);
              return (
                <span key={s.id} style={{ display: 'contents' }}>
                  {i > 0 && <span className="muted">→</span>}
                  <span className="step">
                    <b>{s.name}</b>{' '}
                    <span className="small muted">
                      {s.status === 'bitti' ? '✓ bitti' : s.matches.length ? `${p.played}/${p.total} maç` : 'kura bekleniyor'}
                    </span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {t.stages.length === 0 && <div className="empty">Turnuva formatı henüz belirlenmedi.</div>}

      {upcoming.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Sıradaki maçlar</h2>
          </div>
          <div className="match-list">
            {upcoming.map((x) => (
              <MatchCard key={x.m.id} stage={x.stage} m={x.m} r={x.r} showGroup onClick={admin ? () => setEditing({ stage: x.stage, m: x.m }) : undefined} />
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Son sonuçlar</h2>
          </div>
          <div className="match-list">
            {recent.map((x) => (
              <MatchCard key={x.m.id} stage={x.stage} m={x.m} r={x.r} showGroup onClick={admin ? () => setEditing({ stage: x.stage, m: x.m }) : undefined} />
            ))}
          </div>
        </section>
      )}
      {live && liveMatch && <MatchEditor stage={live} match={liveMatch} onClose={() => setEditing(null)} />}
    </>
  );
}
