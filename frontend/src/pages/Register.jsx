import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkStatusContext';
import { ErrorAlert, FormField, OfflineHint } from '../components/ui';
import { fieldErrorsFrom, validateRegister } from '../utils/validators';

export default function Register() {
  const { register } = useAuth();
  const { online } = useNetwork();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const v = validateRegister(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError(null);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
      setErrors(fieldErrorsFrom(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="page narrow">
      <h1>Create account</h1>
      <form onSubmit={submit} noValidate className="stack card">
        <FormField id="name" label="Full name" error={errors.name}>
          <input id="name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} />
        </FormField>
        <FormField id="email" label="Email" error={errors.email}>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password} hint="8+ characters with letters and numbers">
          <input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} aria-invalid={!!errors.password} />
        </FormField>
        <FormField id="confirm" label="Confirm password" error={errors.confirm}>
          <input id="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} aria-invalid={!!errors.confirm} />
        </FormField>
        <ErrorAlert error={error} />
        <button type="submit" className="btn btn-block" disabled={busy || !online}>{busy ? 'Creating…' : 'Create account'}</button>
        <OfflineHint online={online} action="registration" />
      </form>
      <p className="center">Have an account? <Link to="/login">Sign in</Link></p>
    </div>
  );
}
