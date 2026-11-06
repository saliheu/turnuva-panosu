import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  applyDraw,
  describeProposal,
  moveInProposal,
  proposeDraw,
  stageEntrants,
  swapInProposal,
  validateProposal,
  type DrawProposal,
} from '../../engine/draw';
import { STAGE_TYPE_LABELS } from '../../engine/planner';
import { computeStageResult, stageProgress } from '../../engine/qualify';
import {
  completeStage,
  groupSwapImpact,
  redrawImpact,
  reopenStage,
  resetStage,
  swapGroupTeams,
  teamName,
} from '../../engine/tournament';
import type { DrawMode, Qualifier, Stage, TeamId } from '../../engine/types';
import { randomSeed } from '../../engine/util';
import { useConfirm } from '../common';
import { useT } from './ctx';
import { LiveDraw } from './LiveDraw';
import { TieModal } from './StandingsView';

function TeamSelect({ value, options, onPick, label, labels }: { value: TeamId | null; options: TeamId[]; onPick: (id: TeamId) => void; label: string; labels?: Record<TeamId, string> }) {
  const { t } = useT();
  const tag = (id: TeamId) => (labels?.[id] ? ` (${/^\d+$/.test(labels[id]) ? `güç sırası ${labels[id]}` : labels[id]})` : '');
  return (
    <select className="input" aria-label={label} value={value ?? ''} onChange={(e) => e.target.value && onPick(e.target.value)} style={{ minHeight: 36, padding: '0.25rem 0.4rem' }}>
      {!value && <option value="">Bay</option>}
      {options.map((id) => (
        <option key={id} value={id}>
          {teamName(t, id)}
          {tag(id)}
        </option>
      ))}
    </select>
  );
}

function ProposalEditor({ p, onChange }: { p: DrawProposal; onChange: (p: DrawProposal) => void }) {
  const all = p.entrants.map((e) => e.teamId);
  if (p.groups) {
    return (
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {p.groups.map((g) => (
          <div className="group-box" key={g.name}>
            <h4>
              {p.type === 'lig' ? 'Lig (fikstür sırası)' : `${g.name} Grubu`} <span className="tiny muted">{g.teamIds.length} takım</span>
            </h4>
            {g.teamIds.map((id) => (
              <div key={id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                <TeamSelect value={id} options={all} label="Takımı değiştir" onPick={(x) => onChange(swapInProposal(p, id, x))} />
                {p.groups!.length > 1 && (
                  <select
                    className="input"
                    aria-label="Başka gruba taşı"
                    title="Başka gruba taşı"
                    value=""
                    style={{ width: 64, minHeight: 36, padding: '0.25rem' }}
                    onChange={(e) => e.target.value && onChange(moveInProposal(p, id, e.target.value))}
                  >
                    <option value="">→</option>
                    {p.groups!.filter((x) => x.name !== g.name).map((x) => (
                      <option key={x.name} value={x.name}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      {p.direct && (
        <div className="group-box" style={{ marginBottom: '0.75rem' }}>
          <h4>Doğrudan geçenler ({p.direct.length})</h4>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 4 }}>
            {p.direct.map((id) => (
              <TeamSelect key={id} value={id} options={all} label="Takımı değiştir" onPick={(x) => onChange(swapInProposal(p, id, x))} />
            ))}
          </div>
        </div>
      )}
      <div className="group-box">
        <h4>
          {p.type === 'on-eleme'
            ? 'Ön eleme maçları'
            : p.pairs!.some((x) => !x.a || !x.b)
              ? 'Ağaçtaki yerleşim (yukarıdan aşağıya). “Bay” karşısındaki takım ön eleme oynamadan ana tabloya geçer.'
              : 'İlk tur eşleşmeleri'}
        </h4>
        {p.pairs!.map((pair, i) => (
          <div className="pair-row" key={i}>
            <span className="tiny muted">{i + 1}.</span>
            {pair.a ? (
              <TeamSelect value={pair.a} options={all} label="1. takım" labels={p.labels} onPick={(x) => onChange(swapInProposal(p, pair.a!, x))} />
            ) : (
              <span className="muted">Bay</span>
            )}
            <span className="muted small">vs</span>
            {pair.b ? (
              <TeamSelect value={pair.b} options={all} label="2. takım" labels={p.labels} onPick={(x) => onChange(swapInProposal(p, pair.b!, x))} />
            ) : (
              <span className="muted">Bay</span>
            )}
          </div>
        ))}
        <p className="tiny muted" style={{ marginBottom: 0 }}>
          Bir takımı değiştirdiğinizde iki takımın yeri karşılıklı değişir.
        </p>
      </div>
    </>
  );
}

function DrawPanel({ stage }: { stage: Stage }) {
  const { t, mutate } = useT();
  const [mode, setMode] = useState<DrawMode>('dengeli');
  const [p, setP] = useState<DrawProposal | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const entrants = stageEntrants(t, stage.id);
  const idx = t.stages.indexOf(stage);
  const make = (m: DrawMode = mode) => {
    try {
      setError('');
      setP(proposeDraw(t, stage.id, m, randomSeed()));
    } catch (e) {
      setError((e as Error).message);
      setP(null);
    }
  };
  if (!entrants) return <div className="alert info">Önceki aşama tamamlanınca bu aşamanın kurası çekilebilir.</div>;
  const errs = p ? validateProposal(p) : [];
  const summary = p && !errs.length ? describeProposal(t, p) : '';
  const fromGroups = idx > 0 && (t.stages[idx - 1].type === 'grup' || t.stages[idx - 1].type === 'lig');

  const commit = async () => {
    if (!p) return;
    const ok = await mutate(`Kura kesinleşti: ${stage.name}`, (d) => void applyDraw(d, { ...p, steps: stepsFor(p) }, summary));
    if (ok) setP(null);
  };

  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {entrants.length} takım bu aşamaya katılacak.
      </p>
      <div className="btn-row">
        <div className="seg">
          <button className={mode === 'dengeli' ? 'on' : ''} onClick={() => (setMode('dengeli'), p && make('dengeli'))}>
            {fromGroups ? 'Plandaki kurala göre' : 'Dengeli (güç puanına göre)'}
          </button>
          <button className={mode === 'rastgele' ? 'on' : ''} onClick={() => (setMode('rastgele'), p && make('rastgele'))}>
            Tamamen rastgele
          </button>
        </div>
        <button className="btn accent" onClick={() => make()}>
          {p ? 'Kurayı yeniden çek' : 'Kurayı çek'}
        </button>
      </div>
      <p className="tiny muted">
        {mode === 'dengeli'
          ? stage.type === 'grup'
            ? 'Güçlü takımlar aynı gruba düşmesin diye takımlar güç puanına göre torbalara ayrılır (1. torbada en güçlüler). Her gruba her torbadan bir takım düşer. Güç puanı aynı olanların sırası kurayla belirlenir.'
            : stage.type === 'on-eleme'
              ? 'En zayıf takımlar ön eleme oynar. Ön eleme oynayanların en güçlüsü en zayıfıyla eşleşir.'
              : fromGroups
                ? 'Eşleşmeler Format’ta seçtiğiniz kurala göre yapılır (ör. A grubu birincisi – B grubu ikincisi).'
                : stage.settings.seeding === 'kesin'
                  ? 'Kesin güç sıralaması: en güçlü takım en zayıfla eşleşir. Puanı aynı olanlar dışında her kurada aynı ağaç çıkar.'
                  : 'Kademeli kura: en güçlü iki takım ağacın ayrı yarılarına konur, güçlüler birbirine erken denk gelmez; kimin kiminle eşleşeceği kurayla belirlenir. Her “yeniden çek”te farklı bir ağaç çıkar.'
          : 'Güç puanlarına bakılmaz; takımlar tamamen rastgele yerleştirilir.'}
        {' '}Kura kaydedilmeden önce size gösterilir; beğenmezseniz yeniden çekebilir veya takımların yerini elle değiştirebilirsiniz.
      </p>
      {error && <div className="alert error">{error}</div>}
      {p && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="alert info" style={{ fontSize: '1rem' }}>
            <b>Kura sonucu (henüz kaydedilmedi):</b> {summary || '—'}
          </div>
          {p.notes.map((n, i) => (
            <div className="alert warn" key={i}>
              {n}
            </div>
          ))}
          {errs.length > 0 && (
            <div className="alert error">
              <ul>
                {errs.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <ProposalEditor p={p} onChange={setP} />
          <div className="btn-row" style={{ marginTop: '0.75rem' }}>
            <button className="btn ghost" onClick={() => setLive(true)}>
              ▶ Canlı kura olarak göster
            </button>
            <button className="btn accent" onClick={commit} disabled={errs.length > 0}>
              Kurayı kesinleştir
            </button>
            <button className="btn ghost" onClick={() => setP(null)}>
              Vazgeç
            </button>
          </div>
          <p className="tiny muted">Canlı kura, önizlemedeki son hâli takım takım gösterir (elle yaptığınız değişiklikler dahil). Kesinleştirmeden hiçbir şey kaydedilmez.</p>
        </div>
      )}
      {live && p && <LiveDraw t={t} title={`${t.name} · ${stage.name}`} steps={stepsFor(p)} onClose={() => setLive(false)} />}
    </div>
  );
}

/** Elle düzenlenmiş önizlemeyle uyumlu çekiliş sırası */
function stepsFor(p: DrawProposal) {
  const placed = new Map<TeamId, string>();
  if (p.groups) for (const g of p.groups) g.teamIds.forEach((id, i) => placed.set(id, p.type === 'lig' ? `Fikstür sırası ${i + 1}` : `${g.name} Grubu`));
  if (p.pairs) {
    const hasBye = p.pairs.some((x) => !x.a || !x.b);
    let pe = 0;
    p.pairs.forEach((x, i) => {
      if (!x.a || !x.b) {
        const id = x.a ?? x.b;
        if (id) placed.set(id, 'Doğrudan ana tabloya');
        return;
      }
      const to = p.type === 'on-eleme' || hasBye ? `Ön eleme ${++pe}` : `Maç ${i + 1}`;
      placed.set(x.a, to);
      placed.set(x.b, to);
    });
  }
  if (p.direct) for (const id of p.direct) placed.set(id, 'Doğrudan ana tabloya');
  return p.steps.map((s) => ({ ...s, to: placed.get(s.teamId) ?? s.to }));
}

function GroupSwap({ stage }: { stage: Stage }) {
  const { t, mutate } = useT();
  const confirm = useConfirm();
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const groupOf = (id: string) => stage.groups?.find((g) => g.teamIds.includes(id))?.name;
  const ids = stage.groups?.flatMap((g) => g.teamIds) ?? [];
  const go = async () => {
    if (!x || !y || groupOf(x) === groupOf(y)) return;
    const impact = groupSwapImpact(t, stage.id, x, y);
    const ok = await confirm({
      title: 'Grupları değiştir',
      message: `${teamName(t, x)} (${groupOf(x)}) ile ${teamName(t, y)} (${groupOf(y)}) yer değiştirecek. İki grubun fikstürü yeniden kurulur; aynı eşleşmelerin skorları ve tarihleri korunur.`,
      items: impact.clears.map((c) => `Silinecek oynanmış maç: ${c.text}`),
      confirmText: impact.clears.length ? 'Skorları silerek değiştir' : 'Değiştir',
      danger: impact.clears.length > 0,
      typeToConfirm: impact.clears.length ? 'DEĞİŞTİR' : undefined,
    });
    if (!ok) return;
    if (await mutate(`Grup değişikliği: ${teamName(t, x)} ↔ ${teamName(t, y)}`, (d) => void swapGroupTeams(d, stage.id, x, y, true))) {
      setX('');
      setY('');
    }
  };
  const opt = (id: string) => (
    <option key={id} value={id}>
      {teamName(t, id)} ({groupOf(id)})
    </option>
  );
  return (
    <details style={{ marginTop: '0.6rem' }}>
      <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
        Gruplar arasında takım değiştir
      </summary>
      <div className="btn-row" style={{ marginTop: '0.5rem' }}>
        <select className="input" style={{ width: 'auto' }} value={x} onChange={(e) => setX(e.target.value)}>
          <option value="">1. takım…</option>
          {ids.map(opt)}
        </select>
        <span>↔</span>
        <select className="input" style={{ width: 'auto' }} value={y} onChange={(e) => setY(e.target.value)}>
          <option value="">2. takım…</option>
          {ids.filter((id) => !x || groupOf(id) !== groupOf(x)).map(opt)}
        </select>
        <button className="btn sm" disabled={!x || !y} onClick={go}>
          Değiştir
        </button>
      </div>
    </details>
  );
}

function CompletePanel({ stage }: { stage: Stage }) {
  const { t, mutate } = useT();
  const result = useMemo(() => computeStageResult(t, stage), [t, stage]);
  const [edited, setEdited] = useState<Qualifier[] | null>(null);
  const [tie, setTie] = useState<{ scope: string; ids: TeamId[] } | null>(null);
  const isLast = t.stages[t.stages.length - 1].id === stage.id;
  const list = edited ?? result.qualifiers;
  const entrants = stage.entrants?.map((e) => e.teamId) ?? [];
  const replaceAt = (i: number, id: TeamId) => {
    const next = list.map((q) => ({ ...q }));
    const j = next.findIndex((q) => q.teamId === id);
    if (j >= 0) [next[i].teamId, next[j].teamId] = [next[j].teamId, next[i].teamId];
    else next[i].teamId = id;
    setEdited(next);
  };
  const confirmStage = async () => {
    await mutate(isLast ? `${stage.name} tamamlandı` : `${stage.name} tamamlandı, ${list.length} takım sonraki aşamaya geçti`, (d) => completeStage(d, stage.id, isLast ? undefined : list));
  };
  return (
    <div className="alert ok" style={{ marginTop: '0.75rem' }}>
      <b>Bu aşamanın tüm maçları oynandı.</b>{' '}
      {isLast
        ? 'Aşamayı tamamlayın, sonra “Şampiyon” sekmesinden şampiyonu onaylayın.'
        : 'Bir sonraki aşamaya çıkan takımlar aşağıda. Kontrol edin; gerekirse değiştirip onaylayın:'}
      {result.ties.length > 0 && (
        <div className="alert warn">
          Puanı ve tüm sıralama kriterleri eşit olan takımlar var. Sıralarını sizin belirlemeniz gerekiyor:
          <ul>
            {result.ties.map((x, i) => (
              <li key={i}>
                {x.teamIds.map((id) => teamName(t, id)).join(', ')}{' '}
                <button className="btn ghost sm" onClick={() => setTie({ scope: x.scope, ids: x.teamIds })}>
                  Sırayı belirle
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.map((w, i) => (
        <div className="alert warn" key={i}>
          {w}
        </div>
      ))}
      {!isLast && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6, marginTop: 8 }}>
          {list.map((q, i) => (
            <label key={i} className="field" style={{ color: 'var(--ink)' }}>
              <span className="tiny">
                {i + 1}. sıra · {q.label}
              </span>
              <select className="input" value={q.teamId} onChange={(e) => replaceAt(i, e.target.value)} style={{ minHeight: 36 }}>
                {entrants.map((id) => (
                  <option key={id} value={id}>
                    {teamName(t, id)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <div className="btn-row" style={{ marginTop: '0.75rem' }}>
        <button className="btn accent" onClick={confirmStage} disabled={result.ties.length > 0 && !edited}>
          {isLast ? 'Aşamayı tamamla' : 'Onayla ve sonraki aşamaya geçir'}
        </button>
        {edited && (
          <button className="btn ghost" onClick={() => setEdited(null)}>
            Otomatik sonuca dön
          </button>
        )}
      </div>
      {tie && <TieModal stage={stage} scope={tie.scope} teamIds={tie.ids} onClose={() => setTie(null)} />}
    </div>
  );
}

function StageCard({ stage, index }: { stage: Stage; index: number }) {
  const { t, mutate } = useT();
  const confirm = useConfirm();
  const progress = stageProgress(stage);
  const next = t.stages[index + 1];

  const redraw = async () => {
    const imp = redrawImpact(t, stage.id);
    const items = [
      ...(imp.played ? [`Bu aşamada ${imp.played} maçın sonucu girilmiş; hepsi silinecek.`] : []),
      ...(imp.laterDrawn.length ? [`Sonraki aşamalar da sıfırlanacak: ${imp.laterDrawn.join(', ')}`] : []),
    ];
    const ok = await confirm({
      title: 'Kurayı sıfırla',
      message: 'Kura ve maç programı silinip aşama kura öncesine döner. Önceki hâl “Geçmiş” sekmesinden geri yüklenebilir.',
      items,
      confirmText: 'Sıfırla',
      danger: true,
      typeToConfirm: imp.played ? 'SIFIRLA' : undefined,
    });
    if (!ok) return;
    await mutate(`Kura sıfırlandı: ${stage.name}`, (d) => resetStage(d, stage.id));
  };
  const reopen = async () => {
    await mutate(`${stage.name} yeniden açıldı`, (d) => reopenStage(d, stage.id));
  };

  return (
    <div className={`card stage-box ${stage.status}`}>
      <div className="section-head" style={{ marginBottom: '0.4rem' }}>
        <h3 style={{ margin: 0 }}>
          {index + 1}. {stage.name} <span className="small muted">({STAGE_TYPE_LABELS[stage.type]})</span>
        </h3>
        <span className={`badge ${stage.status === 'bitti' ? 'done' : stage.matches.length ? 'live' : 'draft'}`}>
          {stage.status === 'bitti' ? 'Tamamlandı' : stage.matches.length ? `${progress.played}/${progress.total} maç` : 'Kura bekliyor'}
        </span>
      </div>
      {stage.drawSummary && <p className="small" style={{ margin: '0.25rem 0' }}>{stage.drawSummary}</p>}

      {!stage.matches.length && <DrawPanel stage={stage} />}

      {stage.matches.length > 0 && (
        <>
          <div className="btn-row" style={{ marginTop: '0.4rem' }}>
            {stage.drawSteps?.length ? (
              <Link className="btn ghost sm" to={`/t/${t.id}/kura/${stage.id}`}>
                ▶ Kurayı canlı izle
              </Link>
            ) : null}
            {stage.status !== 'bitti' && (
              <button className="btn ghost danger sm" onClick={redraw}>
                Kurayı sıfırla / yeniden çek
              </button>
            )}
            {stage.status === 'bitti' && (!next || !next.matches.length) && (
              <button className="btn ghost sm" onClick={reopen}>
                Aşamayı yeniden aç
              </button>
            )}
          </div>
          {stage.type === 'grup' && stage.status !== 'bitti' && (stage.groups?.length ?? 0) > 1 && <GroupSwap stage={stage} />}
          {(stage.type === 'eleme' || stage.type === 'on-eleme') && stage.status !== 'bitti' && (
            <p className="tiny muted">Oynanmamış eşleşmeleri değiştirmek için Maçlar veya Eleme Ağacı sekmesinde maça dokunun.</p>
          )}
          {progress.complete && stage.status !== 'bitti' && <CompletePanel stage={stage} />}
          {stage.status === 'bitti' && stage.qualifiers && stage.qualifiers.length > 0 && (
            <p className="small">
              <b>Bir sonraki aşamaya çıkanlar:</b> {stage.qualifiers.map((q) => `${teamName(t, q.teamId)}${q.label ? ` (${q.label})` : ''}`).join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function StagesTab() {
  const { t } = useT();
  if (!t.stages.length) return <div className="empty">Önce “Format” sekmesinden turnuva aşamalarını belirleyin.</div>;
  return (
    <>
      {t.status === 'taslak' && (
        <div className="alert info">Turnuva taslak durumunda; kura ve maçlar yalnızca size görünür. Hazır olunca “Ayarlar”dan “Devam ediyor” yapın.</div>
      )}
      {t.stages.map((s, i) => (
        <StageCard key={s.id} stage={s} index={i} />
      ))}
    </>
  );
}
