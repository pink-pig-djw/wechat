import { useNavigate } from 'react-router-dom';
import { Aperture } from 'lucide-react';
import { useStore } from '../lib/store.js';
import { Avatar } from '../components/Avatar.jsx';
import { Badge, Cell, CellGroup, PageHeader } from '../components/ui.jsx';

export default function Discover() {
  const navigate = useNavigate();
  const { unread, latest } = useStore((s) => s.momentStatus);
  return (
    <div className="page">
      <PageHeader title="发现" />
      <div className="page-scroll">
        <CellGroup>
          <Cell
            icon={<Aperture size={22} className="moments-icon" />}
            label="朋友圈"
            onClick={() => navigate('/moments')}
            badge={
              <span className="cell-badges">
                {unread > 0 ? (
                  <Badge count={unread} />
                ) : (
                  latest && (
                    <span className="latest-avatar">
                      <Avatar src={latest.user.avatar} name={latest.user.nickname} seed={latest.user.id} size={30} />
                      <Badge dot />
                    </span>
                  )
                )}
              </span>
            }
          />
        </CellGroup>
      </div>
    </div>
  );
}
