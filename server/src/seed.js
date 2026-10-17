/**
 * Fill an empty database with demo accounts, chats, a group and some moments.
 *   npm run seed            (all demo accounts use the password 123456)
 */
import bcrypt from 'bcryptjs';
import { resolveConfig } from './config.js';
import { openDatabase } from './db.js';
import { generateGroupNo } from './messaging.js';

const PASSWORD = '123456';

const USERS = [
  { username: 'xiaoming', nickname: '小明', gender: 1, region: '北京 海淀', signature: '今天也要元气满满 ☀️' },
  { username: 'xiaohong', nickname: '小红', gender: 2, region: '上海 徐汇', signature: '奶茶续命中' },
  { username: 'lilei', nickname: '李雷', gender: 1, region: '广东 深圳', signature: 'Code is poetry.' },
  { username: 'hanmeimei', nickname: '韩梅梅', gender: 2, region: '浙江 杭州', signature: '山川湖海，日落黄昏' },
  { username: 'zhangwei', nickname: '张伟', gender: 1, region: '四川 成都', signature: '吃火锅不' },
  { username: 'wangfang', nickname: '王芳', gender: 2, region: '江苏 南京', signature: '' },
];

const FRIENDS = [
  ['xiaoming', 'xiaohong'],
  ['xiaoming', 'lilei'],
  ['xiaoming', 'hanmeimei'],
  ['xiaoming', 'zhangwei'],
  ['xiaohong', 'hanmeimei'],
  ['lilei', 'hanmeimei'],
  ['lilei', 'zhangwei'],
];

const MIN = 60_000;

export function seed(db) {
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get('xiaoming')) return false;
  const now = Date.now();
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const id = {};

  db.transaction(() => {
    for (const u of USERS) {
      id[u.username] = Number(
        db
          .prepare(
            'INSERT INTO users (username, password_hash, nickname, gender, region, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(u.username, hash, u.nickname, u.gender, u.region, u.signature, now - 30 * 24 * 60 * MIN).lastInsertRowid,
      );
    }

    const addFriend = db.prepare('INSERT INTO friendships (user_id, friend_id, remark, created_at) VALUES (?, ?, ?, ?)');
    for (const [a, b] of FRIENDS) {
      addFriend.run(id[a], id[b], '', now - 20 * 24 * 60 * MIN);
      addFriend.run(id[b], id[a], '', now - 20 * 24 * 60 * MIN);
    }
    db.prepare("UPDATE friendships SET remark = '红红' WHERE user_id = ? AND friend_id = ?").run(id.xiaoming, id.xiaohong);
    db.prepare('UPDATE friendships SET starred = 1 WHERE user_id = ? AND friend_id = ?').run(id.xiaoming, id.hanmeimei);

    db.prepare(
      "INSERT INTO friend_requests (from_user_id, to_user_id, message, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
    ).run(id.wangfang, id.xiaoming, '我是王芳，上次读书会认识的～', now - 40 * MIN, now - 40 * MIN);

    const insertMessage = db.prepare(
      `INSERT INTO messages (conversation_id, sender_id, type, content, mentions, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const post = (conversationId, sender, type, content, minutesAgo, mentions = null) =>
      Number(
        insertMessage.run(
          conversationId,
          sender ? id[sender] : null,
          type,
          typeof content === 'string' ? content : JSON.stringify(content),
          mentions ? JSON.stringify(mentions) : null,
          now - minutesAgo * MIN,
        ).lastInsertRowid,
      );
    const finish = (conversationId, readers) => {
      const last = db.prepare('SELECT id, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1').get(conversationId);
      db.prepare('UPDATE conversations SET last_message_id = ?, updated_at = ? WHERE id = ?').run(last.id, last.created_at, conversationId);
      // Everyone except `readers` has read everything; readers keep some unread messages.
      db.prepare('UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ?').run(last.id, conversationId);
      for (const [user, unreadCount] of Object.entries(readers)) {
        const ids = db.prepare('SELECT id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?').pluck().all(conversationId, unreadCount + 1);
        db.prepare('UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?').run(ids.at(-1), conversationId, id[user]);
      }
    };

    const privateChat = (a, b) => {
      const [x, y] = [id[a], id[b]].sort((m, n) => m - n);
      const cid = Number(
        db
          .prepare("INSERT INTO conversations (type, private_key, created_at, updated_at) VALUES ('private', ?, ?, ?)")
          .run(`${x}:${y}`, now - 20 * 24 * 60 * MIN, now).lastInsertRowid,
      );
      const add = db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
      add.run(cid, id[a], now);
      add.run(cid, id[b], now);
      return cid;
    };

    // 小明 ⇄ 小红
    const c1 = privateChat('xiaoming', 'xiaohong');
    post(c1, null, 'system', { event: 'friend_added', actor: null, targets: [] }, 3 * 24 * 60);
    post(c1, 'xiaohong', 'text', '周末有空吗？新开了一家奶茶店[奶茶]', 95);
    post(c1, 'xiaoming', 'text', '有空呀！几点？', 92);
    post(c1, 'xiaohong', 'text', '下午两点，地铁站见[开心]', 90);
    post(c1, 'xiaoming', 'sticker', { id: 'roger' }, 89);
    post(c1, 'xiaohong', 'text', '对了，你上次说的那本书叫什么来着[思考]', 12);
    post(c1, 'xiaohong', 'sticker', { id: 'anyone' }, 11);
    finish(c1, { xiaoming: 2 });

    // 小明 ⇄ 李雷
    const c2 = privateChat('xiaoming', 'lilei');
    post(c2, 'lilei', 'text', '代码我推上去了，帮忙 review 一下', 300);
    post(c2, 'xiaoming', 'text', '好的，晚上看[好的]', 290);
    post(c2, 'lilei', 'text', '谢啦！请你吃饭[爱心]', 288);
    post(c2, 'xiaoming', 'sticker', { id: 'thanks' }, 287);
    finish(c2, {});

    // 小明 ⇄ 张伟
    const c3 = privateChat('xiaoming', 'zhangwei');
    post(c3, 'zhangwei', 'text', '兄弟，今晚火锅走起？[馋]', 60 * 26);
    post(c3, 'xiaoming', 'text', '冲！[奋斗]', 60 * 26 - 3);
    finish(c3, {});

    // Group
    const members = ['xiaoming', 'xiaohong', 'lilei', 'hanmeimei', 'zhangwei'];
    const g = Number(
      db
        .prepare(
          `INSERT INTO conversations (type, group_no, name, owner_id, announcement, announcement_at, created_at, updated_at)
           VALUES ('group', ?, '周末爬山小分队', ?, ?, ?, ?, ?)`,
        )
        .run(generateGroupNo(db), id.xiaoming, '本周六早上 8:00 香山东门集合，记得带水和零食！', now - 50 * MIN, now - 2 * 24 * 60 * MIN, now)
        .lastInsertRowid,
    );
    const addMember = db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
    members.forEach((m, i) => addMember.run(g, id[m], i === 0 ? 'owner' : 'member', now - 2 * 24 * 60 * MIN));
    db.prepare("UPDATE conversation_members SET alias = '梅子' WHERE conversation_id = ? AND user_id = ?").run(g, id.hanmeimei);
    post(
      g,
      null,
      'system',
      {
        event: 'group_create',
        actor: { id: id.xiaoming, name: '小明' },
        targets: members.slice(1).map((m) => ({ id: id[m], name: USERS.find((u) => u.username === m).nickname })),
      },
      2 * 24 * 60,
    );
    post(g, 'xiaoming', 'text', '@所有人\n本周六早上 8:00 香山东门集合，记得带水和零食！', 50, ['all']);
    post(g, 'hanmeimei', 'text', '收到！我带相机📷', 48);
    post(g, 'zhangwei', 'sticker', { id: 'go' }, 47);
    post(g, 'lilei', 'text', '天气预报说周六晴[太阳]', 30);
    post(g, 'xiaohong', 'text', '@小明 要不要叫上王芳？', 8, [id.xiaoming]);
    post(g, 'hanmeimei', 'text', '好耶，人多热闹[星星眼]', 6);
    finish(g, { xiaoming: 2 });

    // Moments
    const moment = db.prepare('INSERT INTO moments (user_id, content, images, created_at) VALUES (?, ?, ?, ?)');
    const like = db.prepare('INSERT INTO moment_likes (moment_id, user_id, created_at) VALUES (?, ?, ?)');
    const comment = db.prepare(
      'INSERT INTO moment_comments (moment_id, user_id, reply_to_user_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    // Oldest first, so ids follow time like real posts.
    moment.run(id.xiaoming, '新的一周，冲鸭！[奋斗]', '[]', now - 3 * 24 * 60 * MIN);
    const m2 = Number(moment.run(id.lilei, '终于把项目上线了，庆祝一下[666]', '[]', now - 26 * 60 * MIN).lastInsertRowid);
    like.run(m2, id.zhangwei, now - 25 * 60 * MIN);
    comment.run(m2, id.xiaoming, null, '恭喜恭喜[奋斗]', now - 24 * 60 * MIN);
    const m1 = Number(moment.run(id.hanmeimei, '西湖边的日落，美得不像话[喜欢]', '[]', now - 3 * 60 * MIN).lastInsertRowid);
    like.run(m1, id.xiaoming, now - 2 * 60 * MIN);
    like.run(m1, id.lilei, now - 2 * 60 * MIN);
    comment.run(m1, id.xiaohong, null, '太好看了吧！', now - 100 * MIN);
    comment.run(m1, id.hanmeimei, id.xiaohong, '下次一起来[开心]', now - 90 * MIN);
  })();
  return true;
}

if (process.argv[1]?.endsWith('seed.js')) {
  const config = resolveConfig();
  const db = openDatabase(config.dbFile);
  const created = seed(db);
  db.close();
  console.log(
    created
      ? `✅ 演示数据已创建。可登录账号：${USERS.map((u) => u.username).join(' / ')}，密码均为 ${PASSWORD}`
      : 'ℹ️  演示数据已存在，跳过。',
  );
}
