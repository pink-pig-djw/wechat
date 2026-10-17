import { api, setToken, uploadFile } from './api.js';
import {
  clearMessages,
  getState,
  patchConversation,
  patchMessage,
  prependMessages,
  removeConversation,
  removeFriend,
  removeMessage,
  resetSession,
  setConversations,
  setFriends,
  setMe,
  setMessages,
  setMomentStatus,
  setRequests,
  setSessionToken,
  upsertConversation,
  upsertFriend,
  upsertMessage,
} from './store.js';
import { uid } from './format.js';

/* ---------- session ---------- */

function startSession({ token, user }) {
  setToken(token);
  setSessionToken(token);
  setMe(user);
}

export async function login(username, password) {
  startSession(await api.post('/auth/login', { username, password }));
}

export async function register(fields) {
  startSession(await api.post('/auth/register', fields));
}

export function logout() {
  setToken(null);
  resetSession();
}

export async function refreshMe() {
  const { user } = await api.get('/auth/me');
  setMe(user);
}

export async function updateProfile(patch) {
  const { user } = await api.put('/users/me', patch);
  setMe(user);
  return user;
}

export async function changePassword(oldPassword, newPassword) {
  const res = await api.put('/users/me/password', { oldPassword, newPassword });
  startSession(res);
}

/** Load everything the shell needs. Also used to resync after a reconnect. */
export async function syncAll() {
  await Promise.all([loadConversations(), loadFriends(), loadRequests(), loadMomentStatus()]);
}

/* ---------- contacts ---------- */

export async function loadFriends() {
  const { friends } = await api.get('/friends');
  setFriends(friends);
}

export async function loadRequests() {
  const { requests } = await api.get('/friends/requests');
  setRequests(requests);
}

export async function sendFriendRequest(userId, { message, remark }) {
  const res = await api.post('/friends/requests', { userId, message, remark });
  if (res.friend) upsertFriend(res.friend);
  return res;
}

export async function acceptRequest(id, remark = '') {
  const { friend } = await api.post(`/friends/requests/${id}/accept`, { remark });
  upsertFriend(friend);
  await loadRequests();
  return friend;
}

export async function rejectRequest(id) {
  await api.post(`/friends/requests/${id}/reject`);
  await loadRequests();
}

export async function updateFriend(id, patch) {
  const { friend } = await api.put(`/friends/${id}`, patch);
  upsertFriend(friend);
  return friend;
}

export async function deleteFriend(id) {
  await api.del(`/friends/${id}`);
  removeFriend(id);
  const conversation = Object.values(getState().conversations).find((c) => c.peerId === id);
  if (conversation) removeConversation(conversation.id);
}

export const searchUsers = (q) => api.get(`/users/search?q=${encodeURIComponent(q)}`);
export const fetchUser = (id) => api.get(`/users/${id}`).then((r) => r.user);

/* ---------- conversations ---------- */

export async function loadConversations() {
  const { conversations } = await api.get('/conversations');
  setConversations(conversations);
}

export async function fetchConversation(id) {
  const { conversation } = await api.get(`/conversations/${id}`);
  upsertConversation(conversation);
  return conversation;
}

export async function openPrivateChat(userId) {
  const { conversation } = await api.post('/conversations/private', { userId });
  upsertConversation(conversation);
  return conversation.id;
}

export async function createGroup(memberIds, name = '') {
  const { conversation } = await api.post('/conversations/group', { memberIds, name });
  upsertConversation(conversation);
  return conversation.id;
}

export async function updateConversationSettings(id, patch) {
  patchConversation(id, patch);
  try {
    const { conversation } = await api.put(`/conversations/${id}/settings`, patch);
    upsertConversation(conversation);
  } catch (e) {
    await fetchConversation(id).catch(() => {});
    throw e;
  }
}

const readTimers = new Map();
/** Mark a conversation read (coalesces bursts of incoming messages into one request). */
export function markRead(id, { immediate = false } = {}) {
  const c = getState().conversations[id];
  if (!c) return;
  if (c.unread || c.mentioned || c.manualUnread) patchConversation(id, { unread: 0, mentioned: false, manualUnread: false });
  clearTimeout(readTimers.get(id));
  readTimers.set(
    id,
    setTimeout(() => {
      readTimers.delete(id);
      api.post(`/conversations/${id}/read`).catch(() => {});
    }, immediate ? 0 : 400),
  );
}

export async function clearHistory(id) {
  await api.post(`/conversations/${id}/clear`);
  clearMessages(id);
  patchConversation(id, { lastMessage: null, unread: 0, mentioned: false });
}

export async function deleteConversation(id) {
  await api.del(`/conversations/${id}`);
  removeConversation(id);
}

/* ---------- groups ---------- */

const groupCall = async (promise) => {
  const res = await promise;
  if (res?.conversation) upsertConversation(res.conversation);
  return res?.conversation;
};

export const updateGroup = (id, patch) => groupCall(api.put(`/groups/${id}`, patch));
export const setGroupAlias = (id, alias) => groupCall(api.put(`/groups/${id}/alias`, { alias }));
export const inviteMembers = (id, userIds) => groupCall(api.post(`/groups/${id}/members`, { userIds }));
export const removeMember = (id, userId) => groupCall(api.del(`/groups/${id}/members/${userId}`));
export const transferOwner = (id, userId) => groupCall(api.post(`/groups/${id}/transfer`, { userId }));
export const dissolveGroup = (id) => groupCall(api.post(`/groups/${id}/dissolve`));
export const joinGroup = (id) => groupCall(api.post(`/groups/${id}/join`));
export const loadGroups = () => api.get('/groups').then((r) => r.groups);

export async function leaveGroup(id) {
  await api.post(`/groups/${id}/leave`);
  removeConversation(id);
}

/* ---------- messages ---------- */

export async function loadMessages(id) {
  const res = await api.get(`/conversations/${id}/messages?limit=30`);
  setMessages(id, { items: res.messages, hasMore: res.hasMore });
}

export async function loadOlderMessages(id) {
  const bucket = getState().messages[id];
  const oldest = bucket?.items.find((m) => !m.status);
  if (!bucket?.hasMore || !oldest) return;
  const res = await api.get(`/conversations/${id}/messages?limit=30&before=${oldest.id}`);
  prependMessages(id, { items: res.messages, hasMore: res.hasMore });
}

export const searchMessages = (id, q) =>
  api.get(`/conversations/${id}/messages/search?q=${encodeURIComponent(q)}`).then((r) => r.messages);

function localMessage(conversationId, fields) {
  const { me } = getState();
  const clientId = uid();
  const message = {
    id: `local-${clientId}`,
    clientId,
    conversationId,
    senderId: me.id,
    sender: { id: me.id, nickname: me.nickname, avatar: me.avatar },
    mentions: [],
    quote: null,
    recalled: false,
    createdAt: Date.now(),
    status: 'sending',
    ...fields,
  };
  upsertMessage(message);
  return message;
}

async function deliver(local, payload) {
  try {
    const { message } = await api.post(`/conversations/${local.conversationId}/messages`, {
      ...payload,
      clientId: local.clientId,
    });
    upsertMessage({ ...message, status: undefined, retry: undefined });
    return message;
  } catch (e) {
    patchMessage(local.conversationId, local.clientId, { status: 'failed', error: e.message });
    throw e;
  }
}

export function sendText(conversationId, text, { mentions = [], quote = null } = {}) {
  const local = localMessage(conversationId, {
    type: 'text',
    content: text,
    mentions,
    quote: quote && { id: quote.id, senderName: quote.senderName, text: quote.text, type: quote.type, url: quote.url },
  });
  const payload = { type: 'text', content: text, mentions, quoteId: quote?.id };
  patchMessage(conversationId, local.clientId, { retry: payload });
  return deliver(local, payload);
}

export function readImageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ url, width: 0, height: 0 });
    img.src = url;
  });
}

export async function sendImage(conversationId, file) {
  const preview = await readImageSize(file);
  const local = localMessage(conversationId, { type: 'image', content: { ...preview }, progress: 0 });
  let uploaded;
  try {
    uploaded = await uploadFile(file, {
      kind: 'image',
      onProgress: (p) => patchMessage(conversationId, local.clientId, { progress: p }),
    });
  } catch (e) {
    patchMessage(conversationId, local.clientId, { status: 'failed', error: e.message, file, retryKind: 'image' });
    throw e;
  }
  const payload = { type: 'image', content: { url: uploaded.url, width: preview.width, height: preview.height } };
  patchMessage(conversationId, local.clientId, { retry: payload });
  return deliver(local, payload);
}

export async function sendFile(conversationId, file) {
  const local = localMessage(conversationId, {
    type: 'file',
    content: { name: file.name, size: file.size, url: null },
    progress: 0,
  });
  let uploaded;
  try {
    uploaded = await uploadFile(file, {
      kind: 'file',
      onProgress: (p) => patchMessage(conversationId, local.clientId, { progress: p }),
    });
  } catch (e) {
    patchMessage(conversationId, local.clientId, { status: 'failed', error: e.message, file, retryKind: 'file' });
    throw e;
  }
  const payload = { type: 'file', content: { url: uploaded.url, name: file.name, size: file.size } };
  patchMessage(conversationId, local.clientId, { retry: payload });
  return deliver(local, payload);
}

export function sendCard(conversationId, user) {
  const local = localMessage(conversationId, {
    type: 'card',
    content: { userId: user.id, nickname: user.nickname, avatar: user.avatar, username: user.username },
  });
  const payload = { type: 'card', content: { userId: user.id } };
  patchMessage(conversationId, local.clientId, { retry: payload });
  return deliver(local, payload);
}

export function sendSticker(conversationId, sticker) {
  const local = localMessage(conversationId, { type: 'sticker', content: { id: sticker.id } });
  const payload = { type: 'sticker', content: { id: sticker.id } };
  patchMessage(conversationId, local.clientId, { retry: payload });
  return deliver(local, payload);
}

/** Retry a failed local message: re-upload if the upload itself failed, otherwise re-post. */
export async function retryMessage(message) {
  const { conversationId, clientId } = message;
  if (!message.retry && message.file) {
    removeMessage(conversationId, clientId);
    return message.retryKind === 'file' ? sendFile(conversationId, message.file) : sendImage(conversationId, message.file);
  }
  patchMessage(conversationId, clientId, { status: 'sending', error: undefined, createdAt: Date.now() });
  return deliver(message, message.retry);
}

export const discardLocalMessage = removeMessage;

export async function recallMessage(message) {
  const { message: updated } = await api.post(`/messages/${message.id}/recall`);
  upsertMessage({ ...updated, recalledText: message.type === 'text' ? message.content : undefined });
}

export async function forwardMessage(message, { conversationIds = [], userIds = [] }) {
  const { messages } = await api.post('/messages/forward', { messageId: message.id, conversationIds, userIds });
  for (const m of messages) {
    upsertMessage(m);
    if (!getState().conversations[m.conversationId]) fetchConversation(m.conversationId).catch(() => {});
  }
}

/* ---------- moments ---------- */

export async function loadMomentStatus() {
  const status = await api.get('/moments/status');
  setMomentStatus(status);
}

export async function markMomentsSeen() {
  setMomentStatus({ latest: null });
  await api.post('/moments/seen').catch(() => {});
}
