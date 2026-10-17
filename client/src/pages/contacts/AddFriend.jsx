import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Search } from 'lucide-react';
import { useStore } from '../../lib/store.js';
import { joinGroup, searchUsers } from '../../lib/actions.js';
import { toast, toastError } from '../../lib/ui.js';
import { Avatar, GroupAvatar } from '../../components/Avatar.jsx';
import { Empty, PageHeader, SearchBar, Spinner } from '../../components/ui.jsx';

export default function AddFriend() {
  const me = useStore((s) => s.me);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      searchUsers(needle)
        .then((r) => !cancelled && setResults(r))
        .catch(toastError)
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const join = async (group) => {
    try {
      if (!group.joined) await joinGroup(group.id);
      navigate(`/chats/${group.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const copyMine = () =>
    navigator.clipboard?.writeText(me.username).then(
      () => toast('泡泡号已复制'),
      () => toast(`我的泡泡号：${me.username}`),
    );

  return (
    <div className="page">
      <PageHeader title="添加朋友" back="/contacts" />
      <div className="page-scroll">
        <div className="add-search">
          <SearchBar value={q} onChange={setQ} placeholder="泡泡号 / 昵称 / 群号" autoFocus />
        </div>
        {!q.trim() && (
          <>
            <button type="button" className="my-id" onClick={copyMine}>
              我的泡泡号：<b>{me.username}</b>
              <Copy size={14} />
            </button>
            <Empty icon={<Search size={44} strokeWidth={1.2} />} title="搜索朋友或群聊">
              <p>输入对方的泡泡号或昵称查找朋友，输入群号可以加入公开群聊</p>
            </Empty>
          </>
        )}
        {q.trim() && loading && !results && (
          <div className="page-center">
            <Spinner />
          </div>
        )}
        {results && (
          <>
            {results.users.length === 0 && results.groups.length === 0 && <Empty title="该用户不存在" />}
            {results.users.length > 0 && (
              <section className="card-list">
                <h3 className="section-title">用户</h3>
                {results.users.map((u) => (
                  <button key={u.id} type="button" className="request-row" onClick={() => navigate(`/contacts/u/${u.id}`)}>
                    <Avatar src={u.avatar} name={u.nickname} seed={u.id} size={44} />
                    <span className="row-text">
                      <span className="row-title">{u.remark || u.nickname}</span>
                      <span className="row-sub">泡泡号：{u.username}</span>
                    </span>
                    <span className="request-status">{u.relation === 'self' ? '我' : u.relation === 'friend' ? '已添加' : ''}</span>
                  </button>
                ))}
              </section>
            )}
            {results.groups.length > 0 && (
              <section className="card-list">
                <h3 className="section-title">群聊</h3>
                {results.groups.map((g) => (
                  <div key={g.id} className="request-row">
                    <GroupAvatar members={g.memberPreview} src={g.avatar} size={44} />
                    <span className="row-text">
                      <span className="row-title">{g.name}</span>
                      <span className="row-sub">
                        群号：{g.groupNo} · {g.memberCount} 人
                      </span>
                    </span>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => join(g)}>
                      {g.joined ? '进入' : '加入'}
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
