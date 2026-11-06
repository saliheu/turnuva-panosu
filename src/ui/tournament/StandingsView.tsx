import { useRef, useState } from 'react';
import { bestExtraTable, computeStageResult, groupTables } from '../../engine/qualify';
import { setManualOrder, teamName } from '../../engine/tournament';
import type { Stage, TeamId } from '../../engine/types';
import { Modal } from '../common';
import { useT } from './ctx';
import { ordinalPlural, ordinalWord } from '../../engine/util';
import { ExportButtons } from './MatchesView';

export function TieModal({ stage, scope, teamIds, onClose }: { stage: Stage; scope: string; teamIds: TeamId[]; onClose: () => void }) {
  const { t, mutate } = useT();
  const [order, setOrder] = useState<TeamId[]>(teamIds);
  const move = (i: number, d: number) => {
    const n = order.slice();
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setOrder(n);
  };
  const save = async () => {
    const existing = (stage.manualOrder?.[scope] ?? []).filter((id) => !order.includes(id));
    const ok = await mutate(`Eşitlik kararı (${scope === '__extra' ? 'en iyi sıradakiler' : `${scope} Grubu`})`, (d) =>
      setManualOrder(d, stage.id, scope, [...existing, ...order]),
    );
    if (ok) onClose();
  };
  return (
    <Modal title="Eşitliği yönetici kararıyla çöz" onClose={onClose}>
      <p className="small muted">Bu takımlar tüm sıralama kriterlerinde eşit. Sıralamayı yukarı/aşağı oklarla belirleyin (ör. kura veya fair-play kararı).</p>
      <div className="list">
        {order.map((id, i) => (
          <div className="list-row" key={id}>
            <b style={{ width: 24 }}>{i + 1}.</b>
            <span className="grow">{teamName(t, id)}</span>
            <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Yukarı">
              ↑
            </button>
            <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Aşağı">
              ↓
            </button>
          </div>
        ))}
      </div>
      <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: '0.75rem' }}>
        <button className="btn ghost" onClick={onClose}>
          Vazgeç
        </button>
        <button className="btn accent" onClick={save}>
          Sıralamayı kaydet
        </button>
      </div>
    </Modal>
  );
}

function StageTables({ stage }: { stage: Stage }) {
  const { t, admin } = useT();
  const [tie, setTie] = useState<{ scope: string; ids: TeamId[] } | null>(null);
  const tables = groupTables(t, stage);
  const k = stage.settings.qualifiersPerGroup ?? 0;
  const extraOn = !!stage.settings.bestExtra?.enabled && (stage.settings.bestExtra?.count ?? 0) > 0;
  const result = computeStageResult(t, stage);
  const extra = extraOn ? bestExtraTable(t, stage, tables) : [];
  const extraChosen = new Set(extra.slice(0, stage.settings.bestExtra?.count ?? 0).map((r) => r.teamId));
  const isLast = t.stages[t.stages.length - 1].id === stage.id;

  return (
    <>
      {admin && result.ties.length > 0 && (
        <div className="alert warn">
          <b>Kriterlerle çözülemeyen eşitlik var.</b> Karar vermeniz gerekiyor:
          <ul>
            {result.ties.map((tie, i) => (
              <li key={i}>
                {tie.scope === '__extra' ? `En iyi ${ordinalPlural(k + 1)}` : stage.type === 'lig' ? 'Lig' : `${tie.scope} Grubu`}:{' '}
                {tie.teamIds.map((id) => teamName(t, id)).join(', ')}{' '}
                <button className="btn sm ghost" onClick={() => setTie({ scope: tie.scope, ids: tie.teamIds })}>
                  Sırayı belirle
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="tables">
        {tables.map((tb) => (
          <div className="card" key={tb.group} style={{ padding: '0.75rem' }}>
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              {stage.type === 'lig' ? 'Puan Durumu' : `${tb.group} Grubu`}
              {tb.complete && <span className="badge done">Tamamlandı</span>}
            </h3>
            <div className="table-wrap">
              <table className="standings">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="team">Takım</th>
                    <th title="Oynanan">O</th>
                    <th title="Galibiyet">G</th>
                    <th title="Beraberlik" className={t.scoring.allowDraw ? '' : 'hide-sm'}>
                      B
                    </th>
                    <th title="Mağlubiyet">M</th>
                    <th title="Atılan" className="hide-sm">
                      A
                    </th>
                    <th title="Yenilen" className="hide-sm">
                      Y
                    </th>
                    <th title="Averaj">Av</th>
                    <th title="Puan">P</th>
                  </tr>
                </thead>
                <tbody>
                  {tb.rows.map((r) => {
                    const q = !isLast && r.rank <= k;
                    const qx = extraOn && r.rank === k + 1 && extraChosen.has(r.teamId);
                    const tm = t.teams.find((x) => x.id === r.teamId);
                    return (
                      <tr key={r.teamId} className={`${q ? 'q' : ''}${qx ? ' qx' : ''}${r.tied ? ' tied' : ''}`}>
                        <td>{r.rank}</td>
                        <td className="team">
                          {teamName(t, r.teamId)}
                          {tm?.withdrawn && <span className="tiny muted"> (çekildi)</span>}
                          {r.manual && <span className="tiny muted" title="Yönetici kararı"> *</span>}
                        </td>
                        <td>{r.played}</td>
                        <td>{r.won}</td>
                        <td className={t.scoring.allowDraw ? '' : 'hide-sm'}>{r.drawn}</td>
                        <td>{r.lost}</td>
                        <td className="hide-sm">{r.gf}</td>
                        <td className="hide-sm">{r.ga}</td>
                        <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                        <td className="pts">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      {extraOn && (
        <div className="card" style={{ marginTop: '1rem', padding: '0.75rem' }}>
          <h3>En iyi {ordinalPlural(k + 1)}</h3>
          <p className="tiny muted">Gruplar farklı büyüklükteyse son sıradaki takımlara karşı maçlar sayılmaz.</p>
          <div className="table-wrap">
            <table className="standings">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="team">Takım</th>
                  <th>Grup</th>
                  <th>O</th>
                  <th>Av</th>
                  <th>A</th>
                  <th>P</th>
                </tr>
              </thead>
              <tbody>
                {extra.map((r) => (
                  <tr key={r.teamId} className={`${extraChosen.has(r.teamId) ? 'qx' : ''}${r.tied ? ' tied' : ''}`}>
                    <td>{r.rank}</td>
                    <td className="team">{teamName(t, r.teamId)}</td>
                    <td>{r.group}</td>
                    <td>{r.played}</td>
                    <td>{r.gd}</td>
                    <td>{r.gf}</td>
                    <td className="pts">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="legend">
        {!isLast && k > 0 && (
          <span>
            <i style={{ background: 'var(--green)' }} />
            Üst tura çıkar
          </span>
        )}
        {extraOn && (
          <span>
            <i style={{ background: 'var(--amber)' }} />
            En iyi {ordinalWord(k + 1)} olarak çıkar
          </span>
        )}
        <span>O: oynanan · G/B/M: galibiyet/beraberlik/mağlubiyet · A/Y: atılan/yenilen · Av: averaj · P: puan · =: eşitlik</span>
      </div>
      {tie && <TieModal stage={stage} scope={tie.scope} teamIds={tie.ids} onClose={() => setTie(null)} />}
    </>
  );
}

export function StandingsView() {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const stages = t.stages.filter((s) => (s.type === 'grup' || s.type === 'lig') && s.groups?.length);
  if (!stages.length) return <div className="empty">Grup veya lig kurası çekilince puan durumu burada görünür.</div>;
  return (
    <>
      <div className="btn-row" style={{ justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <ExportButtons target={ref} name={`${t.id}-puan-durumu`} />
      </div>
      <div ref={ref} className="export-area">
        <div className="print-title">{t.name} · Puan Durumu</div>
        {stages.map((s) => (
          <section key={s.id} style={{ marginBottom: '1.5rem' }}>
            {stages.length > 1 && <div className="round-head">{s.name}</div>}
            <StageTables stage={s} />
          </section>
        ))}
      </div>
    </>
  );
}
