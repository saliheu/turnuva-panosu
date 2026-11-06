import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { TournamentStatus } from '../engine/types';

// ---------------- Bildirimler ----------------
type Toast = { id: number; text: string; kind: 'info' | 'error' | 'ok' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---------------- Diyalog ----------------
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 820 } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------- Onay ----------------
interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  items?: string[];
  confirmText?: string;
  danger?: boolean;
  /** Kullanıcının yazması gereken kelime (ör. "SİL") */
  typeToConfirm?: string;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback(
    (o: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setTyped('');
        setState({ ...o, resolve });
      }),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const blocked = !!state?.typeToConfirm && typed.trim().toLocaleUpperCase('tr') !== state.typeToConfirm.toLocaleUpperCase('tr');
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => close(false)}>
          {state.message && <div style={{ marginBottom: '0.6rem' }}>{state.message}</div>}
          {state.items && state.items.length > 0 && (
            <div className="alert warn">
              <ul>
                {state.items.map((i, k) => (
                  <li key={k}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {state.typeToConfirm && (
            <label className="field" style={{ margin: '0.6rem 0' }}>
              Onaylamak için “{state.typeToConfirm}” yazın
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </label>
          )}
          <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button className="btn ghost" onClick={() => close(false)}>
              Vazgeç
            </button>
            <button className={`btn ${state.danger ? 'danger' : 'accent'}`} disabled={blocked} onClick={() => close(true)}>
              {state.confirmText ?? 'Onayla'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}

// ---------------- Küçük parçalar ----------------
export function Spinner() {
  return <div className="spinner" aria-label="Yükleniyor" />;
}

export function StatusBadge({ status, archived }: { status: TournamentStatus; archived?: boolean }) {
  if (archived) return <span className="badge draft">Arşivde</span>;
  if (status === 'devam') return <span className="badge live">Devam ediyor</span>;
  if (status === 'bitti') return <span className="badge done">Bitti</span>;
  return <span className="badge draft">Taslak</span>;
}

export function powerColor(p: number): string {
  // 1 (açık) → 10 (koyu)
  const hues = ['#9aa5b5', '#8a98ab', '#7a8aa1', '#6a7c96', '#5a6e8c', '#4a6082', '#3b5277', '#2c446c', '#1d3661', '#e2552b'];
  return hues[Math.max(0, Math.min(9, p - 1))];
}

export function PowerDot({ power }: { power: number }) {
  return (
    <span className="power" style={{ background: powerColor(power) }} title={`Güç puanı: ${power}`}>
      {power}
    </span>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/** Bileşen kaldırıldıktan sonra state güncellemesini engeller */
export function useMounted() {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}

export function Trophy({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" fill="#e0a21a" stroke="#8a5d00" strokeWidth="1.3" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3.6M17 6h2.5a2.5 2.5 0 0 1-2.6 3.6" stroke="#8a5d00" strokeWidth="1.3" />
      <path d="M12 13v3.5M8.5 20h7l-.8-3.5H9.3L8.5 20Z" fill="#e0a21a" stroke="#8a5d00" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#e2552b" />
      <path d="M8 9h5v5H8zM8 18h5v5H8z" fill="#fff" />
      <path d="M13 11.5h4v9h-4M17 16h7" stroke="#fff" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
