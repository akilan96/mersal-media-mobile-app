import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { defaultEventTypes, type ThemeName } from '../domain/types';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { AccountRole, ClientGalleryList, ClientInput, ClientPaymentSummary, DrivePhotoPage, EventInput, EventStatus, ManagedAccount, Profile, StudioData, StudioEvent } from '../domain/types';
import { addPhotoGallery, isClientPhone, phoneDigits, putEvent, removeClient, validateClient, validateProfile } from '../domain/validation';
import { emptyStudio, studioRepository } from '../services/repository';
import { createCredential, hasCredential, removeCredential, verifyPin } from '../services/credentials';
import { cloudApiUrl } from '../services/cloudApi';
import { useCloudStudio } from './useCloudStudio';
export interface StudioContext {
  cloud: boolean;
  role?: AccountRole;
  accountName?: string;
  deviceTheme?: ThemeName;
  listAccounts?(): Promise<ManagedAccount[]>;
  createAccount?(account: ManagedAccount & { pin: string }): Promise<ManagedAccount>;
  linkClientAccount?(username: string, clientId: string): Promise<void>;
  loadClientPayments?(): Promise<ClientPaymentSummary | null>;
  loadClientGalleries?(): Promise<ClientGalleryList>;
  loadGalleryPhotos?(galleryId: string, pageToken?: string, favourites?: boolean): Promise<DrivePhotoPage>;
  galleryThumbnail?(galleryId: string, photoId: string, large?: boolean): { uri: string; cacheKey: string; headers: Record<string, string> } | undefined;
  loadClientPhotoSummary?(): Promise<import('../domain/types').ClientPhotoSummary>;
  setGalleryFavourite?(galleryId: string, photoId: string, selected: boolean): Promise<void>;
  galleryChange?: { id: string };
  data: StudioData; configured: boolean; authenticated: boolean; loading: boolean; storageError: string | null;
  authError: string | null; busy: boolean; retryLoad(): void;
  setup(profile: Profile, pin: string, joinCode?: string): Promise<void>; unlock(username: string, pin: string): Promise<void>;
  lock(): void; changePin(currentPin: string, newPin: string): Promise<void>;
  saveEvent(input: EventInput, id?: string, contact?: { name: string; phone: string }): Promise<string>; deleteEvent(id: string): Promise<void>;
  recordPayment(eventId: string, amount: number, note: string): Promise<StudioEvent>;
  setEventStatus(eventId: string, status: EventStatus): Promise<void>;
  saveClient(input: ClientInput, id?: string): Promise<string>; deleteClient(id: string): Promise<void>;
  saveProfile(profile: Profile): Promise<void>;
  setTheme(theme: ThemeName): Promise<void>;
  setHomePhoto(uri?: string): Promise<void>;
  addEventType(name: string): Promise<void>;
  savePhotoGallery(clientId: string, driveLink: string): Promise<void>;
}
const Context = createContext<StudioContext | null>(null);
function LocalStudioProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState(emptyStudio);
  const latest = useRef(emptyStudio);
  const [configured, setConfigured] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const authBusy = useRef(false);
  const lock = useCallback(() => { setAuthenticated(false); setAuthError(null); }, []);
  const retryLoad = useCallback(() => {
    setLoading(true); setStorageError(null);
    Promise.all([studioRepository.load(), hasCredential()]).then(async ([saved, credential]) => {
      // iOS keychain entries can survive reinstall after all app records are removed.
      // An orphaned PIN with no profile or records belongs to a fresh workspace.
      if (credential && saved.profile === null && saved.events.length === 0 && saved.clients.length === 0) {
        await removeCredential(); credential = false;
      }
      if (Boolean(saved.profile) !== credential) throw new Error('The local profile and device PIN are out of sync. Your saved data has been preserved. Restore the app data together with its device credentials.');
      latest.current = saved; setData(saved); setConfigured(credential);
    }).catch(error => setStorageError(error instanceof Error ? error.message : 'Could not open local storage.')).finally(() => setLoading(false));
  }, []);
  useEffect(retryLoad, [retryLoad]);
  useEffect(() => {
    let backgroundedAt = 0;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') backgroundedAt = Date.now();
      if (state === 'active' && backgroundedAt && Date.now() - backgroundedAt > 60000) lock();
      if (state === 'active') backgroundedAt = 0;
    });
    return () => subscription.remove();
  }, [lock]);
  const commit = useCallback((change: (previous: StudioData) => StudioData) => {
    const operation = queue.current.then(async () => {
      const next = change(latest.current);
      await studioRepository.save(next);
      latest.current = next; setData(next);
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, []);
  async function authAction(action: () => Promise<void>) {
    if (authBusy.current) return;
    authBusy.current = true; setBusy(true); setAuthError(null);
    try { await action(); } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not unlock your studio.';
      setAuthError(message); throw new Error(message);
    } finally { authBusy.current = false; setBusy(false); }
  }
  const value: StudioContext = {
    cloud: false, data, configured, authenticated, loading, storageError, authError, busy, retryLoad, lock,
    setup: (profile, pin) => authAction(async () => {
      if (configured || latest.current.profile) throw new Error('This studio is already configured. Sign in instead.');
      const clean = { ...profile, name: profile.name.trim(), studioName: profile.studioName.trim(), username: profile.username.trim(), phone: profile.phone.trim(), email: profile.email.trim() };
      validateProfile(clean); await createCredential(pin);
      try { await commit(previous => ({ ...previous, profile: clean })); } catch (error) { await removeCredential(); throw error; }
      setConfigured(true); setAuthenticated(true);
    }),
    unlock: (username, pin) => authAction(async () => {
      await verifyPin(pin);
      if (username.trim().toLowerCase() !== latest.current.profile?.username.toLowerCase()) throw new Error('The username or PIN is incorrect.');
      setAuthenticated(true);
    }),
    async changePin(currentPin, newPin) { await verifyPin(currentPin); await createCredential(newPin); },
    async saveProfile(profile) {
      const clean = { ...profile, name: profile.name.trim(), studioName: profile.studioName.trim(), username: profile.username.trim(), phone: profile.phone.trim(), email: profile.email.trim() };
      validateProfile(clean); await commit(previous => ({ ...previous, profile: clean }));
    },
    async setTheme(theme) { await commit(previous => ({ ...previous, theme })); },
    async setHomePhoto(homePhoto) { await commit(previous => ({ ...previous, homePhoto })); },
    async savePhotoGallery(clientId, driveLink) {
      const gallery = { id: Crypto.randomUUID(), clientId, driveLink: driveLink.trim(), createdAt: new Date().toISOString() };
      await commit(previous => addPhotoGallery(previous, gallery));
    },
    async addEventType(name) {
      const clean = name.trim();
      if (!clean || clean.length > 60) throw new Error('Enter an event type up to 60 characters.');
      await commit(previous => {
        const custom = previous.customEventTypes ?? [];
        if ([...defaultEventTypes, ...custom].some(type => type.toLowerCase() === clean.toLowerCase())) {
          throw new Error('That event type already exists.');
        }
        return { ...previous, customEventTypes: [...custom, clean] };
      });
    },
    async saveEvent(input, id, contact) {
      const eventId = id ?? Crypto.randomUUID();
      await commit(previous => {
        const existing = previous.events.find(e => e.id === eventId);
        if (id && !existing) throw new Error('This event no longer exists.');
        let snapshot = previous;
        let clientId = input.clientId;
        if (contact) {
          const phone = contact.phone.trim();
          if (!isClientPhone(phone)) throw new Error('Enter a valid client phone number.');
          const matches = previous.clients.filter(client => phoneDigits(client.phone) === phoneDigits(phone));
          if (matches.length > 1) throw new Error('More than one client has this number. Choose the client from the directory.');
          if (matches.length === 1) {
            clientId = matches[0].id;
          } else {
            const client = { id: Crypto.randomUUID(), name: contact.name.trim(), phone, email: '', notes: '', createdAt: new Date().toISOString() };
            validateClient(client);
            snapshot = { ...previous, clients: [...previous.clients, client] };
            clientId = client.id;
          }
        }
        return putEvent(snapshot, { ...input, clientId, title: input.title.trim(), location: input.location.trim() }, eventId, existing?.createdAt ?? new Date().toISOString());
      }); return eventId;
    },
    async recordPayment(eventId, amount, note) {
      const payment = { id: Crypto.randomUUID(), date: new Date().toISOString(), amount, note };
      let saved: StudioEvent | undefined;
      await commit(previous => {
        const event = previous.events.find(item => item.id === eventId);
        if (!event) throw new Error('This event no longer exists.');
        saved = { ...event, payments: [...event.payments, payment] };
        return putEvent(previous, saved, event.id, event.createdAt);
      });
      if (!saved) throw new Error('The saved payment could not be loaded.');
      return saved;
    },
    async setEventStatus(eventId, status) {
      await commit(previous => {
        const event = previous.events.find(item => item.id === eventId);
        if (!event) throw new Error('This event no longer exists.');
        return putEvent(previous, { ...event, status }, event.id, event.createdAt);
      });
    },
    async deleteEvent(id) { await commit(previous => ({ ...previous, events: previous.events.filter(e => e.id !== id) })); },
    async saveClient(input, id) {
      const clientId = id ?? Crypto.randomUUID();
      const clean = { ...input, name: input.name.trim(), phone: input.phone.trim(), email: input.email.trim() }; validateClient(clean);
      await commit(previous => {
        const existing = previous.clients.find(c => c.id === clientId);
        if (id && !existing) throw new Error('This client no longer exists.');
        const client = { ...clean, id: clientId, createdAt: existing?.createdAt ?? new Date().toISOString() };
        return { ...previous, clients: existing ? previous.clients.map(c => c.id === clientId ? client : c) : [...previous.clients, client] };
      }); return clientId;
    },
    async deleteClient(id) { await commit(previous => removeClient(previous, id)); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useStudio() { const context = useContext(Context); if (!context) throw new Error('StudioProvider is missing.'); return context; }

function CloudStudioProvider({ children }: { children: React.ReactNode }) {
  const value = useCloudStudio();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function StudioProvider({ children }: { children: React.ReactNode }) {
  const Provider = cloudApiUrl ? CloudStudioProvider : LocalStudioProvider;
  return <Provider>{children}</Provider>;
}
