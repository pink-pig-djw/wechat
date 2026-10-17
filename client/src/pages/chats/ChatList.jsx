import { memo, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BellOff, MessageCirclePlus, MessagesSquare, Plus, UserPlus } from 'lucide-react';
import { countUnread, displayName, sortConversations, useStore } from '../../lib/store.js';
import { createGroup, deleteConversation, markRead, openPrivateChat, updateConversationSettings } from '../../lib/actions.js';
import { formatListTime, messagePreview, systemText } from '../../lib/format.js';
import { useContextAction, useIsMobile } from '../../lib/hooks.js';
import { confirmDialog, openMenu, toastError } from '../../lib/ui.js';
import { Avatar, ConversationAvatar } from '../../components/Avatar.jsx';
import { Badge, Empty, PageHeader, SearchBar } from '../../components/ui.jsx';
import { UserPicker } from '../../components/Pickers.jsx';
import { SplitView } from '../../components/AppShell.jsx';
import { EmojiText } from '../../emoji/EmojiText.jsx';

export function ChatsSection() {
  return <SplitView list={<ChatList />} />;
}

/** "+" menu shared by the chat list and contacts: start a group chat or add a friend. */
export function useStartMenu() {
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);

  const open = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu({
      x: r.left,
      y: r.bottom + 6,
      items: [
        { label: '发起群聊', icon: MessageCirclePlus, onClick: () => setPicking(true) },
        { label: '添加朋友', icon: UserPlus, onClick: () => navigate('/contacts/add') },
      ],
    });
  };

  const picker = picking && (
    <UserPicker
      title="发起群聊"
      confirmText="完成"
      onClose={() => setPicking(false)}
      onConfirm={async (ids) => {
        // One person is just a private chat, like WeChat.
        const id = ids.length === 1 ? await openPrivateChat(ids[0]) : await createGroup(ids);
        setPicking(false);
        navigate(`/chats/${id}`);
      }}
    />
  );
  return { open, picker };
}

function ChatList() {
  const conversations = useStore((s) => s.conversations);
  const loaded = useStore((s) => s.conversationsLoaded);
  const friends = useStore((s) => s.friends);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const start = useStartMenu();

  const sorted = useMemo(() => sortConversations(conversations), [conversations]);
  const { total } = useMemo(() => countUnread(conversations), [conversations]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return null;
    const has = (...fields) => fields.some((f) => f && String(f).toLowerCase().includes(needle));
    return {
      friends: Object.values(friends).filter((f) => has(f.remark, f.nickname, f.username, f.pinyin)),
      chats: sorted.filter((c) => has(c.name)),
    };
  }, [needle, friends, sorted]);

  const plusButton = (
    <button type="button" className="icon-btn" aria-label="发起群聊或添加朋友" onClick={start.open}>
      <Plus size={isMobile ? 24 : 18} />
    </button>
  );

  return (
    <div className="list-pane">
      {isMobile ? (
        <PageHeader title={total ? `泡泡(${total})` : '泡泡'} actions={plusButton} />
      ) : (
        <div className="list-toolbar">
          <SearchBar value={q} onChange={setQ} />
          <span className="toolbar-plus">{plusButton}</span>
        </div>
      )}
      <div className="list-scroll">
        {isMobile && (
          <div className="mobile-search">
            <SearchBar value={q} onChange={setQ} />
          </div>
        )}
        {results ? (
          <SearchResults
            results={results}
            onOpenFriend={async (id) => {
              try {
                const cid = await openPrivateChat(id);
                setQ('');
                navigate(`/chats/${cid}`);
              } catch (e) {
                toastError(e);
              }
            }}
            onOpenChat={(id) => {
              setQ('');
              navigate(`/chats/${id}`);
            }}
          />
        ) : (
          <>
            {sorted.map((c) => (
              <ConversationItem key={c.id} conversation={c} />
            ))}
            {loaded && sorted.length === 0 && (
              <Empty icon={<MessagesSquare size={48} strokeWidth={1.2} />} title="还没有聊天">
                <p>去通讯录找朋友聊聊吧</p>
              </Empty>
            )}
          </>
        )}
      </div>
      {start.picker}
    </div>
  );
}

function SearchResults({ results, onOpenFriend, onOpenChat }) {
  if (!results.friends.length && !results.chats.length) {
    return <p className="search-empty">没有找到相关结果</p>;
  }
  return (
    <div className="search-results">
      {results.friends.length > 0 && (
        <section>
          <h3 className="section-title">联系人</h3>
          {results.friends.map((f) => (
            <button key={f.id} type="button" className="row-item" onClick={() => onOpenFriend(f.id)}>
              <Avatar src={f.avatar} name={f.nickname} seed={f.id} size={36} />
              <span className="row-text">
                <span className="row-title">{f.remark || f.nickname}</span>
                {f.remark && <span className="row-sub">昵称：{f.nickname}</span>}
              </span>
            </button>
          ))}
        </section>
      )}
      {results.chats.length > 0 && (
        <section>
          <h3 className="section-title">聊天</h3>
          {results.chats.map((c) => (
            <button key={c.id} type="button" className="row-item" onClick={() => onOpenChat(c.id)}>
              <ConversationAvatar conversation={c} size={36} />
              <span className="row-text">
                <span className="row-title">{c.name}</span>
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function usePreview(c) {
  const { me, friends, users, draft, active, detail } = useStore(
    useShallow((s) => ({
      me: s.me,
      friends: s.friends,
      users: s.users,
      draft: s.drafts[c.id],
      active: s.activeId === c.id,
      detail: s.details[c.id],
    })),
  );
  const state = { me, friends, users };
  const m = c.lastMessage;

  let prefix = null;
  if (draft && !active) prefix = <em className="preview-flag">[草稿]</em>;
  else if (c.mentioned) prefix = <em className="preview-flag">[有人@我]</em>;

  if (draft && !active) return { prefix, text: draft };
  if (!m) return { prefix, text: '' };
  const nameOf = (id, fallback) => displayName(state, id, detail, fallback);
  let text;
  if (m.recalled) {
    text = m.senderId === me.id ? '你撤回了一条消息' : `"${nameOf(m.senderId, m.sender?.nickname)}" 撤回了一条消息`;
  } else if (m.type === 'system') {
    text = systemText(m.content, me.id, nameOf);
  } else {
    text = messagePreview(m);
    if (c.type === 'group' && m.senderId !== me.id) text = `${nameOf(m.senderId, m.sender?.nickname)}: ${text}`;
  }
  if (c.muted && c.unread > 1) text = `[${c.unread}条] ${text}`;
  return { prefix, text };
}

const ConversationItem = memo(function ConversationItem({ conversation: c }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const activeId = useStore((s) => s.activeId);
  const { prefix, text } = usePreview(c);
  const hasUnread = c.unread > 0 || c.manualUnread;

  const contextAction = useContextAction(({ x, y }) => {
    openMenu({
      x,
      y,
      title: isMobile ? c.name : undefined,
      items: [
        { label: c.pinned ? '取消置顶' : '置顶', onClick: () => updateConversationSettings(c.id, { pinned: !c.pinned }).catch(toastError) },
        {
          label: hasUnread ? '标为已读' : '标为未读',
          onClick: () =>
            hasUnread ? markRead(c.id, { immediate: true }) : updateConversationSettings(c.id, { manualUnread: true }).catch(toastError),
        },
        { label: c.muted ? '开启新消息提醒' : '消息免打扰', onClick: () => updateConversationSettings(c.id, { muted: !c.muted }).catch(toastError) },
        {
          label: '删除该聊天',
          danger: true,
          onClick: async () => {
            const ok = await confirmDialog({
              title: '删除聊天',
              message: '删除后，将同时清空该聊天的聊天记录。',
              confirmText: '删除',
              danger: true,
            });
            if (!ok) return;
            if (activeId === c.id) navigate('/chats', { replace: true });
            deleteConversation(c.id).catch(toastError);
          },
        },
      ],
    });
  });

  return (
    <NavLink
      to={`/chats/${c.id}`}
      className={({ isActive }) => `conv-item ${c.pinned ? 'pinned' : ''} ${isActive ? 'active' : ''}`}
      {...contextAction}
    >
      <span className="conv-avatar">
        <ConversationAvatar conversation={c} size={isMobile ? 48 : 40} />
        <Badge count={c.muted ? 0 : c.unread} dot={(c.muted && c.unread > 0) || (!c.unread && c.manualUnread)} />
      </span>
      <span className="conv-main">
        <span className="conv-line">
          <span className="conv-name">{c.name}</span>
          <time className="conv-time">{formatListTime(c.lastMessage?.createdAt ?? c.updatedAt)}</time>
        </span>
        <span className="conv-line">
          <span className="conv-preview">
            {prefix}
            <EmojiText text={text} />
          </span>
          {c.muted && <BellOff className="conv-muted" size={14} aria-label="消息免打扰" />}
        </span>
      </span>
    </NavLink>
  );
});
