import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { apiRequest, ApiRequestError, cloudApiUrl } from '../services/cloudApi';
import { emptyStudio } from '../services/repository';
import { assertStudioData } from '../domain/validation';
import type { StudioContext } from './StudioProvider';
import type { AccountRole, ManagedAccount, StudioEvent } from '../domain/types';

const sessionKey = 'mersal.cloud.session.v1';
type Session = { token: string; expiresAt: string };
const sessionStorage = Platform.OS !== 'web';

function dataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read your Home photo.'));
    reader.readAsDataURL(blob);
  });
}

async function photoData(uri: string) {
  if (uri.startsWith('data:')) {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

function photoType(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
  const header = String.fromCharCode(...bytes);
  if (header.startsWith('RIFF') && header.slice(8) === 'WEBP') return 'image/webp';
  throw new Error('Choose a JPEG, PNG, or WebP photo.');
}

export function useCloudStudio(): StudioContext {
  const [data, setData] = useState(emptyStudio);
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<AccountRole>();
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<Session | null>(null);
  const latest = useRef(emptyStudio);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const signingIn = useRef(false);

  const clear = useCallback(async () => {
    session.current = null;
    latest.current = emptyStudio;
    setAuthenticated(false);
    setRole(undefined);
    setData(emptyStudio);
    setStorageError(null);
    if (sessionStorage) await SecureStore.deleteItemAsync(sessionKey);
  }, []);

  const refresh = useCallback(async (active: Session, withPhoto = false) => {
    const identityResponse = await apiRequest('/auth/me', { token: active.token }).catch(error => {
      if (error instanceof ApiRequestError && error.status === 404) {
        throw new Error('The studio server needs an update before you can sign in. Deploy the latest backend to Vercel.');
      }
      throw error;
    });
    const identity = await identityResponse.json();
    const nextRole = identity.role;
    if (nextRole !== 'owner' && nextRole !== 'admin' && nextRole !== 'client') {
      throw new Error('Could not verify this account’s access.');
    }
    if (session.current !== active) return;
    if (nextRole === 'client') {
      latest.current = emptyStudio;
      setData(emptyStudio);
      setRole(nextRole);
      setAuthenticated(true);
      setStorageError(null);
      return;
    }
    const response = await apiRequest('/studio', { token: active.token });
    const result = await response.json();
    assertStudioData(result.data);
    let homePhoto = latest.current.homePhoto;
    if (withPhoto) {
      try {
        const photo = await apiRequest('/settings/home-photo', { token: active.token });
        homePhoto = await dataUri(await photo.blob());
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 404) homePhoto = undefined;
        else if (error instanceof ApiRequestError && error.status === 401) throw error;
      }
    }
    if (session.current !== active) return;
    latest.current = { ...result.data, homePhoto };
    setData(latest.current);
    setRole(nextRole);
    setAuthenticated(true);
    setStorageError(null);
  }, []);

  const retryLoad = useCallback(() => {
    setLoading(true);
    setStorageError(null);
    void (async () => {
      try {
        if (!session.current && sessionStorage) {
          const raw = await SecureStore.getItemAsync(sessionKey);
          if (raw) {
            const saved = JSON.parse(raw) as Session & { endpoint: string };
            if (saved.endpoint === cloudApiUrl && typeof saved.token === 'string' && Date.parse(saved.expiresAt) > Date.now()) {
              session.current = saved;
            } else await SecureStore.deleteItemAsync(sessionKey);
          }
        }
        if (session.current) await refresh(session.current, true);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) await clear().catch(() => undefined);
        else setStorageError(error instanceof Error ? error.message : 'Could not load your studio.');
      } finally { setLoading(false); }
    })();
  }, [clear, refresh]);

  useEffect(retryLoad, [retryLoad]);

  const enqueue = useCallback(<T,>(action: () => Promise<T>) => {
    const operation = queue.current.then(action);
    queue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const active = session.current;
      if (state !== 'active' || !active) return;
      void enqueue(async () => {
        if (active !== session.current) return;
        try { await refresh(active); }
        catch (error) {
          if (error instanceof ApiRequestError && error.status === 401) await clear().catch(() => undefined);
        }
      });
    });
    return () => subscription.remove();
  }, [clear, enqueue, refresh]);

  async function signIn(path: string, json: unknown) {
    if (signingIn.current) return;
    signingIn.current = true;
    setBusy(true);
    setAuthError(null);
    try {
      const response = await apiRequest(path, { method: 'POST', json });
      const active: Session = await response.json();
      session.current = active;
      if (sessionStorage) await SecureStore.setItemAsync(sessionKey, JSON.stringify({ ...active, endpoint: cloudApiUrl }));
      await refresh(active, true);
    } catch (error) {
      await clear().catch(() => undefined);
      setAuthError(error instanceof Error ? error.message : 'Could not sign in.');
      throw error;
    } finally { signingIn.current = false; setBusy(false); }
  }

  function mutate<T>(action: (token: string) => Promise<T>, photo = false) {
    const active = session.current;
    return enqueue(async () => {
      if (!active || session.current !== active) throw new Error('Sign in to continue.');
      let result: T;
      try { result = await action(active.token); }
      catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) await clear().catch(() => undefined);
        if (error instanceof ApiRequestError && error.status === 409) await refresh(active).catch(() => undefined);
        throw error;
      }
      try { await refresh(active, photo); }
      catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) await clear().catch(() => undefined);
        else setStorageError('The change was saved. Retry to reload your studio.');
      }
      return result;
    });
  }

  function write(path: string, method: string, json?: unknown) {
    return mutate(token => apiRequest(path, { method, token, json })).then(() => undefined);
  }

  const listAccounts = useCallback(async () => {
    const active = session.current;
    if (!active) throw new Error('Sign in to continue.');
    const response = await apiRequest('/accounts', { token: active.token });
    return await response.json() as ManagedAccount[];
  }, []);

  return {
    cloud: true, configured: true, data, authenticated, role, loading, storageError, authError, busy, retryLoad, listAccounts,
    async createAccount(account) {
      const active = session.current;
      if (!active) throw new Error('Sign in to continue.');
      const response = await apiRequest('/accounts', { method: 'POST', token: active.token, json: account });
      return await response.json() as ManagedAccount;
    },
    setup: (profile, secret, joinCode) => signIn('/auth/register', {
      username: profile.username, ...(/^\d{4}$/.test(secret) ? { pin: secret } : { password: secret }), profile, joinCode,
    }),
    unlock: (username, secret) => signIn('/auth/login', {
      username, ...(/^\d{4}$/.test(secret) ? { pin: secret } : { password: secret }),
    }),
    lock() {
      const active = session.current;
      void clear().catch(() => undefined);
      if (active) void apiRequest('/auth/logout', { method: 'POST', token: active.token }).catch(() => undefined);
    },
    async changePin() { throw new Error('Cloud accounts sign in with a password.'); },
    saveProfile({ username: _username, ...profile }) { return write('/profile', 'PATCH', profile); },
    setTheme(theme) { return write('/settings', 'PATCH', { theme }); },
    savePhotoGallery(clientId, driveLink) { return write('/photo-galleries', 'POST', { clientId, driveLink }); },
    addEventType(name) { return write('/event-types', 'POST', { name }); },
    async setHomePhoto(uri) {
      if (!uri) {
        await mutate(token => apiRequest('/settings/home-photo', { method: 'DELETE', token }), true);
        return;
      }
      const body = await photoData(uri);
      if (body.byteLength > 4 * 1024 * 1024) throw new Error('Choose an image under 4 MiB.');
      const contentType = photoType(body);
      await mutate(token => apiRequest('/settings/home-photo', { method: 'PUT', token, body, contentType }), true);
    },
    saveEvent({ payments, ...fields }, id, contact) {
      return mutate(async token => {
        if (!id) {
          const response = await apiRequest('/events', {
            token, method: 'POST', json: { ...fields, clientId: contact ? undefined : fields.clientId, contact, advance: payments[0]?.amount ?? 0 },
          });
          return (await response.json()).id as string;
        }
        await apiRequest('/events/' + id, { token, method: 'PATCH', json: { ...fields, clientId: contact ? undefined : fields.clientId ?? null, contact } });
        return id;
      });
    },
    recordPayment(id, amount, note) {
      return mutate(async token => {
        const response = await apiRequest('/events/' + id + '/payments', { method: 'POST', token, json: { amount, note } });
        return await response.json() as StudioEvent;
      });
    },
    setEventStatus(id, status) { return write('/events/' + id + '/status', 'PATCH', { status }); },
    deleteEvent(id) { return write('/events/' + id, 'DELETE'); },
    saveClient(input, id) {
      return mutate(async token => {
        const response = await apiRequest(id ? '/clients/' + id : '/clients', { token, method: id ? 'PATCH' : 'POST', json: input });
        return (await response.json()).id as string;
      });
    },
    deleteClient(id) { return write('/clients/' + id, 'DELETE'); },
  };
}
