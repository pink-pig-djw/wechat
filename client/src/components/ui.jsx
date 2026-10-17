import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../lib/hooks.js';

/**
 * Page title bar. On phones it shows a back button (when `back` is given) and a centred title;
 * on desktop the back button is hidden unless `alwaysBack` is set.
 */
export function PageHeader({ title, subtitle, back, backLabel, alwaysBack = false, actions, className = '', children }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const showBack = back && (isMobile || alwaysBack);
  const goBack = () => {
    if (typeof back === 'function') return back();
    // Prefer real history so the phone's back gesture/button and our arrow agree.
    const canGoBack = (window.history.state?.idx ?? 0) > 0;
    if (canGoBack) navigate(-1);
    else navigate(typeof back === 'string' ? back : '/', { replace: true });
  };
  return (
    <header className={`page-header ${className}`}>
      <div className="page-header-side">
        {showBack && (
          <button type="button" className="icon-btn back-btn" aria-label="返回" onClick={goBack}>
            <ChevronLeft size={26} />
            {backLabel ? <span className="back-label">{backLabel}</span> : null}
          </button>
        )}
      </div>
      <h1 className="page-title">
        <span className="page-title-text">{title}</span>
        {subtitle && <small className="page-subtitle">{subtitle}</small>}
      </h1>
      <div className="page-header-side page-header-actions">{actions}</div>
      {children}
    </header>
  );
}

export function SearchBar({ value, onChange, placeholder = '搜索', autoFocus, onFocus, onKeyDown, className = '' }) {
  return (
    <label className={`search-bar ${className}`}>
      <Search size={15} aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className="search-clear" aria-label="清除" onClick={() => onChange('')}>
          <X size={12} />
        </button>
      )}
    </label>
  );
}

export function Badge({ count, dot, className = '' }) {
  if (dot) return <i className={`badge badge-dot ${className}`} aria-label="有新消息" />;
  if (!count) return null;
  return <i className={`badge ${className}`}>{count > 99 ? '99+' : count}</i>;
}

export function CellGroup({ title, children, className = '' }) {
  return (
    <section className={`cell-group ${className}`}>
      {title && <h3 className="cell-group-title">{title}</h3>}
      <div className="cell-group-body">{children}</div>
    </section>
  );
}

export function Cell({ icon, label, value, onClick, arrow = !!onClick, danger, center, children, className = '', badge }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`cell ${danger ? 'danger' : ''} ${center ? 'center' : ''} ${className}`} onClick={onClick}>
      {icon && <span className="cell-icon">{icon}</span>}
      <span className="cell-label">{label}</span>
      {badge}
      {value != null && <span className="cell-value">{value}</span>}
      {children}
      {arrow && <ChevronRight className="cell-arrow" size={18} aria-hidden="true" />}
    </Tag>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="cell switch-cell">
      <span className="cell-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function Empty({ icon, title, children }) {
  return (
    <div className="empty">
      {icon}
      {title && <p className="empty-title">{title}</p>}
      {children}
    </div>
  );
}

export function Spinner({ size = 20 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="加载中" />;
}
