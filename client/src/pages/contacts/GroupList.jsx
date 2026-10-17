import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCirclePlus, Users } from 'lucide-react';
import { loadGroups } from '../../lib/actions.js';
import { useStore } from '../../lib/store.js';
import { toastError } from '../../lib/ui.js';
import { GroupAvatar } from '../../components/Avatar.jsx';
import { Empty, PageHeader, Spinner } from '../../components/ui.jsx';
import { useStartMenu } from '../chats/ChatList.jsx';

export default function GroupList() {
  const [groups, setGroups] = useState(null);
  const start = useStartMenu();
  // Reload when a group is joined, left, renamed or resized.
  const groupKey = useStore((s) =>
    Object.values(s.conversations)
      .filter((c) => c.type === 'group')
      .map((c) => `${c.id}:${c.name}:${c.memberCount}:${c.dissolved}`)
      .join('|'),
  );

  useEffect(() => {
    loadGroups().then(setGroups).catch(toastError);
  }, [groupKey]);

  return (
    <div className="page">
      <PageHeader
        title="群聊"
        back="/contacts"
        actions={
          <button type="button" className="icon-btn" aria-label="发起群聊" onClick={start.open}>
            <MessageCirclePlus size={20} />
          </button>
        }
      />
      <div className="page-scroll">
        {groups === null ? (
          <div className="page-center">
            <Spinner />
          </div>
        ) : groups.length === 0 ? (
          <Empty icon={<Users size={44} strokeWidth={1.2} />} title="还没有群聊">
            <button type="button" className="btn btn-primary" onClick={start.open}>
              发起群聊
            </button>
          </Empty>
        ) : (
          <div className="card-list">
            {groups.map((g) => (
              <Link key={g.id} to={`/chats/${g.id}`} className="request-row">
                <GroupAvatar members={g.memberPreview} src={g.avatar} size={44} />
                <span className="row-text">
                  <span className="row-title">{g.name}</span>
                  <span className="row-sub">{g.memberCount} 人</span>
                </span>
              </Link>
            ))}
            <p className="contact-count">{groups.length} 个群聊</p>
          </div>
        )}
      </div>
      {start.picker}
    </div>
  );
}
