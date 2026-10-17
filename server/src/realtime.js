import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { friendIds, getMembership, memberIds } from './views.js';

/**
 * Socket.IO is used for server → client push only (plus typing hints).
 * Every socket joins a personal room `user:<id>`, so emitting to a user reaches all of their tabs/devices.
 */
export function createRealtime(httpServer, { db, config }) {
  const io = new Server(httpServer, { serveClient: false });
  const connections = new Map();

  const room = (userId) => `user:${userId}`;
  const isOnline = (userId) => (connections.get(userId) ?? 0) > 0;

  function toUsers(userIds, event, payload) {
    const rooms = [...new Set(userIds)].map(room);
    if (rooms.length) io.to(rooms).emit(event, payload);
  }

  function toUser(userId, event, payload) {
    io.to(room(userId)).emit(event, payload);
  }

  function announcePresence(userId, online) {
    toUsers(friendIds(db, userId), 'presence', { userId, online });
  }

  io.use((socket, next) => {
    const user = verifyToken(db, config, socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.userId = user.id;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(room(userId));
    const count = (connections.get(userId) ?? 0) + 1;
    connections.set(userId, count);
    if (count === 1) announcePresence(userId, true);

    socket.on('typing', (payload) => {
      const conversationId = Number(payload?.conversationId);
      if (!Number.isInteger(conversationId)) return;
      const membership = getMembership(db, conversationId, userId);
      if (!membership || membership.type !== 'private') return;
      const others = memberIds(db, conversationId).filter((id) => id !== userId);
      toUsers(others, 'typing', { conversationId, userId });
    });

    socket.on('disconnect', () => {
      const left = (connections.get(userId) ?? 1) - 1;
      if (left > 0) {
        connections.set(userId, left);
      } else {
        connections.delete(userId);
        announcePresence(userId, false);
      }
    });
  });

  /** Kick every socket of a user (e.g. after a password change invalidates their tokens). */
  function disconnectUser(userId) {
    io.in(room(userId)).disconnectSockets(true);
  }

  return { io, toUser, toUsers, isOnline, disconnectUser };
}
