import { mongo, Schema, type Connection } from 'mongoose';
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

const clientFields = {
  inactive: Boolean,
  name: { type: String, required: true, maxlength: 100 },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  notes: { type: String, default: '', maxlength: 2000 },
  createdAt: { type: String, required: true },
} as const;
export const clientSchema = new Schema({ id: { type: String, required: true }, ...clientFields }, nested);

export const paymentSchema = new Schema({
  id: { type: String, required: true },
  amount: { type: Number, required: true, min: Number.MIN_VALUE, max: 1e10 },
  date: { type: String, required: true },
  note: { type: String, required: true, maxlength: 200 },
}, nested);

const eventFields = {
  inactive: Boolean,
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
  notes: { type: String, default: '', maxlength: 3000 },
  createdAt: { type: String, required: true },
};
export const eventSchema = new Schema({ id: { type: String, required: true }, ...eventFields, payments: [paymentSchema] }, nested);

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
}, { ...collection, autoIndex: false, autoCreate: false });
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
  bytes: { type: Buffer, required: true, validate: (bytes: Buffer | InstanceType<typeof mongo.Binary>) => {
    // Mongoose casts update values to BSON Binary before running query validators.
    const size = bytes instanceof mongo.Binary ? bytes.length() : bytes.length;
    return size > 0 && size <= 4 * 1024 * 1024;
  } },
}, collection);

const userSchema = new Schema({
  _id: { type: String, required: true },
  username: { type: String, required: true, match: /^[a-z0-9_.-]{3,40}$/ },
  pin: { type: String, required: true, select: false, match: /^\d{4}$/ },
  name: { type: String, maxlength: 100 },
  role: { type: String, enum: ['admin', 'client'] },
  clientId: String,
  attempts: Number,
  attemptUntil: Number,
  profile: { type: profileSchema, default: null },
}, collection);
userSchema.index({ username: 1 }, { unique: true });

const workspaceSchema = new Schema({
  _id: { type: String, required: true },
  revision: { type: Number, required: true, min: 0 },
  profile: { type: profileSchema, default: null },
  theme: { type: String, enum: [...themeNames, 'pancake'] },
  customEventTypes: { type: [String], default: undefined },
  photoGalleries: { type: [new Schema({
    id: { type: String, required: true },
    clientId: { type: String, required: true },
    driveLink: { type: String, required: true, maxlength: 2048 },
    createdAt: { type: String, required: true },
  }, nested)], default: undefined },
}, collection);

const sharedEventSchema = new Schema({
  _id: { type: String, required: true },
  ...eventFields,
}, collection);
sharedEventSchema.index({ createdAt: -1 });
sharedEventSchema.index({ clientId: 1 });
sharedEventSchema.index({ status: 1, date: 1 });

const sharedClientSchema = new Schema({
  _id: { type: String, required: true },
  ...clientFields,
}, collection);
sharedClientSchema.index({ createdAt: -1 });

const sharedPaymentSchema = new Schema({
  _id: { type: String, required: true },
  eventId: { type: String, required: true },
  ...paymentSchema.obj,
}, collection);
sharedPaymentSchema.index({ eventId: 1, date: 1 });
export function createMongoModels(connection: Connection) {
  return {
    Studio: connection.model('Studio', studioSchema, 'studios'),
    User: connection.model('AuthAccount', userSchema, 'auth'),
    Workspace: connection.model('StudioWorkspace', workspaceSchema, 'studio_workspace'),
    Event: connection.model('SharedEvent', sharedEventSchema, 'events'),
    Client: connection.model('SharedClient', sharedClientSchema, 'clients'),
    Payment: connection.model('SharedPayment', sharedPaymentSchema, 'payments'),
    Session: connection.model('StudioSession', sessionSchema, 'studio_sessions'),
    HomePhoto: connection.model('StudioHomePhoto', homePhotoSchema, 'studio_home_photos'),
  };
}
