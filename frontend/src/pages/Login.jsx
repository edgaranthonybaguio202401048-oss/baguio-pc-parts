import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNetwork } from '../context/NetworkStatusContext';
import { ErrorAlert, FormField, OfflineHint } from '../components/ui';
import { validateLogin } from '../utils/validators';

export default function Login() {
  const { login, sessionMessage } = useAuth();
  const { online } = useNetwork();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateLogin(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true); setError(null);
    try {
      const user = await login(form);
      navigate(location.state?.from || (user.role === 'admin' ? '/admin' : '/'), { replace: true });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="page narrow">
      <h1>Sign in</h1>
      {sessionMessage && <div className="alert" role="status">{sessionMessage}</div>}
      <form onSubmit={submit} noValidate className="stack card">
        <FormField id="email" label="Email" error={errors.email}>
          <input id="email" type="email" autoComplete="email" value={form.email} aria-invalid={!!errors.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
        <FormField id="password" label="Password" error={errors.password}>
          <input id="password" type="password" autoComplete="current-password" value={form.password} aria-invalid={!!errors.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </FormField>
        <ErrorAlert error={error} />
        <button type="submit" className="btn btn-block" disabled={busy || !online}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <OfflineHint online={online} action="signing in" />
      </form>
      <p className="center">New here? <Link to="/register">Create an account</Link></p>
    </div>
  );
}
