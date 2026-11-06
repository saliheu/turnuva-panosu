import { useCallback, useEffect, useState } from 'react';
import type { DrawStep, LiveSlot, Tournament } from '../../engine/types';

/**
 * Takımları tek tek çekerek gösteren tam ekran canlı kura.
 * layout verilirse pano baştan boş kartlarla ("?") çizilir ve takımlar çekildikçe yerine oturur.
 */
export function LiveDraw({
  t,
  title,
  steps,
  layout,
  onClose,
  autoStart = false,
  doneLabel,
}: {
  t: Tournament;
  title: string;
  steps: DrawStep[];
  layout?: LiveSlot[];
  onClose: () => void;
  autoStart?: boolean;
  /** Kura bitince gösterilecek ana düğme (ör. "Sonuca geç") */
  doneLabel?: string;
}) {
  const [shown, setShown] = useState(0);
  const [auto, setAuto] = useState(autoStart);
  const name = (id: string) => t.teams.find((x) => x.id === id)?.name ?? '?';
  const next = useCallback(() => setShown((s) => Math.min(steps.length, s + 1)), [steps.length]);
  const finished = shown >= steps.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (finished && doneLabel) onClose();
        else next();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, onClose, finished, doneLabel]);

  useEffect(() => {
    if (!auto || finished) return;
    const id = setTimeout(next, shown === 0 ? 900 : 1700);
    return () => clearTimeout(id);
  }, [auto, shown, finished, next]);

  const current = shown > 0 ? steps[shown - 1] : null;
  const revealed = new Set(steps.slice(0, shown).map((s) => s.teamId));

  // Düzen yoksa (eski kayıtlar) çekilen takımları hedeflerine göre listele
  const cards: LiveSlot[] =
    layout ??
    [...new Set(steps.map((s) => s.to))].map((to) => ({
      title: to,
      kind: 'list' as const,
      entries: steps.filter((s) => s.to === to).map((s) => ({ teamId: s.teamId })),
    }));

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
          {doneLabel ? 'Kurayı atla' : 'Kapat'}
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
          <div style={{ opacity: 0.85 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '2rem', fontWeight: 700 }}>{steps.length} takım çekilecek</div>
            <p>{auto ? 'Kura birazdan başlıyor…' : '“Sıradaki” düğmesine veya boşluk tuşuna basın.'}</p>
          </div>
        )}
      </div>
      <div className="btn-row" style={{ justifyContent: 'center', padding: '0 1rem 1rem' }}>
        {finished && doneLabel ? (
          <button className="btn accent" onClick={onClose}>
            {doneLabel}
          </button>
        ) : (
          <>
            <button className="btn accent" onClick={next} disabled={finished}>
              Sıradaki ({shown}/{steps.length})
            </button>
            <button className="btn ghost" onClick={() => setAuto((a) => !a)} disabled={finished}>
              {auto ? 'Durdur' : 'Otomatik çek'}
            </button>
            <button className="btn ghost" onClick={() => setShown(steps.length)} disabled={finished}>
              Hepsini göster
            </button>
          </>
        )}
        <button className="btn ghost" onClick={() => (setShown(0), setAuto(autoStart))}>
          Baştan
        </button>
      </div>
      <div className="live-board">
        {cards.map((c) => (
          <div className={`slot${c.kind === 'match' ? ' match-slot' : ''}`} key={c.title}>
            <h4>{c.title}</h4>
            {c.entries.map((e, i) => (
              <div key={i}>
                {i > 0 && c.kind === 'match' && <div className="vs">vs</div>}
                {'text' in e ? (
                  <div className="ph">{e.text}</div>
                ) : revealed.has(e.teamId) ? (
                  <div className={current?.teamId === e.teamId ? 'fresh' : ''}>{name(e.teamId)}</div>
                ) : (
                  <div className="unknown">?</div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
