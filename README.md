# GridLock

A React Native (Expo) app for motorcycle ride leaders to plan routes, place blocker points at intersections, and receive automatic voice announcements as they approach each point during a ride.

---

## Table of Contents

1. [How the App Works](#how-the-app-works)
2. [Data Model](#data-model)
3. [Project Structure](#project-structure)
4. [Module Reference](#module-reference)
5. [Tech Stack](#tech-stack)
6. [Local Development Setup](#local-development-setup)
7. [Testing on iPhone (Expo Go)](#testing-on-iphone-expo-go)
   - [Option A — LAN (same Wi-Fi)](#option-a--lan-same-wi-fi)
   - [Option B — Tunnel (different networks)](#option-b--tunnel-different-networks)
8. [Google Maps API Key](#google-maps-api-key)
9. [User Guide](#user-guide)

---

## How the App Works

The app has three screens connected by a native stack navigator:

```
HomeScreen  →  EditRouteScreen  →  (save)  →  HomeScreen
HomeScreen  →  RideScreen       →  (stop)  →  HomeScreen
```

**HomeScreen** loads all saved routes from device storage and displays them in a list. Each card shows the route name, how many blocker points it has, and buttons to Start Ride, Edit, or Delete.

**EditRouteScreen** opens a full-screen map. The user types a route name, then taps anywhere on the map to place a blocker point. A modal (`BlockerPointModal`) collects the point details. Tapping an existing marker re-opens the modal to edit it. Saving the route writes it to AsyncStorage.

**RideScreen** starts a GPS subscription (`expo-location`) that fires every 3 seconds or every 15 metres. On each update it runs the Haversine formula against every un-announced blocker point. When the rider is within a point's trigger radius, `expo-speech` reads the announcement aloud and the marker turns green. The screen stays awake via `expo-keep-awake`. The rider can replay the last announcement or stop the ride at any time.

---

## Data Model

### Route

```js
{
  id: string,           // UUID (expo-crypto)
  name: string,
  description: string,  // optional
  blockerPoints: BlockerPoint[],
  createdAt: string,    // ISO timestamp
  updatedAt: string,
}
```

All routes are stored together under the single AsyncStorage key `@gridlock_routes` as a JSON array.

### BlockerPoint

```js
{
  id: string,                  // UUID
  latitude: number,
  longitude: number,
  name: string,                // intersection / location label
  positionDescription: string, // e.g. "NW corner"
  blockersNeeded: number,      // integer ≥ 1
  triggerRadius: number,       // feet (default 10, min 1); converted to metres at runtime
  customAnnouncement: string,  // overrides auto-generated text if set
}
```

---

## Project Structure

```
gridlock/
├── App.js                          Entry point — wraps app in SafeAreaProvider + NavigationContainer
├── app.json                        Expo config (bundle ID, permissions, Google Maps keys)
├── package.json
├── babel.config.js
├── CHANGELOG.md                    Running log of all changes
└── src/
    ├── navigation/
    │   └── AppNavigator.js         Native stack: Home → EditRoute → Ride
    ├── screens/
    │   ├── HomeScreen.js           Route list with Start / Edit / Delete actions
    │   ├── EditRouteScreen.js      Map-based route editor; tap map to place points
    │   └── RideScreen.js           Live GPS tracking + voice announcements
    ├── components/
    │   └── BlockerPointModal.js    Bottom-sheet modal for adding/editing a blocker point
    ├── services/
    │   ├── StorageService.js       AsyncStorage read/write/delete for routes
    │   └── AnnouncementService.js  expo-speech wrapper + announcement text builder
    ├── utils/
    │   └── geoUtils.js             Haversine distance formula (returns metres)
    └── theme/
        └── colors.js               Shared color constants
```

---

## Module Reference

### `App.js`

Bootstraps the app. Renders `SafeAreaProvider` → `NavigationContainer` → `AppNavigator`. Sets the status bar to light style.

---

### `src/navigation/AppNavigator.js`

Creates a `NativeStackNavigator` with three screens:

| Screen name | Component | Header |
|---|---|---|
| `Home` | `HomeScreen` | "GridLock" |
| `EditRoute` | `EditRouteScreen` | "Edit Route" (dynamic) |
| `Ride` | `RideScreen` | Hidden |

All screens share a dark header (`COLORS.primary = #1a1a2e`) with white text.

---

### `src/screens/HomeScreen.js`

- Uses `useFocusEffect` to reload routes from storage every time the screen gains focus (so edits are reflected immediately after returning from `EditRouteScreen`).
- **New Route** button generates a UUID, creates a blank route object, and navigates to `EditRouteScreen` without saving yet.
- **Start Ride** validates that the route has at least one blocker point before navigating.
- **Delete** shows a confirmation alert, then calls `deleteRoute()` and reloads the list.

---

### `src/screens/EditRouteScreen.js`

- On mount, requests location permission and pans the map to the user's current position (or to the first existing blocker point if editing an existing route).
- `onPress` on the map (`handleMapPress`) captures the tapped coordinate and opens `BlockerPointModal` in "add" mode.
- `onPress` on a marker (`handleMarkerPress`) opens the modal in "edit" mode with the point's current values pre-filled.
- `handleModalSave(data)` either updates the matching point (edit) or appends a new one with a new UUID (add).
- `handleSave()` calls `saveRoute()` and navigates back. Nothing is written to storage until this is called.
- The route name field updates the navigation header title in real time via `navigation.setOptions`.

---

### `src/screens/RideScreen.js`

Key state and refs:

| Name | Type | Purpose |
|---|---|---|
| `announcedIdsRef` | `useRef(Set)` | Tracks which point IDs have been announced; used inside the location callback to avoid stale closure |
| `announcedIds` | `useState(Set)` | Mirror of the ref — triggers re-render to update marker colors |
| `lastAnnouncementText` | `useState(string)` | Stores the last spoken text for the Repeat button |
| `locationSubscriptionRef` | `useRef` | Holds the `expo-location` subscription so it can be removed on unmount |
| `mapRef` | `useRef(MapView)` | Used to animate the map to follow the rider |

Location polling: `accuracy: BestForNavigation`, `timeInterval: 2000 ms`, `distanceInterval: 5 m`.

On each `onLocationUpdate`:
1. Animates the map to the new position.
2. Loops through all blocker points not yet in `announcedIdsRef`.
3. Calls `getDistance()` (Haversine) for each.
4. If `dist ≤ point.triggerRadius`, generates and speaks the announcement, adds the ID to both the ref and state.

On unmount (or Stop Ride): removes the location subscription and stops any active speech.

---

### `src/components/BlockerPointModal.js`

A slide-up `Modal` with a `ScrollView` form. Fields:

| Field | Default | Validation |
|---|---|---|
| Name | `""` | Required (auto-filled from Overpass API on map tap) |
| Position description | `""` | Optional |
| Blockers needed | `1` | Integer ≥ 1 (stepper buttons) |
| Trigger distance | `75` ft | Integer ≥ 1 ft; stored in feet, converted to metres at ride time |
| Custom announcement | `""` | Optional; overrides auto-text |

`useEffect` on `[visible, point]` resets all fields each time the modal opens.

`onSave` is called with a plain object of the five fields above (no `id`, `latitude`, or `longitude` — those are owned by the parent).

---

### `src/services/StorageService.js`

All data lives under the key `@gridlock_routes`.

| Export | Behaviour |
|---|---|
| `getRoutes()` | Reads and JSON-parses the array. Returns `[]` on error. |
| `saveRoute(route)` | Reads the array, finds the route by `id`, updates in place or appends if new, writes back. Returns `true`/`false`. |
| `deleteRoute(routeId)` | Filters the route out and writes back. Returns `true`/`false`. |

---

### `src/services/AnnouncementService.js`

| Export | Behaviour |
|---|---|
| `generateAnnouncement(point)` | Returns `point.customAnnouncement` if set, otherwise builds: `"Approaching {name}. {n} blocker(s) needed[ at {position}]."` |
| `announce(text)` | Stops any current speech, then calls `Speech.speak()` with rate 0.9, en-US, and an `onDone` callback. Returns a Promise that resolves when speech fully completes (or errors/stops). Safe to `await` in async loops — simulation uses this to prevent overlap. |
| `stopSpeech()` | Calls `Speech.stop()`. |

---

### `src/utils/geoUtils.js`

`getDistance(lat1, lon1, lat2, lon2) → number`

Implements the Haversine formula using Earth radius = 6 371 000 m. Returns the great-circle distance in metres.

---

### `src/theme/colors.js`

| Key | Value | Usage |
|---|---|---|
| `primary` | `#1a1a2e` | Header, FAB, dark backgrounds |
| `primaryLight` | `#16213e` | Secondary dark surfaces |
| `accent` | `#e94560` | Destructive actions, highlights |
| `success` | `#4caf50` | Announced markers |
| `warning` | `#ff9800` | Pending markers |
| `danger` | `#f44336` | Delete buttons |
| `background` | `#f0f2f5` | Screen background |
| `card` | `#ffffff` | Card surfaces |
| `text` | `#1a1a2e` | Primary text |
| `textSecondary` | `#66667a` | Labels, placeholders |
| `overlay` | `rgba(0,0,0,0.65)` | Modal backdrop |

---

## Tech Stack

| Concern | Package | Version |
|---|---|---|
| Framework | Expo | SDK 54 |
| UI | React Native | 0.81.5 |
| Navigation | React Navigation | v7 (native stack) |
| Maps | react-native-maps | 1.20.1 |
| Location | expo-location | ~18.1.5 |
| Voice | expo-speech | ~13.1.4 |
| Storage | @react-native-async-storage/async-storage | 2.1.2 |
| UUIDs | expo-crypto | ~14.1.4 |
| Screen awake | expo-keep-awake | ~14.1.4 |
| Safe areas | react-native-safe-area-context | 5.4.0 |
| Reverse geocode | Overpass API (OpenStreetMap) | — (HTTP, no key) |
| Tunnel (dev) | @expo/ngrok | ^4.1.0 (global install) |

---

## Local Development Setup

### Prerequisites

- **Node.js** 20+ and npm
- **Expo Go** (SDK 54) installed on your iPhone from the App Store
- **@expo/ngrok** installed globally (required for tunnel mode):
  ```powershell
  npm install -g @expo/ngrok@^4.1.0
  ```

### First-time install

```powershell
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required due to peer dependency conflicts in the Expo SDK 54 dependency tree. Always use this flag when adding new packages too.

### Windows Firewall rule (one-time, LAN mode only)

Run once in an elevated PowerShell to allow Metro bundler traffic through the firewall:

```powershell
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow
```

---

## Testing on iPhone (Expo Go)

### Option A — LAN (same Wi-Fi)

Use this when your iPhone and PC are on the **same Wi-Fi network** (home/office).

```powershell
# In the project directory:
$env:REACT_NATIVE_PACKAGER_HOSTNAME="10.0.0.248"
npx expo start --lan
```

- The QR code in the terminal encodes `exp://10.0.0.248:8081`.
- Open the iPhone Camera app → scan → tap the banner, **or** open Expo Go → **Enter URL manually** → `exp://10.0.0.248:8081`.
- Hot-reload fires on every file save.

> **PC LAN IP**: `10.0.0.248`. If your IP changes, update the environment variable and re-scan.

---

### Option B — Tunnel (different networks / mobile data)

Use this when the iPhone can't reach the PC directly (e.g. hotspot, different subnet, firewall blocking LAN).

```powershell
# In the project directory:
npx expo start --tunnel
```

Expo will print a tunnel URL of the form:
```
exp://<random-slug>.exp.direct
```

Scan the QR code shown in the terminal, or open Expo Go → **Enter URL manually** and paste the URL.

> **Tunnel requires** `@expo/ngrok@^4.1.0` installed globally (see Prerequisites above).  
> The tunnel URL changes every time you restart the server — always re-scan the new QR code.

**Last known tunnel URL (from a previous session):** `exp://vbtaef4-anonymous-8082.exp.direct`  
*(This is shown for reference only — it will not work after the tunnel server is restarted.)*

---

### Restarting the dev server

If the app shows a red error screen or loses connection:

1. Press `Ctrl+C` in the terminal to stop Metro.
2. Restart with either mode above.
3. Re-scan the QR code on the iPhone (or re-enter the URL in Expo Go).
4. If you see a **"Something went wrong"** screen in Expo Go, shake the iPhone → **Reload**.

### Clearing the cache

If changes aren't reflecting after reload:

```powershell
npx expo start --clear
# or with tunnel:
npx expo start --tunnel --clear
```

### Full clean reinstall

If you see dependency errors or Metro crashes on startup:

```powershell
cmd /c rd /s /q node_modules
npm install --legacy-peer-deps
npx expo start --clear
```

---

## Google Maps API Key

iOS uses Apple Maps by default (no key needed). Android requires a Google Maps key.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Enable **Maps SDK for Android**.
3. Create an API key restricted to the package name `com.gridlock.app`.
4. Add it to `app.json`:

```json
"android": {
  "config": {
    "googleMaps": { "apiKey": "YOUR_KEY_HERE" }
  }
}
```

For Google Maps on iOS as well, also enable **Maps SDK for iOS** and add the key under `"ios": { "config": { "googleMapsApiKey": "..." } }`.

---

## User Guide

### Creating a route

1. Tap **+ New Route** on the home screen.
2. Edit the route name at the top of the editor.
3. Tap any spot on the map to add a blocker point.
4. In the modal, fill in:
   - **Intersection / Location Name** *(required)* — e.g. "Oak St & Main Ave"
   - **Position Description** *(optional)* — e.g. "NW corner"
   - **Blockers Needed** — use +/− buttons (minimum 1)
   - **Trigger Distance** — metres before announcement fires (default 200 m ≈ 650 ft)
   - **Custom Announcement** *(optional)* — leave blank to auto-generate
5. Tap **Save Point**. Repeat for each intersection.
6. Tap **Save** (top-right) to persist the route.

### Starting a ride

1. Tap **▶ Start Ride** on any saved route.
2. Grant location permission if prompted.
3. Ride normally — announcements fire automatically as you approach each point.
   - **Orange marker** = not yet announced
   - **Green marker** = announced
4. Tap **🔁 Repeat** to replay the last announcement.
5. Tap **■ Stop** to end the ride and return to the home screen.

### Announcement format (auto-generated)

> *"Approaching [Name]. [N] blocker(s) needed at [Position]."*

Example: *"Approaching Oak Street and Main Avenue. 2 blockers needed at the northwest corner."*
