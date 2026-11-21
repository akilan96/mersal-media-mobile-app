import { Schema, type Connection } from 'mongoose';
import { themeNames } from '../src/domain/types';

const nested = { _id: false, id: false } as const;
const collection = { versionKey: false, id: false } as const;

export const profileSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  studioName: { type: String, required: true, maxlength: 100 },
  username: { type: String, required: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
}, nested);

export const clientSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 100 },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  notes: { type: String, default: '', maxlength: 2000 },
  createdAt: { type: String, required: true },
}, nested);

export const paymentSchema = new Schema({
  id: { type: String, required: true },
  amount: { type: Number, required: true, min: Number.MIN_VALUE, max: 1e10 },
  date: { type: String, required: true },
  note: { type: String, required: true, maxlength: 200 },
}, nested);

export const eventSchema = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true, maxlength: 180 },
  date: { type: String, required: true },
  location: { type: String, required: true, maxlength: 250 },
  attendees: { type: Number, required: true, min: 0, max: 99_999_999, validate: Number.isInteger },
  type: { type: String, required: true, maxlength: 60 },
  status: { type: String, required: true, enum: ['Scheduled', 'Editing', 'Completed', 'Cancelled'] },
  clientId: String,
  crew: [String],
  equipment: [String],
  totalAmount: { type: Number, required: true, min: 0, max: 1e10 },
  payments: [paymentSchema],
  notes: { type: String, default: '', maxlength: 3000 },
  createdAt: { type: String, required: true },
}, nested);

const studioDataSchema = new Schema({
  version: { type: Number, required: true, enum: [1] },
  profile: { type: profileSchema, default: null },
  events: [eventSchema],
  clients: [clientSchema],
  theme: { type: String, enum: [...themeNames, 'pancake'] },
  customEventTypes: { type: [String], default: undefined },
}, nested);

const studioSchema = new Schema({
  _id: { type: String, required: true },
  username: { type: String, required: true, match: /^[a-z0-9_.-]{3,40}$/ },
  salt: { type: String, required: true, select: false, match: /^[a-f0-9]{32}$/ },
  passwordHash: { type: String, required: true, select: false, match: /^[a-f0-9]{128}$/ },
  revision: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
  data: { type: studioDataSchema, required: true },
}, collection);
studioSchema.index({ username: 1 }, { unique: true });

const sessionSchema = new Schema({
  _id: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  studioId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, collection);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const homePhotoSchema = new Schema({
  _id: { type: String, required: true },
  contentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
  bytes: { type: Buffer, required: true, validate: (bytes: Buffer) => bytes.length > 0 && bytes.length <= 4 * 1024 * 1024 },
}, collection);

export function createMongoModels(connection: Connection) {
  return {
    Studio: connection.model('Studio', studioSchema, 'studios'),
    Session: connection.model('StudioSession', sessionSchema, 'studio_sessions'),
    HomePhoto: connection.model('StudioHomePhoto', homePhotoSchema, 'studio_home_photos'),
  };
}
