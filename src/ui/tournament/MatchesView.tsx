import { useMemo, useRef, useState } from 'react';
import { teamName } from '../../engine/tournament';
import type { Match, Stage } from '../../engine/types';
import { formatDate, useToast } from '../common';
import { resolveAll, stageRoundLabel, useT, type Resolved } from './ctx';
import { exportExcel, exportImage } from './exporters';
import { MatchCard } from './MatchCard';
import { MatchEditor } from './MatchEditor';

export function ExportButtons({ target, name }: { target?: React.RefObject<HTMLElement | null>; name: string }) {
  const { t } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(`Dışa aktarılamadı: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="btn-row">
      <button className="btn ghost sm" disabled={busy} onClick={() => run(() => exportExcel(t))}>
        ⬇ Excel
      </button>
      {target && (
        <button className="btn ghost sm" disabled={busy} onClick={() => run(() => exportImage(target.current!, name))}>
          🖼 Görsel kaydet
        </button>
      )}
    </div>
  );
}

interface Item {
  stage: Stage;
  m: Match;
  r: Resolved;
}

export function MatchesView() {
  const { t, admin } = useT();
  const drawn = t.stages.filter((s) => s.matches.length);
  const current = drawn.find((s) => s.status !== 'bitti') ?? drawn[drawn.length - 1];
  const [stageId, setStageId] = useState<string>(current?.id ?? 'hepsi');
  const [team, setTeam] = useState('');
  const [order, setOrder] = useState<'tur' | 'tarih'>('tur');
  const [editing, setEditing] = useState<{ stageId: string; matchId: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    for (const s of t.stages) {
      if (stageId !== 'hepsi' && s.id !== stageId) continue;
      const res = resolveAll(s);
      for (const m of s.matches) {
        if (m.a.kind === 'bye' || m.b.kind === 'bye') continue;
        const r = res.get(m.id)!;
        if (team && r.a !== team && r.b !== team) continue;
        out.push({ stage: s, m, r });
      }
    }
    return out;
  }, [t, stageId, team]);

  if (!drawn.length) return <div className="empty">Henüz kura çekilmedi. Maç programı kuradan sonra burada görünür.</div>;

  const sections: { title: string; items: Item[] }[] = [];
  if (order === 'tur') {
    for (const s of t.stages) {
      const own = items.filter((i) => i.stage.id === s.id);
      if (!own.length) continue;
      const rounds = [...new Set(own.map((i) => `${i.m.round}|${i.m.third ? 1 : 0}`))].sort((a, b) => {
        const [ra, ta] = a.split('|').map(Number);
        const [rb, tb] = b.split('|').map(Number);
        return ra - rb || tb - ta;
      });
      for (const key of rounds) {
        const [round, third] = key.split('|').map(Number);
        const list = own
          .filter((i) => i.m.round === round && (i.m.third ? 1 : 0) === third)
          .sort((x, y) => (x.m.group ?? '').localeCompare(y.m.group ?? '') || x.m.no - y.m.no);
        const prefix = stageId === 'hepsi' || drawn.length > 1 ? `${s.name} · ` : '';
        sections.push({ title: prefix + stageRoundLabel(s, round, !!third), items: list });
      }
    }
  } else {
    const dated = items.filter((i) => i.m.date).sort((x, y) => `${x.m.date} ${x.m.time ?? ''}`.localeCompare(`${y.m.date} ${y.m.time ?? ''}`));
    const byDate = new Map<string, Item[]>();
    for (const i of dated) byDate.set(i.m.date!, [...(byDate.get(i.m.date!) ?? []), i]);
    for (const [d, list] of byDate) sections.push({ title: formatDate(d), items: list });
    const undated = items.filter((i) => !i.m.date);
    if (undated.length) sections.push({ title: 'Tarihi belirlenmemiş', items: undated });
  }

  const teamOptions = t.teams.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const editingStage = editing && t.stages.find((s) => s.id === editing.stageId);
  const editingMatch = editingStage?.matches.find((m) => m.id === editing!.matchId);

  return (
    <>
      <div className="filters">
        {drawn.length > 1 && (
          <select className="input" value={stageId} onChange={(e) => setStageId(e.target.value)} aria-label="Aşama">
            <option value="hepsi">Tüm aşamalar</option>
            {drawn.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select className="input" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Takım">
          <option value="">Tüm takımlar</option>
          {teamOptions.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>
        <div className="seg">
          <button className={order === 'tur' ? 'on' : ''} onClick={() => setOrder('tur')}>
            Tura göre
          </button>
          <button className={order === 'tarih' ? 'on' : ''} onClick={() => setOrder('tarih')}>
            Tarihe göre
          </button>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <ExportButtons target={ref} name={`${t.id}-mac-programi`} />
        </div>
      </div>
      {admin && <p className="small muted">Skor, tarih, saat ve saha girmek için maça dokunun.</p>}
      <div ref={ref} className="export-area">
        <div className="print-title">
          {t.name} · Maç Programı{team ? ` · ${teamName(t, team)}` : ''}
        </div>
        {sections.length === 0 && <div className="empty">Bu filtreye uygun maç yok.</div>}
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="round-head">{sec.title}</div>
            <div className="match-list">
              {sec.items.map((i) => (
                <MatchCard
                  key={i.m.id}
                  stage={i.stage}
                  m={i.m}
                  r={i.r}
                  showGroup
                  onClick={admin ? () => setEditing({ stageId: i.stage.id, matchId: i.m.id }) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {editingStage && editingMatch && <MatchEditor stage={editingStage} match={editingMatch} onClose={() => setEditing(null)} />}
    </>
  );
}
