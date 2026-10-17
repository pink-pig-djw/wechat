import { useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Star, UserPlus, Users } from 'lucide-react';
import { useStore } from '../../lib/store.js';
import { useIsMobile } from '../../lib/hooks.js';
import { Avatar } from '../../components/Avatar.jsx';
import { Badge, PageHeader, SearchBar } from '../../components/ui.jsx';
import { SplitView } from '../../components/AppShell.jsx';

export function ContactsSection() {
  return <SplitView list={<ContactList />} />;
}

function ContactRow({ friend }) {
  return (
    <NavLink to={`/contacts/u/${friend.id}`} className={({ isActive }) => `contact-row ${isActive ? 'active' : ''}`}>
      <Avatar src={friend.avatar} name={friend.nickname} seed={friend.id} size={38} online={friend.online} />
      <span className="contact-name">{friend.remark || friend.nickname}</span>
    </NavLink>
  );
}

function ContactList() {
  const friends = useStore((s) => s.friends);
  const loaded = useStore((s) => s.friendsLoaded);
  const requests = useStore((s) => s.requests);
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const scrollRef = useRef(null);

  const pending = requests.filter((r) => r.direction === 'in' && r.status === 'pending').length;
  const list = useMemo(() => Object.values(friends).sort((a, b) => a.pinyin.localeCompare(b.pinyin)), [friends]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? list.filter((f) => [f.remark, f.nickname, f.username, f.pinyin].some((v) => v?.toLowerCase().includes(needle)))
    : list;

  const sections = useMemo(() => {
    const map = new Map();
    for (const f of filtered) {
      if (!map.has(f.initial)) map.set(f.initial, []);
      map.get(f.initial).push(f);
    }
    return [...map.entries()].sort(([a], [b]) => (a === '#') - (b === '#') || a.localeCompare(b));
  }, [filtered]);
  const starred = filtered.filter((f) => f.starred);

  const jumpTo = (letter) => {
    const target = scrollRef.current?.querySelector(`[data-letter="${letter}"]`);
    target?.scrollIntoView({ block: 'start' });
  };

  const addButton = (
    <NavLink to="/contacts/add" className="icon-btn" aria-label="添加朋友" title="添加朋友">
      <UserPlus size={isMobile ? 23 : 18} />
    </NavLink>
  );

  return (
    <div className="list-pane">
      {isMobile ? (
        <PageHeader title="通讯录" actions={addButton} />
      ) : (
        <div className="list-toolbar">
          <SearchBar value={q} onChange={setQ} />
          <span className="toolbar-plus">{addButton}</span>
        </div>
      )}
      <div className="list-scroll contact-scroll" ref={scrollRef}>
        {isMobile && (
          <div className="mobile-search">
            <SearchBar value={q} onChange={setQ} />
          </div>
        )}
        {!needle && (
          <div className="contact-entries">
            <NavLink to="/contacts/new" className={({ isActive }) => `contact-row ${isActive ? 'active' : ''}`}>
              <span className="entry-icon orange">
                <UserPlus size={20} />
              </span>
              <span className="contact-name">新的朋友</span>
              <Badge count={pending} />
            </NavLink>
            <NavLink to="/contacts/groups" className={({ isActive }) => `contact-row ${isActive ? 'active' : ''}`}>
              <span className="entry-icon green">
                <Users size={20} />
              </span>
              <span className="contact-name">群聊</span>
            </NavLink>
          </div>
        )}

        {!needle && starred.length > 0 && (
          <section>
            <h3 className="letter-title">
              <Star size={12} fill="currentColor" /> 星标朋友
            </h3>
            {starred.map((f) => (
              <ContactRow key={f.id} friend={f} />
            ))}
          </section>
        )}

        {sections.map(([letter, items]) => (
          <section key={letter}>
            <h3 className="letter-title" data-letter={letter}>
              {letter}
            </h3>
            {items.map((f) => (
              <ContactRow key={f.id} friend={f} />
            ))}
          </section>
        ))}

        {loaded && (
          <p className="contact-count">{needle ? (filtered.length ? `找到 ${filtered.length} 位联系人` : '没有找到相关联系人') : `${list.length} 个朋友`}</p>
        )}
      </div>
      {!needle && sections.length > 3 && (
        <nav className="index-bar" aria-label="字母索引">
          {sections.map(([letter]) => (
            <button key={letter} type="button" onClick={() => jumpTo(letter)}>
              {letter}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
