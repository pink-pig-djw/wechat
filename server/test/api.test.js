import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connectSocket } from 'socket.io-client';
import { createServer } from '../src/index.js';

let server;
let base;
let tmp;
const sockets = [];

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weiliao-test-'));
  server = createServer({
    dataDir: path.join(tmp, 'data'),
    uploadDir: path.join(tmp, 'uploads'),
    clientDist: path.join(tmp, 'no-client'),
    jwtSecret: 'test-secret',
  });
  const port = await server.listen(0);
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  sockets.forEach((s) => s.disconnect());
  await server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(token, method, url, body) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}/api${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/** Like `call`, but asserts success and returns the JSON body. */
async function ok(token, method, url, body) {
  const res = await call(token, method, url, body);
  assert.ok(res.status < 300, `${method} ${url} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

let userSeq = 0;
async function register(nickname) {
  userSeq += 1;
  const { token, user } = await ok(null, 'POST', '/auth/register', {
    username: `user${userSeq}_${Date.now() % 100000}`,
    password: 'secret1',
    nickname,
  });
  return { token, ...user };
}

function connect(user) {
  return new Promise((resolve, reject) => {
    const socket = connectSocket(base, { auth: { token: user.token }, transports: ['websocket'], forceNew: true });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitFor(socket, event, predicate = () => true, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeout);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

async function befriend(a, b) {
  await ok(a.token, 'POST', '/friends/requests', { userId: b.id, message: '' });
  const { requests } = await ok(b.token, 'GET', '/friends/requests');
  const request = requests.find((r) => r.direction === 'in' && r.user.id === a.id && r.status === 'pending');
  await ok(b.token, 'POST', `/friends/requests/${request.id}/accept`, {});
}

async function privateChat(a, b) {
  const { conversation } = await ok(a.token, 'POST', '/conversations/private', { userId: b.id });
  return conversation.id;
}

describe('auth', () => {
  test('register validates input and rejects duplicates', async () => {
    assert.equal((await call(null, 'POST', '/auth/register', { username: '1abc', password: 'secret1', nickname: 'x' })).status, 400);
    assert.equal((await call(null, 'POST', '/auth/register', { username: 'goodname', password: '123', nickname: 'x' })).status, 400);
    assert.equal((await call(null, 'POST', '/auth/register', { username: 'goodname', password: 'secret1', nickname: ' ' })).status, 400);
    await ok(null, 'POST', '/auth/register', { username: 'goodname', password: 'secret1', nickname: '好名字' });
    const dup = await call(null, 'POST', '/auth/register', { username: 'GoodName', password: 'secret1', nickname: 'x' });
    assert.equal(dup.status, 409);
  });

  test('login and /me', async () => {
    assert.equal((await call(null, 'POST', '/auth/login', { username: 'goodname', password: 'wrong!!' })).status, 401);
    const { token, user } = await ok(null, 'POST', '/auth/login', { username: 'goodname', password: 'secret1' });
    assert.equal(user.nickname, '好名字');
    const me = await ok(token, 'GET', '/auth/me');
    assert.equal(me.user.id, user.id);
    assert.equal((await call(null, 'GET', '/conversations')).status, 401);
    assert.equal((await call('garbage', 'GET', '/conversations')).status, 401);
  });

  test('changing password revokes old tokens', async () => {
    const u = await register('改密码');
    const res = await ok(u.token, 'PUT', '/users/me/password', { oldPassword: 'secret1', newPassword: 'secret2' });
    assert.equal((await call(u.token, 'GET', '/auth/me')).status, 401);
    await ok(res.token, 'GET', '/auth/me');
  });

  test('profile update is validated', async () => {
    const u = await register('资料');
    const { user } = await ok(u.token, 'PUT', '/users/me', { nickname: '新名字', signature: '你好', gender: 2, region: '上海' });
    assert.deepEqual([user.nickname, user.signature, user.gender, user.region], ['新名字', '你好', 2, '上海']);
    assert.equal((await call(u.token, 'PUT', '/users/me', { avatar: 'https://evil.example/x.png' })).status, 400);
    assert.equal((await call(u.token, 'PUT', '/users/me', { gender: 7 })).status, 400);
  });
});

describe('friends', () => {
  test('request, realtime notification, accept, greeting lands in chat', async () => {
    const alice = await register('爱丽丝');
    const bob = await register('Bob');
    const bobSocket = await connect(bob);
    const aliceSocket = await connect(alice);

    const search = await ok(alice.token, 'GET', `/users/search?q=${bob.username}`);
    assert.equal(search.users[0].id, bob.id);
    assert.equal(search.users[0].relation, 'stranger');

    const incoming = waitFor(bobSocket, 'friend:request');
    const sent = await ok(alice.token, 'POST', '/friends/requests', { userId: bob.id, message: '我是爱丽丝', remark: '小鲍' });
    assert.equal(sent.status, 'pending');
    const { request } = await incoming;
    assert.equal(request.user.id, alice.id);
    assert.equal(request.message, '我是爱丽丝');

    const profile = await ok(bob.token, 'GET', `/users/${alice.id}`);
    assert.equal(profile.user.incomingRequestId, request.id);

    const added = waitFor(aliceSocket, 'friend:added');
    const greeting = waitFor(aliceSocket, 'message:new', (p) => p.message.type === 'text');
    await ok(bob.token, 'POST', `/friends/requests/${request.id}/accept`, { remark: '' });
    assert.equal((await added).friend.id, bob.id);
    assert.equal((await greeting).message.content, '我是爱丽丝');

    const { friends } = await ok(alice.token, 'GET', '/friends');
    const bobAsFriend = friends.find((f) => f.id === bob.id);
    assert.equal(bobAsFriend.remark, '小鲍');
    assert.equal(bobAsFriend.initial, 'X');
    assert.equal(bobAsFriend.online, true);

    const { conversations } = await ok(bob.token, 'GET', '/conversations');
    const chat = conversations.find((c) => c.peerId === alice.id);
    assert.equal(chat.unread, 1);
    assert.equal(chat.lastMessage.type, 'system');
    assert.equal(chat.name, '爱丽丝');

    assert.equal((await call(bob.token, 'POST', `/friends/requests/${request.id}/accept`, {})).status, 400);
    assert.equal((await call(alice.token, 'POST', '/friends/requests', { userId: bob.id })).status, 400);
  });

  test('adding someone who already asked you accepts immediately', async () => {
    const a = await register('甲');
    const b = await register('乙');
    await ok(a.token, 'POST', '/friends/requests', { userId: b.id, message: 'hi' });
    const res = await ok(b.token, 'POST', '/friends/requests', { userId: a.id });
    assert.equal(res.status, 'accepted');
    const { friends } = await ok(a.token, 'GET', '/friends');
    assert.ok(friends.some((f) => f.id === b.id));
  });

  test('reject, remark/star, delete', async () => {
    const a = await register('丙');
    const b = await register('丁');
    await ok(a.token, 'POST', '/friends/requests', { userId: b.id });
    const { requests } = await ok(b.token, 'GET', '/friends/requests');
    await ok(b.token, 'POST', `/friends/requests/${requests[0].id}/reject`);
    const after = await ok(a.token, 'GET', '/friends/requests');
    assert.equal(after.requests[0].status, 'rejected');
    assert.equal(after.requests[0].direction, 'out');

    await befriend(a, b);
    const { friend } = await ok(a.token, 'PUT', `/friends/${b.id}`, { remark: '老丁', starred: true });
    assert.equal(friend.remark, '老丁');
    assert.equal(friend.starred, true);
    const conversationId = await privateChat(a, b);
    await ok(a.token, 'DELETE', `/friends/${b.id}`);
    const sendAfterDelete = await call(b.token, 'POST', `/conversations/${conversationId}/messages`, { type: 'text', content: 'hi' });
    assert.equal(sendAfterDelete.status, 403);
    const { conversations } = await ok(a.token, 'GET', '/conversations');
    assert.ok(!conversations.some((c) => c.id === conversationId));
  });

  test('cannot add yourself or open chats with strangers', async () => {
    const a = await register('戊');
    const b = await register('己');
    assert.equal((await call(a.token, 'POST', '/friends/requests', { userId: a.id })).status, 400);
    assert.equal((await call(a.token, 'POST', '/conversations/private', { userId: b.id })).status, 403);
  });
});

describe('private chat', () => {
  test('send, unread, read, quote, recall, typing', async () => {
    const a = await register('张三');
    const b = await register('李四');
    await befriend(a, b);
    const bSocket = await connect(b);
    const conversationId = await privateChat(a, b);

    const received = waitFor(bSocket, 'message:new', (p) => p.message.content === '在吗？');
    const { message } = await ok(a.token, 'POST', `/conversations/${conversationId}/messages`, {
      type: 'text',
      content: '在吗？',
      clientId: 'c-1',
    });
    assert.equal(message.clientId, 'c-1');
    assert.equal((await received).message.id, message.id);

    let list = (await ok(b.token, 'GET', '/conversations')).conversations;
    assert.equal(list.find((c) => c.id === conversationId).unread, 1);
    await ok(b.token, 'POST', `/conversations/${conversationId}/read`);
    list = (await ok(b.token, 'GET', '/conversations')).conversations;
    assert.equal(list.find((c) => c.id === conversationId).unread, 0);

    const reply = await ok(b.token, 'POST', `/conversations/${conversationId}/messages`, {
      type: 'text',
      content: '在的',
      quoteId: message.id,
    });
    assert.equal(reply.message.quote.text, '在吗？');
    assert.equal(reply.message.quote.senderName, '张三');

    assert.equal((await call(b.token, 'POST', `/messages/${message.id}/recall`)).status, 403);
    const recalled = waitFor(bSocket, 'message:recalled');
    await ok(a.token, 'POST', `/messages/${message.id}/recall`);
    const event = await recalled;
    assert.equal(event.message.recalled, true);
    assert.equal(event.message.content, null);

    const aSocket = await connect(a);
    const typing = waitFor(aSocket, 'typing');
    bSocket.emit('typing', { conversationId });
    assert.deepEqual(await typing, { conversationId, userId: b.id });

    assert.equal(
      (await call(a.token, 'POST', `/conversations/${conversationId}/messages`, { type: 'text', content: '   ' })).status,
      400,
    );
    assert.equal(
      (await call(a.token, 'POST', `/conversations/${conversationId}/messages`, { type: 'image', content: { url: 'http://x/y.png' } })).status,
      400,
    );
  });

  test('pagination, search, clear, hide, settings', async () => {
    const a = await register('王五');
    const b = await register('赵六');
    await befriend(a, b);
    const id = await privateChat(a, b);
    for (let i = 1; i <= 35; i += 1) {
      await ok(a.token, 'POST', `/conversations/${id}/messages`, { type: 'text', content: `消息 ${i}` });
    }
    const page1 = await ok(b.token, 'GET', `/conversations/${id}/messages?limit=30`);
    assert.equal(page1.messages.length, 30);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.messages.at(-1).content, '消息 35');
    const page2 = await ok(b.token, 'GET', `/conversations/${id}/messages?limit=30&before=${page1.messages[0].id}`);
    assert.equal(page2.hasMore, false);
    assert.ok(page2.messages.length >= 5);

    const found = await ok(b.token, 'GET', `/conversations/${id}/messages/search?q=${encodeURIComponent('消息 3')}`);
    assert.ok(found.messages.length >= 6);

    const { conversation } = await ok(b.token, 'PUT', `/conversations/${id}/settings`, { pinned: true, muted: true });
    assert.equal(conversation.pinned, true);
    assert.equal(conversation.muted, true);

    await ok(b.token, 'POST', `/conversations/${id}/clear`);
    assert.equal((await ok(b.token, 'GET', `/conversations/${id}/messages`)).messages.length, 0);
    assert.ok((await ok(a.token, 'GET', `/conversations/${id}/messages`)).messages.length > 0);

    await ok(b.token, 'DELETE', `/conversations/${id}`);
    assert.ok(!(await ok(b.token, 'GET', '/conversations')).conversations.some((c) => c.id === id));
    await ok(a.token, 'POST', `/conversations/${id}/messages`, { type: 'text', content: '回来' });
    const back = (await ok(b.token, 'GET', '/conversations')).conversations.find((c) => c.id === id);
    assert.equal(back.unread, 1);
    assert.equal(back.lastMessage.content, '回来');
  });

  test('cards and forwarding', async () => {
    const a = await register('孙七');
    const b = await register('周八');
    const c = await register('吴九');
    await befriend(a, b);
    await befriend(a, c);
    const ab = await privateChat(a, b);
    const { message: card } = await ok(a.token, 'POST', `/conversations/${ab}/messages`, {
      type: 'card',
      content: { userId: c.id },
    });
    assert.equal(card.content.nickname, '吴九');
    assert.equal((await call(b.token, 'POST', '/messages/forward', { messageId: card.id, userIds: [] })).status, 400);
    assert.equal((await call(b.token, 'POST', '/messages/forward', { messageId: card.id, userIds: [c.id] })).status, 403);
    const forwarded = await ok(a.token, 'POST', '/messages/forward', { messageId: card.id, userIds: [c.id] });
    assert.equal(forwarded.messages[0].type, 'card');
    assert.equal(forwarded.messages[0].senderId, a.id);
  });

  test('stickers and emoji tokens', async () => {
    const a = await register('表情甲');
    const b = await register('表情乙');
    await befriend(a, b);
    const id = await privateChat(a, b);
    const { message } = await ok(a.token, 'POST', `/conversations/${id}/messages`, { type: 'sticker', content: { id: 'hello' } });
    assert.deepEqual(message.content, { id: 'hello' });
    const bad = await call(a.token, 'POST', `/conversations/${id}/messages`, { type: 'sticker', content: { id: '<script>' } });
    assert.equal(bad.status, 400);
    const quoted = await ok(b.token, 'POST', `/conversations/${id}/messages`, { type: 'text', content: '[微笑]好可爱', quoteId: message.id });
    assert.equal(quoted.message.quote.text, '[动画表情]');
    assert.equal(quoted.message.content, '[微笑]好可爱');
    const fwd = await ok(b.token, 'POST', '/messages/forward', { messageId: message.id, conversationIds: [id] });
    assert.equal(fwd.messages[0].type, 'sticker');
  });
});

describe('groups', () => {
  test('full lifecycle', async () => {
    const owner = await register('群主');
    const m1 = await register('成员一');
    const m2 = await register('成员二');
    const m3 = await register('成员三');
    const outsider = await register('路人');
    await befriend(owner, m1);
    await befriend(owner, m2);
    await befriend(owner, m3);
    const m1Socket = await connect(m1);

    assert.equal((await call(owner.token, 'POST', '/conversations/group', { memberIds: [m1.id] })).status, 400);
    assert.equal((await call(owner.token, 'POST', '/conversations/group', { memberIds: [m1.id, outsider.id] })).status, 403);

    const created = waitFor(m1Socket, 'message:new', (p) => p.message.type === 'system');
    const { conversation } = await ok(owner.token, 'POST', '/conversations/group', { memberIds: [m1.id, m2.id] });
    const id = conversation.id;
    assert.equal(conversation.memberCount, 3);
    assert.equal(conversation.myRole, 'owner');
    assert.match(conversation.groupNo, /^\d{8}$/);
    const createdEvent = await created;
    assert.equal(createdEvent.message.content.event, 'group_create');
    assert.deepEqual(createdEvent.message.content.targets.map((t) => t.id), [m1.id, m2.id]);

    // @mentions
    await ok(m1.token, 'POST', `/conversations/${id}/messages`, { type: 'text', content: '@成员二 看这里', mentions: [m2.id, outsider.id] });
    let m2view = (await ok(m2.token, 'GET', '/conversations')).conversations.find((c) => c.id === id);
    assert.equal(m2view.mentioned, true);
    assert.equal(m2view.unread, 1);
    const ownerView = (await ok(owner.token, 'GET', '/conversations')).conversations.find((c) => c.id === id);
    assert.equal(ownerView.mentioned, false);
    // only the owner may @all
    const noAll = await ok(m1.token, 'POST', `/conversations/${id}/messages`, { type: 'text', content: '@所有人', mentions: ['all'] });
    assert.deepEqual(noAll.message.mentions, []);

    // rename (anyone), announcement (owner only)
    const renamed = await ok(m1.token, 'PUT', `/groups/${id}`, { name: '周末爬山群' });
    assert.equal(renamed.conversation.name, '周末爬山群');
    assert.equal((await call(m1.token, 'PUT', `/groups/${id}`, { announcement: 'x' })).status, 403);
    const announced = await ok(owner.token, 'PUT', `/groups/${id}`, { announcement: '周六早上 8 点集合' });
    assert.equal(announced.conversation.announcement, '周六早上 8 点集合');
    m2view = (await ok(m2.token, 'GET', '/conversations')).conversations.find((c) => c.id === id);
    assert.equal(m2view.mentioned, true);

    // invites: only your friends, and new members don't see old history
    assert.equal((await call(m1.token, 'POST', `/groups/${id}/members`, { userIds: [m3.id] })).status, 403);
    await ok(owner.token, 'POST', `/groups/${id}/members`, { userIds: [m3.id] });
    const m3history = await ok(m3.token, 'GET', `/conversations/${id}/messages`);
    assert.equal(m3history.messages.length, 1);
    assert.equal(m3history.messages[0].content.event, 'group_invite');

    // alias
    const aliased = await ok(m3.token, 'PUT', `/groups/${id}/alias`, { alias: '小三子' });
    assert.equal(aliased.conversation.members.find((m) => m.id === m3.id).alias, '小三子');

    // kick
    assert.equal((await call(m1.token, 'DELETE', `/groups/${id}/members/${m2.id}`)).status, 403);
    const m2Socket = await connect(m2);
    const removed = waitFor(m2Socket, 'conversation:removed');
    await ok(owner.token, 'DELETE', `/groups/${id}/members/${m2.id}`);
    assert.equal((await removed).conversationId, id);
    assert.equal((await call(m2.token, 'GET', `/conversations/${id}`)).status, 404);

    // join via group number
    const found = await ok(outsider.token, 'GET', `/users/search?q=${conversation.groupNo}`);
    assert.equal(found.groups[0].id, id);
    assert.equal(found.groups[0].joined, false);
    await ok(owner.token, 'PUT', `/groups/${id}`, { allowSearch: false });
    assert.equal((await ok(outsider.token, 'GET', `/users/search?q=${conversation.groupNo}`)).groups.length, 0);
    assert.equal((await call(outsider.token, 'POST', `/groups/${id}/join`)).status, 403);
    await ok(owner.token, 'PUT', `/groups/${id}`, { allowSearch: true });
    const joined = await ok(outsider.token, 'POST', `/groups/${id}/join`);
    assert.equal(joined.conversation.memberCount, 4);

    // owner leaves -> earliest remaining member becomes owner
    await ok(owner.token, 'POST', `/groups/${id}/leave`);
    const detail = await ok(m1.token, 'GET', `/conversations/${id}`);
    assert.equal(detail.conversation.ownerId, m1.id);
    assert.equal(detail.conversation.myRole, 'owner');

    // transfer + dissolve
    await ok(m1.token, 'POST', `/groups/${id}/transfer`, { userId: m3.id });
    assert.equal((await call(m1.token, 'POST', `/groups/${id}/dissolve`)).status, 403);
    await ok(m3.token, 'POST', `/groups/${id}/dissolve`);
    const blocked = await call(m1.token, 'POST', `/conversations/${id}/messages`, { type: 'text', content: 'hi' });
    assert.equal(blocked.status, 400);
    const history = await ok(m1.token, 'GET', `/conversations/${id}/messages`);
    assert.equal(history.messages.at(-1).content.event, 'group_dissolve');
    await ok(m1.token, 'POST', `/groups/${id}/leave`);
  });
});

describe('moments', () => {
  test('feed visibility, likes, comments, notifications', async () => {
    const a = await register('作者');
    const b = await register('好友');
    const c = await register('陌生人');
    const d = await register('作者的另一好友');
    await befriend(a, b);
    await befriend(a, d);
    const aSocket = await connect(a);
    const bSocket = await connect(b);

    assert.equal((await call(a.token, 'POST', '/moments', { content: '' })).status, 400);
    const newMoment = waitFor(bSocket, 'moment:new');
    const { moment } = await ok(a.token, 'POST', '/moments', { content: '今天天气真好', images: [] });
    assert.equal((await newMoment).user.id, a.id);

    const status = await ok(b.token, 'GET', '/moments/status');
    assert.equal(status.latest.user.id, a.id);
    await ok(b.token, 'POST', '/moments/seen');
    assert.equal((await ok(b.token, 'GET', '/moments/status')).latest, null);

    assert.ok((await ok(b.token, 'GET', '/moments')).moments.some((m) => m.id === moment.id));
    assert.ok(!(await ok(c.token, 'GET', '/moments')).moments.some((m) => m.id === moment.id));
    assert.equal((await call(c.token, 'GET', `/moments?userId=${a.id}`)).status, 403);
    assert.equal((await call(c.token, 'POST', `/moments/${moment.id}/like`)).status, 404);

    const notified = waitFor(aSocket, 'moment:notify');
    const liked = await ok(b.token, 'POST', `/moments/${moment.id}/like`);
    assert.equal(liked.moment.liked, true);
    assert.equal((await notified).unread, 1);
    await ok(b.token, 'POST', `/moments/${moment.id}/comments`, { content: '羡慕！' });
    await ok(d.token, 'POST', `/moments/${moment.id}/like`);

    // b and d aren't friends with each other, so they can't see each other's likes.
    const bView = (await ok(b.token, 'GET', '/moments')).moments.find((m) => m.id === moment.id);
    assert.deepEqual(bView.likes.map((l) => l.userId), [b.id]);
    const aView = (await ok(a.token, 'GET', '/moments')).moments.find((m) => m.id === moment.id);
    assert.deepEqual(aView.likes.map((l) => l.userId).sort(), [b.id, d.id].sort());
    assert.equal(aView.comments[0].content, '羡慕！');

    const reply = await ok(a.token, 'POST', `/moments/${moment.id}/comments`, { content: '一起出去玩', replyToUserId: b.id });
    const replyComment = reply.moment.comments.at(-1);
    assert.equal(replyComment.replyToNickname, '好友');

    const { notifications, unread } = await ok(a.token, 'GET', '/moments/notifications');
    assert.equal(unread, 3);
    assert.deepEqual(notifications.map((n) => n.type).sort(), ['comment', 'like', 'like']);
    await ok(a.token, 'POST', '/moments/notifications/read');
    assert.equal((await ok(a.token, 'GET', '/moments/status')).unread, 0);
    assert.equal((await ok(b.token, 'GET', '/moments/notifications')).notifications[0].type, 'reply');

    assert.equal((await call(b.token, 'DELETE', `/moments/comments/${replyComment.id}`)).status, 403);
    await ok(a.token, 'DELETE', `/moments/comments/${replyComment.id}`);
    assert.equal((await call(b.token, 'DELETE', `/moments/${moment.id}`)).status, 403);
    await ok(a.token, 'DELETE', `/moments/${moment.id}`);
    assert.equal((await ok(a.token, 'GET', '/moments')).moments.length, 0);
  });
});

describe('uploads', () => {
  async function upload(token, kind, name, type, bytes) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    const res = await fetch(`${base}/api/upload?kind=${kind}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    return { status: res.status, body: await res.json() };
  }

  test('images and files are stored safely', async () => {
    const u = await register('上传');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const img = await upload(u.token, 'image', 'pic.png', 'image/png', png);
    assert.equal(img.status, 201);
    assert.match(img.body.url, /^\/uploads\/[\w-]+\.png$/);
    const served = await fetch(base + img.body.url);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.equal(served.headers.get('content-disposition'), null);

    const rejected = await upload(u.token, 'image', 'x.html', 'text/html', '<script>alert(1)</script>');
    assert.equal(rejected.status, 400);

    const file = await upload(u.token, 'file', '季度报告.html', 'text/html', '<script>alert(1)</script>');
    assert.equal(file.status, 201);
    assert.equal(file.body.name, '季度报告.html');
    const download = await fetch(base + file.body.url);
    assert.equal(download.headers.get('content-disposition'), 'attachment');
    assert.match(download.headers.get('content-security-policy'), /sandbox/);

    const noAuth = await fetch(`${base}/api/upload?kind=file`, { method: 'POST' });
    assert.equal(noAuth.status, 401);
  });
});
