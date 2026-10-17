import { create } from 'zustand';
import { getToken } from './api.js';

const ME_KEY = 'weiliao.me';

function loadJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

const emptySession = () => ({
  users: {},
  friends: {},
  friendsLoaded: false,
  requests: [],
  conversations: {},
  conversationsLoaded: false,
  details: {},
  messages: {},
  typing: {},
  drafts: {},
  activeId: null,
  momentStatus: { unread: 0, latest: null },
  connected: true,
});

export const useStore = create(() => ({
  token: getToken(),
  me: getToken() ? loadJson(ME_KEY) : null,
  ...emptySession(),
}));

const set = useStore.setState;
const get = useStore.getState;

export function setMe(me) {
  try {
    localStorage.setItem(ME_KEY, JSON.stringify(me));
  } catch {
    // ignore
  }
  set((s) => ({ me, users: { ...s.users, [me.id]: { ...s.users[me.id], ...me } } }));
}

export function setSessionToken(token) {
  set({ token });
}

export function resetSession() {
  try {
    localStorage.removeItem(ME_KEY);
  } catch {
    // ignore
  }
  set({ token: null, me: null, ...emptySession() });
}

/* ---------- users & friends ---------- */

export function mergeUsers(list) {
  const valid = list.filter(Boolean);
  if (!valid.length) return;
  set((s) => {
    const users = { ...s.users };
    for (const u of valid) users[u.id] = { ...users[u.id], ...u };
    return { users };
  });
}

export function setFriends(list) {
  const friends = {};
  for (const f of list) friends[f.id] = f;
  set({ friends, friendsLoaded: true });
  mergeUsers(list.map(pickUser));
}

export function upsertFriend(friend) {
  set((s) => ({ friends: { ...s.friends, [friend.id]: { ...s.friends[friend.id], ...friend } } }));
  mergeUsers([pickUser(friend)]);
  // Private chat titles follow remark/nickname.
  patchConversationsWhere(
    (c) => c.peerId === friend.id,
    () => ({ name: friend.remark || friend.nickname, avatar: friend.avatar, isFriend: true }),
  );
}

export function removeFriend(id) {
  set((s) => {
    const friends = { ...s.friends };
    delete friends[id];
    return { friends };
  });
  patchConversationsWhere((c) => c.peerId === id, () => ({ isFriend: false }));
}

export function setPresence(userId, online) {
  set((s) => {
    const friend = s.friends[userId];
    return friend ? { friends: { ...s.friends, [userId]: { ...friend, online } } } : {};
  });
  patchConversationsWhere((c) => c.peerId === userId, () => ({ online }));
}

function pickUser(u) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    avatar: u.avatar,
    signature: u.signature,
    gender: u.gender,
    region: u.region,
  };
}

/** Someone changed their profile: refresh every cached copy of their name/avatar. */
export function applyUserUpdate(user) {
  mergeUsers([user]);
  set((s) => {
    const patch = {};
    const friend = s.friends[user.id];
    if (friend) patch.friends = { ...s.friends, [user.id]: { ...friend, ...user } };
    if (s.me?.id === user.id) patch.me = { ...s.me, ...user };
    const conversations = { ...s.conversations };
    let changed = false;
    for (const c of Object.values(conversations)) {
      if (c.peerId === user.id) {
        conversations[c.id] = { ...c, avatar: user.avatar, name: friend?.remark || user.nickname };
        changed = true;
      } else if (c.memberPreview?.some((m) => m.id === user.id)) {
        conversations[c.id] = {
          ...c,
          memberPreview: c.memberPreview.map((m) => (m.id === user.id ? { ...m, nickname: user.nickname, avatar: user.avatar } : m)),
        };
        changed = true;
      }
    }
    if (changed) patch.conversations = conversations;
    return patch;
  });
}

export function setRequests(requests) {
  set({ requests });
  mergeUsers(requests.map((r) => r.user));
}

/* ---------- conversations ---------- */

export function setConversations(list) {
  const conversations = {};
  for (const c of list) conversations[c.id] = c;
  set({ conversations, conversationsLoaded: true });
}

export function upsertConversation(conversation) {
  const { members, announcement, announcementAt, allowSearch, ...summary } = conversation;
  set((s) => {
    const patch = { conversations: { ...s.conversations, [summary.id]: { ...s.conversations[summary.id], ...summary } } };
    if (members) {
      patch.details = { ...s.details, [summary.id]: { members, announcement, announcementAt, allowSearch } };
    }
    return patch;
  });
  if (members) mergeUsers(members.map(pickUser));
}

export function patchConversation(id, patch) {
  set((s) => {
    const current = s.conversations[id];
    if (!current) return {};
    const next = typeof patch === 'function' ? patch(current) : patch;
    return { conversations: { ...s.conversations, [id]: { ...current, ...next } } };
  });
}

function patchConversationsWhere(predicate, makePatch) {
  set((s) => {
    let changed = false;
    const conversations = { ...s.conversations };
    for (const c of Object.values(conversations)) {
      if (predicate(c)) {
        conversations[c.id] = { ...c, ...makePatch(c) };
        changed = true;
      }
    }
    return changed ? { conversations } : {};
  });
}

export function removeConversation(id) {
  set((s) => {
    const conversations = { ...s.conversations };
    delete conversations[id];
    const messages = { ...s.messages };
    delete messages[id];
    return { conversations, messages };
  });
}

export function setActiveConversation(id) {
  set({ activeId: id });
}

export function setDraft(id, text) {
  set((s) => {
    const drafts = { ...s.drafts };
    if (text) drafts[id] = text;
    else delete drafts[id];
    return { drafts };
  });
}

export function setTyping(conversationId) {
  set((s) => ({ typing: { ...s.typing, [conversationId]: Date.now() + 4000 } }));
}

export function clearTyping(conversationId) {
  set((s) => {
    const typing = { ...s.typing };
    delete typing[conversationId];
    return { typing };
  });
}

/* ---------- messages ---------- */

const sameMessage = (a, b) => a.id === b.id || (a.clientId && b.clientId && a.clientId === b.clientId);

export function setMessages(conversationId, { items, hasMore }) {
  mergeUsers(items.map((m) => m.sender));
  set((s) => {
    // Keep in-flight local messages that the server doesn't know about yet.
    const pending = (s.messages[conversationId]?.items ?? []).filter(
      (m) => m.status && !items.some((x) => sameMessage(x, m)),
    );
    return {
      messages: { ...s.messages, [conversationId]: { items: [...items, ...pending], hasMore, loaded: true } },
    };
  });
}

export function prependMessages(conversationId, { items, hasMore }) {
  mergeUsers(items.map((m) => m.sender));
  set((s) => {
    const current = s.messages[conversationId];
    if (!current) return {};
    const fresh = items.filter((m) => !current.items.some((x) => x.id === m.id));
    return { messages: { ...s.messages, [conversationId]: { ...current, items: [...fresh, ...current.items], hasMore } } };
  });
}

/** Insert or replace (matching by id or clientId) a message, and keep the chat-list preview in sync. */
export function upsertMessage(message) {
  const conversationId = message.conversationId;
  if (message.sender) mergeUsers([message.sender]);
  set((s) => {
    const patch = {};
    const bucket = s.messages[conversationId];
    if (bucket) {
      const index = bucket.items.findIndex((m) => sameMessage(m, message));
      let items;
      if (index >= 0) {
        items = bucket.items.slice();
        // A server copy (numeric id) replaces our optimistic one, so drop the local-only fields.
        const confirmed = typeof message.id === 'number' ? { status: undefined, error: undefined, progress: undefined } : {};
        items[index] = { ...items[index], ...confirmed, ...message };
      } else {
        // Confirmed messages go before local pending ones.
        const firstPending = bucket.items.findIndex((m) => m.status);
        items = bucket.items.slice();
        if (firstPending >= 0 && !message.status) items.splice(firstPending, 0, message);
        else items.push(message);
      }
      patch.messages = { ...s.messages, [conversationId]: { ...bucket, items } };
    }
    const conversation = s.conversations[conversationId];
    if (conversation && !message.status) {
      const last = conversation.lastMessage;
      if (!last || last.id <= message.id) {
        patch.conversations = {
          ...s.conversations,
          [conversationId]: { ...conversation, lastMessage: message, updatedAt: Math.max(conversation.updatedAt ?? 0, message.createdAt) },
        };
      }
    }
    return patch;
  });
}

export function patchMessage(conversationId, key, patch) {
  set((s) => {
    const bucket = s.messages[conversationId];
    if (!bucket) return {};
    const items = bucket.items.map((m) => (m.id === key || m.clientId === key ? { ...m, ...patch } : m));
    return { messages: { ...s.messages, [conversationId]: { ...bucket, items } } };
  });
}

export function removeMessage(conversationId, key) {
  set((s) => {
    const bucket = s.messages[conversationId];
    if (!bucket) return {};
    return {
      messages: {
        ...s.messages,
        [conversationId]: { ...bucket, items: bucket.items.filter((m) => m.id !== key && m.clientId !== key) },
      },
    };
  });
}

export function clearMessages(conversationId) {
  set((s) => ({ messages: { ...s.messages, [conversationId]: { items: [], hasMore: false, loaded: true } } }));
}

export function setMomentStatus(patch) {
  set((s) => ({ momentStatus: { ...s.momentStatus, ...patch } }));
}

export function setConnected(connected) {
  set({ connected });
}

/* ---------- derived helpers ---------- */

/** Display name of a user: my remark for them > their group alias > nickname. */
export function displayName(state, userId, detail, fallback = '') {
  if (userId === state.me?.id) {
    const mine = detail?.members?.find((m) => m.id === userId);
    return mine?.alias || state.me.nickname;
  }
  const friend = state.friends[userId];
  if (friend?.remark) return friend.remark;
  const member = detail?.members?.find((m) => m.id === userId);
  if (member?.alias) return member.alias;
  return state.users[userId]?.nickname ?? member?.nickname ?? friend?.nickname ?? fallback;
}

export function sortConversations(map) {
  const time = (c) => c.lastMessage?.createdAt ?? c.updatedAt ?? 0;
  return Object.values(map).sort((a, b) => (b.pinned - a.pinned) || time(b) - time(a));
}

export function countUnread(map) {
  let total = 0;
  let mutedDot = false;
  for (const c of Object.values(map)) {
    const n = c.unread || (c.manualUnread ? 1 : 0);
    if (!n) continue;
    if (c.muted) mutedDot = true;
    else total += n;
  }
  return { total, mutedDot };
}

export { get as getState };
