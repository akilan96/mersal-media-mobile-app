# Mersal Media

A native Expo/TypeScript photography-studio app implementing the nine supplied Google Stitch screens in one light teal/aqua theme.

The original workspace was empty and the uploaded ZIP contained designs only. After inspection, the user authorized creating this new project. This is a complete standalone app with persistent local records; it is not a verified migration of an unavailable existing app. No existing backend or database was changed, and no API endpoints or preview credentials were invented.

## Run with Expo Go

Extract `deliverables/mersal-media-expo.zip`. Open PowerShell in the extracted folder containing `package.json`:

```powershell
Set-Location 'C:\path\to\extracted-project'
npm ci
npx expo start
```

Use Node.js supported by this Expo release: Node 22.13+ within 22.x, Node 24.3+ within 24.x, Node 26.x, or a later supported major. The development environment used Node 26.13.0. Install an Expo Go version that supports **Expo SDK 58** on your Android phone, connect your phone and computer to the same network, and scan the terminal QR code with Expo Go. Metro must remain running while you use the development app. If Windows asks about a firewall rule, allow your chosen development network so the phone can reach Metro.

No backend, database setup, API key, or `.env` file is required for this local app. `npm ci` installs the exact dependency graph from `package-lock.json`; do not replace the SDK-specific native-package versions with arbitrary latest releases.

### If Expo Go says “Failed to download remote update”

This error occurs while Expo Go downloads the development app. Keep the computer's Expo terminal running and use its current QR code. For LAN, both devices must be on the same reachable Wi-Fi network; a `localhost` or `127.0.0.1` address cannot reach the computer from a phone.

If the phone cannot open the computer's `http://<Wi-Fi-IP>:8081/status` address, use the tunnel preview. Stop any previous mobile tunnel with Ctrl+C, then run:

```powershell
npm run start:mobile
```

Scan the new QR code with Expo Go. The command uses Expo CLI's supported **ngrok** provider, with its helper installed locally as a development dependency. Plain `--tunnel` on this SDK uses an Expo-account-based provider and may request `npx expo login`; the explicit `--tunnel ngrok` command selects the fallback used here.

The tunnel carries the development manifest and JavaScript bundle through ngrok at a temporary public address. Use it only while sharing that development source is acceptable, and stop it with Ctrl+C when finished. Keep the server running while viewing the app; the tunnel URL is not a hosted production deployment. Device-local studio records are not part of the JavaScript bundle. This command does not change Windows firewall settings or app storage.

For an ordinary LAN preview, use `npm run start:lan`. If the server is reachable but Expo Go reports an SDK mismatch, install Expo Go supporting SDK 58 from the official Expo site.

Android is the main delivery target. iOS source is included, but native device behavior still needs verification on an iPhone. The optional web tooling supports layout and interaction previews: it stores the PIN verifier in browser-local storage, while native Expo Go uses OS SecureStore. Browser preview behavior does not certify native device behavior. To open a browser preview, use `npm run web`.

## First use

1. Tap **Get Started** and create your local studio profile. Choose a username using 3–40 letters, numbers, dots, dashes, or underscores and a four-digit PIN. There is no built-in username or default PIN.
2. Add actual clients on **Clients**. Open a client to edit contact details, view linked events, or use the device's calling/email apps where contact information is available.
3. Create an event from **Home** or **Events**. Enter date/time, venue, total, optional advance, client, crew names, equipment, and notes. Add crew/equipment entries before saving.
4. Open **Event Details** to edit the event, record money already received, change the shoot stage, or save/share an event record. Payments are bookkeeping records; this app does not collect money.
5. Edit your profile or change the PIN in **Settings**. **Lock Studio** keeps records saved and returns to PIN entry.

Every event and client list starts empty. Dashboard totals, upcoming shoots, payment status, received amounts, and balances are calculated from your records. Stitch's example people, dates, monetary values, dashboard counts, and `studio / 1234` preview hint are not seeded as real data.

## Included screens and source

| Screen | Source |
| --- | --- |
| Home Dashboard | `src/screens/HomeScreen.tsx` |
| Welcome / Splash | `src/screens/WelcomeScreen.tsx` |
| Login and first-time setup | `src/screens/LoginScreen.tsx` |
| Events Listing | `src/screens/EventsScreen.tsx` |
| Create / Edit Event | `src/screens/CreateEventScreen.tsx` |
| Event Details | `src/screens/EventDetailsScreen.tsx` |
| Clients | `src/screens/ClientsScreen.tsx` |
| Photos / Coming Soon | `src/screens/PhotosScreen.tsx` |
| Settings / Profile | `src/screens/SettingsScreen.tsx` |

Navigation uses **React Navigation 7**: a native root stack and five bottom tabs. There was no existing navigator to detect or preserve. `src/navigation/AppNavigator.tsx` owns both, including auth-dependent route groups and the reusable native bottom bar. `App.tsx` provides startup loading, preserved-data storage errors, a retry path, and an error boundary.

`src/components/ui.tsx` contains reusable screen shells, cards, buttons, inputs, headers, badges, chips, empty/error states, branding, and camera artwork. `src/theme.ts` defines the shared light palette and typography. Safe-area padding, vertical scrolling, keyboard handling, native date/time selection, disabled/loading actions, and field validation are implemented with React Native components. Native screens do not use HTML, CSS files, or WebViews.

The supplied Settings image showed a dark-mode toggle. The implementation uses **Appearance: Light** to follow the user's explicit requirement for a consistent light theme. Photos intentionally displays the requested Coming Soon design; no fake upload or notification action is shown. No notification service was supplied, so the design's fabricated badge is replaced with truthful local-app status rather than a nonfunctional bell.

## Local storage and PIN

Studio profile, clients, events, crew/equipment names, and payment histories persist using AsyncStorage through `src/services/repository.ts`. Mutations are saved before the shared UI state is updated, and invalid/corrupt saved data is reported without silently replacing it with empty data.

The PIN is a **device lock**, not a server account. A random salt and SHA-256 digest are stored with Expo SecureStore on native devices; the plaintext PIN is not stored. Browser previews use browser-local storage for the verifier instead of OS SecureStore. Five failed PIN attempts trigger a 60-second cooldown. Returning after more than 60 seconds in the background locks the studio. Settings can change the PIN after checking the current one.

The PIN does **not** encrypt the business records in AsyncStorage. There is no server-backed PIN recovery or cloud backup/sync. Keep your PIN and retain any exported records you need. Clearing app data or uninstalling Expo Go/the app can erase local records; secure credential persistence can differ by platform. Reinstallation is not a guaranteed recovery method.

## Event records

**Share Event Details** opens the native text share sheet with the actual selected event. **Save / Share Record** writes a `.txt` event record and opens the native file share sheet so you can choose an available save/share destination. The record includes event details, linked client, crew/equipment, amounts, payment history, and notes. It is a readable event export, not a complete restorable studio backup or PDF invoice.

Client deletion is blocked while events reference that client. Event deletion requires confirmation and removes that event's payment records. Payment entries must be positive, use no more than two decimal places, and must not exceed the remaining balance. Crew names are local labels; the app does not pretend to look up real team accounts. Equipment names can include a quantity in their label.

## Dependencies

The project uses Expo **58.0.26**, React Native **0.88.1**, React **19.3.0**, TypeScript **6.0.3**, and React Navigation **7**. Required native capabilities are installed and locked in `package.json`/`package-lock.json`:

- Navigation: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `react-native-screens`, and `react-native-safe-area-context`.
- Interface: `expo-linear-gradient`, `expo-status-bar`, `expo-splash-screen`, `@expo/vector-icons`, `expo-font`, `expo-constants`, and `@react-native-community/datetimepicker`.
- Persistence/PIN: `@react-native-async-storage/async-storage`, `expo-secure-store`, and `expo-crypto`.
- Native event export: `expo-file-system` and `expo-sharing`.

The lockfile also includes the Metro/web companion packages. No additional runtime dependency installation command is needed after `npm ci`.

## Artwork and design references

The app reuses actual artwork extracted from the original supplied high-resolution PNG references. `assets/design/` contains illustration-only welcome, login, and photos images, the dashboard camera vignette, and the original camera logo tile. Interactive text, forms, cards, buttons, and navigation remain native elements.

`assets/design/manifest.json` documents exact source filenames, crop bounds, dimensions, and SHA-256 hashes. `remote-source-manifest.json` preserves the original HTML image URL records. Those remote URLs returned complete lower-resolution mockups, so they are not used as full-screen runtime UI.

`DESIGN_AUDIT.md` maps all nine reference screens, identifies Settings as a raster-only reference, and distinguishes design samples from app behavior. `scripts/extract-local-artwork.py` reproduces the crops with Python/Pillow when the original extracted `design-reference/stitch_mersal_media_app_redesign/` directory is available. Artwork extraction is a development-only step; the resulting PNGs are already packaged, and Python is not required to run the app.

## Checks and packaging

Run these commands from the project root:

```powershell
npm run typecheck
npm test
npm run export:android
npm run package
```

The package script creates `deliverables/mersal-media-expo.zip` with source, locked dependencies, configuration, local artwork, and documentation. Install dependencies after extracting; `node_modules` is not included. The Android export command verifies production bundling and is not an APK or physical-device test.

TypeScript, domain tests, and bundle/export checks are the automated verification paths. Before relying on the app, run the manual device checks described in `INTEGRATION.md`; physical Android/iOS behavior has not been certified by the source build alone.

## Future backend integration

See `INTEGRATION.md` for the repository/state boundary, data contracts, source integration plan, and remaining backend requirements. No cloud sync, remote authentication, actual team-directory lookup, online PIN recovery, media upload/gallery backend, or payment processor is included. These need the real API contract and infrastructure rather than invented endpoints.

## Express API

Run `npm run api` to start the local Express API. See [the API endpoint list and setup guide](backend/README.md).
