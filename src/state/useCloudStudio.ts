import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { apiRequest, ApiRequestError, cloudApiUrl } from '../services/cloudApi';
import { emptyStudio } from '../services/repository';
import { assertStudioData } from '../domain/validation';
import type { StudioContext } from './StudioProvider';
import type { AccountRole, ClientGalleryList, ClientPaymentSummary, ClientPhotoSummary, DrivePhotoPage, ManagedAccount, StudioEvent, ThemeName } from '../domain/types';
import { settingsThemes } from '../theme';

const sessionKey = 'mersal.cloud.session.v1';
const themeKeys = { client: 'mersal.client.theme.v1', staff: 'mersal.staff.theme.v1' } as const;
type DeviceThemes = Partial<Record<keyof typeof themeKeys, ThemeName>>;
type Session = { token: string; expiresAt: string; photoCacheId: string };
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
  const [accountName, setAccountName] = useState<string>();
  const [deviceThemes, setDeviceThemes] = useState<DeviceThemes>({});
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [galleryChange, setGalleryChange] = useState<{ id: string }>();
  const session = useRef<Session | null>(null);
  const latest = useRef(emptyStudio);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const signingIn = useRef(false);
  const themeScope = role === 'client' ? 'client' : 'staff';

  useEffect(() => {
    let active = true;
    void AsyncStorage.multiGet([themeKeys.client, themeKeys.staff]).then(entries => {
      const values = new Map(entries);
      if (!active) return;
      setDeviceThemes(current => ({
        client: settingsThemes.find(option => option === values.get(themeKeys.client)),
        staff: settingsThemes.find(option => option === values.get(themeKeys.staff)),
        ...current,
      }));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const clear = useCallback(async () => {
    session.current = null;
    latest.current = emptyStudio;
    setAuthenticated(false);
    setRole(undefined);
    setAccountName(undefined);
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
      setAccountName(typeof identity.name === 'string' && identity.name.trim()
        ? identity.name.trim()
        : typeof identity.username === 'string' ? identity.username : undefined);
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
              session.current = { ...saved, photoCacheId: saved.photoCacheId || randomUUID() };
              if (!saved.photoCacheId) await SecureStore.setItemAsync(sessionKey, JSON.stringify({ ...session.current, endpoint: cloudApiUrl }));
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
      const active: Session = { ...await response.json(), photoCacheId: randomUUID() };
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

  const loadClientPayments = useCallback(async () => {
    const active = session.current;
    if (!active) throw new Error('Sign in to continue.');
    const response = await apiRequest('/client/payment-summary', { token: active.token });
    return await response.json() as ClientPaymentSummary | null;
  }, []);

  const loadClientGalleries = useCallback(async () => {
    const active = session.current;
    if (!active) throw new Error('Sign in to continue.');
    const response = await apiRequest('/client/galleries', { token: active.token });
    return await response.json() as ClientGalleryList;
  }, []);

  const loadGalleryPhotos = useCallback(async (galleryId: string, pageToken?: string, favourites?: boolean) => {
    const active = session.current;
    if (!active) throw new Error('Sign in to continue.');
    const query = new URLSearchParams();
    if (pageToken) query.set('pageToken', pageToken);
    if (favourites) query.set('favourites', 'true');
    const response = await apiRequest('/client/galleries/' + encodeURIComponent(galleryId) + '/photos?' + query, { token: active.token });
    return await response.json() as DrivePhotoPage;
  }, []);

  const loadGalleryPhotoCount = useCallback(async (galleryId: string, favourites: boolean, signal?: AbortSignal) => {
    const active = session.current;
    if (!active) throw new Error('Sign in to continue.');
    try {
      const response = await apiRequest('/client/galleries/' + encodeURIComponent(galleryId) + '/summary?favourites=' + favourites, { token: active.token });
      const { total } = await response.json() as { total: number };
      if (Number.isSafeInteger(total) && total >= 0) return total;
    } catch (error) {
      if (!(error instanceof ApiRequestError) || ![403, 404].includes(error.status)) throw error;
    }
    // Older deployments can use the client summary when it represents just this gallery.
    try {
      const { galleries } = await loadClientGalleries();
      if (galleries.length === 1 && galleries[0].id === galleryId && !signal?.aborted && session.current === active) {
        const response = await apiRequest('/client/photo-summary', { token: active.token });
        const { total, selected } = await response.json() as ClientPhotoSummary;
        if (Number.isSafeInteger(total) && Number.isSafeInteger(selected) && selected >= 0 && total >= selected) {
          return favourites ? selected : total - selected;
        }
      }
    } catch {
      // The gallery pages also work with older deployments that lack a summary.
    }
    const ids = new Set<string>();
    const tokens = new Set<string>();
    let pageToken: string | undefined;
    do {
      if (signal?.aborted || session.current !== active) throw new Error('Photo count cancelled.');
      const page = await loadGalleryPhotos(galleryId, pageToken, favourites);
      for (const photo of page.photos) ids.add(photo.id);
      pageToken = page.nextPageToken;
      if (pageToken && tokens.has(pageToken)) throw new Error('Could not finish counting gallery photos.');
      if (pageToken) tokens.add(pageToken);
    } while (pageToken);
    return ids.size;
  }, [loadClientGalleries, loadGalleryPhotos]);

  const loadClientPhotoSummary = useCallback(async () => {
    const active = session.current;
    if (!active) throw new Error('Sign in to continue.');
    const response = await apiRequest('/client/photo-summary', { token: active.token });
    return await response.json() as ClientPhotoSummary;
  }, []);

  async function setGalleryFavourite(galleryId: string, photoId: string, selected: boolean) {
    const active = session.current;
    if (!active) throw new Error('Sign in to continue.');
    await enqueue(async () => {
      if (session.current !== active) throw new Error('Sign in to continue.');
      await apiRequest('/client/galleries/' + encodeURIComponent(galleryId) + '/photos/' + encodeURIComponent(photoId) + '/favourite', {
        method: 'PUT', token: active.token, json: { selected },
      });
      if (session.current === active) setGalleryChange({ id: galleryId });
    });
  }

  function galleryThumbnail(galleryId: string, photoId: string, large?: boolean, name?: string) {
    const active = session.current;
    if (!active || !cloudApiUrl) return;
    const uri = cloudApiUrl + '/client/galleries/' + encodeURIComponent(galleryId) + '/photos/' + encodeURIComponent(photoId) + '/thumbnail' + (large ? '?size=large' : '?size=small');
    return {
      uri: name ? uri + '&name=' + encodeURIComponent(name) : uri,
      cacheKey: active.photoCacheId + ':' + uri,
      headers: { Authorization: 'Bearer ' + active.token },
    };
  }

  return {
    cloud: true, configured: true, data, authenticated, role, accountName,
    deviceTheme: authenticated ? deviceThemes[themeScope] : undefined,
    loading, storageError, authError, busy, retryLoad, listAccounts, loadClientPayments,
    loadClientGalleries, loadGalleryPhotos, loadGalleryPhotoCount, galleryThumbnail, loadClientPhotoSummary, setGalleryFavourite, galleryChange,
    async linkClientAccount(username, clientId) {
      const active = session.current;
      if (!active) throw new Error('Sign in to continue.');
      await apiRequest('/accounts/' + encodeURIComponent(username) + '/client', {
        method: 'PATCH', token: active.token, json: { clientId },
      });
    },
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
    async setTheme(theme) {
      setDeviceThemes(previous => ({ ...previous, [themeScope]: theme }));
      try { await AsyncStorage.setItem(themeKeys[themeScope], theme); }
      catch (error) {
        setDeviceThemes(previous => ({ ...previous, [themeScope]: deviceThemes[themeScope] }));
        throw error;
      }
    },
    savePhotoGallery(clientId, driveLink, id) {
      return write(id ? '/photo-galleries/' + encodeURIComponent(id) : '/photo-galleries', id ? 'PATCH' : 'POST', { clientId, driveLink });
    },
    removePhotoGallery(id) { return write('/photo-galleries/' + encodeURIComponent(id), 'DELETE'); },
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
    deleteEvent(id) { return write('/events/' + id + '/inactive', 'PATCH'); },
    saveClient(input, id) {
      return mutate(async token => {
        const response = await apiRequest(id ? '/clients/' + id : '/clients', { token, method: id ? 'PATCH' : 'POST', json: input });
        return (await response.json()).id as string;
      });
    },
    deleteClient(id) { return write('/clients/' + id + '/inactive', 'PATCH'); },
  };
}
