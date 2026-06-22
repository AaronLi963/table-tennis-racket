import { NavLink, Outlet } from 'react-router-dom';

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: '8px 14px',
  borderRadius: 8,
  textDecoration: 'none',
  color: isActive ? '#fff' : '#cbd5e1',
  background: isActive ? '#2563eb' : 'transparent',
  fontWeight: 600,
});

export function App() {
  return (
    <div>
      <header className="topbar">
        <div className="brand">🏓 桌球拍敲擊聲學分析</div>
        <nav style={{ display: 'flex', gap: 8 }}>
          <NavLink to="/" end style={linkStyle}>
            量測
          </NavLink>
          <NavLink to="/calibration" style={linkStyle}>
            自動評分
          </NavLink>
          <NavLink to="/compare" style={linkStyle}>
            比較
          </NavLink>
        </nav>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
