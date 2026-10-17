import { NavLink, useNavigate } from 'react-router-dom';
import { Aperture, ChevronRight, Settings as SettingsIcon } from 'lucide-react';
import { useStore } from '../../lib/store.js';
import { useIsMobile } from '../../lib/hooks.js';
import { Avatar } from '../../components/Avatar.jsx';
import { Cell, CellGroup, PageHeader } from '../../components/ui.jsx';
import { SplitView } from '../../components/AppShell.jsx';

export function MeSection() {
  return <SplitView list={<MeHome />} className="me-split" />;
}

function MeHome() {
  const me = useStore((s) => s.me);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  if (!me) return null;
  return (
    <div className="list-pane me-home">
      {!isMobile && <PageHeader title="我" />}
      <div className="list-scroll">
        <NavLink to="/me/profile" className={({ isActive }) => `me-card ${isActive ? 'active' : ''}`}>
          <Avatar src={me.avatar} name={me.nickname} seed={me.id} size={isMobile ? 64 : 56} radius={8} />
          <span className="me-info">
            <span className="me-name">{me.nickname}</span>
            <span className="me-id">微聊号：{me.username}</span>
            {me.signature && <span className="me-sign">{me.signature}</span>}
          </span>
          <ChevronRight size={18} className="cell-arrow" />
        </NavLink>
        <CellGroup>
          <Cell icon={<Aperture size={20} className="moments-icon" />} label="朋友圈" onClick={() => navigate(`/moments/u/${me.id}`)} />
        </CellGroup>
        <CellGroup>
          <Cell icon={<SettingsIcon size={20} className="settings-icon" />} label="设置" onClick={() => navigate('/me/settings')} />
        </CellGroup>
      </div>
    </div>
  );
}
