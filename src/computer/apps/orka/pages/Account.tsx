/**
 * Orka sign-in page and the Account pages (Apps §2.2).
 */
import { useState, type FormEvent } from 'react';
import { emitAppAction } from '../../../apps';
import { ACCOUNTS, setLogin, takeReturnTo } from '../session';
import { Alert, Field, useOrka } from '../shared';
import type { OrkaRouteKey } from '../session';

export function LoginPage() {
  const { navigate } = useOrka();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [remember, setRemember] = useState(true);
  const [failed, setFailed] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const acct = ACCOUNTS[u.trim()];
    if (!acct || acct.password == null || acct.password !== p) {
      setFailed(true);
      return;
    }
    setLogin(u.trim());
    emitAppAction('orka', 'orka.session.signedIn', { login: u.trim() });
    navigate(takeReturnTo() ?? '/');
  };
  return (
    <div className="orka-login">
      <h1>Sign in</h1>
      {failed ? (
        <Alert kind="danger">
          <strong>Failed to sign in!</strong> Please check your credentials and try again.
        </Alert>
      ) : null}
      <form onSubmit={submit}>
        <Field label="Username">
          <input className="orka-control" name="username" autoFocus value={u} onChange={(e) => setU(e.target.value)} placeholder="Your username" />
        </Field>
        <Field label="Password">
          <input className="orka-control" type="password" name="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="Your password" />
        </Field>
        <label className="orka-check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me
        </label>
        <div>
          <button type="submit" className="orka-btn orka-btn-primary">
            Sign in
          </button>
        </div>
      </form>
      <div style={{ marginTop: 16 }}>
        <div className="orka-alert orka-alert-warning">
          <button type="button" className="orka-link">
            Did you forget your password?
          </button>
        </div>
        <div className="orka-alert orka-alert-warning">
          You don't have an account yet? <span className="orka-muted">Register a new account (disabled)</span>
        </div>
      </div>
    </div>
  );
}

export function AccountPage(props: { which: OrkaRouteKey }) {
  const { login } = useOrka();
  const [saved, setSaved] = useState<string | null>(null);
  if (props.which === 'accountPassword') {
    return (
      <div className="orka-login">
        <h2>
          Password for [<strong>{login}</strong>]
        </h2>
        {saved ? <Alert kind="danger">{saved}</Alert> : null}
        <Field label="Current password">
          <input className="orka-control" type="password" />
        </Field>
        <Field label="New password">
          <input className="orka-control" type="password" />
        </Field>
        <Field label="New password confirmation">
          <input className="orka-control" type="password" />
        </Field>
        <button type="button" className="orka-btn orka-btn-primary" onClick={() => setSaved('An error has occurred! The password could not be changed (LDAP-managed account).')}>
          Save
        </button>
      </div>
    );
  }
  return (
    <div className="orka-login">
      <h2>
        User settings for [<strong>{login}</strong>]
      </h2>
      {saved ? <Alert kind="success">{saved}</Alert> : null}
      <Field label="First Name">
        <input className="orka-control" defaultValue={login === 'admin' ? 'Administrator' : (login ?? '')} />
      </Field>
      <Field label="Last Name">
        <input className="orka-control" defaultValue={login === 'admin' ? 'Administrator' : ''} />
      </Field>
      <Field label="Email">
        <input className="orka-control" defaultValue={`${login}@orka.lab.local`} />
      </Field>
      <Field label="Language">
        <select className="orka-control" defaultValue="en">
          <option value="en">English</option>
        </select>
      </Field>
      <button type="button" className="orka-btn orka-btn-primary" onClick={() => setSaved('Settings saved!')}>
        Save
      </button>
    </div>
  );
}
