import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { BrandMark, ConfirmProvider, ToastProvider } from './common';
import { SessionProvider, useSession } from './session';
import HomePage from './pages/HomePage';
import ChampionsPage from './pages/ChampionsPage';
import TournamentPage from './pages/TournamentPage';
import AdminPage from './pages/AdminPage';
import LiveDrawPage from './pages/LiveDrawPage';
import NewTournamentWizard from './pages/NewTournamentWizard';

function Layout({ children }: { children: React.ReactNode }) {
  const { settings, admin } = useSession();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-title">{settings.siteTitle}</span>
              {settings.schoolName && <span className="brand-sub">{settings.schoolName}</span>}
            </span>
          </Link>
          <nav className="topnav">
            <NavLink to="/" end className="home-link">
              Ana sayfa
            </NavLink>
            <NavLink to="/sampiyonlar">Şampiyonlar</NavLink>
            <NavLink to="/yonetim" className={admin ? 'admin-pill' : undefined}>
              {admin ? 'Yönetim' : 'Giriş'}
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">{settings.schoolName ? `${settings.schoolName} · ` : ''}Beden Eğitimi Turnuvaları</footer>
    </>
  );
}

function NotFound() {
  return (
    <div className="empty" style={{ marginTop: '2rem' }}>
      Sayfa bulunamadı. <Link to="/">Ana sayfaya dön</Link>
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/t/:id/kura/:stageId" element={<LiveDrawPage />} />
            <Route
              path="*"
              element={
                <Layout>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/sampiyonlar" element={<ChampionsPage />} />
                    <Route path="/t/:id" element={<TournamentPage />} />
                    <Route path="/yonetim" element={<AdminPage />} />
                    <Route path="/yeni-turnuva" element={<NewTournamentWizard />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Layout>
              }
            />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
