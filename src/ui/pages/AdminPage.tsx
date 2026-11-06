import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChampionRecord, TournamentSummary } from '../../engine/types';
import { currentSchoolYear, uid } from '../../engine/util';
import { api } from '../api';
import { Modal, Spinner, StatusBadge, useConfirm, useDocumentTitle, useToast } from '../common';
import { useSession } from '../session';
import { SportInput, yearOptions } from '../tournament/SettingsTab';

function Login() {
  const { refresh, configured } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card" style={{ maxWidth: 420, margin: '2rem auto' }}>
      <h2>Yönetici girişi</h2>
      {!configured && (
        <div className="alert warn">
          Yönetici şifresi henüz tanımlanmamış. Netlify’da <code>ADMIN_PASSWORD</code> ortam değişkenini ekleyin (README’ye bakın).
        </div>
      )}
      <form onSubmit={submit}>
        <label className="field">
          Şifre
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn accent block" style={{ marginTop: '0.75rem' }} disabled={busy || !password}>
          Giriş yap
        </button>
      </form>
      <p className="small muted">Öğrenciler ve ziyaretçiler giriş yapmadan tüm turnuvaları görebilir.</p>
    </div>
  );
}

function ChampionForm({ initial, onSave, onClose }: { initial?: ChampionRecord; onSave: (c: ChampionRecord) => void; onClose: () => void }) {
  const [c, setC] = useState<ChampionRecord>(
    initial ?? { id: uid('c'), schoolYear: currentSchoolYear(), sport: 'Futbol', champion: '', createdAt: new Date().toISOString() },
  );
  const set = (patch: Partial<ChampionRecord>) => setC({ ...c, ...patch });
  return (
    <Modal title={initial ? 'Şampiyon kaydını düzenle' : 'Eski turnuva ekle'} onClose={onClose}>
      <p className="small muted">Fikstür girmeden geçmiş turnuvaların şampiyonlarını arşive ekleyin.</p>
      <div className="form-grid">
        <label className="field">
          Öğretim yılı
          <select className="input" value={c.schoolYear} onChange={(e) => set({ schoolYear: e.target.value })}>
            {yearOptions().map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Branş
          <SportInput value={c.sport} onChange={(v) => set({ sport: v })} />
        </label>
        <label className="field">
          Kategori (isteğe bağlı)
          <input className="input" value={c.category ?? ''} onChange={(e) => set({ category: e.target.value || undefined })} />
        </label>
        <label className="field">
          Şampiyon
          <input className="input" value={c.champion} onChange={(e) => set({ champion: e.target.value })} placeholder="Ör. 9-A" autoFocus />
        </label>
        <label className="field">
          İkinci (isteğe bağlı)
          <input className="input" value={c.runnerUp ?? ''} onChange={(e) => set({ runnerUp: e.target.value || undefined })} />
        </label>
        <label className="field">
          Turnuva adı / not (isteğe bağlı)
          <input className="input" value={c.tournamentName ?? ''} onChange={(e) => set({ tournamentName: e.target.value || undefined })} />
        </label>
      </div>
      <p className="small">
        Görünüm: <b>{c.schoolYear} · {c.champion || '…'}</b>
      </p>
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>
          Vazgeç
        </button>
        <button className="btn accent" disabled={!c.champion.trim() || !c.sport.trim()} onClick={() => onSave({ ...c, champion: c.champion.trim(), sport: c.sport.trim() })}>
          Kaydet
        </button>
      </div>
    </Modal>
  );
}

function ChampionsAdmin() {
  const toast = useToast();
  const confirm = useConfirm();
  const [doc, setDoc] = useState<{ version: number; items: ChampionRecord[] } | null>(null);
  const [editing, setEditing] = useState<ChampionRecord | 'new' | null>(null);
  const load = useCallback(() => api.champions().then(setDoc).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => {
    load();
  }, [load]);
  const save = async (items: ChampionRecord[]) => {
    try {
      setDoc(await api.saveChampions(items, doc!.version));
      return true;
    } catch (e) {
      toast((e as Error).message, 'error');
      load();
      return false;
    }
  };
  if (!doc) return <Spinner />;
  const sorted = doc.items.slice().sort((a, b) => b.schoolYear.localeCompare(a.schoolYear) || a.sport.localeCompare(b.sport, 'tr'));
  return (
    <div className="card">
      <div className="section-head" style={{ marginBottom: '0.4rem' }}>
        <h3 style={{ margin: 0 }}>Şampiyonlar arşivi ({doc.items.length})</h3>
        <button className="btn sm accent" onClick={() => setEditing('new')}>
          + Eski turnuva ekle
        </button>
      </div>
      <div className="list">
        {sorted.map((c) => (
          <div className="list-row" key={c.id}>
            <div className="grow">
              <b>
                {c.schoolYear} · {c.champion}
              </b>
              <div className="tiny muted">
                {c.sport}
                {c.category ? ` · ${c.category}` : ''}
                {c.runnerUp ? ` · İkinci: ${c.runnerUp}` : ''}
                {c.tournamentName ? ` · ${c.tournamentName}` : ''}
              </div>
            </div>
            <button className="btn ghost sm" onClick={() => setEditing(c)}>
              Düzenle
            </button>
            <button
              className="btn ghost sm danger"
              onClick={async () => {
                if (await confirm({ title: 'Kaydı sil', message: `${c.schoolYear} · ${c.champion} (${c.sport}) kaydı silinsin mi?`, danger: true, confirmText: 'Sil' }))
                  save(doc.items.filter((x) => x.id !== c.id));
              }}
            >
              Sil
            </button>
          </div>
        ))}
        {!sorted.length && <div className="empty">Kayıt yok.</div>}
      </div>
      {editing && (
        <ChampionForm
          initial={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            if (await save([...doc.items.filter((x) => x.id !== c.id), c])) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SiteSettingsCard() {
  const { settings, setSettings } = useSession();
  const toast = useToast();
  const [title, setTitle] = useState(settings.siteTitle);
  const [school, setSchool] = useState(settings.schoolName);
  useEffect(() => {
    setTitle(settings.siteTitle);
    setSchool(settings.schoolName);
  }, [settings]);
  const save = async () => {
    try {
      setSettings(await api.saveSettings({ siteTitle: title, schoolName: school }));
      toast('Kaydedildi', 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="card">
      <h3>Site ayarları</h3>
      <div className="form-grid">
        <label className="field">
          Site başlığı
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          Okul adı
          <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Ör. Atatürk Anadolu Lisesi" />
        </label>
      </div>
      <button className="btn" style={{ marginTop: '0.75rem' }} onClick={save}>
        Kaydet
      </button>
    </div>
  );
}

function BackupCard({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const download = async () => {
    try {
      const data = await api.backup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `turnuva-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const upload = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const n = Array.isArray(data.tournaments) ? data.tournaments.length : 0;
      const ok = await confirm({
        title: 'Yedekten geri yükle',
        message: `${n} turnuva ve ${data.champions?.length ?? 0} şampiyon kaydı yüklenecek. Aynı kimlikteki turnuvaların güncel hâli değiştirilir (önceki hâli “Geçmiş” sekmesinde kalır). Şampiyon kayıtları mevcutlara eklenir.`,
        confirmText: 'Geri yükle',
      });
      if (!ok) return;
      const r = await api.importBackup(data);
      toast(`${r.tournaments} turnuva geri yüklendi`, 'ok');
      onImported();
    } catch (e) {
      toast(`Yedek okunamadı: ${(e as Error).message}`, 'error');
    }
  };
  return (
    <div className="card">
      <h3>Yedek</h3>
      <p className="small muted">Tüm turnuvaları, şampiyonları ve ayarları tek bir JSON dosyası olarak indirin. Dönem sonlarında bir yedek almanızı öneririz.</p>
      <div className="btn-row">
        <button className="btn" onClick={download}>
          ⬇ Tüm veriyi indir
        </button>
        <label className="btn ghost">
          ⬆ Yedekten geri yükle
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { admin, ready, logout } = useSession();
  const toast = useToast();
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [view, setView] = useState<'aktif' | 'arsiv'>('aktif');
  useDocumentTitle('Yönetim');
  const load = useCallback(() => {
    api.listAll().then(setList).catch((e) => toast(e.message, 'error'));
  }, [toast]);
  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  if (!ready) return <Spinner />;
  if (!admin) return <Login />;

  const shown = (list ?? []).filter((t) => (view === 'arsiv' ? t.archived : !t.archived)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <div className="t-hero">
        <div>
          <div className="eyebrow">Yönetici</div>
          <h1>Yönetim</h1>
        </div>
        <button className="btn ghost sm" onClick={logout}>
          Çıkış yap
        </button>
      </div>

      <section className="section">
        <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0 }}>Yeni turnuva</h3>
            <p className="small muted" style={{ margin: '0.25rem 0 0' }}>Bilgiler → Takımlar → Format → Puanlama → Özet adımlarıyla kurulur.</p>
          </div>
          <Link to="/yeni-turnuva" className="btn accent">
            + Yeni turnuva oluştur
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Turnuvalar</h2>
          <div className="seg">
            <button className={view === 'aktif' ? 'on' : ''} onClick={() => setView('aktif')}>
              Aktif
            </button>
            <button className={view === 'arsiv' ? 'on' : ''} onClick={() => setView('arsiv')}>
              Arşiv
            </button>
          </div>
        </div>
        {!list ? (
          <Spinner />
        ) : shown.length ? (
          <div className="card">
            <div className="list">
              {shown.map((t) => (
                <Link to={`/t/${t.id}`} className="list-row" key={t.id} style={{ textDecoration: 'none' }}>
                  <div className="grow">
                    <b>{t.name}</b>
                    <div className="tiny muted">
                      {t.sport} · {t.schoolYear}
                      {t.category ? ` · ${t.category}` : ''} · {t.teamCount} takım
                      {t.champion ? ` · 🏆 ${t.champion}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={t.status} archived={t.archived} />
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">{view === 'arsiv' ? 'Arşivde turnuva yok.' : 'Henüz turnuva yok. Yukarıdan ilk turnuvanızı oluşturun.'}</div>
        )}
      </section>

      <section className="section">
        <ChampionsAdmin />
      </section>
      <section className="section">
        <SiteSettingsCard />
      </section>
      <section className="section">
        <BackupCard onImported={load} />
      </section>
    </>
  );
}
