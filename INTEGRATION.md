# Integration and validation notes

## Delivery scope

This is newly authorized source for the initially empty workspace. The uploaded ZIP provided Stitch HTML and PNG designs, not a previous React Native application. The implementation therefore establishes a new **Expo SDK 58 + TypeScript + React Navigation 7** project with working local features. It cannot demonstrate preservation of unseen API calls, authentication, forms, navigation, state, or business rules from an earlier project.

The native design conversion covers all nine requested screens. Existing backend/database services were not accessed or modified. All user records begin empty and persist on the current device. The app contains no mock-data login, hardcoded preview account, fabricated network request, or successful-looking button for an unimplemented remote operation.

## Project boundaries

| Responsibility | File(s) |
| --- | --- |
| Expo entry and application providers | `index.ts`, `App.tsx`, `app.json` |
| Native stack, auth routing, five tabs, bottom navigation | `src/navigation/AppNavigator.tsx` |
| Shared native UI and fixed light theme | `src/components/ui.tsx`, `src/theme.ts` |
| Data and route contracts | `src/domain/types.ts` |
| Form/data integrity validation | `src/domain/validation.ts` |
| Dates, metrics, payments, balances, export text | `src/domain/helpers.ts` |
| Read/write persistence adapter | `src/services/repository.ts` |
| Device PIN digest, SecureStore, attempt cooldown | `src/services/credentials.ts` |
| Shared state, startup/auth state, serialized mutations | `src/state/StudioProvider.tsx` |
| Complete native screens | `src/screens/` — see the nine-screen map in `README.md` |
| Extracted original artwork and provenance | `assets/design/` |
| Reference inventory and design/data decisions | `DESIGN_AUDIT.md` |
| Reproducible artwork crops | `scripts/extract-local-artwork.py` |
| Source ZIP packaging | `scripts/package.ps1` |

React Navigation's root stack has Welcome, Login, Main, CreateEvent, and EventDetails destinations. Main contains Home, Events, Photos, Clients, and Settings tabs. CreateEvent accepts an optional event ID for editing; EventDetails requires its event ID. Authentication changes reset the route group so a locked user cannot return to the studio through the back button.

## Local behavior and data contracts

`StudioData` is versioned (`version: 1`) and stores one profile, a client array, and an event array. Profile contains name, studio name, username, optional phone, and optional email. Clients contain their own stable ID, contact details, notes, and creation timestamp. Events link to clients by `clientId`; client deletion is rejected while references remain.

An event includes an ID, title, ISO date/time string, location, nonnegative whole-number attendee count, event type, workflow status, optional client ID, crew-name array, equipment-label array, total amount, payment history, notes, and creation timestamp. Workflow states are Scheduled, Editing, Completed, and Cancelled. Supported event types are declared in `src/domain/types.ts` rather than derived from display text.

Each payment has its own ID, positive amount, ISO date/time, and note. Received amount is the sum of payment records; remaining balance and Pending/Partially Paid/Paid labels are calculated from total and received amounts. The UI does not let a manually selected payment badge contradict the actual payment history. Overpayment and amounts with more than two decimals are rejected. Currency displays as INR, and date/time displays use the device's local timezone with `en-IN` formatting.

Home's Total Shoots excludes cancelled events. Upcoming counts future Scheduled events. Completed and Pending Edits use the Completed and Editing states respectively. Events can be sorted by date, name, or amount and searched. Clients can be searched across contact data and linked event titles, sorted, filtered, edited, and associated with events. Crew entries are descriptive labels on the current device, not verified remote staff identities. Equipment entries are labels; a quantity can be included in the name.

The repository currently exposes `load(): Promise<StudioData>` and `save(data): Promise<void>`. It validates data before accepting it and reports damaged or unsupported saved records without clearing them. `StudioProvider` serializes writes and updates visible state only after a successful save. Startup read failures show a retry state; forms preserve their inputs on failure.

## Connecting a real backend later

First supply the actual previous app or API documentation. Inspect its navigator, route parameters, SDK, lockfile, auth/token handling, request layer, form library, query/state store, and existing business rules before merging the UI. If that app uses Expo Router, retain its file routes and mount/adapt these screen components there. If it uses React Navigation, preserve its configured navigation structure. Do not replace a functioning earlier navigator simply because this standalone delivery uses React Navigation.

Use `src/services/repository.ts` as the current persistence boundary and `StudioProvider` as the screen-facing state boundary. An API-backed implementation must translate server records into the documented domain shapes and return real failures. A multi-user backend will usually need granular event/client/profile/payment operations, server-generated identifiers, pagination, cancellation, conflict handling, and a real query cache rather than blindly uploading the entire local snapshot. Expand the repository contract to match the actual service; retain the native screen callbacks and loading/error behavior.

Map server enums, date/time conventions, currency precision, optional values, staff IDs, equipment/quantity models, payment/receipt identities, and permissions explicitly. Server validation remains authoritative. Do not infer backend schema from the sample HTML, its fake counts, the PNG's names, or the financially inconsistent Event Details example. A local data migration/import should be deliberate and validated; there is no implicit sync to an unknown database.

Real account authentication requires documented login, refresh, logout, expiry/revocation, user-profile, PIN-change/reset, and account-recovery flows. Replace the device-unlock flow with those actual calls and store sensitive tokens in SecureStore according to the service contract. A locally hashed PIN is not a server identity or permission check. Derive access and role rules from the real backend and handle unauthorized/expired sessions through the existing auth route boundary. Never add a default `studio / 1234` account or invented API URL.

Runtime API configuration should be introduced only when an API exists, with a committed `.env.example` containing names and nonsecret examples. Expo public variables are visible in the client bundle and cannot hold service credentials. Keep privileged database/service secrets server-side. No environment configuration is required for the current offline app.

## Backend-dependent features not supplied

| Capability | Current truthful behavior | Needed for remote implementation |
| --- | --- | --- |
| Account login/recovery | Local username and four-digit device PIN; help explains recovery limits | Real identity endpoints, token lifecycle, recovery policy |
| Cloud backup or sync | Records persist on the current device | Authenticated data API, ownership, migration/conflict and backup rules |
| Team directory/assignment | User-entered crew labels saved on an event | Staff directory, stable staff IDs, assignment permissions and endpoints |
| Notifications | No fake notification badge/service | Notification source, routing behavior, permissions and push infrastructure |
| Photos | Requested native Coming Soon screen | Media storage/upload/gallery API, access rules and product workflows |
| Online payments | Actual local payment bookkeeping | Payment-provider integration and verified backend confirmation/receipts |
| Record download | Actual `.txt` event file through native save/share options | A supplied document format or report endpoint if PDF/invoices are required |

The user's consistent light-mode requirement takes precedence over the dark-mode toggle pictured in the Settings raster. The app's Appearance row reports Light and does not imply that an unimplemented theme toggle works.

## Device lock and storage limits

On native devices, SecureStore contains a random salt and SHA-256 PIN digest, plus failed-attempt state. Browser previews store that verifier and attempt state in browser-local storage instead of OS SecureStore. A PIN has exactly four digits. Five failed PIN checks trigger a 60-second cooldown, and returning after more than a minute in the background locks the app. Profile/event/client/payment records live in AsyncStorage, which this PIN does not encrypt. This is a local convenience lock, not a substitute for server authorization or an encrypted business database. Optional `npm run web` previews support layout/interaction checks; Expo Go remains the delivery target.

There is no guaranteed forgotten-PIN recovery or restorable full-studio backup. Clearing storage or uninstalling can erase records, while secure credentials can persist differently across platforms. Keep the PIN and export important event records before clearing the application. Event text exports are readable records rather than a complete import/restore format.

## Install, verify, and package

In PowerShell, use the extracted directory containing `package.json`:

```powershell
Set-Location 'C:\path\to\extracted-project'
npm ci
npm run typecheck
npm test
npm run export:android
npx expo start
```

The locked stack is Expo 58.0.26, React Native 0.88.1, React 19.3.0, TypeScript 6.0.3, and React Navigation 7. Use Node supported by the installed Expo package and an Expo Go build supporting SDK 58. The native modules and matching versions are already in `package.json` and `package-lock.json`. No manual dependency substitution or backend setup is needed.

Mobile connection troubleshooting: `npm run start:lan` explicitly starts Expo Go over LAN with a cleared Metro cache. If the phone cannot reach the computer's LAN `/status` endpoint, `npm run start:mobile` uses the supported ngrok tunnel provider on port 8082. `@expo/ngrok` is a project-local development dependency. The user approved temporary public tunnel exposure for this support session; future tunnel use exposes development source through a temporary public URL as explained in README.md. Stop the tunnel with Ctrl+C when finished. This changes the development connection only and does not change authentication, storage, or business logic.

The automated commands check type consistency, domain behavior, and Android production bundling. They do not prove an APK install, physical-phone interactions, OS share destinations, or iOS behavior. Source generation must not be described as physical-device certification. Check the actual command results supplied with the delivery; this document does not assert that unexecuted device tests passed.

Before production use, exercise this sequence on a real Android phone:

1. Confirm first launch shows Welcome and empty setup; validate required fields and PIN confirmation, then create a real local profile.
2. Add/edit a client; verify contact actions with the available device apps; create an event linked to that client with crew/equipment and an advance.
3. Check all five tabs, event sorting/search, client filtering/search, Home metrics, details, dates/times, and rupee amounts against the entered records.
4. Record another payment; reject invalid/overpaid values; edit total without losing history; update Editing/Completed and verify metrics change.
5. Open native text and file share sheets, cancel safely, and save/share an actual record with a real target app.
6. Try deletion cancellation, linked-client protection, confirmed event deletion, and an empty search result.
7. Edit profile, change PIN, lock/reopen, check cooldown after failed PINs, and return after more than 60 seconds in the background.
8. Restart Expo Go and confirm records persist; check small displays, Android safe areas/gesture navigation, large text, numeric keyboard, date/time pickers, scrolling, and form modals with the keyboard open.

Repeat relevant checks on an iPhone before claiming iOS verification. Validate that native share/save destinations depend on installed apps and OS capabilities. Photos should remain a clear Coming Soon screen with working navigation and no fake upload action.

Create a fresh distributable from the project root:

```powershell
npm run package
```

The output is `deliverables/mersal-media-expo.zip`. It contains complete source, configuration, lockfile, extracted runtime artwork, provenance, and integration docs; reinstall dependencies with `npm ci` after extraction. It is source for Expo Go, not an APK/AAB. Original HTML/complete mockups are design references, not runtime screen implementations. Reproducing image crops requires the original design ZIP extracted at the documented reference path and Python/Pillow; running the app does not.
