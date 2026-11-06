import { useState } from 'react';
import { SPORTS, scoringPreset } from '../../engine/tournament';
import type { Scoring, TournamentStatus } from '../../engine/types';
import { useConfirm } from '../common';
import { useT } from './ctx';

export function yearOptions(): string[] {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const out: string[] = [];
  for (let y = start + 1; y >= start - 15; y--) out.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  return out;
}

export function SportInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input className="input" list="sports" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Futbol, Voleybol…" />
      <datalist id="sports">
        {SPORTS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

/** Puanlama ayarları (turnuva ayarları ve yeni turnuva sihirbazı ortak kullanır) */
export function ScoringEditor({ value: sc, onChange: setSc, sport }: { value: Scoring; onChange: (s: Scoring) => void; sport: string }) {
  const num = (k: keyof Scoring) => (e: React.ChangeEvent<HTMLInputElement>) => setSc({ ...sc, [k]: Number(e.target.value) || 0 });
  return (
    <div className="card">
      <h3>Puanlama</h3>
      <div className="btn-row" style={{ marginBottom: '0.6rem' }}>
        <button className="btn ghost sm" onClick={() => setSc(scoringPreset(sport))}>
          {sport || 'Branş'} varsayılanlarını yükle
        </button>
      </div>
      <div className="form-grid">
        <label className="field">
          Galibiyet puanı
          <input className="input" type="number" min={0} value={sc.win} onChange={num('win')} />
        </label>
        <label className="field">
          Beraberlik puanı
          <input className="input" type="number" min={0} value={sc.draw} onChange={num('draw')} disabled={!sc.allowDraw} />
        </label>
        <label className="field">
          Mağlubiyet puanı
          <input className="input" type="number" min={0} value={sc.loss} onChange={num('loss')} />
        </label>
        <label className="field">
          Hükmen mağlubiyet puanı
          <input className="input" type="number" min={0} value={sc.forfeitLoss} onChange={num('forfeitLoss')} />
        </label>
        <label className="field">
          Hükmen skoru
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="input" type="number" min={0} value={sc.forfeitScore[0]} onChange={(e) => setSc({ ...sc, forfeitScore: [Number(e.target.value) || 0, sc.forfeitScore[1]] })} />–
            <input className="input" type="number" min={0} value={sc.forfeitScore[1]} onChange={(e) => setSc({ ...sc, forfeitScore: [sc.forfeitScore[0], Number(e.target.value) || 0] })} />
          </span>
        </label>
        <label className="field">
          Skor birimi
          <input className="input" value={sc.unit} onChange={(e) => setSc({ ...sc, unit: e.target.value })} placeholder="Gol, Set, Sayı" />
        </label>
      </div>
      <label className="check" style={{ marginTop: '0.5rem' }}>
        <input type="checkbox" checked={sc.allowDraw} onChange={(e) => setSc({ ...sc, allowDraw: e.target.checked })} />
        Lig ve grup maçlarında beraberlik olabilir
      </label>
      <label className="check">
        <input type="checkbox" checked={sc.volleyball} onChange={(e) => setSc({ ...sc, volleyball: e.target.checked })} />
        Voleybol kuralı: 1 set farkla (3-2, 2-1) galibiyet 2 puan, mağlubiyet 1 puan
      </label>
    </div>

  );
}

export function SettingsTab() {
  const { t, mutate } = useT();
  const confirm = useConfirm();
  const [name, setName] = useState(t.name);
  const [sport, setSport] = useState(t.sport);
  const [year, setYear] = useState(t.schoolYear);
  const [category, setCategory] = useState(t.category ?? '');
  const [description, setDescription] = useState(t.description ?? '');
  const [sc, setSc] = useState<Scoring>(t.scoring);
  const dirty =
    name !== t.name || sport !== t.sport || year !== t.schoolYear || category !== (t.category ?? '') || description !== (t.description ?? '') || JSON.stringify(sc) !== JSON.stringify(t.scoring);

  const save = () =>
    mutate('Turnuva bilgileri güncellendi', (d) => {
      d.name = name.trim() || d.name;
      d.sport = sport.trim() || d.sport;
      d.schoolYear = year;
      d.category = category.trim() || undefined;
      d.description = description.trim() || undefined;
      d.scoring = sc;
    });

  const setStatus = async (s: TournamentStatus) => {
    if (s === 'taslak') {
      const ok = await confirm({ title: 'Taslağa al', message: 'Turnuva herkese kapatılır; yalnızca siz görebilirsiniz.' });
      if (!ok) return;
    }
    await mutate(`Durum: ${s === 'taslak' ? 'Taslak' : s === 'devam' ? 'Devam ediyor' : 'Bitti'}`, (d) => (d.status = s));
  };
  const setArchived = async (a: boolean) => {
    if (a) {
      const ok = await confirm({
        title: 'Turnuvayı arşivle',
        message: 'Arşivlenen turnuva ana sayfadan ve herkese açık bağlantıdan kaldırılır, ancak silinmez. Yönetim sayfasındaki “Arşiv” listesinden geri alabilirsiniz. Şampiyonlar arşivindeki kayıt etkilenmez.',
        confirmText: 'Arşivle',
      });
      if (!ok) return;
    }
    await mutate(a ? 'Arşivlendi' : 'Arşivden çıkarıldı', (d) => (d.archived = a));
  };

  return (
    <>
      <div className="card">
        <h3>Yayın durumu</h3>
        <div className="seg">
          {(
            [
              ['taslak', 'Taslak (herkese kapalı)'],
              ['devam', 'Devam ediyor'],
              ['bitti', 'Bitti'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={t.status === k ? 'on' : ''} onClick={() => setStatus(k)}>
              {l}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Paylaşım bağlantısı: <code>{`${location.origin}/t/${t.id}`}</code>
          {t.status === 'taslak' && ' — taslakken yalnızca siz açabilirsiniz.'}
        </p>
        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          {t.archived ? (
            <button className="btn ghost" onClick={() => setArchived(false)}>
              Arşivden çıkar
            </button>
          ) : (
            <button className="btn ghost" onClick={() => setArchived(true)}>
              Arşivle
            </button>
          )}
          {t.archived && <span className="badge draft">Bu turnuva arşivde</span>}
        </div>
      </div>

      <div className="card">
        <h3>Turnuva bilgileri</h3>
        <div className="form-grid">
          <label className="field">
            Ad
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Branş
            <SportInput value={sport} onChange={setSport} />
          </label>
          <label className="field">
            Öğretim yılı
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              {yearOptions().map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Kategori (isteğe bağlı)
            <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Erkekler, Kızlar, 9. sınıflar…" />
          </label>
        </div>
        <label className="field" style={{ marginTop: '0.75rem' }}>
          Açıklama / kurallar (isteğe bağlı)
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>

      <ScoringEditor value={sc} onChange={setSc} sport={sport} />

      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <button className="btn accent" disabled={!dirty} onClick={save}>
          Değişiklikleri kaydet
        </button>
      </div>
    </>
  );
}
