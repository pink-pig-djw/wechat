import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Minus, Plus, X } from 'lucide-react';
import { displayName, useStore } from '../../lib/store.js';
import {
  clearHistory,
  createGroup,
  deleteConversation,
  dissolveGroup,
  fetchConversation,
  inviteMembers,
  leaveGroup,
  removeMember,
  searchMessages,
  setGroupAlias,
  transferOwner,
  updateConversationSettings,
  updateGroup,
} from '../../lib/actions.js';
import { formatMessageTime, messagePreview } from '../../lib/format.js';
import { useIsMobile } from '../../lib/hooks.js';
import { confirmDialog, promptDialog, toast, toastError } from '../../lib/ui.js';
import { Avatar } from '../../components/Avatar.jsx';
import { Modal } from '../../components/Modal.jsx';
import { UserPicker } from '../../components/Pickers.jsx';
import { Cell, CellGroup, Empty, PageHeader, SearchBar, Switch } from '../../components/ui.jsx';
import { UserCard } from '../contacts/UserProfile.jsx';
import { EmojiText } from '../../emoji/EmojiText.jsx';

const MEMBER_PREVIEW = 19;

export default function ChatInfo() {
  const { id } = useParams();
  const conversationId = Number(id);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const conversation = useStore((s) => s.conversations[conversationId]);
  const detail = useStore((s) => s.details[conversationId]);
  const me = useStore((s) => s.me);
  const friends = useStore((s) => s.friends);
  const users = useStore((s) => s.users);
  const [picker, setPicker] = useState(null);
  const [searching, setSearching] = useState(false);
  const [viewAnnouncement, setViewAnnouncement] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [cardUser, setCardUser] = useState(null);

  useEffect(() => {
    fetchConversation(conversationId).catch(() => {});
  }, [conversationId]);

  if (!conversation) return null;
  const isGroup = conversation.type === 'group';
  const isOwner = isGroup && conversation.myRole === 'owner';
  const active = isGroup && !conversation.dissolved;
  const backToChat = () => navigate(`/chats/${conversationId}`);
  const nameOf = (userId, fallback) => displayName({ me, friends, users }, userId, detail, fallback);
  const run = (promise, success) =>
    promise.then(() => success && toast(success)).catch(toastError);

  if (searching) {
    return <HistorySearch conversation={conversation} nameOf={nameOf} onBack={() => setSearching(false)} />;
  }

  const openMember = (userId) => (isMobile ? navigate(`/contacts/u/${userId}`) : setCardUser(userId));

  const members = isGroup
    ? detail?.members ?? conversation.memberPreview ?? []
    : [{ id: conversation.peerId, nickname: conversation.name, avatar: conversation.avatar }];
  const shownMembers = showAll ? members : members.slice(0, MEMBER_PREVIEW);

  async function rename() {
    const name = await promptDialog({ title: '修改群聊名称', value: conversation.customName ? conversation.name : '', placeholder: '群聊名称', maxLength: 30 });
    if (name !== null) run(updateGroup(conversationId, { name }));
  }

  async function editAnnouncement() {
    if (!isOwner) {
      setViewAnnouncement(true);
      return;
    }
    const announcement = await promptDialog({
      title: '群公告',
      message: '发布后将通过 @所有人 通知全部群成员',
      value: detail?.announcement ?? '',
      placeholder: '编辑群公告',
      maxLength: 1000,
      multiline: true,
      confirmText: '发布',
    });
    if (announcement !== null) run(updateGroup(conversationId, { announcement }), announcement ? '群公告已发布' : '群公告已清空');
  }

  async function editAlias() {
    const mine = detail?.members?.find((m) => m.id === me.id)?.alias ?? conversation.myAlias ?? '';
    const alias = await promptDialog({ title: '我在本群的昵称', message: '昵称修改后，只会在此群内显示，群内成员都可以看见。', value: mine, placeholder: me.nickname, maxLength: 20 });
    if (alias !== null) run(setGroupAlias(conversationId, alias));
  }

  async function clear() {
    const ok = await confirmDialog({ title: '清空聊天记录', message: `确定清空和“${conversation.name}”的聊天记录吗？`, confirmText: '清空', danger: true });
    if (ok) run(clearHistory(conversationId), '已清空');
  }

  async function leave() {
    const dissolved = conversation.dissolved;
    const ok = await confirmDialog({
      title: dissolved ? '删除并退出' : '退出群聊',
      message: dissolved ? '将删除该群聊及其聊天记录。' : isOwner ? '退出后，群主将自动转让给最早入群的成员。' : '退出后不会通知群聊中其他成员，且不会再接收此群聊消息。',
      confirmText: '退出',
      danger: true,
    });
    if (!ok) return;
    navigate('/chats', { replace: true });
    run(leaveGroup(conversationId));
  }

  async function dissolve() {
    const ok = await confirmDialog({ title: '解散群聊', message: '解散后，所有成员将无法在此群聊中发送消息。', confirmText: '解散', danger: true });
    if (ok) run(dissolveGroup(conversationId), '群聊已解散');
  }

  async function deleteChat() {
    const ok = await confirmDialog({ title: '删除聊天', message: '删除后，将同时清空该聊天的聊天记录。', confirmText: '删除', danger: true });
    if (!ok) return;
    navigate('/chats', { replace: true });
    run(deleteConversation(conversationId));
  }

  const memberIds = members.map((m) => m.id);

  return (
    <div className="chat-info">
      <PageHeader
        title={isGroup ? `聊天信息(${conversation.memberCount})` : '聊天详情'}
        back={`/chats/${conversationId}`}
        actions={
          !isMobile && (
            <button type="button" className="icon-btn" aria-label="关闭" onClick={backToChat}>
              <X size={18} />
            </button>
          )
        }
      />
      <div className="info-scroll">
        <div className="member-grid">
          {shownMembers.map((m) => (
            <button key={m.id} type="button" className="member-tile" onClick={() => openMember(m.id)}>
              <Avatar src={m.avatar} name={m.nickname} seed={m.id} size={48} />
              <span className="member-name">
                {isGroup ? nameOf(m.id, m.nickname) : conversation.name}
                {m.role === 'owner' && <i className="owner-tag">群主</i>}
              </span>
            </button>
          ))}
          {(active || (!isGroup && conversation.isFriend !== false)) && (
            <button type="button" className="member-tile" onClick={() => setPicker(isGroup ? 'invite' : 'create')}>
              <span className="tile-action" aria-hidden="true">
                <Plus size={22} />
              </span>
              <span className="member-name">{isGroup ? '邀请' : '发起群聊'}</span>
            </button>
          )}
          {active && isOwner && members.length > 1 && (
            <button type="button" className="member-tile" onClick={() => setPicker('remove')}>
              <span className="tile-action" aria-hidden="true">
                <Minus size={22} />
              </span>
              <span className="member-name">移出</span>
            </button>
          )}
        </div>
        {members.length > MEMBER_PREVIEW && (
          <button type="button" className="show-all" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '收起' : `查看全部群成员(${members.length})`}
          </button>
        )}

        {isGroup && (
          <CellGroup>
            <Cell label="群聊名称" value={conversation.customName ? conversation.name : '未命名'} onClick={active ? rename : undefined} />
            <Cell
              label="群号"
              value={conversation.groupNo}
              onClick={() => {
                navigator.clipboard?.writeText(conversation.groupNo).then(() => toast('群号已复制'), () => toast(`群号：${conversation.groupNo}`));
              }}
            />
            <Cell label="群公告" onClick={active ? editAnnouncement : undefined}>
              <span className="cell-note">{detail?.announcement ? <EmojiText text={detail.announcement} /> : isOwner ? '未设置' : '暂无公告'}</span>
            </Cell>
            {active && <Cell label="我在本群的昵称" value={conversation.myAlias || me.nickname} onClick={editAlias} />}
          </CellGroup>
        )}

        <CellGroup>
          <Cell label="查找聊天记录" onClick={() => setSearching(true)} />
        </CellGroup>

        <CellGroup>
          <Switch label="消息免打扰" checked={conversation.muted} onChange={(muted) => run(updateConversationSettings(conversationId, { muted }))} />
          <Switch label="置顶聊天" checked={conversation.pinned} onChange={(pinned) => run(updateConversationSettings(conversationId, { pinned }))} />
          {isOwner && active && (
            <Switch
              label="允许通过群号搜索加入"
              checked={!!detail?.allowSearch}
              onChange={(allowSearch) => run(updateGroup(conversationId, { allowSearch }))}
            />
          )}
        </CellGroup>

        {isOwner && active && (
          <CellGroup>
            <Cell label="转让群主" onClick={() => setPicker('transfer')} />
          </CellGroup>
        )}

        <CellGroup>
          <Cell label="清空聊天记录" danger center arrow={false} onClick={clear} />
        </CellGroup>

        <CellGroup>
          {isGroup ? (
            <>
              {isOwner && active && <Cell label="解散群聊" danger center arrow={false} onClick={dissolve} />}
              <Cell label={conversation.dissolved ? '删除并退出' : '退出群聊'} danger center arrow={false} onClick={leave} />
            </>
          ) : (
            <Cell label="删除聊天" danger center arrow={false} onClick={deleteChat} />
          )}
        </CellGroup>
      </div>

      {picker === 'invite' && (
        <UserPicker
          title="邀请好友入群"
          lockedIds={memberIds}
          confirmText="邀请"
          onClose={() => setPicker(null)}
          onConfirm={async (ids) => {
            await inviteMembers(conversationId, ids);
            setPicker(null);
          }}
        />
      )}
      {picker === 'create' && (
        <UserPicker
          title="发起群聊"
          lockedIds={[conversation.peerId]}
          onClose={() => setPicker(null)}
          onConfirm={async (ids) => {
            const gid = await createGroup([conversation.peerId, ...ids]);
            setPicker(null);
            navigate(`/chats/${gid}`);
          }}
        />
      )}
      {picker === 'remove' && (
        <UserPicker
          title="移出群成员"
          users={members.filter((m) => m.id !== me.id).map((m) => ({ ...m, remark: nameOf(m.id, m.nickname) }))}
          confirmText="移出"
          onClose={() => setPicker(null)}
          onConfirm={async (ids) => {
            const ok = await confirmDialog({ title: '移出群成员', message: `确定将选中的 ${ids.length} 位成员移出群聊？`, confirmText: '移出', danger: true });
            if (!ok) return;
            for (const uid of ids) await removeMember(conversationId, uid);
            setPicker(null);
          }}
        />
      )}
      {picker === 'transfer' && (
        <UserPicker
          title="选择新群主"
          single
          users={members.filter((m) => m.id !== me.id).map((m) => ({ ...m, remark: nameOf(m.id, m.nickname) }))}
          onClose={() => setPicker(null)}
          onConfirm={async ([uid]) => {
            const ok = await confirmDialog({ title: '转让群主', message: `确定将群主转让给“${nameOf(uid)}”？转让后你将成为普通成员。`, confirmText: '转让' });
            if (!ok) return;
            await transferOwner(conversationId, uid);
            setPicker(null);
            toast('已转让群主');
          }}
        />
      )}
      {viewAnnouncement && (
        <Modal title="群公告" onClose={() => setViewAnnouncement(false)} width={480}>
          {detail?.announcement ? (
            <div className="announcement-view">
              {detail.announcementAt && <p className="announcement-time">{formatMessageTime(detail.announcementAt)}</p>}
              <p className="announcement-body">
                <EmojiText text={detail.announcement} links />
              </p>
            </div>
          ) : (
            <p className="announcement-empty">暂无群公告</p>
          )}
        </Modal>
      )}
      {cardUser && <UserCard userId={cardUser} onClose={() => setCardUser(null)} />}
    </div>
  );
}

function HistorySearch({ conversation, nameOf, onBack }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults(null);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchMessages(conversation.id, needle)
        .then((list) => !cancelled && setResults(list))
        .catch(toastError);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, conversation.id]);

  const highlight = (text) => {
    const needle = q.trim();
    const i = text.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark>{text.slice(i, i + needle.length)}</mark>
        {text.slice(i + needle.length)}
      </>
    );
  };

  return (
    <div className="chat-info">
      <header className="page-header search-header">
        <button type="button" className="icon-btn" aria-label="返回" onClick={onBack}>
          <ChevronLeft size={24} />
        </button>
        <SearchBar value={q} onChange={setQ} placeholder="搜索聊天记录" autoFocus />
      </header>
      <div className="info-scroll">
        {results === null ? (
          <p className="search-tip">输入关键词，搜索文字消息和文件</p>
        ) : results.length === 0 ? (
          <Empty title="没有找到相关聊天记录" />
        ) : (
          results.map((m) => (
            <div key={m.id} className="history-item">
              <Avatar src={m.sender?.avatar} name={m.sender?.nickname} seed={m.senderId} size={36} />
              <div className="history-main">
                <div className="history-top">
                  <span>{nameOf(m.senderId, m.sender?.nickname)}</span>
                  <time>{formatMessageTime(m.createdAt)}</time>
                </div>
                <p className="history-text">{highlight(messagePreview(m))}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
