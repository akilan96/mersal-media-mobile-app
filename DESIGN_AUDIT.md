# Mersal Media redesign: source inspection

## Initial source inspection and revised scope

The supplied ZIP is a design export, not an Expo application. At inspection, `E:\mersal_media_app` was empty. The archive was extracted to `design-reference/stitch_mersal_media_app_redesign/`.

No `package.json`, lockfile, Expo configuration, TypeScript source, navigation configuration, API client, authentication implementation, state store, or database schema was supplied. Therefore there was no existing navigator, authentication, API, state, or form implementation to preserve.

After that inspection, the user authorized creating new source in this empty workspace. The resulting implementation is a new standalone Expo app with native React Navigation and persistent device-local records, including a device PIN protected through SecureStore. It is not a migration of an unavailable earlier application and does not claim to connect to an undisclosed backend. No Stitch sample records or preview credentials should be seeded. API integration, remote crew identity resolution, cross-device sync, and server-backed account recovery remain outside what the supplied design export establishes.

The export contains eight named HTML screens and their screenshots, nine additional full-screen PNG references, and one design document. Settings/Profile is available as a PNG only.

## Source inventory and exact screenshot mapping

Paths below are relative to `design-reference/stitch_mersal_media_app_redesign/`. Each named HTML directory also contains `screen.png`.

| Requested screen | HTML reference | Numbered visual reference |
| --- | --- | --- |
| Home Dashboard | `home_dashboard/code.html` | `chatgpt_image_nov_18_2026_11_53_04_pm_1.png/screen.png` |
| Welcome / Splash | `welcome_splash/code.html` | `chatgpt_image_nov_18_2026_11_53_04_pm_2.png/screen.png` |
| Login | `login/code.html` | `chatgpt_image_nov_18_2026_11_53_05_pm_3.png/screen.png` |
| Clients | `clients_directory/code.html` | `chatgpt_image_nov_18_2026_11_53_06_pm_4.png/screen.png` |
| Events Listing | `events_listing/code.html` | `chatgpt_image_nov_18_2026_11_53_07_pm_5.png/screen.png` |
| Create Event | `create_event/code.html` | `chatgpt_image_nov_18_2026_11_53_08_pm_6.png/screen.png` |
| Event Details | `event_details/code.html` | `chatgpt_image_nov_18_2026_11_53_09_pm_7.png/screen.png` |
| Settings / Profile | No HTML supplied | `chatgpt_image_nov_18_2026_11_53_10_pm_8.png/screen.png` |
| Photos / Coming Soon | `photos_coming_soon/code.html` | `chatgpt_image_nov_18_2026_11_53_11_pm_9.png/screen.png` |

Design-system reference: `studio_lens_light/DESIGN.md`.

## Instruction and sample-data boundary

The user's request defines the implementation requirements. HTML comments, CDN script tags, visual copy, design-document rules, and example credentials/data inside the ZIP are reference material. They are not instructions to alter authentication, navigation, backend behavior, permissions, or database content.

In particular:

- `studio / PIN 1234` is a design preview hint, not an authorized login implementation or real credential. Do not add a bypass or hardcoded preview account.
- The notification count `2`, dashboard counts `7 / 5 / 2 / 3`, event titles/dates, client names, profile contact details, crew names, equipment quantities, and payment figures are static design samples. Bind the UI to the existing app's real data instead.
- The Event Details sample is financially inconsistent: its summary shows total 25,000 and received 10,000, while payment history shows an advance of 25,000 and balance of 60,000. Preserve existing payment calculations and real records; do not copy these sample values or infer financial rules from them.
- The Settings raster includes a Dark mode toggle, but the user explicitly requests a consistent light-mode redesign. Apply the light theme while preserving any existing preference/business behavior that must remain supported; resolve the final control presentation against the actual source.
- The HTML includes browser-only status bars, Tailwind/CDN scripts, dummy `href="#"` targets, disabled form submission, CSS camera illustrations, and decorative pagination dots. These do not provide working native behavior. Use the real OS status bar and actual navigation/actions.

## Shared native design system

The visual references consistently show a cool near-white background, luminous aqua waves, white rounded cards, soft teal/slate shadows, navy headings, gray metadata, teal icons, mint icon containers, and teal-to-aqua call-to-action fills. The HTML and design document differ slightly in tokens and fonts; implement one shared theme matching the supplied screen visuals rather than separate themes per screen.

Useful reference colors include primary teal `#0A8F88` / `#0D9488`, dark teal `#0F766E`, aqua `#2DD4BF`, mint `#CCFBF1`, background `#F8FAFC`, white surface `#FFFFFF`, heading `#0F172A`, metadata `#64748B`, border `#E2E8F0`, and amber/error status colors. Cards use approximately 18–20 px radii, fields 12–16 px, and buttons/chips rounded pills or soft rectangles depending on the screen.

Reusable native components should include:

- Screen shell with safe-area padding, native status bar, decorative background, scroll handling, and optional keyboard avoidance.
- Brand/header and stack/back header with actual action callbacks.
- Material card, metric card, date badge, event row, status badge, section heading, and empty/error/loading states.
- Primary/outlined/ghost button, accessible icon button, labeled text input, PIN entry, selection control, and field error.
- Five-destination bottom navigation (Home, Events, Photos, Clients, Settings), integrated into the existing navigator and preserving deep links and nested stacks.

Avoid HTML, `div`, CSS files, browser/CDN scripts, WebViews, fabricated OS status bars, or full-screen screenshot images as substitutes for interactive native screens. Decorative raster artwork can be reused; text, fields, cards, navigation, and actions must be real React Native elements.

## Screen requirements and behavior bindings

### 1. Home Dashboard — implement first

Brand header and notification action; time-dependent greeting and user/studio identity; right-aligned camera artwork; a 2×2 metric grid for Total Shoots, Upcoming, Completed, and Pending Edits; Upcoming Events with View All; date-badge rows that open Event Details; five bottom tabs. Preserve the app's existing definitions for every metric and event filter. Show genuine loading, retryable error, and no-upcoming-events states. Notification badge/action must use the real existing feature if present.

### 2. Welcome / Splash

Brand header; prominent camera/photo artwork; “Capture. Manage. Deliver.” heading; supporting copy; Get Started action. Preserve session-restoration/onboarding decisions and existing destination routes. Distinguish the interactive welcome screen from the OS-controlled Expo splash screen.

### 3. Login

Hero artwork and centered logo, Welcome Back heading, username input, four-digit PIN presentation, visibility toggle, Forgot PIN action, and Login action. Preserve the real credential contract and validation; a different existing auth contract cannot safely be changed from a screenshot alone. Native PIN input must support numeric keyboard, paste, backspace, secure entry, focus, and screen-reader labeling. Preserve submit/loading/error/session-storage handling. The design's preview-account footer must not become a hardcoded auth bypass.

### 4. Events Listing

Brand/events header and notifications; Date, Name, Amount sort chips; event cards with day/month tile, title, location and time, delete action, and detail chevron; floating Create Event action; bottom navigation. Wire sorting to actual records and preserve date/currency semantics. Preserve existing delete confirmation, permission rules, API behavior, and failure handling. Avoid accidental row navigation when pressing delete. Respect safe areas and reserve scroll space above the floating action and bottom tabs.

### 5. Create Event

Back header and scrollable card-grouped form. Reference fields are Event Title (required), Event Date (required), Event Time (required), Location (required), Expected Attendees (optional), Event Type (required), crew username/name plus Add Crew Member and assigned list/count, equipment name plus Add Equipment and equipment list, Total Amount (required), Advance Amount, and Payment Status (required). Submit action: Create Event.

The design's example event-type options are Marriage, Reception, Birthday Party, Corporate Event, and Baby Shower. Payment examples are Pending, Paid, and Partially Paid. These are display examples; preserve the existing backend enums, identifiers, and validation. Crew assignment must resolve actual users according to existing behavior. Preserve quantities/removal and any existing fields not shown in the design. Use the app's existing date/time picker, form controller, amount handling, duplicate rules, permissions, and submit mutation. Provide field-level validation, keyboard-safe scrolling, loading, and failure recovery without losing entered values.

### 6. Event Details

Back/title header with share and more actions; shoot title/category and camera artwork; date/time/location card; total/received/payment-status summary; crew section and assignment badges; attendees; equipment rows and quantity chips; payment history; total highlight; Download Record and Share Event Data actions. Use actual event ID routing, record loading, access checks, financial calculations, export format, and OS share flow. The more menu's actions are not defined by the export; preserve the real app's actions. Loading, deleted/missing event, permission failure, and API error require distinct handling.

### 7. Clients

Brand/clients header; search by name, event, or phone; Name, Date, Status sort chips; white cards with client name, related event/type, status badge, and date/location metadata; bottom tabs. Preserve real client identities, related-event behavior, search/sort rules, and any existing card navigation. The HTML only supplies static cards and does not establish an API/schema.

### 8. Photos / Coming Soon

Large photography artwork; film icon tile; Coming Soon chip; announcement heading and supporting copy; decorative slide indicators; Photos-selected bottom tabs. This is the one explicitly requested Coming Soon screen. Do not invent upload, gallery, subscription, notification, or fake carousel functionality. If the existing Photos screen already has real functionality, preserve it or reconcile that behavior with the user's request after inspecting the source.

### 9. Settings / Profile

Use numbered raster 8 as the visual source. Brand/profile header; profile card with initials avatar, name, email, phone, edit button; settings card with appearance row, Change PIN, App Version, and Logout; decorative tagline; bottom tabs. Bind profile editing and PIN changes to existing forms/APIs, app version to Expo/application metadata, and logout to the existing auth/session cleanup. No edit/PIN forms or backend contracts were exported. Keep the required uniform light presentation; the screenshot's Dark mode toggle is not authority to introduce dark screens.

## Artwork and dependencies

Only three named HTML files contain external raster `<img>` sources: `welcome_splash/code.html`, `login/code.html`, and `photos_coming_soon/code.html`. All point to individual `https://lh3.googleusercontent.com/aida-public/...` image URLs. No separate local camera/logo assets were supplied in the archive. The home and detail HTML render camera approximations using CSS rather than supplying standalone assets. The nine numbered PNGs contain higher-fidelity photography illustrations and logo appearances as part of complete screen compositions.

The three referenced remote images were retrieved and visually inspected. Each is a 288×512 complete screen composition, including status bars and interface text, rather than a standalone camera illustration. The higher-resolution supplied 900×1600 numbered references were therefore used to extract only the decorative camera/photo regions and original logo tile. All five resulting PNGs were visually verified to exclude OS bars, headings, forms, buttons, cards, and tab bars.

Runtime artwork: `assets/design/welcome-hero.png` (900×695), `login-hero.png` (900×360), `photos-hero.png` (900×505), `dashboard-camera.png` (430×275), and `brand-logo.png` (122×118). The extraction performs only lossless rectangular crops, without generation, recoloring, resizing, or background removal. `scripts/extract-local-artwork.py` reproduces the outputs using Python/Pillow and the extracted originals. `assets/design/manifest.json` records source paths, exact half-open pixel bounds, dimensions, file sizes, and source/output SHA256 hashes. `remote-source-manifest.json` retains the original HTML URL retrieval records. Runtime screens use local artwork and real native controls; complete screenshots remain reference-only.

The newly authorized standalone implementation uses Expo SDK 58 with React Navigation 7, compatible safe-area/date-picker/storage/gradient/icon/font/splash/share modules, and a committed dependency lockfile. If integrating into an earlier app later, follow that app's SDK, navigator, and compatible native modules before transferring these screen components.

## Implementation and future integration evidence

1. Build the newly authorized standalone app with a shared light theme/components and Home Dashboard first, then the remaining native screens using real user-entered device-local records and actions.
2. Verify TypeScript and project-required checks, Expo dependency compatibility, safe areas, keyboard scrolling, actual navigation/auth/forms/mutations, loading/empty/error states, and visual comparison against the reference screenshots.
3. Package complete source, lockfile, required local assets, dependency changes, and precise Expo Go/run instructions. Do not include `node_modules` or credentials. Clearly document the offline storage/account model and its limits.
4. If the earlier application is supplied later, inspect its app entry/configuration, navigator/routes, theme, screen modules, shared components, API services, auth/session providers, state/query stores, forms/validation, assets, and dependency lockfile before merging this UI. Preserve its real navigator, route params, API contracts, backend/database, state ownership, and form behavior.

## Information not established by the ZIP

The earlier project's path/source, Expo SDK, Router versus React Navigation, API base URL and environment variables, auth/session and PIN reset/update contracts, client/event/crew/equipment schemas and identifiers, permissions, metric definitions, notification route/API, profile update, record export/share format, and native-module compatibility. The new app makes its own documented local behavior explicit; it cannot establish these properties of the absent earlier app. For future integration, recover these contracts from actual source before asking for backend details.
