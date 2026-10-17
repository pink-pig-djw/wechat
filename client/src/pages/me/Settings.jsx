import { useState, useSyncExternalStore } from 'react';
import { Check } from 'lucide-react';
import { changePassword, logout } from '../../lib/actions.js';
import { getColorScheme, setColorScheme, setPref, usePrefs } from '../../lib/prefs.js';
import { canNotify, requestNotificationPermission } from '../../lib/notify.js';
import { useMediaQuery } from '../../lib/hooks.js';
import { confirmDialog, toast } from '../../lib/ui.js';
import { Modal } from '../../components/Modal.jsx';
import { Cell, CellGroup, PageHeader, Switch } from '../../components/ui.jsx';

function subscribeScheme(callback) {
  window.addEventListener('storage', callback);
  window.addEventListener('color-scheme-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('color-scheme-change', callback);
  };
}

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ old: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (form.next !== form.confirm) return setError('两次输入的新密码不一致');
    setBusy(true);
    setError('');
    try {
      await changePassword(form.old, form.next);
      toast('密码已修改');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="修改密码" onClose={onClose} width={400}>
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>原密码</span>
          <input className="input" type="password" autoComplete="current-password" value={form.old} onChange={update('old')} required />
        </label>
        <label className="field">
          <span>新密码</span>
          <input className="input" type="password" autoComplete="new-password" placeholder="至少 6 位" value={form.next} onChange={update('next')} required />
        </label>
        <label className="field">
          <span>确认新密码</span>
          <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={update('confirm')} required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          确认修改
        </button>
      </form>
    </Modal>
  );
}

export default function Settings() {
  const prefs = usePrefs();
  const scheme = useSyncExternalStore(subscribeScheme, getColorScheme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [changing, setChanging] = useState(false);

  const pickScheme = (value) => {
    setColorScheme(value);
    window.dispatchEvent(new Event('color-scheme-change'));
  };

  const schemeOption = (value, label) => (
    <Cell key={value} label={label} onClick={() => pickScheme(value)} arrow={false}>
      {scheme === value && <Check size={18} className="check-mark" />}
    </Cell>
  );

  const toggleDesktop = async (on) => {
    if (!on) return setPref('desktop', false);
    const permission = await requestNotificationPermission();
    if (permission === 'granted') setPref('desktop', true);
    else toast(permission === 'unsupported' ? '当前浏览器不支持桌面通知' : '请在浏览器设置中允许通知', { type: 'error' });
  };

  return (
    <div className="page">
      <PageHeader title="设置" back="/me" />
      <div className="page-scroll">
        <CellGroup title="深色模式">
          {schemeOption('light dark', `跟随系统（当前${systemDark ? '深色' : '浅色'}）`)}
          {schemeOption('light', '浅色')}
          {schemeOption('dark', '深色')}
        </CellGroup>

        <CellGroup title="新消息通知">
          <Switch label="提示音" checked={prefs.sound} onChange={(v) => setPref('sound', v)} />
          {canNotify() && <Switch label="桌面通知（页面在后台时）" checked={prefs.desktop} onChange={toggleDesktop} />}
        </CellGroup>

        <CellGroup title="聊天">
          <Switch label="按 Enter 键发送消息" checked={prefs.enterToSend} onChange={(v) => setPref('enterToSend', v)} />
        </CellGroup>

        <CellGroup title="账号与安全">
          <Cell label="修改密码" onClick={() => setChanging(true)} />
        </CellGroup>

        <CellGroup>
          <Cell
            label="退出登录"
            danger
            center
            arrow={false}
            onClick={async () => {
              if (await confirmDialog({ title: '退出登录', message: '确定要退出当前账号吗？', confirmText: '退出', danger: true })) logout();
            }}
          />
        </CellGroup>
        <p className="about">泡泡 v1.0 · 连接你在乎的每一个人</p>
      </div>
      {changing && <ChangePasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}
