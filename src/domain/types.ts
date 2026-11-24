import { daisyThemes } from '../daisyThemes';
export type EventStatus = 'Scheduled' | 'Editing' | 'Completed' | 'Cancelled';
export type AccountRole = 'owner' | 'admin' | 'client';
export type ManagedAccount = { username: string; name: string; role: Exclude<AccountRole, 'owner'>; clientId?: string };
export type ClientPaymentSummary = { total: number; pending: number };
export type EventType = string;
export const defaultEventTypes = ['Marriage', 'Reception', 'Birthday Party', 'Corporate Event', 'Baby Shower', 'Portraits', 'Other'];
export type ThemeName = keyof typeof daisyThemes | 'pancake';
export const themeNames = ['light', 'dark', ...Object.keys(daisyThemes).filter(name => name !== 'light' && name !== 'dark')] as (keyof typeof daisyThemes)[];
export interface Payment { id: string; amount: number; date: string; note: string }
export interface StudioEvent {
  id: string; title: string; date: string; location: string; attendees: number;
  type: EventType; status: EventStatus; clientId?: string; crew: string[];
  equipment: string[]; totalAmount: number; payments: Payment[]; notes: string; createdAt: string;
  inactive?: boolean;
}
export interface Client { id: string; name: string; phone: string; email: string; notes: string; createdAt: string; inactive?: boolean }
export interface Profile { name: string; studioName: string; username: string; phone: string; email: string }
export interface PhotoGallery { id: string; clientId: string; driveLink: string; createdAt: string }
export const maxGalleryLinksPerCreate = 10;
export type ClientGallery = Pick<PhotoGallery, 'id' | 'driveLink' | 'createdAt'>;
export type ClientGalleryList = { galleries: ClientGallery[]; previewsEnabled: boolean };
export type DrivePhoto = { id: string; name: string; hasThumbnail: boolean };
export type DrivePhotoPage = { photos: DrivePhoto[]; nextPageToken?: string };
export type ClientPhotoSummary = { total: number; selected: number };
export const drivePhotoPageSize = 6;
export interface StudioData { version: 1; profile: Profile | null; events: StudioEvent[]; clients: Client[]; theme?: ThemeName; homePhoto?: string; customEventTypes?: string[]; photoGalleries?: PhotoGallery[] }
export type EventInput = Omit<StudioEvent, 'id' | 'createdAt' | 'inactive'>;
export type ClientInput = Omit<Client, 'id' | 'createdAt' | 'inactive'>;
export type EventListFilter = 'all' | 'total' | 'upcoming' | 'completed' | 'editing';
export type MainTabParamList = { Home: undefined; Events: { filter: EventListFilter; openedAt?: number } | undefined; Photos: undefined; Clients: undefined; Settings: undefined };
export type RootStackParamList = {
  Accounts: undefined;
  Payments: undefined;
  Welcome: undefined; Login: undefined; Main: undefined;
  CreateEvent: { eventId?: string } | undefined; EventDetails: { eventId: string };
};
