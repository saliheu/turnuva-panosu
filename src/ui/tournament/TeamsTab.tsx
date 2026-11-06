import { useState } from 'react';
import { addTeams, replaceTeam, teamInUse, withdrawTeam } from '../../engine/tournament';
import type { Team } from '../../engine/types';
import { Modal, useConfirm } from '../common';
import { useT } from './ctx';

function TeamPublic({ team }: { team: Team }) {
  return (
    <div className="list-row">
      <div className="grow">
        <b>{team.name}</b>
        {team.withdrawn && <span className="badge warn" style={{ marginLeft: 6 }}>Çekildi</span>}
        {team.formerNames?.length ? <div className="tiny muted">Önceki: {team.formerNames.join(', ')}</div> : null}
        {team.members.length > 0 && <div className="small muted">{team.members.join(', ')}</div>}
      </div>
    </div>
  );
}

function TeamEditModal({ team, onClose }: { team: Team; onClose: () => void }) {
  const { t, mutate } = useT();
  const confirm = useConfirm();
  const [name, setName] = useState(team.name);
  const [power, setPower] = useState(team.power);
  const [members, setMembers] = useState(team.members.join('\n'));
  const [replaceMode, setReplaceMode] = useState(false);
  const inUse = teamInUse(t, team.id);

  const save = async () => {
    if (!name.trim()) return;
    const list = members.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
    const ok = replaceMode
      ? await mutate(`${team.name} yerine ${name} kondu`, (d) => replaceTeam(d, team.id, name, power, list))
      : await mutate(`Takım düzenlendi: ${name}`, (d) => {
          const tm = d.teams.find((x) => x.id === team.id)!;
          tm.name = name.trim();
          tm.power = power;
          tm.members = list;
        });
    if (ok) onClose();
  };
  const withdraw = async () => {
    const ok = await confirm({
      title: `${team.name} turnuvadan çekilsin mi?`,
      message: 'Takımın oynanmamış tüm maçları hükmen kaybedilmiş sayılır. Yerine başka takım koymak istiyorsanız “Yerine takım koy” seçeneğini kullanın.',
      confirmText: 'Çekildi olarak işaretle',
      danger: true,
    });
    if (!ok) return;
    if (await mutate(`${team.name} çekildi`, (d) => void withdrawTeam(d, team.id))) onClose();
  };
  const remove = async () => {
    const ok = await confirm({ title: `${team.name} silinsin mi?`, confirmText: 'Sil', danger: true });
    if (!ok) return;
    if (await mutate(`Takım silindi: ${team.name}`, (d) => (d.teams = d.teams.filter((x) => x.id !== team.id)))) onClose();
  };

  return (
    <Modal title={replaceMode ? `${team.name} yerine takım koy` : 'Takımı düzenle'} onClose={onClose}>
      {inUse && (
        <div className="seg" style={{ marginBottom: '0.75rem' }}>
          <button className={!replaceMode ? 'on' : ''} onClick={() => setReplaceMode(false)}>
            Adı düzelt
          </button>
          <button className={replaceMode ? 'on' : ''} onClick={() => (setReplaceMode(true), setName(''), setMembers(''))}>
            Yerine takım koy
          </button>
        </div>
      )}
      {replaceMode && (
        <div className="alert info">
          Yeni takım, ayrılan takımın yerini, maçlarını ve puanlarını devralır. Eski ad takım bilgisinde “önceki” olarak saklanır.
        </div>
      )}
      <div className="form-grid">
        <label className="field">
          {replaceMode ? 'Yeni takımın adı' : 'Takım adı'}
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          Güç puanı: {power} {power >= 9 ? '(çok güçlü)' : power <= 2 ? '(zayıf)' : ''}
          <input type="range" min={1} max={10} value={power} onChange={(e) => setPower(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
        </label>
      </div>
      <label className="field" style={{ marginTop: '0.75rem' }}>
        Oyuncular / katılımcılar (her satıra bir kişi, isteğe bağlı)
        <textarea className="input" value={members} onChange={(e) => setMembers(e.target.value)} />
      </label>
      <div className="btn-row" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
        <div className="btn-row">
          {inUse && !team.withdrawn && !replaceMode && (
            <button className="btn ghost danger sm" onClick={withdraw}>
              Turnuvadan çekildi
            </button>
          )}
          {!inUse && (
            <button className="btn ghost danger sm" onClick={remove}>
              Sil
            </button>
          )}
        </div>
        <div className="btn-row">
          <button className="btn ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn accent" onClick={save} disabled={!name.trim()}>
            Kaydet
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function TeamsTab() {
  const { t, admin, mutate } = useT();
  const [bulk, setBulk] = useState('');
  const [editing, setEditing] = useState<Team | null>(null);
  // Yönetici listesi eklenme sırasında kalır (güç puanı değişince satır yer değiştirmesin)
  const sorted = admin ? t.teams : t.teams.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  // Her satır bir takım adıdır; güç puanı eklendikten sonra listeden seçilir
  const parsed = bulk
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((name) => ({ name, power: 5, members: [] as string[] }));
  const existing = new Set(t.teams.map((x) => x.name.toLocaleLowerCase('tr')));
  const dupes = parsed.filter((p) => existing.has(p.name.toLocaleLowerCase('tr')));
  const drawn = t.stages.some((s) => s.matches.length);

  const add = async () => {
    if (!parsed.length) return;
    if (await mutate(`${parsed.length} takım eklendi`, (d) => void addTeams(d, parsed))) setBulk('');
  };
  const setPower = (team: Team, p: number) => mutate(`${team.name} güç puanı ${p}`, (d) => (d.teams.find((x) => x.id === team.id)!.power = p));

  if (!admin) {
    return (
      <div className="card">
        <h3>Takımlar ({t.teams.length})</h3>
        <div className="list">
          {sorted.map((tm) => (
            <TeamPublic key={tm.id} team={tm} />
          ))}
        </div>
      </div>
    );
  }

  const dist = Array.from({ length: 10 }, (_, i) => t.teams.filter((x) => x.power === 10 - i).length);
  return (
    <>
      <div className="card">
        <h3>Takım ekle</h3>
        <p className="small muted">
          Her satıra bir takım adı yazın ve “Ekle”ye basın. Güç puanını ekledikten sonra aşağıdaki listeden seçersiniz. Oyuncu adlarını eklemek için
          takımın yanındaki “Düzenle” düğmesini kullanın.
        </p>
        <textarea
          className="input"
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={'9-A\n9-B\n10-A\n10-C'}
          aria-label="Takım adları (her satıra bir takım)"
        />
        {dupes.length > 0 && <div className="alert warn">Zaten var: {dupes.map((d) => d.name).join(', ')}</div>}
        {drawn && parsed.length > 0 && (
          <div className="alert warn">Kurası çekilmiş aşamalara yeni takım eklenmez. Ayrılan bir takımın yerine yenisini koymak için takımı düzenleyin.</div>
        )}
        <div className="btn-row" style={{ marginTop: '0.6rem' }}>
          <button className="btn accent" disabled={!parsed.length} onClick={add}>
            {parsed.length ? `${parsed.length} takımı ekle` : 'Ekle'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h3 style={{ margin: 0 }}>Takımlar ({t.teams.length})</h3>
          <span className="tiny muted">
            {dist
              .map((c, i) => (c ? `${10 - i} puanlı: ${c} takım` : ''))
              .filter(Boolean)
              .join(' · ') || '—'}
          </span>
        </div>
        <p className="small" style={{ margin: '0.4rem 0 0.6rem' }}>
          Her takıma <b>1 ile 10 arasında bir güç puanı</b> verin: <b>10 en güçlü</b>, <b>1 en zayıf</b> takımdır. Kura bu puana göre dengelenir (güçlü
          takımlar aynı gruba düşmez, ilk turlarda birbiriyle eşleşmez). Puanı aynı olan takımların sırası kurayla belirlenir. Bu puanları yalnızca siz
          görürsünüz.
        </p>
        {t.teams.length === 0 && <div className="empty">Henüz takım yok.</div>}
        <div className="list">
          {t.teams.length > 0 && (
            <div className="team-row team-head">
              <span>Takım</span>
              <span>Güç puanı</span>
              <span />
            </div>
          )}
          {sorted.map((tm) => (
            <div className="team-row" key={tm.id}>
              <div className="grow">
                <b>{tm.name}</b>
                {tm.withdrawn && <span className="badge warn" style={{ marginLeft: 6 }}>Çekildi</span>}
                {tm.formerNames?.length ? <div className="tiny muted">Önceki: {tm.formerNames.join(', ')}</div> : null}
                {tm.members.length > 0 && <div className="tiny muted">{tm.members.length} oyuncu</div>}
              </div>
              <select className="input" value={tm.power} onChange={(e) => setPower(tm, Number(e.target.value))} aria-label={`${tm.name} güç puanı`}>
                {Array.from({ length: 10 }, (_, i) => 10 - i).map((p) => (
                  <option key={p} value={p}>
                    {p}
                    {p === 10 ? ' (en güçlü)' : p === 1 ? ' (en zayıf)' : ''}
                  </option>
                ))}
              </select>
              <button className="btn ghost sm" onClick={() => setEditing(tm)}>
                Düzenle
              </button>
            </div>
          ))}
        </div>
      </div>
      {editing && <TeamEditModal team={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
