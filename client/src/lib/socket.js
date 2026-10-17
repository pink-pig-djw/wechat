import { io } from 'socket.io-client';
import {
  applyUserUpdate,
  clearMessages,
  clearTyping,
  displayName,
  getState,
  patchConversation,
  removeConversation,
  removeFriend,
  setConnected,
  setMomentStatus,
  setPresence,
  setTyping,
  upsertConversation,
  upsertFriend,
  upsertMessage,
  useStore,
} from './store.js';
import {
  fetchConversation,
  loadMessages,
  loadRequests,
  logout,
  markRead,
  syncAll,
} from './actions.js';
import { mentionsUser, messagePreview } from './format.js';
import { playChime, showDesktopNotification } from './notify.js';
import { toast } from './ui.js';

let socket = null;
let navigate = () => {};

export function setNavigator(fn) {
  navigate = fn;
}

function isViewing(conversationId) {
  return getState().activeId === conversationId && document.visibilityState === 'visible';
}

function handleNewMessage({ message }) {
  const state = getState();
  const id = message.conversationId;
  const known = state.conversations[id];
  upsertMessage(message);
  if (!known) {
    // A chat we don't have yet (new group, re-opened chat): its summary carries the right unread count.
    fetchConversation(id)
      .then((c) => {
        if (message.senderId !== state.me.id && !c.muted && message.type !== 'system') notifyIncoming(message, c);
      })
      .catch(() => {});
    return;
  }
  if (message.senderId === state.me.id || message.type === 'system') return;
  // Their message arrived, so they're no longer "typing".
  if (state.typing[id]) clearTyping(id);
  if (isViewing(id)) {
    markRead(id);
    return;
  }
  patchConversation(id, (c) => ({
    unread: c.unread + 1,
    mentioned: c.mentioned || mentionsUser(message, state.me.id),
  }));
  if (!known.muted || mentionsUser(message, state.me.id)) notifyIncoming(message, known);
}

function notifyIncoming(message, conversation) {
  playChime();
  const state = getState();
  const sender = displayName(state, message.senderId, state.details[conversation.id], message.sender?.nickname);
  const body = conversation.type === 'group' ? `${sender}: ${messagePreview(message)}` : messagePreview(message);
  showDesktopNotification(conversation.name, body, () => navigate(`/chats/${conversation.id}`));
}

export function connectSocket(token) {
  disconnectSocket();
  socket = io({ auth: { token }, transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    setConnected(true);
    // Catch up on anything missed while offline.
    syncAll().catch(() => {});
    const { activeId } = getState();
    if (activeId) loadMessages(activeId).catch(() => {});
  });
  socket.on('disconnect', () => setConnected(false));
  socket.on('connect_error', (err) => {
    setConnected(false);
    if (err.message === 'unauthorized') {
      logout();
      toast('登录已过期，请重新登录');
    }
  });

  socket.on('message:new', handleNewMessage);
  socket.on('message:recalled', ({ message }) => {
    const local = getState().messages[message.conversationId]?.items.find((m) => m.id === message.id);
    upsertMessage({ ...message, recalledText: local?.recalledText });
    // Unread counts and @ markers may have changed.
    if (message.senderId !== getState().me.id) fetchConversation(message.conversationId).catch(() => {});
  });

  socket.on('conversation:updated', ({ conversationId }) => {
    if (getState().conversations[conversationId]) fetchConversation(conversationId).catch(() => {});
  });
  socket.on('conversation:settings', ({ conversation }) => upsertConversation(conversation));
  socket.on('conversation:read', ({ conversationId }) =>
    patchConversation(conversationId, { unread: 0, mentioned: false, manualUnread: false }),
  );
  socket.on('conversation:cleared', ({ conversationId }) => {
    clearMessages(conversationId);
    patchConversation(conversationId, { lastMessage: null, unread: 0, mentioned: false });
  });
  socket.on('conversation:removed', ({ conversationId, reason }) => {
    const conversation = getState().conversations[conversationId];
    removeConversation(conversationId);
    if (reason === 'kicked' && conversation) toast(`你已被移出群聊“${conversation.name}”`);
  });

  socket.on('friend:request', ({ request }) => {
    playChime();
    toast(`${request.user.nickname} 请求添加你为朋友`);
    loadRequests().catch(() => {});
  });
  socket.on('friend:requests:changed', () => loadRequests().catch(() => {}));
  socket.on('friend:added', ({ friend }) => upsertFriend(friend));
  socket.on('friend:updated', ({ friend }) => upsertFriend(friend));
  socket.on('friend:removed', ({ userId }) => removeFriend(userId));
  socket.on('presence', ({ userId, online }) => setPresence(userId, online));
  socket.on('typing', ({ conversationId }) => setTyping(conversationId));
  socket.on('user:updated', ({ user }) => applyUserUpdate(user));

  socket.on('moment:new', ({ user, createdAt }) => setMomentStatus({ latest: { user, createdAt } }));
  socket.on('moment:notify', ({ unread }) => {
    setMomentStatus({ unread });
    playChime();
  });
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

let lastTyping = 0;
/** After sending, the next keystroke should announce typing again right away. */
export function resetTyping() {
  lastTyping = 0;
}

export function emitTyping(conversationId) {
  const now = Date.now();
  if (!socket?.connected || now - lastTyping < 2500) return;
  lastTyping = now;
  socket.emit('typing', { conversationId });
}

// When the tab becomes visible again, the open chat counts as read.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const { activeId, conversations } = useStore.getState();
  const c = activeId && conversations[activeId];
  if (c && (c.unread || c.mentioned)) markRead(activeId);
});

