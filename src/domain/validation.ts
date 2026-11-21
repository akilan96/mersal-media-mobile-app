import { themeNames } from './types';
import type { Client, ClientInput, EventInput, PhotoGallery, Profile, StudioData, StudioEvent } from './types';
export function validateProfile(profile: Profile) {
  if (!profile.name.trim() || !profile.studioName.trim()) throw new Error('Enter your name and studio name.');
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(profile.username)) throw new Error('Username must be 3–40 letters, numbers, dots, dashes or underscores.');
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error('Enter a valid email address.');
}
export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');
export const isClientPhone = (phone: string) => /^\+?[\d\s().-]+$/.test(phone) && /^\d{7,15}$/.test(phoneDigits(phone));
export const isGoogleDriveLink = (link: string) => link.length <= 2048 && /^https:\/\/drive\.google\.com\/[a-z0-9][^\s\\]*$/i.test(link);
export function validateClient(client: ClientInput) {
  if (!client.name.trim()) throw new Error('Enter the client name.');
  if (client.phone && !isClientPhone(client.phone)) throw new Error('Enter a valid phone number.');
  if (client.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email)) throw new Error('Enter a valid email address.');
}
export function validateEvent(event: EventInput, clients: Client[]) {
  if (!event.title.trim() || !event.location.trim()) throw new Error('Event title and location are required.');
  if (!Number.isFinite(Date.parse(event.date))) throw new Error('Choose a valid event date and time.');
  if (!['Scheduled', 'Editing', 'Completed', 'Cancelled'].includes(event.status)) throw new Error('Choose a valid event status.');
  if (typeof event.type !== 'string' || !event.type.trim() || event.type.length > 60) throw new Error('Choose a valid event type.');
  if (!Number.isSafeInteger(event.attendees) || event.attendees < 0) throw new Error('Guest count must be a nonnegative whole number.');
  if (!Number.isFinite(event.totalAmount) || event.totalAmount < 0 || event.totalAmount > 1e10) throw new Error('Enter a valid total amount.');
  if (Math.abs(event.totalAmount * 100 - Math.round(event.totalAmount * 100)) > 0.0001) throw new Error('Use no more than two decimal places for amounts.');
  if (event.clientId && !clients.some(c => c.id === event.clientId)) throw new Error('The selected client no longer exists.');
  if (!event.crew.every(x => typeof x === 'string' && x.trim()) || !event.equipment.every(x => typeof x === 'string' && x.trim())) throw new Error('Crew and equipment names cannot be blank.');
  const ids = new Set<string>();
  for (const payment of event.payments) {
    if (!payment || typeof payment.id !== 'string' || !payment.id || ids.has(payment.id) || typeof payment.note !== 'string' || typeof payment.date !== 'string') throw new Error('Payment records must have a unique identifier, date and note.');
    ids.add(payment.id);
    if (!Number.isFinite(payment.amount) || payment.amount <= 0 || Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) > 0.0001 || !Number.isFinite(Date.parse(payment.date))) throw new Error('Payments must have a valid date and a positive amount with at most two decimals.');
  }
  if (event.payments.reduce((sum, p) => sum + Math.round(p.amount * 100), 0) > Math.round(event.totalAmount * 100)) throw new Error('Payments cannot exceed the event total.');
}
export function assertStudioData(value: unknown): asserts value is StudioData {
  const data = value as StudioData;
  if (!data || data.version !== 1 || !Array.isArray(data.events) || !Array.isArray(data.clients) || !('profile' in data)) throw new Error('The saved studio data is not a supported format.');
  if (data.theme !== undefined && data.theme !== 'pancake' && !themeNames.includes(data.theme)) throw new Error('The saved theme is invalid.');
  if (data.homePhoto !== undefined && typeof data.homePhoto !== 'string') throw new Error('The saved Home photo is invalid.');
  if (data.customEventTypes !== undefined && (!Array.isArray(data.customEventTypes) || data.customEventTypes.some(type => typeof type !== 'string' || !type.trim() || type.length > 60))) throw new Error('The saved event types are invalid.');
  if (data.profile !== null) {
    if (![data.profile.name, data.profile.studioName, data.profile.username, data.profile.phone, data.profile.email].every(x => typeof x === 'string')) throw new Error('The saved profile is damaged.');
    validateProfile(data.profile);
  }
  const clientIds = new Set<string>();
  for (const c of data.clients) {
    if (!c || typeof c.id !== 'string' || !c.id || clientIds.has(c.id) || ![c.name, c.phone, c.email, c.notes, c.createdAt].every(x => typeof x === 'string')) throw new Error('A saved client is damaged.');
    clientIds.add(c.id); validateClient(c);
  }
  if (data.photoGalleries !== undefined) {
    if (!Array.isArray(data.photoGalleries)) throw new Error('The saved photo galleries are invalid.');
    const galleryIds = new Set<string>();
    for (const gallery of data.photoGalleries) {
      if (!gallery || typeof gallery.id !== 'string' || !gallery.id || galleryIds.has(gallery.id)
        || !clientIds.has(gallery.clientId) || typeof gallery.driveLink !== 'string' || !isGoogleDriveLink(gallery.driveLink)
        || typeof gallery.createdAt !== 'string' || !Number.isFinite(Date.parse(gallery.createdAt))) {
        throw new Error('A saved photo gallery is invalid.');
      }
      galleryIds.add(gallery.id);
    }
  }
  const eventIds = new Set<string>();
  for (const e of data.events) {
    if (!e || typeof e.id !== 'string' || !e.id || eventIds.has(e.id) || ![e.title, e.date, e.location, e.notes, e.createdAt].every(x => typeof x === 'string') || !Array.isArray(e.crew) || !Array.isArray(e.equipment) || !Array.isArray(e.payments)) throw new Error('A saved event is damaged.');
    eventIds.add(e.id); validateEvent(e, data.clients);
  }
}
export function removeClient(data: StudioData, id: string): StudioData {
  if (data.events.some(e => e.clientId === id)) throw new Error('This client is linked to an event. Edit or delete the linked events first.');
  if (data.photoGalleries?.some(gallery => gallery.clientId === id)) throw new Error('This client is linked to a photo gallery.');
  return { ...data, clients: data.clients.filter(c => c.id !== id) };
}
export function addPhotoGallery(data: StudioData, gallery: PhotoGallery): StudioData {
  if (!data.clients.some(client => client.id === gallery.clientId)) throw new Error('Choose an existing client.');
  if (!isGoogleDriveLink(gallery.driveLink)) throw new Error('Enter a valid Google Drive link.');
  return { ...data, photoGalleries: [...(data.photoGalleries ?? []), gallery] };
}
export function putEvent(data: StudioData, input: EventInput, id: string, createdAt: string): StudioData {
  validateEvent(input, data.clients);
  const event: StudioEvent = { ...input, id, createdAt };
  return { ...data, events: data.events.some(e => e.id === id) ? data.events.map(e => e.id === id ? event : e) : [...data.events, event] };
}
