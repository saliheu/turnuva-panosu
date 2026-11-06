import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type SiteSettings } from './api';

interface Session {
  admin: boolean;
  configured: boolean;
  ready: boolean;
  settings: SiteSettings;
  refresh: () => Promise<void>;
  setSettings: (s: SiteSettings) => void;
  logout: () => Promise<void>;
}

const DEFAULT: SiteSettings = { siteTitle: 'Turnuva Panosu', schoolName: '' };
const Ctx = createContext<Session>({
  admin: false,
  configured: true,
  ready: false,
  settings: DEFAULT,
  refresh: async () => {},
  setSettings: () => {},
  logout: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setAdmin(me.admin);
      setConfigured(me.configured);
    } catch {
      setAdmin(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    api
      .publicData()
      .then((d) => setSettings(d.settings))
      .catch(() => {});
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setAdmin(false);
  }, []);

  return <Ctx.Provider value={{ admin, configured, ready, settings, refresh, setSettings, logout }}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
