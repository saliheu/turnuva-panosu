import { useEffect, useState } from 'react';
import { suggestChampion } from '../../engine/qualify';
import { teamName } from '../../engine/tournament';
import type { ChampionRecord } from '../../engine/types';
import { uid } from '../../engine/util';
import { api } from '../api';
import { formatDateTime, Spinner, Trophy, useConfirm, useToast } from '../common';
import { useT } from './ctx';

export function ChampionTab() {
  const { t, mutate } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const sug = suggestChampion(t);
  const [champion, setChampion] = useState(t.champion?.champion ?? (sug?.champion ? teamName(t, sug.champion) : ''));
  const [runnerUp, setRunnerUp] = useState(t.champion?.runnerUp ?? (sug?.runnerUp ? teamName(t, sug.runnerUp) : ''));
  const [third, setThird] = useState(t.champion?.third ?? (sug?.third ? teamName(t, sug.third) : ''));
  const [finish, setFinish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<{ version: number; items: ChampionRecord[] } | null>(null);

  useEffect(() => {
    api.champions().then(setDoc).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  const names = t.teams.map((x) => x.name).sort((a, b) => a.localeCompare(b, 'tr'));

  const save = async () => {
    if (!champion.trim() || !doc) return;
    setBusy(true);
    try {
      const recordId = t.champion?.recordId && doc.items.some((c) => c.id === t.champion!.recordId) ? t.champion.recordId : uid('c');
      const rec: ChampionRecord = {
        id: recordId,
        schoolYear: t.schoolYear,
        sport: t.sport,
        category: t.category,
        champion: champion.trim(),
        runnerUp: runnerUp.trim() || undefined,
        tournamentId: t.id,
        tournamentName: t.name,
        createdAt: doc.items.find((c) => c.id === recordId)?.createdAt ?? new Date().toISOString(),
      };
      const items = [...doc.items.filter((c) => c.id !== recordId), rec];
      const saved = await api.saveChampions(items, doc.version);
      setDoc(saved);
      const ok = await mutate(`Şampiyon onaylandı: ${rec.champion}`, (d) => {
        const champTeam = d.teams.find((x) => x.name === rec.champion);
        d.champion = { champion: rec.champion, runnerUp: rec.runnerUp, third: third.trim() || undefined, championTeamId: champTeam?.id, recordId };
        if (finish) d.status = 'bitti';
      });
      if (ok) toast('Şampiyonlar arşivine kaydedildi', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!doc || !t.champion) return;
    const ok = await confirm({ title: 'Şampiyon kaydını kaldır', message: 'Bu turnuvanın şampiyonu arşivden ve turnuvadan kaldırılsın mı?', danger: true, confirmText: 'Kaldır' });
    if (!ok) return;
    try {
      const saved = await api.saveChampions(
        doc.items.filter((c) => c.id !== t.champion!.recordId),
        doc.version,
      );
      setDoc(saved);
      await mutate('Şampiyon kaydı kaldırıldı', (d) => void (d.champion = undefined));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (!doc) return <Spinner />;
  return (
    <div className="card">
      <h3 style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Trophy /> Şampiyon
      </h3>
      {sug?.champion ? (
        <div className="alert ok">
          Sistemin önerisi: <b>{teamName(t, sug.champion)}</b>
          {sug.runnerUp && ` · İkinci: ${teamName(t, sug.runnerUp)}`}
          {sug.third && ` · Üçüncü: ${teamName(t, sug.third)}`}. Onaylayabilir veya değiştirebilirsiniz.
        </div>
      ) : (
        <div className="alert info">Son aşama tamamlanınca sistem şampiyonu önerir. İsterseniz şimdi elle de girebilirsiniz.</div>
      )}
      <datalist id="team-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="form-grid">
        <label className="field">
          Şampiyon
          <input className="input" list="team-names" value={champion} onChange={(e) => setChampion(e.target.value)} />
        </label>
        <label className="field">
          İkinci (isteğe bağlı)
          <input className="input" list="team-names" value={runnerUp} onChange={(e) => setRunnerUp(e.target.value)} />
        </label>
        <label className="field">
          Üçüncü (isteğe bağlı)
          <input className="input" list="team-names" value={third} onChange={(e) => setThird(e.target.value)} />
        </label>
      </div>
      <p className="small muted">
        Arşivde “{t.schoolYear} · {champion || '…'}” olarak saklanır ({t.sport}
        {t.category ? `, ${t.category}` : ''}).
      </p>
      <label className="check">
        <input type="checkbox" checked={finish} onChange={(e) => setFinish(e.target.checked)} />
        Turnuvayı “Bitti” olarak işaretle
      </label>
      <div className="btn-row" style={{ marginTop: '0.75rem' }}>
        <button className="btn accent" onClick={save} disabled={busy || !champion.trim()}>
          {t.champion ? 'Güncelle' : 'Onayla ve arşive ekle'}
        </button>
        {t.champion && (
          <button className="btn ghost danger" onClick={remove}>
            Kaydı kaldır
          </button>
        )}
      </div>
    </div>
  );
}

export function HistoryTab() {
  const { t, replace } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const [revs, setRevs] = useState<{ version: number; label: string; savedAt: string }[] | null>(null);
  useEffect(() => {
    api.revisions(t.id).then(setRevs).catch((e) => toast(e.message, 'error'));
  }, [t.id, t.version, toast]);
  const restore = async (v: number) => {
    const ok = await confirm({
      title: `${v}. sürüme dön`,
      message: 'Turnuva bu sürümdeki hâline döner. Şu anki hâl de geçmişte kalır, yani bu işlem de geri alınabilir.',
      confirmText: 'Geri yükle',
    });
    if (!ok) return;
    try {
      replace(await api.restore(t.id, v));
      toast('Geri yüklendi', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  if (!revs) return <Spinner />;
  return (
    <div className="card">
      <h3>Değişiklik geçmişi</h3>
      <p className="small muted">Son 40 kayıt saklanır. Yanlışlıkla silinen skor veya kurayı buradan geri getirebilirsiniz.</p>
      <div className="list">
        {revs.map((r) => (
          <div className="list-row" key={r.version}>
            <span className="badge">{r.version}</span>
            <div className="grow">
              <div>{r.label}</div>
              <div className="tiny muted">{formatDateTime(r.savedAt)}</div>
            </div>
            {r.version !== t.version ? (
              <button className="btn ghost sm" onClick={() => restore(r.version)}>
                Bu sürüme dön
              </button>
            ) : (
              <span className="tiny muted">güncel</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
