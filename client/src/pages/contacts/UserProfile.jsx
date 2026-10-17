import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, MoreHorizontal, Star, UserMinus, UserPlus, Share2, PenLine } from 'lucide-react';
import { useStore } from '../../lib/store.js';
import {
  acceptRequest,
  deleteFriend,
  fetchUser,
  openPrivateChat,
  sendCard,
  sendFriendRequest,
  updateFriend,
} from '../../lib/actions.js';
import { genderLabel } from '../../lib/format.js';
import { useIsMobile } from '../../lib/hooks.js';
import { confirmDialog, openMenu, promptDialog, toast, toastError } from '../../lib/ui.js';
import { Avatar } from '../../components/Avatar.jsx';
import { Modal } from '../../components/Modal.jsx';
import { ForwardPicker } from '../../components/Pickers.jsx';
import { Cell, CellGroup, Empty, PageHeader, Spinner } from '../../components/ui.jsx';

/** Fetch a profile and overlay live friend data (remark, star, avatar…) from the store. */
function useProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const friend = useStore((s) => s.friends[userId]);
  const cached = useStore((s) => s.users[userId]);
  const isFriend = !!friend;

  const reload = useCallback(() => {
    setError(null);
    return fetchUser(userId)
      .then(setProfile)
      .catch(setError);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload, isFriend]);

  if (!profile) return { profile: null, error, reload };
  const merged = { ...profile, ...cached };
  if (friend) {
    Object.assign(merged, { relation: 'friend', remark: friend.remark, starred: friend.starred, online: friend.online });
  } else if (profile.relation === 'friend') {
    merged.relation = 'stranger';
  }
  return { profile: merged, error, reload };
}

function GenderMark({ gender }) {
  if (!gender) return null;
  return (
    <span className={`gender-mark ${gender === 1 ? 'male' : 'female'}`} aria-label={genderLabel(gender)}>
      {gender === 1 ? '♂' : '♀'}
    </span>
  );
}

export function AddFriendModal({ user, onClose, onSent }) {
  const me = useStore((s) => s.me);
  const [message, setMessage] = useState(`我是${me.nickname}`);
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await sendFriendRequest(user.id, { message: message.trim(), remark: remark.trim() });
      toast(res.status === 'accepted' ? '你们已经成为好友' : '已发送');
      onSent?.(res);
      onClose();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="申请添加朋友" onClose={onClose} width={420}>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>发送添加朋友申请</span>
          <textarea className="input" rows={3} maxLength={50} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="field">
          <span>设置备注</span>
          <input className="input" maxLength={20} value={remark} placeholder={user.nickname} onChange={(e) => setRemark(e.target.value)} />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>
          发送
        </button>
      </form>
    </Modal>
  );
}

/** Actions shared by the full profile page and the desktop popup card. */
function useProfileActions(profile, reload, afterOpenChat) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [recommending, setRecommending] = useState(false);

  const message = async () => {
    try {
      const id = await openPrivateChat(profile.id);
      afterOpenChat?.();
      navigate(`/chats/${id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const accept = async () => {
    try {
      await acceptRequest(profile.incomingRequestId);
      toast('已添加到通讯录');
      reload();
    } catch (e) {
      toastError(e);
    }
  };

  const editRemark = async () => {
    const remark = await promptDialog({ title: '设置备注', value: profile.remark, placeholder: profile.nickname, maxLength: 20 });
    if (remark !== null) updateFriend(profile.id, { remark }).catch(toastError);
  };

  const toggleStar = () => updateFriend(profile.id, { starred: !profile.starred }).catch(toastError);

  const remove = async () => {
    const name = profile.remark || profile.nickname;
    const ok = await confirmDialog({
      title: '删除联系人',
      message: `将联系人“${name}”删除，同时删除与该联系人的聊天记录`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteFriend(profile.id);
      toast('已删除');
      navigate('/contacts', { replace: true });
    } catch (e) {
      toastError(e);
    }
  };

  const extras = (
    <>
      {adding && <AddFriendModal user={profile} onClose={() => setAdding(false)} onSent={reload} />}
      {recommending && (
        <ForwardPicker
          onClose={() => setRecommending(false)}
          onConfirm={async ({ conversationIds, userIds }) => {
            const targets = [...conversationIds];
            for (const uid of userIds) targets.push(await openPrivateChat(uid));
            await Promise.all([...new Set(targets)].map((cid) => sendCard(cid, profile)));
            setRecommending(false);
            toast('已发送');
          }}
        />
      )}
    </>
  );

  return { message, accept, editRemark, toggleStar, remove, add: () => setAdding(true), recommend: () => setRecommending(true), extras };
}

function PrimaryActions({ profile, actions }) {
  const navigate = useNavigate();
  if (profile.relation === 'self') {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/me/profile')}>
        <PenLine size={18} /> 编辑个人资料
      </button>
    );
  }
  if (profile.relation === 'friend') {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={actions.message}>
        <MessageCircle size={18} /> 发消息
      </button>
    );
  }
  if (profile.incomingRequestId) {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={actions.accept}>
        通过验证
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-primary btn-block" onClick={actions.add}>
      <UserPlus size={18} /> {profile.outgoingPending ? '再次发送申请' : '添加到通讯录'}
    </button>
  );
}

function ProfileHead({ profile, size = 64 }) {
  const title = profile.remark || profile.nickname;
  return (
    <div className="profile-head">
      <Avatar src={profile.avatar} name={profile.nickname} seed={profile.id} size={size} radius={8} />
      <div className="profile-names">
        <h2>
          {title}
          <GenderMark gender={profile.gender} />
          {profile.starred && <Star className="star-mark" size={14} fill="currentColor" aria-label="星标朋友" />}
        </h2>
        {profile.remark && <p>昵称：{profile.nickname}</p>}
        <p>微聊号：{profile.username}</p>
        {profile.region && <p>地区：{profile.region}</p>}
      </div>
    </div>
  );
}

export default function UserProfile() {
  const { userId } = useParams();
  const id = Number(userId);
  const navigate = useNavigate();
  const { profile, error, reload } = useProfile(id);
  const actions = useProfileActions(profile, reload);

  if (error) {
    return (
      <div className="page">
        <PageHeader title="详细资料" back />
        <Empty title={error.message} />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="page page-center">
        <Spinner size={26} />
      </div>
    );
  }

  const isFriend = profile.relation === 'friend';
  const more = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu({
      x: r.right - 160,
      y: r.bottom + 4,
      items: [
        { label: '设置备注', icon: PenLine, onClick: actions.editRemark },
        { label: profile.starred ? '取消星标朋友' : '设为星标朋友', icon: Star, onClick: actions.toggleStar },
        { label: '推荐给朋友', icon: Share2, onClick: actions.recommend },
        { label: '删除联系人', icon: UserMinus, danger: true, onClick: actions.remove },
      ],
    });
  };

  return (
    <div className="page profile-page">
      <PageHeader
        title=""
        back
        actions={
          isFriend && (
            <button type="button" className="icon-btn" aria-label="更多" onClick={more}>
              <MoreHorizontal size={22} />
            </button>
          )
        }
      />
      <div className="page-scroll">
        <div className="profile-card-wrap">
          <ProfileHead profile={profile} />
        </div>

        {profile.relation === 'stranger' && profile.incomingRequestId && profile.incomingMessage && (
          <CellGroup>
            <div className="request-note">
              <span className="request-note-label">验证消息</span>
              <p>{profile.incomingMessage}</p>
            </div>
          </CellGroup>
        )}

        {isFriend && (
          <CellGroup>
            <Cell label="备注" value={profile.remark || '未设置'} onClick={actions.editRemark} />
          </CellGroup>
        )}

        {(profile.signature || profile.relation !== 'stranger') && (
          <CellGroup>
            {profile.relation !== 'stranger' && (
              <Cell label="朋友圈" onClick={() => navigate(`/moments/u/${profile.id}`)}>
                <span className="moment-thumbs">
                  {profile.momentsPreview?.length ? (
                    profile.momentsPreview.map((src) => <img key={src} src={src} alt="" loading="lazy" />)
                  ) : (
                    <span className="cell-value">查看动态</span>
                  )}
                </span>
              </Cell>
            )}
            {profile.signature && <Cell label="个性签名" value={profile.signature} />}
            {isFriend && profile.commonGroups > 0 && <Cell label="共同群聊" value={`${profile.commonGroups}个`} />}
          </CellGroup>
        )}

        <div className="profile-actions">
          <PrimaryActions profile={profile} actions={actions} />
        </div>
      </div>
      {actions.extras}
    </div>
  );
}

/** Compact profile popup used on desktop when clicking an avatar. */
export function UserCard({ userId, onClose }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { profile, error, reload } = useProfile(userId);
  const actions = useProfileActions(profile, reload, onClose);

  useEffect(() => {
    if (isMobile) {
      onClose();
      navigate(`/contacts/u/${userId}`);
    }
  }, [isMobile, navigate, onClose, userId]);

  return (
    <Modal onClose={onClose} className="user-card" width={340}>
      {error && <Empty title={error.message} />}
      {!profile && !error && (
        <div className="page-center card-loading">
          <Spinner />
        </div>
      )}
      {profile && (
        <>
          <ProfileHead profile={profile} size={60} />
          {profile.signature && <p className="card-signature">{profile.signature}</p>}
          <div className="card-actions">
            <PrimaryActions profile={profile} actions={actions} />
            <button
              type="button"
              className="btn btn-plain btn-block"
              onClick={() => {
                onClose();
                navigate(`/contacts/u/${profile.id}`);
              }}
            >
              查看详细资料
            </button>
          </div>
          {actions.extras}
        </>
      )}
    </Modal>
  );
}
