import { useRef, useState } from 'react';
import { BYE } from '../../engine/results';
import { teamName } from '../../engine/tournament';
import type { Match, Stage } from '../../engine/types';
import { Trophy } from '../common';
import { resolveAll, sideName, stageRoundLabel, useT, type Resolved } from './ctx';
import { MatchCard } from './MatchCard';
import { MatchEditor } from './MatchEditor';
import { ExportButtons } from './MatchesView';

const NODE_H = 58;
const GAP_Y = 14;
const COL_W = 200;
const COL_GAP = 44;
const TOP = 44;
const LEFT = 12;

function Node({
  stage,
  m,
  r,
  x,
  y,
  onClick,
  extra,
}: {
  stage: Stage;
  m: Match;
  r: Resolved;
  x: number;
  y: number;
  onClick?: () => void;
  extra?: { a?: string; b?: string };
}) {
  const { t, admin } = useT();
  const bye = m.a.kind === 'bye' || m.b.kind === 'bye';
  const rows = (['a', 'b'] as const).map((side) => {
    const n = sideName(t, stage, m, side, r);
    const id = r[side];
    const win = !!r.winner && r.winner === id && id !== BYE;
    const score = side === 'a' ? m.scoreA : m.scoreB;
    const pen = side === 'a' ? m.penA : m.penB;
    const raw = (side === 'a' ? m.labelA : m.labelB) ?? extra?.[side];
    // Güç sırası numaraları yalnızca yöneticiye gösterilir
    const label = raw && /^\d+$/.test(raw) && !admin ? undefined : raw;
    return (
      <div className={`row${win ? ' win' : ''}`} key={side}>
        {label && (
          <span className="sd" title={/^\d+$/.test(label) ? `Güç sırası ${label}` : `${label[0]} grubu ${label.slice(1)}. sırası`}>
            {label}
          </span>
        )}
        <span className={`nm${n.tbd ? ' tbd' : ''}`} title={n.text}>
          {n.text}
        </span>
        <span className="sc">
          {score ?? ''}
          {pen != null && <sup style={{ fontSize: '0.6rem' }}>({pen})</sup>}
        </span>
      </div>
    );
  });
  return (
    <div
      className={`bnode${onClick && !bye ? ' clickable' : ''}${bye ? ' bye' : ''}`}
      style={{ left: x, top: y, width: COL_W, height: NODE_H }}
      onClick={bye ? undefined : onClick}
      role={onClick && !bye ? 'button' : undefined}
    >
      {m.no > 0 && <span className="no">#{m.no}</span>}
      {rows}
    </div>
  );
}

export function Bracket({ stage, onSelect }: { stage: Stage; onSelect?: (m: Match) => void }) {
  const { t } = useT();
  const res = resolveAll(stage);
  const main = stage.matches.filter((m) => !m.third);
  const third = stage.matches.find((m) => m.third);
  const rounds = Math.max(...main.map((m) => m.round));
  const n1 = main.filter((m) => m.round === 1).length;
  const unit = NODE_H + GAP_Y;
  const pos = new Map<string, { x: number; y: number }>();
  const isBye = (m: Match) => m.a.kind === 'bye' || m.b.kind === 'bye';
  const byId = new Map(stage.matches.map((m) => [m.id, m]));
  // Bay geçen varsa ilk tur "ön eleme turu"dur: bay kutuları çizilmez, ana tablo 2. turdan başlar,
  // ön eleme maçları en solda, kazananın gideceği satırın hizasında durur.
  const prelim = rounds >= 2 && main.some((m) => m.round === 1 && isBye(m));
  const xOf = (round: number) => LEFT + (round - 1) * (COL_W + COL_GAP);
  let height: number;
  if (!prelim) {
    for (const m of main) {
      const span = unit * 2 ** (m.round - 1);
      const cy = TOP + (m.order + 0.5) * span;
      pos.set(m.id, { x: xOf(m.round), y: cy - NODE_H / 2 });
    }
    height = TOP + n1 * unit + 8;
  } else {
    const top = TOP + 18;
    const r1 = main.filter((m) => m.round === 1);
    const realFeeders = new Map<number, number>();
    for (const m of r1) if (!isBye(m)) realFeeders.set(Math.floor(m.order / 2), (realFeeders.get(Math.floor(m.order / 2)) ?? 0) + 1);
    // Bir ana tablo maçına iki ön eleme maçı bağlanıyorsa aralığı aç
    const dbl = [...realFeeders.values()].some((c) => c > 1);
    const unit2 = dbl ? unit * 2 : unit;
    for (const m of main) {
      if (m.round === 1) continue;
      const span = unit2 * 2 ** (m.round - 2);
      const cy = top + (m.order + 0.5) * span;
      pos.set(m.id, { x: xOf(m.round), y: cy - NODE_H / 2 });
    }
    const r2 = main.filter((m) => m.round === 2).sort((a, b) => a.order - b.order);
    for (const m of r1) {
      if (isBye(m)) continue;
      const target = pos.get(r2[Math.floor(m.order / 2)].id)!;
      const cy2 = target.y + NODE_H / 2;
      const sideA = m.order % 2 === 0;
      const offset = dbl ? (sideA ? -unit / 2 : unit / 2) : sideA ? -NODE_H / 4 : NODE_H / 4;
      pos.set(m.id, { x: xOf(1), y: cy2 + offset - NODE_H / 2 });
    }
    height = top + r2.length * unit2 + 8;
  }
  // Bay geçen takımın etiketi (güç sırası / grup sırası) ana tablodaki kutuda gösterilir
  const inherited = (m: Match, side: 'a' | 'b'): string | undefined => {
    const s = m[side];
    if (s.kind !== 'winner') return undefined;
    const src = byId.get(s.matchId);
    if (!src || !isBye(src)) return undefined;
    return src.a.kind === 'bye' ? src.labelB : src.labelA;
  };
  const final = main.find((m) => m.round === rounds)!;
  const fp = pos.get(final.id)!;
  if (third) {
    const ty = fp.y + NODE_H + 46;
    pos.set(third.id, { x: fp.x, y: ty });
    height = Math.max(height, ty + NODE_H + 30);
  }
  const champX = LEFT + rounds * (COL_W + COL_GAP);
  const width = champX + 170;
  const champ = res.get(final.id)?.winner;

  const lines: string[] = [];
  for (const m of main) {
    if (m.round === 1) continue;
    const p = pos.get(m.id)!;
    for (const side of ['a', 'b'] as const) {
      const s = m[side];
      if (s.kind !== 'winner') continue;
      const src = pos.get(s.matchId);
      if (!src) continue;
      const x1 = src.x + COL_W;
      const y1 = src.y + NODE_H / 2;
      const x2 = p.x;
      // çizgi, kazananın yazılacağı satıra bağlanır
      const y2 = p.y + (side === 'a' ? NODE_H / 4 : (3 * NODE_H) / 4);
      const mx = x1 + COL_GAP / 2;
      lines.push(`M${x1},${y1} H${mx} V${y2} H${x2}`);
    }
  }
  lines.push(`M${fp.x + COL_W},${fp.y + NODE_H / 2} H${champX}`);

  const heads = Array.from({ length: rounds }, (_, i) => i + 1);
  return (
    <div className="bracket" style={{ width, height }}>
      <svg className="lines" width={width} height={height}>
        {lines.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#c9c1aa" strokeWidth="1.5" />
        ))}
      </svg>
      {heads.map((r) => (
        <div key={r} className="col-head" style={{ left: LEFT + (r - 1) * (COL_W + COL_GAP), width: COL_W }}>
          {stageRoundLabel(stage, r)}
        </div>
      ))}
      {stage.matches.map((m) => {
        const p = pos.get(m.id);
        if (!p) return null; // ön eleme turundaki bay kutuları çizilmez
        return (
          <Node
            key={m.id}
            stage={stage}
            m={m}
            r={res.get(m.id)!}
            x={p.x}
            y={p.y}
            extra={{ a: inherited(m, 'a'), b: inherited(m, 'b') }}
            onClick={onSelect ? () => onSelect(m) : undefined}
          />
        );
      })}
      {third && (
        <div className="col-head" style={{ left: fp.x, top: pos.get(third.id)!.y - 24, width: COL_W }}>
          Üçüncülük
        </div>
      )}
      <div className="champ-box" style={{ left: champX + 8, top: fp.y - 18, width: 150 }}>
        <Trophy size={36} />
        <div style={{ fontWeight: 700, fontSize: '1.15rem', lineHeight: 1.1 }}>{champ ? teamName(t, champ) : 'Şampiyon'}</div>
        <div className="tiny muted">{champ ? 'ŞAMPİYON' : 'belli olacak'}</div>
      </div>
    </div>
  );
}

function PrelimView({ stage, onSelect }: { stage: Stage; onSelect?: (m: Match) => void }) {
  const { t } = useT();
  const res = resolveAll(stage);
  return (
    <>
      <div className="match-list">
        {stage.matches.map((m) => (
          <MatchCard key={m.id} stage={stage} m={m} r={res.get(m.id)} onClick={onSelect ? () => onSelect(m) : undefined} />
        ))}
      </div>
      {stage.direct && stage.direct.length > 0 && (
        <p className="small" style={{ marginTop: '0.75rem' }}>
          <b>Doğrudan ana tabloya geçenler ({stage.direct.length}):</b> {stage.direct.map((id) => teamName(t, id)).join(', ')}
        </p>
      )}
    </>
  );
}

export function BracketView() {
  const { t, admin } = useT();
  const [mode, setMode] = useState<'agac' | 'liste'>(() => (window.innerWidth < 640 ? 'liste' : 'agac'));
  const [editing, setEditing] = useState<{ stageId: string; matchId: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const stages = t.stages.filter((s) => (s.type === 'eleme' || s.type === 'on-eleme') && s.matches.length);
  if (!stages.length) return <div className="empty">Eleme kurası çekilince ağaç burada görünür.</div>;
  const select = admin ? (s: Stage) => (m: Match) => setEditing({ stageId: s.id, matchId: m.id }) : () => undefined;
  const editingStage = editing && t.stages.find((s) => s.id === editing.stageId);
  const editingMatch = editingStage?.matches.find((m) => m.id === editing!.matchId);

  return (
    <>
      <div className="filters">
        <div className="seg">
          <button className={mode === 'agac' ? 'on' : ''} onClick={() => setMode('agac')}>
            Ağaç
          </button>
          <button className={mode === 'liste' ? 'on' : ''} onClick={() => setMode('liste')}>
            Tur listesi
          </button>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <ExportButtons target={ref} name={`${t.id}-eleme-agaci`} />
        </div>
      </div>
      <div ref={ref} className="export-area">
        <div className="print-title">{t.name} · Eleme Ağacı</div>
        {stages.map((s) => (
          <section key={s.id} style={{ marginBottom: '1.25rem' }}>
            {stages.length > 1 && <div className="round-head">{s.name}</div>}
            {s.type === 'on-eleme' ? (
              <PrelimView stage={s} onSelect={admin ? select(s) : undefined} />
            ) : mode === 'agac' ? (
              <div className="bracket-scroll">
                <Bracket stage={s} onSelect={admin ? select(s) : undefined} />
              </div>
            ) : (
              <RoundList stage={s} onSelect={admin ? select(s) : undefined} />
            )}
          </section>
        ))}
      </div>
      {admin && <p className="small muted">Skor girmek veya eşleşmeyi değiştirmek için maça dokunun. Takım adının yanındaki küçük numara güç sırasıdır (yalnızca siz görürsünüz).</p>}
      {stages.some((s) => s.type === 'eleme' && s.matches.some((m) => m.round === 1 && (m.a.kind === 'bye' || m.b.kind === 'bye'))) && (
        <p className="small muted">En soldaki “Ön Eleme” sütununda en zayıf takımlar oynar; kazanan, çizgiyle bağlı olduğu yere geçer. Diğer takımlar ön eleme oynamadan ana tabloya yerleşmiştir.</p>
      )}
      {editingStage && editingMatch && <MatchEditor stage={editingStage} match={editingMatch} onClose={() => setEditing(null)} />}
    </>
  );
}

function RoundList({ stage, onSelect }: { stage: Stage; onSelect?: (m: Match) => void }) {
  const { t } = useT();
  const res = resolveAll(stage);
  const rounds = [...new Set(stage.matches.map((m) => m.round))].sort((a, b) => a - b);
  const isBye = (m: Match) => m.a.kind === 'bye' || m.b.kind === 'bye';
  return (
    <>
      {rounds.map((r) => {
        const ms = stage.matches.filter((m) => m.round === r).sort((x, y) => (x.third ? 1 : 0) - (y.third ? 1 : 0) || x.order - y.order);
        const byes = ms.filter(isBye);
        return (
          <div key={r}>
            <div className="round-head">{stageRoundLabel(stage, r)}</div>
            <div className="match-list">
              {ms
                .filter((m) => !isBye(m))
                .map((m) => (
                  <div key={m.id}>
                    {m.third && <div className="tiny muted">Üçüncülük maçı</div>}
                    <MatchCard stage={stage} m={m} r={res.get(m.id)} onClick={onSelect ? () => onSelect(m) : undefined} />
                  </div>
                ))}
            </div>
            {byes.length > 0 && (
              <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
                Ön eleme oynamadan doğrudan ana tabloya geçenler ({byes.length}):{' '}
                {byes.map((m) => teamName(t, res.get(m.id)!.winner)).join(', ')}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
