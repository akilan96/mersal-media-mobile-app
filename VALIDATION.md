# Delivery verification

Verified on 19 November 2026 in the Windows source workspace, using Node 26.13.0 and the committed dependency lockfile.

## Mobile connection check — 21 November 2026

The user reported Expo Go's `java.io.IOException: Failed to download remote update`. The computer served its LAN status, Android manifest, and development bundle successfully, while the phone could not open the LAN status endpoint. The precise LAN routing/isolation cause was not established; the detailed Windows Node.js inbound rules were Allow rules, and no firewall settings were changed.

After the user explicitly approved temporary public source exposure, Expo CLI's account-based tunnel requested login. Its supported ngrok fallback successfully connected on port 8082. Both the public Android manifest and development bundle returned HTTP 200, the phone connected to the React Native runtime, and the user confirmed that the Welcome or Login screen opened.

Added `npm run start:mobile` for that repeatable ngrok connection and `npm run start:lan` for ordinary LAN use. The ngrok helper is installed as a project-local development dependency and the lockfile matches the package manifest. Stop the temporary public tunnel with Ctrl+C when finished. This was a successful Android launch/connectivity check, not a complete repeat of every device workflow below.

## Initial build checks — 19 November 2026

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass: app and test TypeScript compile |
| `npm test` | Pass: 10 domain tests |
| `npx expo install --check` | Pass: SDK-compatible package versions |
| `npx expo-doctor` | Pass: 20/20 project checks |
| `npm run export:android` | Pass: native Android Hermes production bundle with local artwork |
| Source archive integrity | Checked after packaging against the actual workspace files |

Domain tests cover event create/update, payment precision, overpayments, invalid amounts, duplicate payment identifiers, linked-client deletion protection, upcoming-event filtering, saved-schema validation, and export contents. No runtime sample records or predefined login credentials are included.

The original supplied artwork crops were visually inspected and exclude interface text and controls. Native controls are actual TSX components. Only the Feather icon font is loaded, rather than all icon families.

At initial delivery, live browser visual validation could not be completed: the in-app browser could not reach the localhost preview, and the Windows computer-use tool stopped because it could not confidently verify the current browser URL. No Android emulator/physical device was connected at that time. The later Android launch check is recorded above. Native keyboard, gesture insets, picker behavior, SecureStore persistence, and OS save/share destinations still require the full device checklist in INTEGRATION.md. Browser-preview success has not been claimed.

`npm audit --omit=dev` reports three moderate advisories in Expo's transitive fingerprint/minimatch tooling chain, with no high or critical advisories. The suggested automatic remedy would downgrade the Expo SDK substantially; that incompatible downgrade was not applied. Recheck upstream Expo dependency updates before a production release.

This source ZIP is for Expo Go development. The Android JS export is not an APK/AAB, an installation test, or certification of iOS behavior. Remote authentication, cloud sync, team lookup, media storage, and PIN recovery remain outside the approved local-only implementation and are documented in INTEGRATION.md.
