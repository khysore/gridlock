# Gridlock — Changelog

All notable changes to this project are documented here.
Format: `[YYYY-MM-DD] — Description`

---

## [2026-06-24] — Route sharing (export / import)

- `HomeScreen`: each route card has a new ⬆ Share button — serialises the route to a `.gridlock` JSON file and opens the iOS share sheet (AirDrop, Messages, email, etc.)
- `HomeScreen`: new **⬇ Import Route** button at the bottom — opens a document picker, reads the file, validates it, assigns a fresh UUID, and saves to local storage
- Duplicate detection: warns before importing a route with the same name and point count
- New packages: `expo-sharing`, `expo-file-system`, `expo-document-picker` (all SDK 54 compatible)

## [2026-06-24] — GPS navigation overlay on ride screen

- `RideScreen`: full-screen map now shows a **dashed blue polyline** connecting all blocker points in route order
- Map **rotates with heading** (bearing) during a live ride so it always faces forward like a real GPS
- **Next stop card** overlays the bottom of the map — shows next point name, position description, and live distance (ft / mi)
- Pin colours: blue = next stop, orange = other upcoming, green = announced/done
- `showsTraffic` and `showsCompass` enabled on the map

## [2026-06-24] — Announcement always reads position + appends custom text

- `AnnouncementService`: `generateAnnouncement()` now always reads auto-generated text (name + blockers + position description)
- Custom announcement is **appended** after the auto-text rather than replacing it
- Example: *"Approaching Oak St & Main Ave. 2 blockers needed at northwest corner. Watch for oncoming traffic."

## [2026-06-24] — Reorder blocker points + fix simulation speech overlap

- `EditRouteScreen`: ▲ ▼ buttons on each blocker point row to reorder
- `AnnouncementService`: `announce()` now returns a Promise that resolves via `onDone` — speech fully completes before simulation moves to next point
- `RideScreen`: simulation gap reduced to 500ms (after speech finishes) instead of fixed 2s

## [2026-06-24] — Simulation mode added

- `RideScreen`: new ⚡ Simulate button steps through all blocker points automatically
- Pans map to each point, fires announcement, waits 2s, moves to the next
- Tap "Stop Sim" to cancel at any time
- Allows full testing of routes and voice without leaving your desk

## [2026-06-24] — Fix announcements not firing during car test

- `RideScreen`: `distanceInterval` reduced 15m → 5m so updates fire more frequently
- `RideScreen`: accuracy upgraded to `BestForNavigation`; `timeInterval` reduced to 2s
- Default trigger radius raised 10 ft → 75 ft (realistic for GPS accuracy in a moving vehicle)
- `AnnouncementService`: hardened `announce()` so `isSpeakingAsync` errors can't silently block speech

## [2026-06-24] — Auto-fill intersection name on map tap

- `EditRouteScreen`: tapping the map now runs `Location.reverseGeocodeAsync()` and pre-fills the blocker point name with the nearest street/intersection
- Name is fully editable in the modal — reverse geocode is just a suggestion

## [2026-06-24] — Trigger distance switched to feet

- `BlockerPointModal`: label changed to "feet", default 10 ft, placeholder updated
- `RideScreen`: converts stored feet value to metres (`× 0.3048`) before Haversine comparison
- Existing saved points with old metre values will need to be re-saved with feet values

## [2026-06-24] — Reduced default trigger radius to 10 ft (3 m)

- `BlockerPointModal`: default trigger distance changed from 200 m to 3 m (~10 ft)
- `RideScreen`: fallback trigger radius updated to match
- Prevents all blocker points firing at once when stops are close together

## [2026-06-24] — Better voice quality

- `AnnouncementService`: auto-selects the best available voice (prefers "Enhanced"/"Premium" iOS voices over the default robotic one)
- Slightly increased speech rate to 0.9 for more natural cadence

## [2026-06-24] — Fix speech not playing on iOS

- `AnnouncementService`: `announce()` is now async — checks `isSpeakingAsync()` before stopping, waits 150ms after stop before speaking (fixes iOS cancellation bug)
- `RideScreen`: `onLocationUpdate` made async to await announce calls

## [2026-06-24] — Ride startup announcement

- `RideScreen`: announces "Ride started. N blocker points loaded." when GPS tracking begins
- Confirms speaker is working immediately and gives Repeat button something to replay

## [2026-06-24] — Renamed app from "Moto Blockers" to "GridLock"

- Updated `app.json`: name, slug, bundle IDs, permission strings
- Updated `package.json`: name field
- Updated `AppNavigator.js`: header title
- Updated `StorageService.js`: storage key `@gridlock_routes`
- Updated `RideScreen.js`: location permission message
- Updated `README.md`: all references

## [2026-06-24] — Full technical documentation written

- Rewrote `README.md` with complete module reference, data model, tech stack table, dev setup, iPhone testing guide, and user guide

## [2026-06-24] — Project setup & iPhone preview

- Installed npm dependencies (`npm install`)
- Confirmed Expo Go workflow for iPhone testing (scan QR from `expo start`)
- Created `CHANGELOG.md` to track all future changes

---

<!-- Add new entries at the top of this list, below the --- divider -->
