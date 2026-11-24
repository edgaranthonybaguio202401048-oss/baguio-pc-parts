import { useState } from 'react';
import { AdminApi } from '../../api/endpoints';
import useApi from '../../hooks/useApi';
import { BottomSheet, ErrorAlert, FormField, SkeletonLoader } from '../../components/ui';
import { formatPHP } from '../../utils/currency';
import { fieldErrorsFrom } from '../../utils/validators';

function CouponForm({ onDone }) {
  const [f, setF] = useState({ code: '', type: 'percentage', value: '', minSpend: '0', maxDiscount: '', expiresAt: '', usageLimit: '', perCustomerLimit: '1' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    const body = {
      code: f.code.trim().toUpperCase(), type: f.type,
      value: f.type === 'percentage' ? Number(f.value) : Math.round(Number(f.value) * 100),
      minSpendCents: Math.round(Number(f.minSpend || 0) * 100),
      perCustomerLimit: Number(f.perCustomerLimit || 1),
      ...(f.maxDiscount ? { maxDiscountCents: Math.round(Number(f.maxDiscount) * 100) } : {}),
      ...(f.expiresAt ? { expiresAt: new Date(f.expiresAt).toISOString() } : {}),
      ...(f.usageLimit ? { usageLimit: Number(f.usageLimit) } : {}),
    };
    setError(null);
    try { await AdminApi.createCoupon(body); onDone(); } catch (err) { setError(err); setErrors(fieldErrorsFrom(err)); }
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <FormField id="c-code" label="Code" error={errors.code}><input id="c-code" value={f.code} onChange={set('code')} /></FormField>
      <FormField id="c-type" label="Type"><select id="c-type" value={f.type} onChange={set('type')}><option value="percentage">Percentage</option><option value="fixed">Fixed amount (₱)</option></select></FormField>
      <div className="row">
        <FormField id="c-value" label={f.type === 'percentage' ? 'Percent off' : 'Amount off (₱)'} error={errors.value}><input id="c-value" type="number" min="1" value={f.value} onChange={set('value')} /></FormField>
        <FormField id="c-min" label="Min spend (₱)" error={errors.minSpendCents}><input id="c-min" type="number" min="0" value={f.minSpend} onChange={set('minSpend')} /></FormField>
      </div>
      <div className="row">
        <FormField id="c-max" label="Max discount (₱)"><input id="c-max" type="number" min="0" value={f.maxDiscount} onChange={set('maxDiscount')} /></FormField>
        <FormField id="c-exp" label="Expires"><input id="c-exp" type="datetime-local" value={f.expiresAt} onChange={set('expiresAt')} /></FormField>
      </div>
      <div className="row">
        <FormField id="c-limit" label="Total uses"><input id="c-limit" type="number" min="1" value={f.usageLimit} onChange={set('usageLimit')} /></FormField>
        <FormField id="c-per" label="Per customer"><input id="c-per" type="number" min="1" value={f.perCustomerLimit} onChange={set('perCustomerLimit')} /></FormField>
      </div>
      <ErrorAlert error={error} />
      <button type="submit" className="btn btn-block">Create coupon</button>
    </form>
  );
}

export default function AdminCoupons() {
  const list = useApi((signal) => AdminApi.coupons(signal), []);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const toggle = async (c) => {
    try { await AdminApi.updateCoupon(c.id, { isActive: !c.isActive }); list.reload(); } catch (err) { setError(err); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    try { await AdminApi.deleteCoupon(c.id); list.reload(); } catch (err) { setError(err); }
  };
  return (
    <div className="stack">
      <div className="row between"><h2>Coupons</h2><button type="button" className="btn btn-small" onClick={() => setOpen(true)}>+ Add</button></div>
      <ErrorAlert error={error || list.error} onClose={() => setError(null)} />
      {list.loading ? <SkeletonLoader count={3} variant="row" /> : (
        <ul className="stack" role="list">
          {(list.data || []).map((c) => {
            const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
            return (
              <li key={c.id} className={`card admin-row ${c.isActive && !expired ? '' : 'inactive'}`}>
                <div className="grow">
                  <strong>{c.code}</strong> {expired && <span className="badge badge-expired">expired</span>}
                  <p className="small muted">
                    {c.type === 'percentage' ? `${c.value}% off` : `${formatPHP(c.value)} off`}
                    {c.maxDiscountCents ? ` (max ${formatPHP(c.maxDiscountCents)})` : ''} · min {formatPHP(c.minSpendCents)} · used {c.usedCount}/{c.usageLimit ?? '∞'} · {c.perCustomerLimit}/customer
                    {c.expiresAt ? ` · until ${new Date(c.expiresAt).toLocaleDateString('en-PH')}` : ''}
                  </p>
                </div>
                <div className="row wrap">
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => toggle(c)}>{c.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => remove(c)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <BottomSheet open={open} title="New coupon" onClose={() => setOpen(false)}>
        <CouponForm onDone={() => { setOpen(false); list.reload(); }} />
      </BottomSheet>
    </div>
  );
}
