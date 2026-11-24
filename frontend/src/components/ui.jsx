/* Small reusable UI primitives. */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { messageFor } from '../utils/errorMessages';

export function SkeletonLoader({ count = 4, variant = 'card' }) {
  return (
    <div className={variant === 'card' ? 'grid' : 'stack'} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <div key={i} className={`skeleton skeleton-${variant}`} />)}
    </div>
  );
}

export function EmptyState({ icon = '🛒', title, children, action }) {
  return (
    <section className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
      {action}
    </section>
  );
}

/** Renders an ApiError from the backend error envelope in friendly words. */
export function ErrorAlert({ error, onRetry, onClose }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details.filter((d) => d && d.message && !d.field) : [];
  return (
    <div className="alert alert-error" role="alert">
      <div>
        <strong>{messageFor(error)}</strong>
        {details.length > 0 && <ul>{details.map((d, i) => <li key={`${d.code || i}`}>{d.message}</li>)}</ul>}
        {error.status === 403 && <p className="small">Signed in with the wrong account? <Link to="/login">Switch account</Link></p>}
        {error.requestId && <p className="small muted">Reference: {error.requestId}</p>}
      </div>
      <div className="row">
        {onRetry && <button type="button" className="btn btn-small" onClick={onRetry}>Retry</button>}
        {onClose && <button type="button" className="icon-btn" aria-label="Dismiss" onClick={onClose}>✕</button>}
      </div>
    </div>
  );
}

export function QuantityStepper({ value, min = 1, max = 20, onChange, disabled, label = 'Quantity' }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease quantity" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

/** Slide-up bottom sheet (mobile drawer) with Esc to close and focus on open. */
export function BottomSheet({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function FormField({ id, label, error, hint, children }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}

const STATUS_LABEL = {
  pending_payment: 'Awaiting payment', paid: 'Paid', processing: 'Processing', shipped: 'Shipped / Ready',
  delivered: 'Delivered', cancelled: 'Cancelled', expired: 'Expired',
};
export function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function AiBadge() {
  return <span className="badge badge-ai" title="Generated with AI assistance from real store data">✨ AI-Assisted</span>;
}

/** Disables network-only actions while offline, with an explanatory hint. */
export function OfflineHint({ online, action = 'this action' }) {
  if (online) return null;
  return <p className="hint offline-hint" role="status">You're offline – {action} needs an internet connection.</p>;
}
