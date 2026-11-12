import { useCallback, useEffect, useState } from 'react';
import { Api, ApiError, errorText, normalizeServer, type User } from './api';
import { deleteToken, deviceName, loadToken, saveToken } from './platform';
import { Workspace } from './Workspace';

const SERVER_KEY = 'asanu-server'; // the address is not secret; the token goes to the keystore

type State = { kind: 'loading' } | { kind: 'login'; message?: string } | { kind: 'offline'; api: Api; message: string } | { kind: 'ready'; api: Api; user: User };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const boot = useCallback(async () => {
    setState({ kind: 'loading' });
    const server = localStorage.getItem(SERVER_KEY);
    if (!server) return setState({ kind: 'login' });
    let token: string | null = null;
    try {
      token = await loadToken(server);
    } catch (e) {
      return setState({ kind: 'login', message: `Schlüsselbund nicht lesbar: ${e}` });
    }
    if (!token) return setState({ kind: 'login' });
    const api = new Api(server, token);
    try {
      setState({ kind: 'ready', api, user: await api.me() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await deleteToken(server).catch(() => {});
        setState({ kind: 'login', message: 'Sitzung abgelaufen. Bitte neu anmelden.' });
      } else setState({ kind: 'offline', api, message: errorText(e) });
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  const logout = useCallback(async (api: Api, serverSide: boolean) => {
    if (serverSide) await api.logout().catch(() => {});
    await deleteToken(api.server).catch(() => {});
    setState({ kind: 'login', message: serverSide ? undefined : 'Sitzung abgelaufen. Bitte neu anmelden.' });
  }, []);

  if (state.kind === 'loading') return <div className="center-screen muted">Verbinde …</div>;
  if (state.kind === 'offline')
    return (
      <div className="center-screen">
        <div className="login-card">
          <img src="/logo.svg" alt="" width={48} />
          <h1>Keine Verbindung</h1>
          <p>
            {state.api.server}: {state.message}
          </p>
          <div className="row gap">
            <button type="button" className="btn primary" onClick={boot}>
              Erneut versuchen
            </button>
            <button type="button" className="btn" onClick={() => setState({ kind: 'login' })}>
              Server ändern
            </button>
          </div>
        </div>
      </div>
    );
  if (state.kind === 'login')
    return (
      <Login
        message={state.message}
        onDone={async (api, user) => {
          localStorage.setItem(SERVER_KEY, api.server);
          setState({ kind: 'ready', api, user });
        }}
      />
    );
  return <Workspace key={state.api.server} api={state.api} user={state.user} onLogout={(serverSide) => logout(state.api, serverSide)} />;
}

function Login({ message, onDone }: { message?: string; onDone: (api: Api, user: User) => void }) {
  const [server, setServer] = useState(localStorage.getItem(SERVER_KEY) ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(message ? { ok: false, text: message } : null);
  const [busy, setBusy] = useState(false);

  const api = () => new Api(normalizeServer(server));

  const test = async () => {
    setBusy(true);
    try {
      const h = await api().health();
      setStatus(h.app === 'asanu' ? { ok: true, text: `Verbunden mit Asanu-Server ${h.version}.` } : { ok: false, text: 'Antwortet, ist aber kein Asanu-Server.' });
    } catch (e) {
      setStatus({ ok: false, text: describeConnError(e) });
    }
    setBusy(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const a = api();
      const res = await a.login(email, password, deviceName());
      await saveToken(a.server, res.token);
      a.token = res.token;
      onDone(a, res.user);
    } catch (err) {
      setStatus({ ok: false, text: err instanceof ApiError && err.status === 401 ? 'E-Mail oder Passwort falsch.' : describeConnError(err) });
    }
    setBusy(false);
  };

  return (
    <div className="center-screen" data-tauri-drag-region>
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.svg" alt="" width={56} />
        <h1>Bei Asanu anmelden</h1>
        <label>
          Serveradresse
          <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="http://zimaos.local:8380" required autoFocus spellCheck={false} />
        </label>
        <button type="button" className="btn link" onClick={test} disabled={busy || !server}>
          Verbindung testen
        </button>
        <label>
          E-Mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label>
          Passwort
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {status && (
          <p className={status.ok ? 'ok-text' : 'error-text'} role="status">
            {status.text}
          </p>
        )}
        <button className="btn primary wide" disabled={busy}>
          {busy ? 'Bitte warten …' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}

function describeConnError(e: unknown): string {
  if (e instanceof TypeError) return 'Ungültige Serveradresse.';
  if (e instanceof ApiError && e.status === 0)
    return 'Server nicht erreichbar. Prüfe Adresse und Port, ob der Container läuft und ob du im Heimnetz bzw. VPN bist. Bei https: Zertifikat muss gültig sein.';
  return errorText(e);
}
