# Mersal Media API

Run `npm ci` and `npm run api` from the project root with Node 26.x. The API listens on `http://127.0.0.1:3001/api/v1` and stores data in `backend/data/studio.sqlite`. Override the defaults with `MERSAL_API_HOST`, `MERSAL_API_PORT`, and `MERSAL_API_DB`. The API and Expo run as separate processes.

Atlas accounts share the same studio records. The SQLite development API keeps separate studios. Use a username and a four-digit PIN on Atlas. SQLite development accounts use passwords of 12–128 characters. All routes except health, register, and login require `Authorization: Bearer <token>`. A session expires after seven days and logout revokes the token immediately. The mobile app uses the API when EXPO_PUBLIC_API_URL is configured. Existing device records require a separate import.

| Method | Endpoint under /api/v1 | Purpose |
| --- | --- | --- |
| GET | /health | Check server availability |
| POST | /auth/register | Create a studio and return a session |
| POST | /auth/login | Sign in and return a session |
| POST | /auth/logout | Revoke the current session |
| GET | /studio | Get the studio snapshot and revision |
| GET, PATCH | /profile | Read or update the studio profile |
| GET | /dashboard | Get totals, stage counts, and upcoming shoots |
| GET, POST | /clients | List or create clients |
| GET, PATCH, DELETE | /clients/:id | Read, edit, or delete a client |
| GET, POST | /events | List or create events |
| GET, PATCH, DELETE | /events/:id | Read, edit, or delete an event |
| PATCH | /events/:id/status | Change an event's workflow status |
| POST | /events/:id/payments | Record a payment already received |
| GET | /events/:id/record | Get a plain text event record |
| GET, PATCH | /settings | Read settings or save a theme |
| GET, PUT, DELETE | /settings/home-photo | Read, replace, or remove the Home photo |
| GET, POST | /event-types | List event types or add a custom option |

## Request examples

Register with JSON containing `username`, `password`, and a `profile` with `name`, `studioName`, and optional `phone` and `email`. On Atlas, send `pin` in place of `password` and include `joinCode` when registering. Send `username` and `pin` to sign in on Atlas. Both return `token` and `expiresAt`. Profile updates permit `name`, `studioName`, `phone`, and `email`.

Create an event with `title`, ISO date and time with an offset in `date`, `location`, `type`, and `totalAmount`. Optional fields include `attendees`, `crew`, `equipment`, `notes`, `status`, and `advance`. Link by `clientId` or send a `contact` object with `phone` and, for a new number, `name`. The API matches phone digits, creates new contacts when needed, and saves the client link and event together. Event PATCH accepts individual event fields. Send `clientId: null` to unlink. Linked clients must be unlinked before deletion.

Status updates take `{ "status": "Completed" }`. Valid statuses are Scheduled, Editing, Completed, and Cancelled. Payments take `{ "amount": 1000, "note": "Advance received" }`. The API preserves existing payments when editing an event and rejects overpayments.

Settings PATCH takes `{ "theme": "forest" }`. Event type creation takes `{ "name": "Studio Launch" }`. Send a JPEG, PNG, or WebP file as the raw request body for the photo PUT endpoint with its image content type and bearer token. The limit is 4 MiB. The photo GET endpoint returns the image bytes.

Successful creates return 201. Successful deletes and logout return 204. Errors return JSON with an `error` message and, for invalid fields, optional `fields` details.

## Integration and deployment

Configure the Expo app using the connection steps below. The native app stores session tokens in SecureStore. Plan explicit import and conflict handling for existing device data. The API defaults to loopback for local use. Atlas PIN sign-in admits five attempts per account per 15-minute window. Use the Vercel setup below for HTTPS and persistent Atlas storage. The repository includes one owner account per studio, with no staff roles or password recovery flow.

Run `npm test` to exercise the API over HTTP against a disposable SQLite file. The test verifies private studio data, event/client linking, validation, photos, and persistence after restarting the server.

## Deploy the API to Vercel with MongoDB Atlas

1. In Atlas, create a database user with the built-in `readWrite` role scoped to the app database. Use an Atlas deployment that supports replica-set transactions. Configure Atlas Network Access to allow connections from your Vercel deployment.
2. Import this repository into Vercel. Use the repository root and the Express framework preset. The root `server.ts` is the Express entry point. Node.js 22.x or 24.x can run this entry point. The SQLite development server uses Node 26.x.
3. In Vercel project settings, set `MONGODB_URI` to the Atlas connection string as a server-only environment variable. Set `MONGODB_DB` if your database name differs from `mersal_media`. Use a separate database and credentials for previews if previews are enabled.
4. The existing `aki` account is the owner by default. Set the server-only `MERSAL_OWNER_USERNAME` if you have provisioned a different owner account.
5. Deploy the backend and request `GET /api/v1/health` to initialize the collections and confirm Atlas connectivity.
6. Reload the updated app. Sign in as the owner and use **Settings → Accounts** to create admins and clients. Public registration is disabled on Atlas. Existing non-owner accounts without a stored role have client access.

Atlas stores usernames, four-digit PINs, and roles in `auth`, events in `events`, client records in `clients`, and receipts in `payments` with an `eventId` link. `studio_workspace` stores shared settings and the revision. Owners and admins share studio access. Only the owner can list or create accounts. Clients see Photos, Favourites, and Help. Gallery delivery, selection, and favourites persistence are planned separately. Writes use a transaction and revision check to keep linked records consistent.

The staff Photos tab reads its gallery list from `GET /api/v1/studio`. Staff create a gallery with `POST /api/v1/photo-galleries` using an existing `clientId` and an HTTPS Google Drive `driveLink`. Links are stored in the workspace. Adding a link does not change its permissions in Google Drive.

The existing API returns whole lists and snapshots. On Atlas, each studio's JSON snapshot is capped at 4 MiB to fit Vercel's response limit. The current authentication rate limit is per server instance. If you require a deployment-wide limit, enforce it at the edge or configure a shared rate-limit store.

SQLite files and Expo device data require a separate migration.

## Run the Atlas-backed API locally

Copy `.env.example` to `.env` and set the Atlas connection and server secrets. From the repository root run
`npm run api:atlas`, then request `http://127.0.0.1:3001/api/v1/health`.
Set `MERSAL_API_PORT` to use a different port.

## Connect the Expo app

Set `EXPO_PUBLIC_API_URL=https://YOUR-API.vercel.app/api/v1` in the Expo
project's .env, then restart Expo with `npx expo start --clear`. This public
variable contains only the API URL. Keep `MONGODB_URI` server-side. Sign in
with the studio account that owns the imported events. Native devices store
the session token in SecureStore. Existing PIN-based workspaces remain
available when `EXPO_PUBLIC_API_URL=local`. An unset URL uses the deployed
Mersal Media API. Device records are separate from
the cloud studio and require a separate migration.

For local Android testing with USB debugging, run `npm.cmd run api:atlas`
and `adb reverse tcp:3001 tcp:3001`, then set the Expo URL to
`http://127.0.0.1:3001/api/v1` and restart Expo. With the Android Emulator
use `http://10.0.2.2:3001/api/v1`. Metro's Expo tunnel does not forward the
API port. For a phone without ADB, use a reachable HTTPS API deployment.
