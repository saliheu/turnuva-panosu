import { useMemo, useState } from 'react';
import { groupSizes } from '../../engine/draw';
import {
  analyzePlan,
  defaultSettings,
  defaultStageName,
  STAGE_TYPE_LABELS,
  TEMPLATES,
  templateOptions,
  type StagePlan,
  type TemplateId,
} from '../../engine/planner';
import { ALL_CRITERIA, CRITERION_LABELS } from '../../engine/standings';
import { setFormat } from '../../engine/tournament';
import type { Criterion, StageType } from '../../engine/types';
import { useConfirm } from '../common';
import { useT } from './ctx';
import { PlanSummary } from './PlanSummary';
import { ordinalPlural, ordinalWord } from '../../engine/util';

function CriteriaEditor({ value, onChange, disabled }: { value: Criterion[]; onChange: (v: Criterion[]) => void; disabled?: boolean }) {
  const rest = ALL_CRITERIA.filter((c) => !value.includes(c));
  const move = (i: number, d: number) => {
    const n = value.slice();
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div>
      <div className="small" style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: 4 }}>
        Puanlar eşit olursa sıralama neye göre yapılsın? (yukarıdan aşağıya sırayla bakılır)
      </div>
      <ol style={{ margin: 0, paddingLeft: '1.3rem' }}>
        <li className="small">Puan (her zaman ilk)</li>
        {value.map((c, i) => (
          <li key={c} className="small" style={{ margin: '2px 0' }}>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              {CRITERION_LABELS[c]}
              {!disabled && (
                <>
                  <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Yukarı">
                    ↑
                  </button>
                  <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Aşağı">
                    ↓
                  </button>
                  <button className="btn ghost sm danger" onClick={() => onChange(value.filter((x) => x !== c))} aria-label="Kaldır">
                    ×
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
      {!disabled && rest.length > 0 && (
        <select className="input" style={{ marginTop: 6, maxWidth: 280 }} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value as Criterion])}>
          <option value="">+ Kriter ekle…</option>
          {rest.map((c) => (
            <option key={c} value={c}>
              {CRITERION_LABELS[c]}
            </option>
          ))}
        </select>
      )}
      <p className="tiny muted" style={{ margin: '4px 0 0' }}>
        “Aralarındaki maçlar” kriterleri yalnızca puanı eşit olan takımların birbiriyle yaptığı maçlara bakar. Hiçbir kriter ayıramazsa sıralamayı siz belirlersiniz.
      </p>
    </div>
  );
}

function StageEditor({
  st,
  index,
  incoming,
  isLast,
  prevType,
  nextType,
  locked,
  onChange,
  onRemove,
  onMove,
  total,
}: {
  st: StagePlan;
  index: number;
  incoming: number;
  isLast: boolean;
  prevType?: StageType;
  nextType?: StageType;
  locked: boolean;
  onChange: (s: StagePlan) => void;
  onRemove: () => void;
  onMove: (d: number) => void;
  total: number;
}) {
  const s = st.settings;
  const set = (patch: Partial<StagePlan['settings']>) => onChange({ ...st, settings: { ...s, ...patch } });
  const numInput = (v: number | undefined, f: (n: number) => void, min = 0, max = 64) => (
    <input className="input" type="number" min={min} max={max} value={v ?? 0} disabled={locked} onChange={(e) => f(Math.max(min, Math.min(max, Number(e.target.value) || 0)))} />
  );
  const G = st.type === 'lig' ? 1 : s.groupCount ?? 1;
  const sizes = incoming >= G && G > 0 ? groupSizes(incoming, G) : [];
  return (
    <div className="card stage-box" style={{ marginTop: '0.75rem' }}>
      <div className="section-head" style={{ marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>
          {index + 1}. {STAGE_TYPE_LABELS[st.type]}
          {locked && <span className="badge warn" style={{ marginLeft: 8 }}>Kurası çekildi</span>}
        </h3>
        {!locked && (
          <div className="btn-row">
            <button className="btn ghost sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Yukarı taşı">
              ↑
            </button>
            <button className="btn ghost sm" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Aşağı taşı">
              ↓
            </button>
            <button className="btn ghost sm danger" onClick={onRemove}>
              Kaldır
            </button>
          </div>
        )}
      </div>
      <div className="form-grid">
        <label className="field">
          Aşama adı
          <input className="input" value={st.name} onChange={(e) => onChange({ ...st, name: e.target.value })} />
        </label>
        {!locked && (
          <label className="field">
            Aşama türü
            <select
              className="input"
              value={st.type}
              onChange={(e) => {
                const type = e.target.value as StageType;
                onChange({ type, name: defaultStageName(type), settings: defaultSettings(type) });
              }}
            >
              {(Object.keys(STAGE_TYPE_LABELS) as StageType[]).map((k) => (
                <option key={k} value={k}>
                  {STAGE_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field">
          Bu aşamaya gelen takım
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{incoming}</div>
        </div>
      </div>

      {st.type === 'on-eleme' && (
        <div style={{ marginTop: '0.6rem' }}>
          <label className="field">
            Kaç ön eleme maçı oynansın?
            <select
              className="input"
              disabled={locked || incoming < 3}
              value={s.target && s.target < incoming && incoming <= 2 * s.target ? incoming - s.target : ''}
              onChange={(e) => set({ target: incoming - Number(e.target.value) })}
            >
              {!(s.target && s.target < incoming && incoming <= 2 * s.target) && <option value="">Seçin…</option>}
              {Array.from({ length: Math.floor(incoming / 2) }, (_, i) => i + 1).map((m) => {
                const remain = incoming - m;
                const fits = nextType === 'eleme' && (remain & (remain - 1)) === 0;
                return (
                  <option key={m} value={m}>
                    {m} maç: en zayıf {2 * m} takım oynar → {remain} takım devam eder{fits ? ' (eleme ağacına tam uyar)' : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {s.target && s.target < incoming && incoming <= 2 * s.target ? (
            <p className="small" style={{ margin: '0.4rem 0 0' }}>
              En zayıf {2 * (incoming - s.target)} takım kendi aralarında {incoming - s.target} maç oynar; {incoming - s.target === 1 ? 'kaybeden' : 'kaybedenler'} elenir. Diğer{' '}
              {incoming - 2 * (incoming - s.target)} takım maç yapmadan geçer. Sonraki aşamaya toplam <b>{s.target} takım</b> kalır.
              {nextType === 'eleme' && (s.target & (s.target - 1)) !== 0 && (
                <span className="muted"> Not: {s.target} takımla eleme ağacı tam kurulamaz, bazı takımlar bay geçer.</span>
              )}
            </p>
          ) : (
            <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
              Ön elemede en zayıf takımlar eşleşir: en zayıf iki takım 1 maç yapar, kazanan turnuvada kalır.
            </p>
          )}
        </div>
      )}

      {(st.type === 'grup' || st.type === 'lig') && (
        <>
          <div className="form-grid" style={{ marginTop: '0.6rem' }}>
            {st.type === 'grup' && (
              <label className="field">
                Grup sayısı
                {numInput(s.groupCount, (v) => set({ groupCount: v }), 1, 32)}
              </label>
            )}
            {st.type === 'grup' && (
              <label className="field">
                Grupta kaç takım olsun?
                <select
                  className="input"
                  disabled={locked}
                  value=""
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    if (size) set({ groupCount: Math.max(1, Math.round(incoming / size)) });
                  }}
                >
                  <option value="">{!sizes.length ? '—' : Math.min(...sizes) === Math.max(...sizes) ? `Şu an: her grupta ${sizes[0]} takım` : `Şu an: ${sizes.join(' / ')} takımlı gruplar`}</option>
                  {[3, 4, 5, 6, 8].map((size) => (
                    <option key={size} value={size}>
                      {size} takımlı gruplar yap ({Math.max(1, Math.round(incoming / size))} grup)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Takımlar kaç kez karşılaşsın?
              <select className="input" disabled={locked} value={s.legs ?? 1} onChange={(e) => set({ legs: Number(e.target.value) as 1 | 2 })}>
                <option value={1}>Bir kez (tek maç)</option>
                <option value={2}>İki kez (rövanşlı)</option>
              </select>
            </label>
            {!isLast && (
              <label className="field">
                {st.type === 'grup' ? 'Her gruptan kaç takım çıksın?' : 'Ligden kaç takım sonraki aşamaya çıksın?'}
                {numInput(s.qualifiersPerGroup, (v) => set({ qualifiersPerGroup: v }), 0, 16)}
              </label>
            )}
          </div>
          {st.type === 'grup' && !isLast && (
            <div style={{ marginTop: '0.5rem' }}>
              <label className="check">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={!!s.bestExtra?.enabled}
                  onChange={(e) => set({ bestExtra: { enabled: e.target.checked, count: s.bestExtra?.count || 1 } })}
                />
                Grubunu {ordinalWord((s.qualifiersPerGroup ?? 0) + 1)} bitirenlerin en iyileri de çıksın (ör. en iyi {ordinalPlural((s.qualifiersPerGroup ?? 0) + 1)})
              </label>
              {s.bestExtra?.enabled && (
                <label className="field" style={{ maxWidth: 200 }}>
                  Bunlardan kaç takım çıksın?
                  {numInput(s.bestExtra.count, (v) => set({ bestExtra: { enabled: true, count: v } }), 1, 32)}
                </label>
              )}
            </div>
          )}
          <div style={{ marginTop: '0.75rem' }}>
            <CriteriaEditor value={s.criteria ?? []} onChange={(c) => set({ criteria: c })} />
          </div>
        </>
      )}

      {st.type === 'eleme' && (
        <div style={{ marginTop: '0.6rem' }}>
          {(prevType === 'grup' || prevType === 'lig') && (
            <div className="form-grid">
              <label className="field">
                Gruplardan çıkanlar kiminle eşleşsin?
                <select className="input" disabled={locked} value={s.pairing ?? 'capraz'} onChange={(e) => set({ pairing: e.target.value as 'capraz' | 'sirali' | 'elle' })}>
                  <option value="capraz">Çapraz: A grubu 1.si – B grubu 2.si, B grubu 1.si – A grubu 2.si</option>
                  <option value="sirali">Başarı sırasına göre: en iyi birinci, en zayıf ikinciyle oynar</option>
                  <option value="elle">Elle: eşleşmeleri kurada kendim belirleyeceğim</option>
                </select>
              </label>
            </div>
          )}
          {(prevType === 'grup' || prevType === 'lig') && (
            <label className="check">
              <input type="checkbox" disabled={locked} checked={s.avoidSameGroup ?? true} onChange={(e) => set({ avoidSameGroup: e.target.checked })} />
              Aynı gruptan çıkanlar ilk turda karşılaşmasın
            </label>
          )}
          <label className="check">
            <input type="checkbox" disabled={locked} checked={!!s.thirdPlace} onChange={(e) => set({ thirdPlace: e.target.checked })} />
            Üçüncülük maçı oynansın
          </label>
          {!prevType && (
            <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
              Kuranın nasıl çekileceğini (kademeli kura, kesin güç sıralaması veya tamamen rastgele) kura ekranında seçeceksiniz. Takım sayısı 2, 4, 8, 16,
              32 veya 64 değilse en zayıf takımlar önce ön eleme oynar; ön eleme maçları ağacın en solunda görünür.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export interface FormatEditorProps {
  /** Turnuvadaki aktif takım sayısı */
  n: number;
  /** İlk aşamaya giren takım sayısı (kura çekildiyse kesinleşen sayı) */
  firstStageN: number;
  plan: StagePlan[];
  setPlan: (p: StagePlan[]) => void;
  drawnCount?: number;
  lockedIdx?: (i: number) => boolean;
  /** Şablon listesi başta açık gelsin mi */
  initialTemplate?: TemplateId | null;
}

/** Şablon seçimi + aşama düzenleyici + plan özeti (turnuva sayfası ve yeni turnuva sihirbazı ortak kullanır) */
export function FormatEditor({ n, firstStageN, plan, setPlan, drawnCount = 0, lockedIdx = () => false, initialTemplate = 'grup-eleme' }: FormatEditorProps) {
  const [tpl, setTpl] = useState<TemplateId | null>(initialTemplate);
  const analysis = useMemo(() => analyzePlan(firstStageN, plan), [firstStageN, plan]);
  const options = tpl ? templateOptions(tpl, n) : null;
  return (
    <>
      {n < 2 && <div className="alert warn">Format seçmeden önce en az 2 takım ekleyin (Takımlar sekmesi).</div>}
      {drawnCount > 0 && (
        <div className="alert info">
          {drawnCount} aşamanın kurası çekildi; bu aşamaların yapısı kilitli (adı ve sıralama kriterleri değiştirilebilir). Değiştirmek için “Aşamalar” sekmesinden kurayı sıfırlayın.
        </div>
      )}

      {!drawnCount && (
        <div className="card">
          <h3>Hazır şablonlar ({n} takım)</h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {TEMPLATES.map((x) => (
              <button key={x.id} className={`option${tpl === x.id ? ' on' : ''}`} onClick={() => setTpl(x.id)}>
                <b>{x.title}</b>
                <div className="small muted">{x.description}</div>
              </button>
            ))}
          </div>
          {options && (
            <div style={{ marginTop: '0.9rem' }}>
              {options.message && <div className="alert warn">{options.message}</div>}
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
                {n} takım için geçerli seçenekler — birini seçip aşağıda istediğiniz ayarı değiştirebilirsiniz:
              </div>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {options.options.map((o) => (
                  <button key={o.id} className={`option${JSON.stringify(o.stages) === JSON.stringify(plan) ? ' on' : ''}`} onClick={() => setPlan(o.stages)}>
                    <b>{o.title}</b> {o.recommended && <span className="badge done">Önerilen</span>}
                    <div className="small muted">{o.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2>Aşamalar</h2>
          {!drawnCount && (
            <select
              className="input"
              style={{ width: 'auto' }}
              value=""
              onChange={(e) => {
                const type = e.target.value as StageType;
                if (type) setPlan([...plan, { type, name: defaultStageName(type), settings: defaultSettings(type) }]);
              }}
            >
              <option value="">+ Aşama ekle…</option>
              {(Object.keys(STAGE_TYPE_LABELS) as StageType[]).map((k) => (
                <option key={k} value={k}>
                  {STAGE_TYPE_LABELS[k]}
                </option>
              ))}
            </select>
          )}
        </div>
        {plan.length === 0 && <div className="empty">Bir şablon seçin veya aşama ekleyin.</div>}
        {plan.map((st, i) => (
          <StageEditor
            key={i}
            st={st}
            index={i}
            total={plan.length}
            incoming={analysis.flow[i]?.inCount ?? 0}
            isLast={i === plan.length - 1}
            prevType={plan[i - 1]?.type}
            nextType={plan[i + 1]?.type}
            locked={lockedIdx(i)}
            onChange={(s) => setPlan(plan.map((x, j) => (j === i ? s : x)))}
            onRemove={() => setPlan(plan.filter((_, j) => j !== i))}
            onMove={(d) => {
              const p = plan.slice();
              const j = i + d;
              if (j < 0 || j >= p.length || lockedIdx(j)) return;
              [p[i], p[j]] = [p[j], p[i]];
              setPlan(p);
            }}
          />
        ))}
      </div>

      {plan.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Turnuva nasıl ilerleyecek?</h3>
          <div className="flow">
            <span className="step">
              <b>{firstStageN} takım</b>
            </span>
            {analysis.flow.map((f, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <span className="muted">→</span>
                <span className="step">
                  <b>{f.name}</b> <span className="small muted">{f.text}</span>
                </span>
              </span>
            ))}
          </div>
          {analysis.errors.length > 0 && (
            <div className="alert error">
              <ul>
                {analysis.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.warnings.length > 0 && (
            <div className="alert warn">
              <ul>
                {analysis.warnings.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.suggestions.length > 0 && !drawnCount && (
            <div style={{ marginTop: '0.5rem' }}>
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
                Geçerli seçenekler:
              </div>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {analysis.suggestions.map((o) => (
                  <button key={o.id + o.description} className="option" onClick={() => setPlan(o.stages)}>
                    <b>{o.title}</b>
                    <div className="small muted">{o.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {!analysis.errors.length && !analysis.warnings.length && <div className="alert ok">Plan geçerli.</div>}
        </div>
      )}

    </>
  );
}

export function FormatTab() {
  const { t, mutate } = useT();
  const confirm = useConfirm();
  const n = t.teams.filter((x) => !x.withdrawn).length;
  const initial: StagePlan[] = t.stages.map((s) => ({ type: s.type, name: s.name, settings: JSON.parse(JSON.stringify(s.settings)) }));
  const [plan, setPlan] = useState<StagePlan[]>(initial);
  const drawnCount = t.stages.filter((s) => s.matches.length).length;
  const lockedIdx = (i: number) => i < t.stages.length && t.stages[i].matches.length > 0;
  const firstStageN = drawnCount && t.stages[0].entrants ? t.stages[0].entrants.length : n;
  const analysis = useMemo(() => analyzePlan(firstStageN, plan), [firstStageN, plan]);
  const dirty = JSON.stringify(plan) !== JSON.stringify(initial);
  // Format belirlendiyse kilitli özet gösterilir; değiştirmek için düğmeye basılır
  const [editing, setEditing] = useState(t.stages.length === 0);

  const save = async () => {
    if (analysis.errors.length) {
      const ok = await confirm({ title: 'Planda hata var', items: analysis.errors, message: 'Yine de kaydedilsin mi? Hatalı aşamada kura çekilemez.', confirmText: 'Yine de kaydet' });
      if (!ok) return;
    }
    await mutate('Format kaydedildi', (d) => {
      if (!drawnCount) {
        setFormat(d, plan);
        return;
      }
      // Kurası çekilmiş aşamalar korunur; yalnızca adları/kriterleri ve sonraki aşamalar değişir
      const kept = d.stages.slice(0, drawnCount);
      kept.forEach((s, i) => {
        s.name = plan[i].name;
        if (plan[i].settings.criteria) s.settings.criteria = plan[i].settings.criteria;
      });
      const tmp = { ...d, stages: [] as typeof d.stages };
      setFormat(tmp, plan.slice(drawnCount));
      d.stages = [...kept, ...tmp.stages];
      const last = kept[kept.length - 1];
      if (last?.status === 'bitti' && d.stages[drawnCount]) d.stages[drawnCount].entrants = last.qualifiers;
    });
  };

  if (!editing) {
    return (
      <div className="card">
        <div className="section-head" style={{ marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>🔒 Turnuva formatı</h3>
          <button className="btn ghost sm" onClick={() => setEditing(true)}>
            Formatı değiştir
          </button>
        </div>
        <PlanSummary n={firstStageN} plan={initial} showCriteria />
        {drawnCount > 0 && (
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Kurası çekilmiş aşamaların yapısı değiştirilemez; yalnızca adları, sıralama kriterleri ve henüz kurası çekilmemiş aşamalar değiştirilebilir.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <FormatEditor
        n={n}
        firstStageN={firstStageN}
        plan={plan}
        setPlan={setPlan}
        drawnCount={drawnCount}
        lockedIdx={lockedIdx}
        initialTemplate={t.stages.length ? null : 'grup-eleme'}
      />
      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <button className="btn accent" disabled={!dirty || !plan.length} onClick={save}>
          Formatı kaydet
        </button>
        {t.stages.length > 0 && (
          <button className="btn ghost" onClick={() => (setPlan(initial), setEditing(false))}>
            Vazgeç
          </button>
        )}
      </div>
    </>
  );
}
