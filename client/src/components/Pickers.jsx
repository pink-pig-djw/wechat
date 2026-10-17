import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Avatar, ConversationAvatar } from './Avatar.jsx';
import { SearchBar } from './ui.jsx';
import { sortConversations, useStore } from '../lib/store.js';
import { toastError } from '../lib/ui.js';

function matches(q, ...fields) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => f && String(f).toLowerCase().includes(needle));
}

function groupByInitial(list) {
  const groups = new Map();
  for (const u of list) {
    const key = u.initial ?? '#';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === '#') - (b === '#') || a.localeCompare(b));
}

function useBusy(fn) {
  const [busy, setBusy] = useState(false);
  const run = async (...args) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn(...args);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

/**
 * Choose people from a list (defaults to your friends).
 * `lockedIds` are shown ticked and can't be changed (e.g. existing group members).
 * With `single`, choosing someone confirms immediately.
 */
export function UserPicker({ title, users, lockedIds = [], single = false, confirmText = '完成', onConfirm, onClose }) {
  const friends = useStore((s) => s.friends);
  const list = useMemo(() => users ?? Object.values(friends).sort((a, b) => a.pinyin.localeCompare(b.pinyin)), [users, friends]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const [busy, confirm] = useBusy(async (ids) => onConfirm(ids));

  const filtered = list.filter((u) => matches(q, u.remark, u.alias, u.nickname, u.username, u.pinyin));
  const sections = q ? [['搜索结果', filtered]] : groupByInitial(filtered);
  const selectedUsers = selected.map((id) => list.find((u) => u.id === id)).filter(Boolean);

  const toggle = (id) => {
    if (locked.has(id) || busy) return;
    if (single) return confirm([id]);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      className="picker"
      width={460}
      footer={
        !single && (
          <button type="button" className="btn btn-primary btn-block" disabled={!selected.length || busy} onClick={() => confirm(selected)}>
            {confirmText}
            {selected.length > 0 && `(${selected.length})`}
          </button>
        )
      }
    >
      {!single && selectedUsers.length > 0 && (
        <div className="picker-selected">
          {selectedUsers.map((u) => (
            <Avatar key={u.id} src={u.avatar} name={u.nickname} seed={u.id} size={34} onClick={() => toggle(u.id)} title="点击移除" />
          ))}
        </div>
      )}
      <SearchBar value={q} onChange={setQ} placeholder="搜索" className="picker-search" />
      <div className="picker-list">
        {filtered.length === 0 && <p className="picker-empty">{list.length ? '没有找到相关联系人' : '暂无可选择的联系人'}</p>}
        {sections.map(([letter, items]) => (
          <div key={letter} className="picker-section">
            <div className="picker-letter">{letter}</div>
            {items.map((u) => {
              const isLocked = locked.has(u.id);
              const checked = isLocked || selected.includes(u.id);
              return (
                <button key={u.id} type="button" className={`picker-row ${isLocked ? 'locked' : ''}`} onClick={() => toggle(u.id)} aria-pressed={checked}>
                  {!single && (
                    <span className={`check ${checked ? 'checked' : ''}`} aria-hidden="true">
                      {checked && <Check size={13} strokeWidth={3} />}
                    </span>
                  )}
                  <Avatar src={u.avatar} name={u.nickname} seed={u.id} size={36} />
                  <span className="picker-name">{u.remark || u.alias || u.nickname}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Pick recent chats and/or friends to forward a message to (max 9). */
export function ForwardPicker({ onConfirm, onClose }) {
  const conversations = useStore((s) => s.conversations);
  const friends = useStore((s) => s.friends);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, confirm] = useBusy(async () => {
    await onConfirm({
      conversationIds: selected.filter((k) => k.startsWith('c')).map((k) => Number(k.slice(1))),
      userIds: selected.filter((k) => k.startsWith('u')).map((k) => Number(k.slice(1))),
    });
  });

  const chats = sortConversations(conversations).filter(
    (c) => (c.type === 'group' ? !c.dissolved : c.isFriend !== false) && matches(q, c.name),
  );
  const contacts = Object.values(friends)
    .filter((f) => matches(q, f.remark, f.nickname, f.username, f.pinyin))
    .sort((a, b) => a.pinyin.localeCompare(b.pinyin));

  const toggle = (key) =>
    setSelected((s) => (s.includes(key) ? s.filter((x) => x !== key) : s.length >= 9 ? s : [...s, key]));

  const row = (key, avatar, name) => {
    const checked = selected.includes(key);
    return (
      <button key={key} type="button" className="picker-row" onClick={() => toggle(key)} aria-pressed={checked}>
        <span className={`check ${checked ? 'checked' : ''}`} aria-hidden="true">
          {checked && <Check size={13} strokeWidth={3} />}
        </span>
        {avatar}
        <span className="picker-name">{name}</span>
      </button>
    );
  };

  return (
    <Modal
      title="转发给"
      onClose={onClose}
      className="picker"
      width={460}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!selected.length || busy} onClick={confirm}>
          发送{selected.length > 0 && `(${selected.length})`}
        </button>
      }
    >
      <SearchBar value={q} onChange={setQ} className="picker-search" />
      <div className="picker-list">
        {chats.length > 0 && (
          <div className="picker-section">
            <div className="picker-letter">最近聊天</div>
            {chats.map((c) => row(`c${c.id}`, <ConversationAvatar conversation={c} size={36} />, c.name))}
          </div>
        )}
        {contacts.length > 0 && (
          <div className="picker-section">
            <div className="picker-letter">联系人</div>
            {contacts.map((f) => row(`u${f.id}`, <Avatar src={f.avatar} name={f.nickname} seed={f.id} size={36} />, f.remark || f.nickname))}
          </div>
        )}
        {!chats.length && !contacts.length && <p className="picker-empty">没有找到相关聊天</p>}
      </div>
    </Modal>
  );
}
