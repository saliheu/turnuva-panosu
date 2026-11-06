import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { analyzePlan, STAGE_TYPE_LABELS, type StagePlan } from '../../engine/planner';
import { CRITERION_LABELS, DEFAULT_CRITERIA } from '../../engine/standings';
import { newTournament, scoringPreset, setFormat, slugify } from '../../engine/tournament';
import type { Tournament } from '../../engine/types';
import { clone, currentSchoolYear, uid } from '../../engine/util';
import { api } from '../api';
import { Spinner, useConfirm, useDocumentTitle, useToast } from '../common';
import { useSession } from '../session';
import { TournamentCtx, type TournamentCtxValue } from '../tournament/ctx';
import { FormatEditor } from '../tournament/FormatTab';
import { ScoringEditor, SportInput, yearOptions } from '../tournament/SettingsTab';
import { TeamsTab } from '../tournament/TeamsTab';

const STORAGE_KEY = 'turnuva-panosu:yeni-turnuva';

const STEPS = [
  { title: 'Bilgiler', hint: 'Turnuvanın adı, branşı ve öğretim yılı' },
  { title: 'Takımlar', hint: 'Takımlar ve güç puanları' },
  { title: 'Format', hint: 'Aşamalar ve tur atlama kuralları' },
  { title: 'Puanlama', hint: 'Galibiyet, beraberlik, hükmen ve sıralama' },
  { title: 'Özet', hint: 'Kontrol edip oluşturun' },
];

interface WizardState {
  step: number;
  /** Ulaşılmış en ileri adım (geri dönüp tekrar ileri giderken kullanılır) */
  reached: number;
  draft: Tournament;
  plan: StagePlan[];
  powersAck: boolean;
  warningsAck: string;
  scoringSeen: boolean;
}

function freshState(): WizardState {
  return {
    step: 0,
    reached: 0,
    draft: newTournament({ name: '', sport: 'Futbol', schoolYear: currentSchoolYear() }),
    plan: [],
    powersAck: false,
    warningsAck: '',
    scoringSeen: false,
  };
}

function loadState(): WizardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WizardState) : null;
  } catch {
    return null;
  }
}

function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (i: number) => void }) {
  return (
    <ol className="stepper-bar" aria-label="Adımlar">
      {STEPS.map((s, i) => {
        const state = i === step ? 'current' : i < reached ? 'done' : 'todo';
        return (
          <li key={s.title} className={`stp ${state}`}>
            <button type="button" disabled={i > reached} onClick={() => onGo(i)} aria-current={i === step ? 'step' : undefined} aria-label={`${i + 1}. adım: ${s.title}`} title={s.title}>
              <span className="stp-no">{state === 'done' ? '✓' : i + 1}</span>
              <span className="stp-title">{s.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export default function NewTournamentWizard() {
  const { admin, ready } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  useDocumentTitle('Yeni turnuva');
  const [st, setSt] = useState<WizardState>(() => loadState() ?? freshState());
  const [resumed] = useState(() => !!loadState());
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const draftRef = useRef(st.draft);
  draftRef.current = st.draft;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  }, [st]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setShowErrors(false);
  }, [st.step]);

  const t = st.draft;
  const setDraft = (d: Tournament) => setSt((s) => ({ ...s, draft: d }));
  const n = t.teams.filter((x) => !x.withdrawn).length;
  const analysis = useMemo(() => analyzePlan(n, st.plan), [n, st.plan]);
  const warningsKey = analysis.warnings.join('|');

  // Takım adımındaki mevcut düzenleyiciyi taslak üzerinde çalıştırmak için yerel bağlam
  const ctx: TournamentCtxValue = useMemo(
    () => ({
      t,
      admin: true,
      saving: false,
      reload: async () => {},
      replace: setDraft,
      mutate: async (_label, fn) => {
        const d = clone(draftRef.current);
        try {
          fn(d);
        } catch (e) {
          toast((e as Error).message, 'error');
          return false;
        }
        setDraft(d);
        return true;
      },
    }),
    [t, toast],
  );

  if (!ready) return <Spinner />;
  if (!admin) {
    return (
      <div className="empty" style={{ marginTop: '2rem' }}>
        Yeni turnuva oluşturmak için <Link to="/yonetim">yönetici girişi</Link> yapın.
      </div>
    );
  }

  const powers = new Set(t.teams.map((x) => x.power));
  const allSamePower = n >= 2 && powers.size === 1;

  // Her adımın tamamlanma şartları
  const problems = (step: number): string[] => {
    const p: string[] = [];
    if (step === 0) {
      if (!t.name.trim()) p.push('Turnuva adını yazın.');
      if (!t.sport.trim()) p.push('Branşı seçin.');
    }
    if (step === 1) {
      if (n < 2) p.push('En az 2 takım ekleyin.');
      const names = t.teams.map((x) => x.name.trim().toLocaleLowerCase('tr'));
      if (new Set(names).size !== names.length) p.push('Aynı adda iki takım var; adları düzeltin.');
      if (allSamePower && !st.powersAck) p.push('Bütün takımların güç puanı aynı. Güç puanı verin veya aşağıdaki kutuyu işaretleyin.');
    }
    if (step === 2) {
      if (!st.plan.length) p.push('Bir şablon seçeneği seçin veya aşama ekleyin.');
      else p.push(...analysis.errors);
      if (!analysis.errors.length && analysis.warnings.length && st.warningsAck !== warningsKey) p.push('Plan uyarılarını okuduğunuzu işaretleyin.');
    }
    if (step === 3 && !st.scoringSeen) p.push('Puanlama ayarlarını kontrol ettiğinizi işaretleyin.');
    return p;
  };

  const current = problems(st.step);
  const next = () => {
    if (current.length) {
      setShowErrors(true);
      return;
    }
    setSt((s) => ({ ...s, step: s.step + 1, reached: Math.max(s.reached, s.step + 1) }));
  };
  const back = () => setSt((s) => ({ ...s, step: Math.max(0, s.step - 1) }));
  const go = (i: number) => {
    // ileriye atlarken aradaki adımlar hâlâ geçerli olmalı
    for (let k = 0; k < i; k++) {
      if (problems(k).length) {
        setSt((s) => ({ ...s, step: k }));
        setShowErrors(true);
        return;
      }
    }
    setSt((s) => ({ ...s, step: i }));
  };

  const restart = async () => {
    if (!(await confirm({ title: 'Baştan başla', message: 'Girdiğiniz bilgiler silinsin mi?', danger: true, confirmText: 'Baştan başla' }))) return;
    localStorage.removeItem(STORAGE_KEY);
    setSt(freshState());
  };

  const create = async () => {
    for (let k = 0; k < STEPS.length - 1; k++) {
      if (problems(k).length) {
        setSt((s) => ({ ...s, step: k }));
        setShowErrors(true);
        return;
      }
    }
    setBusy(true);
    try {
      const d = clone(t);
      d.id = `${slugify(d.name) || 'turnuva'}-${uid().slice(0, 5)}`;
      d.name = d.name.trim();
      d.category = d.category?.trim() || undefined;
      d.description = d.description?.trim() || undefined;
      d.status = 'taslak';
      setFormat(d, st.plan);
      const saved = await api.create(d);
      localStorage.removeItem(STORAGE_KEY);
      toast('Turnuva oluşturuldu. Şimdi kurayı çekebilirsiniz.', 'ok');
      navigate(`/t/${saved.id}?sekme=asamalar`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const groupStages = st.plan.filter((p) => p.type === 'grup' || p.type === 'lig');

  return (
    <TournamentCtx.Provider value={ctx}>
      <div className="t-hero">
        <div>
          <div className="eyebrow">
            Yeni turnuva · Adım {st.step + 1}/{STEPS.length}
          </div>
          <h1>{STEPS[st.step].title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {STEPS[st.step].hint}
          </p>
        </div>
        <button className="btn ghost sm" onClick={restart}>
          Baştan başla
        </button>
      </div>
      <Stepper step={st.step} reached={st.reached} onGo={go} />
      {resumed && st.step === 0 && st.draft.name && (
        <div className="alert info">Yarım kalan turnuva kurulumunuz yüklendi. Kaldığınız yerden devam edebilir veya baştan başlayabilirsiniz.</div>
      )}

      <div className="wizard-body">
        {st.step === 0 && (
          <div className="card">
            <div className="form-grid">
              <label className="field">
                Turnuva adı *
                <input
                  className="input"
                  value={t.name}
                  autoFocus
                  onChange={(e) => setDraft({ ...t, name: e.target.value })}
                  placeholder="Sınıflar arası futbol turnuvası"
                />
              </label>
              <label className="field">
                Branş *
                <SportInput
                  value={t.sport}
                  onChange={(v) => setSt((s) => ({ ...s, draft: { ...s.draft, sport: v, scoring: scoringPreset(v) }, scoringSeen: false }))}
                />
              </label>
              <label className="field">
                Öğretim yılı
                <select className="input" value={t.schoolYear} onChange={(e) => setDraft({ ...t, schoolYear: e.target.value })}>
                  {yearOptions().map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Kategori (isteğe bağlı)
                <input className="input" value={t.category ?? ''} onChange={(e) => setDraft({ ...t, category: e.target.value })} placeholder="Erkekler, Kızlar, 9. sınıflar…" />
              </label>
            </div>
            <label className="field" style={{ marginTop: '0.75rem' }}>
              Açıklama / kurallar (isteğe bağlı)
              <textarea className="input" value={t.description ?? ''} onChange={(e) => setDraft({ ...t, description: e.target.value })} placeholder="Maç süreleri, kıyafet, oyuncu sayısı…" />
            </label>
            <p className="tiny muted">Branşa göre puanlama varsayılanları 4. adımda gösterilir; orada değiştirebilirsiniz.</p>
          </div>
        )}

        {st.step === 1 && (
          <>
            <TeamsTab />
            {allSamePower && (
              <div className="alert warn">
                Bütün takımların güç puanı {t.teams[0].power}. Güç puanı verirseniz “dengeli kura” güçlü takımları farklı gruplara/ağacın farklı yerlerine dağıtır.
                <label className="check" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={st.powersAck} onChange={(e) => setSt((s) => ({ ...s, powersAck: e.target.checked }))} />
                  Güç puanı vermeden devam etmek istiyorum (sıralama tamamen kurayla belirlenir)
                </label>
              </div>
            )}
          </>
        )}

        {st.step === 2 && (
          <>
            <FormatEditor n={n} firstStageN={n} plan={st.plan} setPlan={(p) => setSt((s) => ({ ...s, plan: p }))} initialTemplate={st.plan.length ? null : 'grup-eleme'} />
            {!analysis.errors.length && analysis.warnings.length > 0 && (
              <label className="check card" style={{ marginTop: '0.75rem' }}>
                <input type="checkbox" checked={st.warningsAck === warningsKey} onChange={(e) => setSt((s) => ({ ...s, warningsAck: e.target.checked ? warningsKey : '' }))} />
                Plan uyarılarını okudum, bu planla devam etmek istiyorum
              </label>
            )}
          </>
        )}

        {st.step === 3 && (
          <>
            <ScoringEditor value={t.scoring} onChange={(sc) => setDraft({ ...t, scoring: sc })} sport={t.sport} />
            {groupStages.length > 0 && (
              <div className="card">
                <h3>Puan eşitliğinde sıralama</h3>
                {groupStages.map((g, i) => (
                  <p key={i} className="small" style={{ margin: '0.25rem 0' }}>
                    <b>{g.name}:</b> Puan → {(g.settings.criteria ?? DEFAULT_CRITERIA).map((c) => CRITERION_LABELS[c]).join(' → ')} → yönetici kararı
                  </p>
                ))}
                <p className="tiny muted">Sırayı değiştirmek için “Format” adımına dönün.</p>
              </div>
            )}
            <label className="check card" style={{ marginTop: '0.75rem' }}>
              <input type="checkbox" checked={st.scoringSeen} onChange={(e) => setSt((s) => ({ ...s, scoringSeen: e.target.checked }))} />
              Puanlama ayarlarını kontrol ettim
            </label>
          </>
        )}

        {st.step === 4 && (
          <div className="card">
            <dl className="summary">
              <dt>Turnuva</dt>
              <dd>
                <b>{t.name}</b>
                <span className="muted">
                  {' '}
                  · {t.sport} · {t.schoolYear}
                  {t.category ? ` · ${t.category}` : ''}
                </span>
                <button className="link" onClick={() => go(0)}>
                  Düzenle
                </button>
              </dd>
              <dt>Takımlar</dt>
              <dd>
                {n} takım: {t.teams.map((x) => x.name).join(', ')}
                <button className="link" onClick={() => go(1)}>
                  Düzenle
                </button>
              </dd>
              <dt>Format</dt>
              <dd>
                <div className="flow">
                  <span className="step">
                    <b>{n} takım</b>
                  </span>
                  {analysis.flow.map((f, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      <span className="muted">→</span>
                      <span className="step">
                        <b>{f.name}</b> <span className="small muted">{STAGE_TYPE_LABELS[f.type]} · {f.text}</span>
                      </span>
                    </span>
                  ))}
                </div>
                {st.plan.map((p, i) => (
                  <div key={i} className="tiny muted" style={{ marginTop: 4 }}>
                    {p.name}:{' '}
                    {[
                      p.settings.legs === 2 && 'çift maç',
                      p.settings.legs === 1 && (p.type === 'grup' || p.type === 'lig') && 'tek maç',
                      p.type === 'on-eleme' && `${p.settings.target ?? 0} takım ana tabloya kalır`,
                      p.settings.bestExtra?.enabled && `en iyi ${p.settings.bestExtra.count} ek takım`,
                      p.type === 'eleme' && i > 0 && st.plan[i - 1].type !== 'on-eleme' && (p.settings.pairing === 'capraz' ? 'çapraz eşleşme' : p.settings.pairing === 'elle' ? 'elle eşleşme' : 'sıralı eşleşme'),
                      p.type === 'eleme' && i > 0 && st.plan[i - 1].type !== 'on-eleme' && p.settings.avoidSameGroup !== false && 'aynı grup ilk turda karşılaşmaz',
                      p.type === 'eleme' && i === 0 && (p.settings.seeding === 'kesin' ? 'kesin güç sıralaması' : 'kademeli kura (güçlüler erken karşılaşmaz)'),
                      p.type === 'eleme' && (p.settings.thirdPlace ? 'üçüncülük maçı var' : 'üçüncülük maçı yok'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                ))}
                <button className="link" onClick={() => go(2)}>
                  Düzenle
                </button>
              </dd>
              <dt>Puanlama</dt>
              <dd>
                Galibiyet {t.scoring.win}, {t.scoring.allowDraw ? `beraberlik ${t.scoring.draw}, ` : 'beraberlik yok, '}mağlubiyet {t.scoring.loss} · hükmen{' '}
                {t.scoring.forfeitScore[0]}-{t.scoring.forfeitScore[1]} · birim: {t.scoring.unit}
                {t.scoring.volleyball ? ' · voleybol kuralı' : ''}
                <button className="link" onClick={() => go(3)}>
                  Düzenle
                </button>
              </dd>
            </dl>
            <div className="alert info">
              Turnuva <b>Taslak</b> olarak oluşturulur ve siz yayınlayana kadar herkese kapalıdır. Oluşturduktan sonra kura ekranı açılır; kurayı
              çektikten sonra “Ayarlar” sekmesinden “Devam ediyor” yapın.
            </div>
          </div>
        )}

        {showErrors && current.length > 0 && (
          <div className="alert error" role="alert">
            <b>Devam etmeden önce:</b>
            <ul>
              {current.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="wizard-nav">
        <button className="btn ghost" onClick={back} disabled={st.step === 0}>
          ← Geri
        </button>
        <span className="small muted">
          {st.step + 1} / {STEPS.length}
        </span>
        {st.step < STEPS.length - 1 ? (
          <button className="btn accent" onClick={next}>
            Sonraki →
          </button>
        ) : (
          <button className="btn accent" onClick={create} disabled={busy}>
            {busy ? 'Oluşturuluyor…' : 'Turnuvayı oluştur'}
          </button>
        )}
      </div>
    </TournamentCtx.Provider>
  );
}
