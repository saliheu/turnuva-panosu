import { useMemo, useState } from 'react';
import { BYE } from '../../engine/results';
import {
  applyScore,
  clearScore,
  restoreSlotSource,
  scoreImpact,
  setMatchTeam,
  teamName,
  validateScore,
  type ScorePatch,
} from '../../engine/tournament';
import type { Match, Stage, TeamId } from '../../engine/types';
import { Modal, useConfirm } from '../common';
import { resolveAll, sideName, useT } from './ctx';

function NumberBox({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div>
      <input
        className="score-input"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '');
          onChange(v === '' ? null : Math.min(999, Number(v)));
        }}
      />
      <div className="stepper">
        <button type="button" aria-label={`${label} azalt`} onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}>
          −
        </button>
        <button type="button" aria-label={`${label} artır`} onClick={() => onChange((value ?? 0) + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

export function MatchEditor({ stage, match, onClose }: { stage: Stage; match: Match; onClose: () => void }) {
  const { t, mutate } = useT();
  const confirm = useConfirm();
  const r = useMemo(() => resolveAll(stage).get(match.id)!, [stage, match.id]);
  const A = sideName(t, stage, match, 'a', r);
  const B = sideName(t, stage, match, 'b', r);
  const knockout = stage.type === 'eleme' || stage.type === 'on-eleme';
  const teamsKnown = !!r.a && !!r.b && r.a !== BYE && r.b !== BYE;
  const [sa, setSa] = useState<number | null>(match.forfeit ? null : (match.scoreA ?? null));
  const [sb, setSb] = useState<number | null>(match.forfeit ? null : (match.scoreB ?? null));
  const [penA, setPenA] = useState<number | null>(match.penA ?? null);
  const [penB, setPenB] = useState<number | null>(match.penB ?? null);
  const [decided, setDecided] = useState<'a' | 'b' | null>(match.decided ?? null);
  const [forfeit, setForfeit] = useState<'a' | 'b' | null>(match.forfeit ?? null);
  const [tieMode, setTieMode] = useState<'pen' | 'karar'>(match.decided && match.penA == null ? 'karar' : 'pen');
  const [date, setDate] = useState(match.date ?? '');
  const [time, setTime] = useState(match.time ?? '');
  const [venue, setVenue] = useState(match.venue ?? '');
  const [note, setNote] = useState(match.note ?? '');
  const venues = useMemo(() => [...new Set(t.stages.flatMap((s) => s.matches.map((m) => m.venue).filter(Boolean)))] as string[], [t]);

  const isTie = knockout && !forfeit && sa != null && sb != null && sa === sb;
  const patch: ScorePatch = forfeit
    ? { forfeit, date, time, venue, note }
    : {
        scoreA: sa,
        scoreB: sb,
        penA: isTie && tieMode === 'pen' ? penA : null,
        penB: isTie && tieMode === 'pen' ? penB : null,
        decided: isTie && tieMode === 'karar' ? decided : null,
        forfeit: null,
        date,
        time,
        venue,
        note,
      };
  const error = teamsKnown ? validateScore(t, stage, match, patch) : null;

  const describe = () => {
    if (forfeit) return `Hükmen: ${forfeit === 'a' ? A.text : B.text} kazandı`;
    if (sa == null) return `Maç bilgisi: ${A.text} - ${B.text}`;
    return `Skor: ${A.text} ${sa}-${sb} ${B.text}`;
  };

  const save = async () => {
    if (error) return;
    const onlyInfo = !teamsKnown;
    const scorePatch = onlyInfo ? { date, time, venue, note } : patch;
    const impact = onlyInfo ? { clears: [], warnings: [] } : scoreImpact(t, stage.id, match.id, scorePatch);
    if (impact.clears.length) {
      const ok = await confirm({
        title: 'Oynanmış maçlar etkileniyor',
        message: 'Bu sonuç bir sonraki turda oynanmış maçların takımlarını değiştiriyor. Devam ederseniz aşağıdaki maçların skorları silinir (önceki hâli “Geçmiş” sekmesinden geri yüklenebilir).',
        items: impact.clears.map((c) => c.text),
        confirmText: 'Skorları sil ve kaydet',
        danger: true,
      });
      if (!ok) return;
    }
    const ok = await mutate(describe(), (d) => {
      if (onlyInfo) {
        const m = d.stages.find((s) => s.id === stage.id)!.matches.find((x) => x.id === match.id)!;
        Object.assign(m, scorePatch);
      } else applyScore(d, stage.id, match.id, scorePatch, true);
    });
    if (ok) onClose();
  };

  const clear = async () => {
    const impact = scoreImpact(t, stage.id, match.id, { scoreA: null, scoreB: null, forfeit: null, penA: null, penB: null, decided: null });
    const ok = await confirm({
      title: 'Skoru sil',
      message: `${A.text} - ${B.text} maçının sonucu silinsin mi?`,
      items: impact.clears.map((c) => `Ayrıca silinecek: ${c.text}`),
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    if (await mutate(`Skor silindi: ${A.text} - ${B.text}`, (d) => void clearScore(d, stage.id, match.id, true))) onClose();
  };

  // Eşleşme değiştirme (oynanmamış eleme maçı)
  const candidates: TeamId[] = useMemo(() => {
    if (!knockout) return [];
    const ids = new Set<TeamId>();
    for (const e of stage.entrants ?? []) ids.add(e.teamId);
    return [...ids];
  }, [knockout, stage.entrants]);
  const hasResultNow = match.scoreA != null || !!match.forfeit;
  const changeTeam = async (side: 'a' | 'b', id: TeamId) => {
    if (!id) return;
    const ok = await confirm({
      title: 'Eşleşmeyi değiştir',
      message: `${side === 'a' ? A.text : B.text} yerine ${teamName(t, id)} konacak. Takım bu turda başka bir maçtaysa yerleri değiştirilir.`,
    });
    if (!ok) return;
    if (await mutate(`Eşleşme değiştirildi: ${teamName(t, id)}`, (d) => setMatchTeam(d, stage.id, match.id, side, id))) onClose();
  };
  const restore = async (side: 'a' | 'b') => {
    if (await mutate('Eşleşme otomatiğe döndürüldü', (d) => restoreSlotSource(d, stage.id, match.id, side))) onClose();
  };

  return (
    <Modal title={match.no ? `Maç #${match.no}` : 'Maç'} onClose={onClose}>
      {teamsKnown ? (
        <>
          <div className="score-entry">
            <div className="tn">{A.text}</div>
            <div />
            <div className="tn">{B.text}</div>
            <NumberBox value={sa} onChange={(v) => (setSa(v), setForfeit(null))} label={`${A.text} skoru`} />
            <div className="muted" style={{ fontSize: '1.6rem', fontWeight: 700 }}>
              –
            </div>
            <NumberBox value={sb} onChange={(v) => (setSb(v), setForfeit(null))} label={`${B.text} skoru`} />
          </div>
          <p className="tiny muted" style={{ textAlign: 'center', margin: '0.3rem 0 0' }}>
            Birim: {t.scoring.unit}
          </p>

          {isTie && (
            <div className="alert warn" style={{ marginTop: '0.75rem' }}>
              <b>Eleme maçında beraberlik.</b> Kazananı belirleyin:
              <div className="seg" style={{ margin: '0.5rem 0' }}>
                <button className={tieMode === 'pen' ? 'on' : ''} onClick={() => setTieMode('pen')}>
                  Penaltı / uzatma skoru
                </button>
                <button className={tieMode === 'karar' ? 'on' : ''} onClick={() => setTieMode('karar')}>
                  Kazananı seç
                </button>
              </div>
              {tieMode === 'pen' ? (
                <div className="score-entry">
                  <NumberBox value={penA} onChange={setPenA} label="Penaltı A" />
                  <div>pen.</div>
                  <NumberBox value={penB} onChange={setPenB} label="Penaltı B" />
                </div>
              ) : (
                <div className="seg">
                  <button className={decided === 'a' ? 'on' : ''} onClick={() => setDecided('a')}>
                    {A.text}
                  </button>
                  <button className={decided === 'b' ? 'on' : ''} onClick={() => setDecided('b')}>
                    {B.text}
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '0.9rem' }}>
            <div className="small muted" style={{ marginBottom: '0.3rem', fontWeight: 600 }}>
              Hükmen (maça çıkmayan takım {t.scoring.forfeitScore[0]}-{t.scoring.forfeitScore[1]} yenik sayılır)
            </div>
            <div className="seg">
              <button className={!forfeit ? 'on' : ''} onClick={() => setForfeit(null)}>
                Yok
              </button>
              <button className={forfeit === 'a' ? 'on' : ''} onClick={() => setForfeit('a')}>
                {A.text} kazandı
              </button>
              <button className={forfeit === 'b' ? 'on' : ''} onClick={() => setForfeit('b')}>
                {B.text} kazandı
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="alert info">
          {A.text} – {B.text}: takımlar belli olunca skor girilebilir. Şimdilik tarih, saat ve saha girebilirsiniz.
        </div>
      )}

      <div className="form-grid" style={{ marginTop: '1rem' }}>
        <label className="field">
          Tarih
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Saat
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="field">
          Saha
          <input className="input" list="venues" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Ör. Spor salonu" />
          <datalist id="venues">
            {venues.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Not
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="İsteğe bağlı" />
        </label>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="btn-row" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
        {hasResultNow ? (
          <button className="btn ghost danger sm" onClick={clear}>
            Skoru sil
          </button>
        ) : (
          <span />
        )}
        <div className="btn-row">
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn accent" disabled={!!error} onClick={save}>
            Kaydet
          </button>
        </div>
      </div>

      {knockout && !hasResultNow && !match.third && (
        <details style={{ marginTop: '1.1rem' }}>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
            Eşleşmeyi elle değiştir
          </summary>
          <div className="form-grid" style={{ marginTop: '0.6rem' }}>
            {(['a', 'b'] as const).map((side) => (
              <label className="field" key={side}>
                {side === 'a' ? A.text : B.text} yerine şu takım oynasın:
                <select className="input" value="" onChange={(e) => changeTeam(side, e.target.value)} disabled={match[side].kind === 'bye'}>
                  <option value="">Takım seç…</option>
                  {candidates
                    .filter((id) => id !== r[side])
                    .map((id) => (
                      <option key={id} value={id}>
                        {teamName(t, id)}
                      </option>
                    ))}
                </select>
                {match.round > 1 && match[side].kind === 'team' && (
                  <button className="btn ghost sm" onClick={() => restore(side)}>
                    Önceki maç galibine döndür
                  </button>
                )}
              </label>
            ))}
          </div>
          <p className="tiny muted">Seçtiğiniz takım bu turda başka bir maçta oynuyorsa iki takımın yeri karşılıklı değişir. Skoru girilmiş maçlardaki takımlar değiştirilemez.</p>
        </details>
      )}
    </Modal>
  );
}
