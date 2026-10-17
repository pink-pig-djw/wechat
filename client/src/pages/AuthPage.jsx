import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { login, register } from '../lib/actions.js';
import { STICKER_MAP } from '../emoji/index.js';

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ username: '', nickname: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (isRegister && form.password !== form.confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    try {
      if (isRegister) {
        await register({ username: form.username.trim(), nickname: form.nickname.trim(), password: form.password });
      } else {
        await login(form.username.trim(), form.password);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-mascot" src={STICKER_MAP.get(isRegister ? 'yay' : 'hello').src} alt="" />
          <h1>泡泡</h1>
          <p>{isRegister ? '注册一个新账号，和朋友们畅聊' : '连接你在乎的每一个人'}</p>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>泡泡号</span>
            <input
              className="input"
              name="username"
              autoComplete="username"
              autoCapitalize="off"
              spellCheck="false"
              placeholder={isRegister ? '字母开头，4-20 位字母/数字/下划线' : '请输入泡泡号'}
              value={form.username}
              onChange={update('username')}
              required
            />
          </label>
          {isRegister && (
            <label className="field">
              <span>昵称</span>
              <input
                className="input"
                name="nickname"
                autoComplete="nickname"
                placeholder="朋友们看到的名字"
                maxLength={20}
                value={form.nickname}
                onChange={update('nickname')}
                required
              />
            </label>
          )}
          <label className="field">
            <span>密码</span>
            <div className="input-with-action">
              <input
                className="input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? '至少 6 位' : '请输入密码'}
                value={form.password}
                onChange={update('password')}
                required
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {isRegister && (
            <label className="field">
              <span>确认密码</span>
              <input
                className="input"
                name="confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="再输入一次密码"
                value={form.confirm}
                onChange={update('confirm')}
                required
              />
            </label>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? '请稍候…' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? (
            <>
              已有账号？<Link to="/login">直接登录</Link>
            </>
          ) : (
            <>
              还没有账号？<Link to="/register">立即注册</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
