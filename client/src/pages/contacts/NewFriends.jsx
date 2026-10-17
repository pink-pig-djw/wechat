import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useStore } from '../../lib/store.js';
import { acceptRequest, loadRequests, openPrivateChat, rejectRequest } from '../../lib/actions.js';
import { useContextAction } from '../../lib/hooks.js';
import { openMenu, toast, toastError } from '../../lib/ui.js';
import { Avatar } from '../../components/Avatar.jsx';
import { Empty, PageHeader } from '../../components/ui.jsx';

const STATUS_TEXT = {
  in: { accepted: '已添加', rejected: '已拒绝' },
  out: { pending: '等待验证', accepted: '已添加', rejected: '等待验证' },
};

function RequestRow({ request }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const actionable = request.direction === 'in' && request.status === 'pending';

  const accept = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      await acceptRequest(request.id);
      toast('已添加，现在可以开始聊天了');
      const id = await openPrivateChat(request.user.id);
      navigate(`/chats/${id}`);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  };

  const context = useContextAction(({ x, y }) => {
    if (!actionable) return;
    openMenu({ x, y, items: [{ label: '拒绝', danger: true, onClick: () => rejectRequest(request.id).catch(toastError) }] });
  });

  return (
    <Link to={`/contacts/u/${request.user.id}`} className="request-row" {...context}>
      <Avatar src={request.user.avatar} name={request.user.nickname} seed={request.user.id} size={44} />
      <span className="row-text">
        <span className="row-title">{request.user.nickname}</span>
        <span className="row-sub">{request.message || (request.direction === 'out' ? '你发出的好友申请' : '请求添加你为朋友')}</span>
      </span>
      {actionable ? (
        <span className="request-actions">
          <button
            type="button"
            className="btn btn-plain btn-sm"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              rejectRequest(request.id).catch(toastError);
            }}
          >
            拒绝
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={accept}>
            接受
          </button>
        </span>
      ) : (
        <span className="request-status">{STATUS_TEXT[request.direction][request.status]}</span>
      )}
    </Link>
  );
}

export default function NewFriends() {
  const requests = useStore((s) => s.requests);

  useEffect(() => {
    loadRequests().catch(toastError);
  }, []);

  return (
    <div className="page">
      <PageHeader
        title="新的朋友"
        back="/contacts"
        actions={
          <Link to="/contacts/add" className="header-link">
            添加朋友
          </Link>
        }
      />
      <div className="page-scroll">
        <Link to="/contacts/add" className="add-entry">
          <UserPlus size={20} /> 搜索泡泡号 / 昵称 添加朋友
        </Link>
        {requests.length === 0 ? (
          <Empty title="暂时没有新的朋友">
            <p>好友申请会出现在这里</p>
          </Empty>
        ) : (
          <div className="card-list">
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
