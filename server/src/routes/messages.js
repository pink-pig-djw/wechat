import express from 'express';
import { RECALL_WINDOW_MS } from '../config.js';
import { getOrCreatePrivateConversation, sendMessage } from '../messaging.js';
import { areFriends, getMembership, getMessage, memberIds } from '../views.js';
import { badRequest, forbidden, notFound, readId, readIdList } from '../util.js';
import { assertCanSend, requireMembership } from './conversations.js';

const FORWARDABLE = new Set(['text', 'image', 'file', 'card', 'sticker']);

export default function messageRoutes(ctx) {
  const { db, realtime } = ctx;
  const router = express.Router();

  function loadVisibleMessage(messageId, userId) {
    const message = getMessage(db, messageId);
    const membership = message && getMembership(db, message.conversationId, userId);
    if (!message || !membership || message.id <= membership.cleared_message_id) throw notFound('消息不存在');
    return message;
  }

  router.post('/:id/recall', (req, res) => {
    const me = req.user.id;
    const message = loadVisibleMessage(readId(req.params.id, '消息'), me);
    if (message.senderId !== me) throw forbidden('只能撤回自己发送的消息');
    if (message.recalled) throw badRequest('该消息已撤回');
    if (Date.now() - message.createdAt > RECALL_WINDOW_MS) throw badRequest('发送时间超过 2 分钟的消息，不能被撤回');
    db.prepare("UPDATE messages SET recalled = 1, content = '', quote = NULL, mentions = NULL WHERE id = ?").run(message.id);
    const updated = getMessage(db, message.id);
    realtime.toUsers(memberIds(db, message.conversationId), 'message:recalled', { message: updated });
    res.json({ message: updated });
  });

  router.post('/forward', (req, res) => {
    const me = req.user.id;
    const source = loadVisibleMessage(readId(req.body?.messageId, '消息'), me);
    if (source.recalled || !FORWARDABLE.has(source.type)) throw badRequest('该消息不支持转发');

    const conversationIds = readIdList(req.body?.conversationIds ?? [], '会话');
    for (const userId of readIdList(req.body?.userIds ?? [], '好友')) {
      if (!areFriends(db, me, userId)) throw forbidden('只能转发给你的好友');
      conversationIds.push(getOrCreatePrivateConversation(db, me, userId));
    }
    const targets = [...new Set(conversationIds)];
    if (!targets.length) throw badRequest('请选择转发对象');
    if (targets.length > 9) throw badRequest('一次最多转发给 9 个聊天');
    // Validate everything first so a forward is all-or-nothing.
    for (const id of targets) assertCanSend(db, requireMembership(db, id, me), me);

    const messages = targets.map((conversationId) =>
      sendMessage(ctx, { conversationId, senderId: me, type: source.type, content: source.content }),
    );
    res.json({ messages });
  });

  return router;
}
