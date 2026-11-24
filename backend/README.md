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

Atlas stores usernames, four-digit PINs, and roles in `auth`, events in `events`, client records in `clients`, and receipts in `payments` with an `eventId` link. `studio_workspace` stores shared settings and the revision. Owners and admins share studio access. Only the owner can list or create accounts. Clients see Home, Photos, Favourites, and Settings. Studio data writes use a transaction and revision check to keep linked records consistent.

The staff Photos tab reads its gallery list from `GET /api/v1/studio`. Staff create a gallery with `POST /api/v1/photo-galleries` using an existing `clientId` and an HTTPS Google Drive `driveLink`. Links are stored in the workspace. Adding a link does not change its permissions in Google Drive.

### Client Drive galleries

In **Settings → Accounts** choose **Link client** for the client login and select the same client record used for the gallery in the staff Photos tab. The client Photos tab lists only galleries for that linked record. The client API resolves the record from the signed-in session, and checks the link again on photo and thumbnail requests.

The app lists supported image files directly inside each gallery folder and its selection subfolders. Home counts each photo once. The preview API tries the Drive thumbnail first and can serve the original if it fits within the preview size limit. **Open in Google Drive** uses the folder's existing sharing permissions.

Selections move into `Client_Choosen` within the linked gallery. The first like reuses the existing `Client_Choosen`, renames a legacy `Favourites` folder when possible, or creates the folder if Drive allows it. If Drive denies folder creation or rename, the gallery owner can create `Client_Choosen` manually. The service account needs permission to move photos. Selections in a legacy folder remain visible, and removing a selection moves it back to the gallery. Use a separate gallery folder for each client.

#### Keyless setup on Vercel

1. In Google Cloud, enable the Drive API, IAM API, IAM Service Account Credentials API, and Security Token Service API. Keep the existing service account. Share each linked My Drive gallery with the service account's email as **Editor** for photo moves, or **Viewer** for previews only. For a shared drive, use **Content manager** or a role with equivalent move permissions. Verify access to the original photo and the `Client_Choosen` destination if either has separate permissions.
2. Follow [Vercel's Google Cloud OIDC guide](https://vercel.com/docs/oidc/gcp) to create a workload identity pool and OpenID Connect provider. For Vercel's **Team** issuer mode, use its team issuer (`https://oidc.vercel.com/<team-slug>`) and choose **Allowed audiences** with `https://vercel.com/<team-slug>`. Set `google.subject` to `assertion.sub` and restrict the attribute condition to `assertion.sub == 'owner:<team-slug>:project:<project-name>:environment:production'`.
3. On the service account's **Permissions** tab, grant **Workload Identity User** to `principal://iam.googleapis.com/projects/<project-number>/locations/global/workloadIdentityPools/<pool-id>/subject/owner:<team-slug>:project:<project-name>:environment:production`. Use the Google Cloud **project number** that owns the identity pool. There is no need to grant the service account a project-wide IAM role for Drive folder access.
4. In Vercel **Production** environment variables set `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`, and `GCP_SERVICE_ACCOUNT_EMAIL` to the exact Google Cloud values. Deploy the updated backend. Vercel exchanges its runtime OIDC token for a short-lived Drive token with read and write scope. Drive sharing permissions determine which items the service account can change.

If an existing deployment already uses a service-account key, it can continue using `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`. The keyless configuration takes precedence when all four OIDC variables are present.

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
