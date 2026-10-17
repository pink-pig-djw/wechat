import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useOutlet, useParams } from 'react-router-dom';
import { ArrowDown, Copy, Forward, Megaphone, MoreHorizontal, Quote, Undo2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { countUnread, displayName, setActiveConversation, useStore } from '../../lib/store.js';
import {
  discardLocalMessage,
  fetchConversation,
  forwardMessage,
  loadMessages,
  loadOlderMessages,
  markRead,
  recallMessage,
  retryMessage,
} from '../../lib/actions.js';
import { formatMessageTime, messagePreview } from '../../lib/format.js';
import { useIsMobile, useNow } from '../../lib/hooks.js';
import { openMenu, toast, toastError } from '../../lib/ui.js';
import { PageHeader, Spinner } from '../../components/ui.jsx';
import { ForwardPicker } from '../../components/Pickers.jsx';
import { UserCard } from '../contacts/UserProfile.jsx';
import { MessageItem } from './MessageItem.jsx';
import { Composer, sendFiles } from './Composer.jsx';
import { EmojiText } from '../../emoji/EmojiText.jsx';

const RECALL_WINDOW = 2 * 60 * 1000;
const TIME_GAP = 5 * 60 * 1000;

export function ChatWindow() {
  const { id } = useParams();
  return <ChatView key={id} conversationId={Number(id)} />;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs a secure context; fall back for plain-HTTP LAN use.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('已复制');
}

function ChatTitle({ conversation }) {
  const typingUntil = useStore((s) => s.typing[conversation.id]);
  const now = useNow(typingUntil && typingUntil > Date.now() ? 1000 : 60_000);
  const typing = conversation.type === 'private' && typingUntil > now;
  const subtitle = typing ? '对方正在输入…' : conversation.type === 'private' && conversation.online ? '在线' : null;
  return (
    <>
      <span className="chat-title-name">
        {conversation.name}
        {conversation.type === 'group' && !conversation.dissolved && `(${conversation.memberCount})`}
      </span>
      {subtitle && <span className={`chat-title-sub ${typing ? 'typing' : 'online'}`}>{subtitle}</span>}
    </>
  );
}

/** WeChat shows how many unread messages wait in other chats next to the back arrow. */
function OtherUnread({ conversationId }) {
  const total = useStore((s) => {
    const { [conversationId]: _current, ...others } = s.conversations;
    return countUnread(others).total;
  });
  return total ? (total > 99 ? '99+' : total) : null;
}

function AnnouncementBar({ conversationId, detail, onOpen }) {
  const key = `weiliao.announcement.${conversationId}`;
  const stamp = String(detail?.announcementAt ?? '');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  if (!detail?.announcement || dismissed === stamp) return null;
  const dismiss = (e) => {
    e.stopPropagation();
    try {
      localStorage.setItem(key, stamp);
    } catch {
      // ignore
    }
    setDismissed(stamp);
  };
  return (
    <div className="announcement-bar" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Megaphone size={16} aria-hidden="true" />
      <span className="announcement-text">
        <EmojiText text={detail.announcement} />
      </span>
      <button type="button" className="icon-btn" aria-label="关闭公告" onClick={dismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

function ChatView({ conversationId }) {
  const navigate = useNavigate();
  const outlet = useOutlet();
  const isMobile = useIsMobile();
  const { conversation, loaded, detail, bucket, me, friends, users } = useStore(
    useShallow((s) => ({
      conversation: s.conversations[conversationId],
      loaded: s.conversationsLoaded,
      detail: s.details[conversationId],
      bucket: s.messages[conversationId],
      me: s.me,
      friends: s.friends,
      users: s.users,
    })),
  );
  const [quote, setQuote] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [cardUser, setCardUser] = useState(null);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef(null);
  const seen = useRef(false);
  const infoPath = `/chats/${conversationId}/info`;

  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId]);

  // Make sure we have the conversation; leave if it disappears (deleted, kicked, left).
  useEffect(() => {
    if (conversation) {
      seen.current = true;
      return;
    }
    if (!loaded) return;
    if (seen.current) {
      navigate('/chats', { replace: true });
      return;
    }
    fetchConversation(conversationId).catch((e) => {
      toastError(e);
      navigate('/chats', { replace: true });
    });
  }, [conversation, loaded, conversationId, navigate]);

  const isGroup = conversation?.type === 'group';
  useEffect(() => {
    if (isGroup && !detail) fetchConversation(conversationId).catch(() => {});
  }, [isGroup, detail, conversationId]);

  useEffect(() => {
    loadMessages(conversationId).catch(toastError);
  }, [conversationId]);

  const hasUnread = !!(conversation && (conversation.unread || conversation.mentioned || conversation.manualUnread));
  useEffect(() => {
    if (hasUnread && document.visibilityState === 'visible') markRead(conversationId, { immediate: true });
  }, [hasUnread, conversationId]);

  const nameOf = useCallback(
    (userId, fallback) => displayName({ me, friends, users }, userId, detail, fallback),
    [me, friends, users, detail],
  );

  const canSend = conversation && (isGroup ? !conversation.dissolved : conversation.isFriend !== false);

  const onContext = useCallback(
    (message, { x, y }) => {
      const mine = message.senderId === me.id;
      const items = [];
      if (message.type === 'text') items.push({ label: '复制', icon: Copy, onClick: () => copyText(message.content) });
      if (message.status === 'failed') {
        items.push({ label: '重新发送', icon: Undo2, onClick: () => retryMessage(message).catch(toastError) });
        items.push({ label: '删除', danger: true, onClick: () => discardLocalMessage(conversationId, message.clientId) });
      } else if (!message.status) {
        items.push({ label: '转发', icon: Forward, onClick: () => setForwarding(message) });
        if (canSend) {
          items.push({
            label: '引用',
            icon: Quote,
            onClick: () =>
              setQuote({
                id: message.id,
                senderName: nameOf(message.senderId, message.sender?.nickname),
                text: messagePreview(message),
                type: message.type,
                url: message.content?.url,
              }),
          });
        }
        if (mine && Date.now() - message.createdAt < RECALL_WINDOW) {
          items.push({ label: '撤回', icon: Undo2, onClick: () => recallMessage(message).catch(toastError) });
        }
      }
      if (items.length) openMenu({ x, y, items });
    },
    [me.id, conversationId, canSend, nameOf],
  );

  const onAvatar = useCallback(
    (userId) => (isMobile ? navigate(`/contacts/u/${userId}`) : setCardUser(userId)),
    [isMobile, navigate],
  );
  const onRetry = useCallback((message) => retryMessage(message).catch(toastError), []);
  const onReEdit = useCallback((text) => composerRef.current?.setText(text), []);

  if (!conversation) {
    return (
      <div className="chat-window chat-loading">
        <Spinner size={28} />
      </div>
    );
  }

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!canSend) return;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) sendFiles(conversationId, files);
  };

  return (
    <div
      className="chat-window"
      onDragOver={(e) => {
        if (canSend && e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <PageHeader
        className="chat-header"
        back="/chats"
        backLabel={<OtherUnread conversationId={conversationId} />}
        title={<ChatTitle conversation={conversation} />}
        actions={
          <button
            type="button"
            className={`icon-btn ${outlet ? 'active' : ''}`}
            aria-label="聊天信息"
            onClick={() => navigate(outlet ? `/chats/${conversationId}` : infoPath)}
          >
            <MoreHorizontal size={22} />
          </button>
        }
      />
      {isGroup && <AnnouncementBar conversationId={conversationId} detail={detail} onOpen={() => navigate(infoPath)} />}

      <MessageList
        conversationId={conversationId}
        bucket={bucket}
        meId={me.id}
        isGroup={isGroup}
        nameOf={nameOf}
        onContext={onContext}
        onAvatar={onAvatar}
        onRetry={onRetry}
        onReEdit={onReEdit}
        onOpenCard={(userId) => onAvatar(userId)}
      />

      {canSend ? (
        <Composer
          ref={composerRef}
          conversation={conversation}
          detail={detail}
          quote={quote}
          onClearQuote={() => setQuote(null)}
        />
      ) : (
        <div className="composer-disabled">
          {isGroup ? (
            '该群聊已解散，无法继续发送消息'
          ) : (
            <>
              对方已不是你的好友，
              <button type="button" className="link-btn" onClick={() => navigate(`/contacts/u/${conversation.peerId}`)}>
                重新添加
              </button>
            </>
          )}
        </div>
      )}

      {dragging && <div className="drop-hint">松开鼠标，发送给 {conversation.name}</div>}

      {outlet &&
        (isMobile ? (
          <div className="overlay-page">{outlet}</div>
        ) : (
          <>
            <div className="drawer-backdrop" onClick={() => navigate(`/chats/${conversationId}`)} />
            <aside className="chat-drawer">{outlet}</aside>
          </>
        ))}

      {forwarding && (
        <ForwardPicker
          onClose={() => setForwarding(null)}
          onConfirm={async (targets) => {
            await forwardMessage(forwarding, targets);
            setForwarding(null);
            toast('已转发');
          }}
        />
      )}
      {cardUser && <UserCard userId={cardUser} onClose={() => setCardUser(null)} />}
    </div>
  );
}

const keyOf = (m) => (m ? m.clientId ?? `id-${m.id}` : null);
const NO_MESSAGES = [];

function MessageList({ conversationId, bucket, meId, isGroup, nameOf, onContext, onAvatar, onRetry, onReEdit, onOpenCard }) {
  const scroller = useRef(null);
  const atBottom = useRef(true);
  const prev = useRef({ first: null, last: null, height: 0, count: 0 });
  const [newCount, setNewCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const items = bucket?.items ?? NO_MESSAGES;

  const scrollToBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = keyOf(items[0]);
    const last = keyOf(items.at(-1));
    const p = prev.current;
    if (!p.count && items.length) {
      scrollToBottom();
    } else if (first !== p.first && last === p.last) {
      // Older history was prepended: keep the visible message in place.
      el.scrollTop += el.scrollHeight - p.height;
    } else if (last !== p.last && items.length) {
      const newest = items.at(-1);
      if (atBottom.current || newest.senderId === meId) scrollToBottom();
      else setNewCount((n) => n + 1);
    }
    prev.current = { first, last, height: el.scrollHeight, count: items.length };
  }, [items, meId]);

  // Stay pinned to the bottom when the viewport shrinks (keyboard, quote bar, composer growth).
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) scrollToBottom();
      prev.current.height = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current && newCount) setNewCount(0);
    if (el.scrollTop < 120 && bucket?.hasMore && !loadingOlder) {
      setLoadingOlder(true);
      prev.current.height = el.scrollHeight;
      loadOlderMessages(conversationId)
        .catch(toastError)
        .finally(() => setLoadingOlder(false));
    }
  };

  return (
    <div className="message-area">
      <div className="message-scroller" ref={scroller} onScroll={onScroll}>
        <div className="message-list">
          {bucket?.hasMore && <div className="history-loader">{loadingOlder && <Spinner size={18} />}</div>}
          {!bucket?.loaded && (
            <div className="history-loader">
              <Spinner size={22} />
            </div>
          )}
          {items.map((m, i) => {
            const before = items[i - 1];
            const showTime = !before || m.createdAt - before.createdAt > TIME_GAP;
            const mine = m.senderId === meId;
            return (
              <Fragment key={keyOf(m)}>
                {showTime && <div className="msg-time">{formatMessageTime(m.createdAt)}</div>}
                <MessageItem
                  message={m}
                  mine={mine}
                  showName={isGroup && !mine}
                  senderName={m.senderId ? nameOf(m.senderId, m.sender?.nickname) : ''}
                  meId={meId}
                  nameOf={nameOf}
                  onContext={onContext}
                  onAvatar={onAvatar}
                  onRetry={onRetry}
                  onReEdit={onReEdit}
                  onOpenCard={onOpenCard}
                />
              </Fragment>
            );
          })}
        </div>
      </div>
      {newCount > 0 && (
        <button
          type="button"
          className="new-messages-pill"
          onClick={() => {
            scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
            setNewCount(0);
          }}
        >
          <ArrowDown size={14} /> {newCount} 条新消息
        </button>
      )}
    </div>
  );
}
