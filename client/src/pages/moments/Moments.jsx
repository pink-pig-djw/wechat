import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, ChevronLeft, Heart, ImagePlus, MessageSquare, X } from 'lucide-react';
import { api, uploadFile } from '../../lib/api.js';
import { fetchUser, markMomentsSeen, updateProfile } from '../../lib/actions.js';
import { setMomentStatus, useStore } from '../../lib/store.js';
import { formatRelative } from '../../lib/format.js';
import { useIsMobile } from '../../lib/hooks.js';
import { confirmDialog, openMenu, openViewer, toast, toastError } from '../../lib/ui.js';
import { Avatar } from '../../components/Avatar.jsx';
import { Modal } from '../../components/Modal.jsx';
import { Empty, Spinner } from '../../components/ui.jsx';
import { EmojiText } from '../../emoji/EmojiText.jsx';
import { EmojiButton } from '../../emoji/EmojiPanel.jsx';

function useNameOf() {
  const friends = useStore((s) => s.friends);
  const me = useStore((s) => s.me);
  return useCallback(
    (userId, nickname) => (userId === me.id ? me.nickname : friends[userId]?.remark || nickname),
    [friends, me],
  );
}

function MomentImages({ images }) {
  if (!images.length) return null;
  if (images.length === 1) {
    return (
      <button type="button" className="moment-single" onClick={() => openViewer(images, 0)} aria-label="查看图片">
        <img src={images[0]} alt="" loading="lazy" />
      </button>
    );
  }
  return (
    <div className={`moment-grid ${images.length === 4 ? 'grid-4' : ''}`}>
      {images.map((src, i) => (
        <button key={src} type="button" onClick={() => openViewer(images, i)} aria-label={`查看第 ${i + 1} 张图片`}>
          <img src={src} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function MomentItem({ moment, onChange, onDelete, onComment }) {
  const me = useStore((s) => s.me);
  const navigate = useNavigate();
  const nameOf = useNameOf();
  const [actionsOpen, setActionsOpen] = useState(false);
  const mine = moment.user.id === me.id;
  const openUser = (id) => navigate(`/contacts/u/${id}`);

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const close = (e) => {
      if (!e.target.closest('.moment-actions-wrap')) setActionsOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [actionsOpen]);

  const like = async () => {
    setActionsOpen(false);
    try {
      const res = await api.post(`/moments/${moment.id}/like`);
      onChange(res.moment);
    } catch (e) {
      toastError(e);
    }
  };

  const clickComment = (c, e) => {
    if (c.userId === me.id || mine) {
      openMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          c.userId !== me.id && { label: '回复', onClick: () => onComment(moment, { id: c.userId, name: nameOf(c.userId, c.nickname) }) },
          {
            label: '删除',
            danger: true,
            onClick: async () => {
              try {
                const res = await api.del(`/moments/comments/${c.id}`);
                onChange(res.moment);
              } catch (err) {
                toastError(err);
              }
            },
          },
        ],
      });
    } else {
      onComment(moment, { id: c.userId, name: nameOf(c.userId, c.nickname) });
    }
  };

  return (
    <article className="moment">
      <Avatar src={moment.user.avatar} name={moment.user.nickname} seed={moment.user.id} size={42} onClick={() => openUser(moment.user.id)} />
      <div className="moment-main">
        <button type="button" className="moment-author" onClick={() => openUser(moment.user.id)}>
          {nameOf(moment.user.id, moment.user.nickname)}
        </button>
        {moment.content && (
          <p className="moment-text">
            <EmojiText text={moment.content} />
          </p>
        )}
        <MomentImages images={moment.images} />
        <div className="moment-meta">
          <time>{formatRelative(moment.createdAt)}</time>
          {mine && (
            <button type="button" className="link-btn" onClick={() => onDelete(moment)}>
              删除
            </button>
          )}
          <span className="moment-actions-wrap">
            {actionsOpen && (
              <span className="moment-actions" role="group">
                <button type="button" onClick={like}>
                  <Heart size={16} fill={moment.liked ? 'currentColor' : 'none'} />
                  {moment.liked ? '取消' : '赞'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false);
                    onComment(moment, null);
                  }}
                >
                  <MessageSquare size={16} />
                  评论
                </button>
              </span>
            )}
            <button type="button" className="moment-more" aria-label="赞或评论" aria-expanded={actionsOpen} onClick={() => setActionsOpen((v) => !v)}>
              <span />
              <span />
            </button>
          </span>
        </div>
        {(moment.likes.length > 0 || moment.comments.length > 0) && (
          <div className="moment-feedback">
            {moment.likes.length > 0 && (
              <div className="moment-likes">
                <Heart size={13} aria-label="赞" />
                {moment.likes.map((l, i) => (
                  <span key={l.userId}>
                    {i > 0 && '，'}
                    <button type="button" className="name-link" onClick={() => openUser(l.userId)}>
                      {nameOf(l.userId, l.nickname)}
                    </button>
                  </span>
                ))}
              </div>
            )}
            {moment.comments.length > 0 && (
              <ul className="moment-comments">
                {moment.comments.map((c) => (
                  <li key={c.id} onClick={(e) => clickComment(c, e)}>
                    <b className="name-link">{nameOf(c.userId, c.nickname)}</b>
                    {c.replyToUserId && (
                      <>
                        回复<b className="name-link">{nameOf(c.replyToUserId, c.replyToNickname)}</b>
                      </>
                    )}
                    ：<EmojiText text={c.content} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function CommentBar({ target, onClose, onSubmitted }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [target]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.post(`/moments/${target.moment.id}/comments`, { content: text.trim(), replyToUserId: target.replyTo?.id });
      onSubmitted(res.moment);
      onClose();
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  };

  return (
    <form className="comment-bar" onSubmit={submit}>
      <input
        ref={inputRef}
        className="input"
        value={text}
        maxLength={500}
        placeholder={target.replyTo ? `回复${target.replyTo.name}：` : '评论'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      <EmojiButton onPick={(code) => setText((t) => t + code)} />
      <button className="btn btn-primary btn-sm" disabled={!text.trim() || busy}>
        发送
      </button>
      <button type="button" className="icon-btn" aria-label="取消评论" onClick={onClose}>
        <X size={18} />
      </button>
    </form>
  );
}

function PostMoment({ onClose, onPosted }) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]); // { key, preview, url?, progress, error? }
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const addFiles = (files) => {
    const room = 9 - images.length;
    const chosen = [...files].filter((f) => /^image\/(jpeg|png|gif|webp)$/.test(f.type)).slice(0, room);
    if (files.length > room) toast('最多只能选择 9 张图片');
    for (const file of chosen) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setImages((list) => [...list, { key, preview: URL.createObjectURL(file), progress: 0 }]);
      uploadFile(file, { kind: 'image', onProgress: (p) => setImages((list) => list.map((x) => (x.key === key ? { ...x, progress: p } : x))) })
        .then(({ url }) => setImages((list) => list.map((x) => (x.key === key ? { ...x, url } : x))))
        .catch((e) => {
          toastError(e);
          setImages((list) => list.filter((x) => x.key !== key));
        });
    }
  };

  const uploading = images.some((x) => !x.url);
  const canPost = (content.trim() || images.length) && !uploading && !busy;

  const post = async () => {
    setBusy(true);
    try {
      const { moment } = await api.post('/moments', { content: content.trim(), images: images.map((x) => x.url) });
      onPosted(moment);
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="发表动态"
      onClose={onClose}
      width={520}
      className="post-moment"
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!canPost} onClick={post}>
          {uploading ? '图片上传中…' : '发表'}
        </button>
      }
    >
      <textarea
        className="post-text"
        placeholder="这一刻的想法…"
        value={content}
        maxLength={2000}
        rows={4}
        autoFocus
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="post-tools">
        <EmojiButton onPick={(code) => setContent((t) => t + code)} />
      </div>
      <div className="post-images">
        {images.map((img) => (
          <div key={img.key} className="post-thumb">
            <img src={img.preview} alt="" />
            {!img.url && <span className="post-progress">{Math.round(img.progress * 100)}%</span>}
            <button type="button" className="post-remove" aria-label="移除图片" onClick={() => setImages((list) => list.filter((x) => x.key !== img.key))}>
              <X size={12} />
            </button>
          </div>
        ))}
        {images.length < 9 && (
          <button type="button" className="post-add" onClick={() => fileInput.current.click()} aria-label="添加图片">
            <ImagePlus size={28} strokeWidth={1.4} />
          </button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </Modal>
  );
}

function NotificationsModal({ onClose }) {
  const [list, setList] = useState(null);
  const nameOf = useNameOf();
  useEffect(() => {
    api
      .get('/moments/notifications')
      .then((res) => {
        setList(res.notifications);
        setMomentStatus({ unread: 0 });
        return api.post('/moments/notifications/read');
      })
      .catch(toastError);
  }, []);
  return (
    <Modal title="消息" onClose={onClose} width={460} className="notif-modal">
      {!list ? (
        <div className="page-center">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <Empty title="暂无消息" />
      ) : (
        list.map((n) => (
          <div key={n.id} className={`notif-row ${n.read ? '' : 'unread'}`}>
            <Avatar src={n.actor.avatar} name={n.actor.nickname} seed={n.actor.id} size={40} />
            <div className="notif-main">
              <b className="name-link">{nameOf(n.actor.id, n.actor.nickname)}</b>
              <p>
                {n.type === 'like' ? <Heart size={14} className="notif-heart" /> : n.type === 'reply' ? <>回复了你：<EmojiText text={n.content} /></> : <EmojiText text={n.content} />}
              </p>
              <time>{formatRelative(n.createdAt)}</time>
            </div>
            <div className="notif-thumb">
              {n.moment.image ? <img src={n.moment.image} alt="" /> : <span>{n.moment.content}</span>}
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}

export default function Moments() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const me = useStore((s) => s.me);
  const momentStatus = useStore((s) => s.momentStatus);
  const targetId = userId ? Number(userId) : me.id;
  const isAlbum = !!userId;
  const isOwn = targetId === me.id;

  const [owner, setOwner] = useState(isOwn ? me : null);
  const [moments, setMoments] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [composing, setComposing] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [commenting, setCommenting] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef(null);
  const coverInput = useRef(null);
  const loadingRef = useRef(false);
  const momentsRef = useRef(moments);
  momentsRef.current = moments;

  useEffect(() => {
    if (isOwn) setOwner(me);
    else fetchUser(targetId).then(setOwner).catch(() => {});
  }, [isOwn, me, targetId]);

  useEffect(() => {
    if (!isAlbum) markMomentsSeen();
  }, [isAlbum]);

  const loadMore = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '10' });
        if (isAlbum) params.set('userId', String(targetId));
        const last = reset ? null : momentsRef.current.at(-1);
        if (last) params.set('before', String(last.id));
        const res = await api.get(`/moments?${params}`);
        setMoments((current) => (reset ? res.moments : [...current, ...res.moments.filter((m) => !current.some((c) => c.id === m.id))]));
        setHasMore(res.hasMore);
        setError(null);
      } catch (e) {
        setError(e);
        setHasMore(false);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [isAlbum, targetId],
  );

  useEffect(() => {
    setMoments([]);
    setHasMore(true);
    loadMore(true);
  }, [loadMore]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, moments.length]);

  const replaceMoment = (m) => setMoments((list) => list.map((x) => (x.id === m.id ? m : x)));
  const deleteMoment = async (m) => {
    if (!(await confirmDialog({ title: '删除动态', message: '确定删除这条朋友圈吗？', confirmText: '删除', danger: true }))) return;
    try {
      await api.del(`/moments/${m.id}`);
      setMoments((list) => list.filter((x) => x.id !== m.id));
    } catch (e) {
      toastError(e);
    }
  };

  const changeCover = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { url } = await uploadFile(file, { kind: 'image' });
      await updateProfile({ momentsCover: url });
      toast('封面已更换');
    } catch (err) {
      toastError(err);
    }
  };

  const cover = owner?.momentsCover;

  return (
    <div className="moments-page">
      <header className={`moments-topbar ${scrolled ? 'solid' : ''}`}>
        {(isMobile || isAlbum) && (
          <button type="button" className="icon-btn" aria-label="返回" onClick={() => navigate(-1)}>
            <ChevronLeft size={26} />
          </button>
        )}
        <h1>{isAlbum ? (isOwn ? '我的朋友圈' : `${owner?.remark || owner?.nickname || ''}的朋友圈`) : '朋友圈'}</h1>
        {isOwn && (
          <button type="button" className="icon-btn" aria-label="发表动态" onClick={() => setComposing(true)}>
            <Camera size={22} />
          </button>
        )}
      </header>
      <div className="moments-scroll" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 200)}>
        <div className="moments-column">
          <div
            className={`moments-cover ${isOwn ? 'editable' : ''}`}
            style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
            onClick={() => isOwn && coverInput.current.click()}
            title={isOwn ? '点击更换封面' : undefined}
          >
            {!cover && isOwn && <span className="cover-hint">轻点更换封面</span>}
            {owner && (
              <div className="cover-owner">
                <span className="cover-name">{owner.remark || owner.nickname}</span>
                <Avatar src={owner.avatar} name={owner.nickname} seed={owner.id} size={68} radius={8} />
              </div>
            )}
          </div>
          {owner?.signature && <p className="cover-signature">{owner.signature}</p>}

          {!isAlbum && momentStatus.unread > 0 && (
            <button type="button" className="notif-pill" onClick={() => setNotifOpen(true)}>
              {momentStatus.unread} 条新消息
            </button>
          )}
          {!isAlbum && momentStatus.unread === 0 && (
            <button type="button" className="notif-link" onClick={() => setNotifOpen(true)}>
              查看消息
            </button>
          )}

          <div className="moments-feed">
            {moments.map((m) => (
              <MomentItem key={m.id} moment={m} onChange={replaceMoment} onDelete={deleteMoment} onComment={(moment, replyTo) => setCommenting({ moment, replyTo })} />
            ))}
          </div>
          <div ref={sentinel} className="feed-end">
            {loading ? (
              <Spinner />
            ) : error ? (
              error.message
            ) : moments.length === 0 ? (
              <Empty title={isOwn ? '发一条动态，记录此刻' : '还没有动态'}>
                {isOwn && (
                  <button type="button" className="btn btn-primary" onClick={() => setComposing(true)}>
                    发表动态
                  </button>
                )}
              </Empty>
            ) : (
              !hasMore && '— 没有更多了 —'
            )}
          </div>
        </div>
      </div>
      {commenting && <CommentBar target={commenting} onClose={() => setCommenting(null)} onSubmitted={replaceMoment} />}
      {composing && <PostMoment onClose={() => setComposing(false)} onPosted={(m) => setMoments((list) => [m, ...list])} />}
      {notifOpen && <NotificationsModal onClose={() => setNotifOpen(false)} />}
      <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={changeCover} />
    </div>
  );
}
