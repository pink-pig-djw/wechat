import { useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { Aperture, Compass, Menu, MessageCircle, User, Users } from 'lucide-react';
import { countUnread, useStore } from '../lib/store.js';
import { connectSocket, disconnectSocket, setNavigator } from '../lib/socket.js';
import { logout, refreshMe } from '../lib/actions.js';
import { useIsMobile } from '../lib/hooks.js';
import { confirmDialog, openMenu } from '../lib/ui.js';
import { Avatar } from './Avatar.jsx';
import { Badge } from './ui.jsx';
import { Logo } from './Logo.jsx';

const TAB_ROOTS = ['/chats', '/contacts', '/discover', '/me'];

function useBadges() {
  const conversations = useStore((s) => s.conversations);
  const requests = useStore((s) => s.requests);
  const momentStatus = useStore((s) => s.momentStatus);
  const unread = useMemo(() => countUnread(conversations), [conversations]);
  const pendingRequests = useMemo(
    () => requests.filter((r) => r.direction === 'in' && r.status === 'pending').length,
    [requests],
  );
  return { unread, pendingRequests, momentStatus };
}

export function AppShell() {
  const token = useStore((s) => s.token);
  const connected = useStore((s) => s.connected);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { unread } = useBadges();

  useEffect(() => setNavigator(navigate), [navigate]);

  useEffect(() => {
    connectSocket(token);
    refreshMe().catch(() => {});
    return () => disconnectSocket();
  }, [token]);

  useEffect(() => {
    document.title = unread.total ? `(${unread.total}) 微聊` : '微聊';
  }, [unread.total]);

  const showTabBar = isMobile && TAB_ROOTS.includes(location.pathname);

  return (
    <div className={`app ${isMobile ? 'is-mobile' : 'is-desktop'} ${showTabBar ? 'with-tabbar' : ''}`}>
      {!isMobile && <Sidebar />}
      <main className="app-main">
        <Outlet />
      </main>
      {showTabBar && <TabBar />}
      {!connected && (
        <div className="offline-bar" role="status">
          网络连接已断开，正在重新连接…
        </div>
      )}
    </div>
  );
}

function Sidebar() {
  const me = useStore((s) => s.me);
  const navigate = useNavigate();
  const { unread, pendingRequests, momentStatus } = useBadges();

  const openMore = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu({
      x: r.right + 6,
      y: r.top - 90,
      items: [
        { label: '设置', onClick: () => navigate('/me/settings') },
        { label: '个人资料', onClick: () => navigate('/me/profile') },
        {
          label: '退出登录',
          danger: true,
          onClick: async () => {
            if (await confirmDialog({ title: '退出登录', message: '确定要退出当前账号吗？', confirmText: '退出', danger: true })) logout();
          },
        },
      ],
    });
  };

  const item = (to, Icon, label, badge) => (
    <NavLink to={to} className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`} title={label} aria-label={label}>
      <Icon size={24} strokeWidth={1.8} />
      {badge}
    </NavLink>
  );

  return (
    <nav className="sidebar" aria-label="主导航">
      <NavLink to="/me" className="side-avatar" title="我" aria-label="我">
        <Avatar src={me?.avatar} name={me?.nickname} seed={me?.id} size={38} />
      </NavLink>
      {item('/chats', MessageCircle, '聊天', <Badge count={unread.total} dot={!unread.total && unread.mutedDot} />)}
      {item('/contacts', Users, '通讯录', <Badge count={pendingRequests} />)}
      {item('/moments', Aperture, '朋友圈', <Badge count={momentStatus.unread} dot={!momentStatus.unread && !!momentStatus.latest} />)}
      <div className="side-spacer" />
      <Logo className="side-logo" size={22} />
      <button type="button" className="side-item" aria-label="更多" title="更多" onClick={openMore}>
        <Menu size={22} strokeWidth={1.8} />
      </button>
    </nav>
  );
}

function TabBar() {
  const { unread, pendingRequests, momentStatus } = useBadges();
  const tab = (to, Icon, label, badge) => (
    <NavLink to={to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
      <span className="tab-icon">
        <Icon size={25} strokeWidth={1.7} />
        {badge}
      </span>
      <span className="tab-label">{label}</span>
    </NavLink>
  );
  return (
    <nav className="tabbar" aria-label="主导航">
      {tab('/chats', MessageCircle, '微聊', <Badge count={unread.total} dot={!unread.total && unread.mutedDot} />)}
      {tab('/contacts', Users, '通讯录', <Badge count={pendingRequests} />)}
      {tab('/discover', Compass, '发现', <Badge count={momentStatus.unread} dot={!momentStatus.unread && !!momentStatus.latest} />)}
      {tab('/me', User, '我')}
    </nav>
  );
}

/** List on the left, detail on the right (desktop); one at a time on phones. */
export function SplitView({ list, className = '', placeholder }) {
  const outlet = useOutlet();
  return (
    <div className={`split ${outlet ? 'has-detail' : ''} ${className}`}>
      <section className="split-list">{list}</section>
      <section className="split-detail">
        {outlet ?? (
          <div className="detail-placeholder">
            {placeholder ?? <Logo size={88} muted />}
          </div>
        )}
      </section>
    </div>
  );
}
