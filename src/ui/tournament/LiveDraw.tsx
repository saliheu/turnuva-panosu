import { useCallback, useEffect, useState } from 'react';
import type { DrawStep, Tournament } from '../../engine/types';

/** Takımları tek tek çekerek gösteren tam ekran canlı kura */
export function LiveDraw({ t, title, steps, onClose }: { t: Tournament; title: string; steps: DrawStep[]; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(false);
  const name = (id: string) => t.teams.find((x) => x.id === id)?.name ?? '?';
  const next = useCallback(() => setShown((s) => Math.min(steps.length, s + 1)), [steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, onClose]);

  useEffect(() => {
    if (!auto || shown >= steps.length) return;
    const id = setTimeout(next, 1800);
    return () => clearTimeout(id);
  }, [auto, shown, steps.length, next]);

  const current = shown > 0 ? steps[shown - 1] : null;
  const slots: { to: string; ids: string[] }[] = [];
  for (const s of steps.slice(0, shown)) {
    let slot = slots.find((x) => x.to === s.to);
    if (!slot) {
      slot = { to: s.to, ids: [] };
      slots.push(slot);
    }
    slot.ids.push(s.teamId);
  }
  // Tüm hedefleri baştan göster ki pano dolarak ilerlesin
  const allTargets = [...new Set(steps.map((s) => s.to))];

  return (
    <div className="live-draw" role="dialog" aria-label="Canlı kura">
      <div className="live-top">
        <div>
          <div className="eyebrow" style={{ color: '#ffb59c' }}>
            Canlı kura
          </div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '1.4rem' }}>{title}</div>
        </div>
        <button className="btn ghost sm" onClick={onClose}>
          Kapat
        </button>
      </div>
      <div className="live-stage">
        {current ? (
          <div key={shown} className="ball">
            <div>
              <div className="tiny" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-2)' }}>
                {current.from}
              </div>
              <div className="nm">{name(current.teamId)}</div>
              <div className="to">→ {current.to}</div>
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.8 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '2rem', fontWeight: 700 }}>{steps.length} takım çekilecek</div>
            <p>“Sıradaki” düğmesine veya boşluk tuşuna basın.</p>
          </div>
        )}
      </div>
      <div className="btn-row" style={{ justifyContent: 'center', padding: '0 1rem 1rem' }}>
        <button className="btn accent" onClick={next} disabled={shown >= steps.length}>
          Sıradaki ({shown}/{steps.length})
        </button>
        <button className="btn ghost" onClick={() => setAuto((a) => !a)} disabled={shown >= steps.length}>
          {auto ? 'Durdur' : 'Otomatik'}
        </button>
        <button className="btn ghost" onClick={() => setShown(steps.length)}>
          Tümünü göster
        </button>
        <button className="btn ghost" onClick={() => setShown(0)}>
          Baştan
        </button>
      </div>
      <div className="live-board">
        {allTargets.map((to) => {
          const slot = slots.find((s) => s.to === to);
          return (
            <div className="slot" key={to}>
              <h4>{to}</h4>
              {(slot?.ids ?? []).map((id) => (
                <div key={id} className={current?.teamId === id ? 'fresh' : ''}>
                  {name(id)}
                </div>
              ))}
              {!slot && <div style={{ opacity: 0.4 }}>—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
