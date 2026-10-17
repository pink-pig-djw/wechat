import { getMessage, memberIds } from './views.js';

/**
 * Insert a message and bump the conversation. Does not emit; call `broadcastMessage` after the
 * surrounding transaction commits so clients never see a message that was rolled back.
 */
export function insertMessage(db, { conversationId, senderId = null, type, content, mentions = null, quote = null, clientId = null }) {
  const now = Date.now();
  const stored = typeof content === 'string' ? content : JSON.stringify(content);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO messages (conversation_id, sender_id, type, content, mentions, quote, client_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      conversationId,
      senderId,
      type,
      stored,
      mentions?.length ? JSON.stringify(mentions) : null,
      quote ? JSON.stringify(quote) : null,
      clientId,
      now,
    );
  const id = Number(lastInsertRowid);
  db.prepare('UPDATE conversations SET last_message_id = ?, updated_at = ? WHERE id = ?').run(id, now, conversationId);
  // A new message brings a deleted chat back into everyone's list.
  db.prepare('UPDATE conversation_members SET hidden = 0 WHERE conversation_id = ?').run(conversationId);
  if (senderId) {
    db.prepare(
      'UPDATE conversation_members SET last_read_message_id = ?, manual_unread = 0 WHERE conversation_id = ? AND user_id = ?',
    ).run(id, conversationId, senderId);
  }
  return getMessage(db, id);
}

export function broadcastMessage({ db, realtime }, message) {
  realtime.toUsers(memberIds(db, message.conversationId), 'message:new', { message });
}

export function sendMessage(ctx, params) {
  const message = insertMessage(ctx.db, params);
  broadcastMessage(ctx, message);
  return message;
}

/** System notices are stored as structured events so each client can phrase them ("你" vs. a name). */
export function systemContent(event, { actor, targets, ...rest } = {}) {
  return {
    event,
    actor: actor ? { id: actor.id, name: actor.alias || actor.nickname } : null,
    targets: (targets ?? []).map((t) => ({ id: t.id, name: t.alias || t.nickname })),
    ...rest,
  };
}

export function getOrCreatePrivateConversation(db, a, b) {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  const existing = db.prepare('SELECT id FROM conversations WHERE private_key = ?').get(key);
  if (existing) return existing.id;
  const now = Date.now();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO conversations (type, private_key, created_at, updated_at) VALUES ('private', ?, ?, ?)")
    .run(key, now, now);
  const id = Number(lastInsertRowid);
  const addMember = db.prepare(
    'INSERT INTO conversation_members (conversation_id, user_id, joined_at, hidden) VALUES (?, ?, ?, 1)',
  );
  addMember.run(id, a, now);
  addMember.run(id, b, now);
  return id;
}

export function generateGroupNo(db) {
  const exists = db.prepare('SELECT 1 FROM conversations WHERE group_no = ?');
  for (;;) {
    const no = String(Math.floor(10_000_000 + Math.random() * 90_000_000));
    if (!exists.get(no)) return no;
  }
}
