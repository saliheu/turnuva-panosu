import type { Match, Stage } from '../../engine/types';
import { hasScore } from '../../engine/results';
import { formatDate } from '../common';
import { sideName, useT, type Resolved } from './ctx';

export function MatchCard({ stage, m, r, onClick, showGroup }: { stage: Stage; m: Match; r?: Resolved; onClick?: () => void; showGroup?: boolean }) {
  const { t, admin } = useT();
  const tag = (l?: string) => (!l ? null : /^\d+$/.test(l) ? (admin ? `Güç sırası ${l}` : null) : l);
  const tagA = tag(m.labelA);
  const tagB = tag(m.labelB);
  const A = sideName(t, stage, m, 'a', r);
  const B = sideName(t, stage, m, 'b', r);
  const winA = !!r?.winner && r.winner === r.a;
  const winB = !!r?.winner && r.winner === r.b;
  const scored = hasScore(m);
  const hasPen = m.penA != null && m.penB != null;
  return (
    <div
      className={`match${onClick ? ' clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    >
      <div className={`side a${winA ? ' win' : ''}${A.tbd ? ' tbd' : ''}`}>
        {A.text}
        {tagA && <span className="lbl">{tagA}</span>}
      </div>
      <div className={`score${scored ? '' : ' pending'}`}>
        {scored ? (
          <>
            {m.scoreA} - {m.scoreB}
            {hasPen && <span className="pen">pen. {m.penA}-{m.penB}</span>}
            {m.forfeit && <span className="pen">hükmen</span>}
            {!hasPen && m.decided && m.scoreA === m.scoreB && <span className="pen">yönetici kararı</span>}
          </>
        ) : m.time ? (
          m.time
        ) : (
          'vs'
        )}
      </div>
      <div className={`side b${winB ? ' win' : ''}${B.tbd ? ' tbd' : ''}`}>
        {B.text}
        {tagB && <span className="lbl">{tagB}</span>}
      </div>
      {(m.no > 0 || m.date || m.venue || m.note || (showGroup && m.group)) && (
        <div className="match-foot">
          {m.no > 0 && <span className="match-no">#{m.no}</span>}
          {showGroup && m.group && m.group !== 'Lig' && <span>{m.group} Grubu</span>}
          {m.leg === 2 && <span>Rövanş</span>}
          {m.date && <span>{formatDate(m.date)}</span>}
          {m.time && scored && <span>{m.time}</span>}
          {m.venue && <span>📍 {m.venue}</span>}
          {m.note && <span>{m.note}</span>}
        </div>
      )}
    </div>
  );
}
