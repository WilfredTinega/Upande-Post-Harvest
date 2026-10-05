# Tambuzi Post Harvest

Android scanning app for the Tambuzi packhouse. It replaces the Scan form on
the desk for handheld use: every post-harvest scan — harvesting, receiving,
grading, stock take, packing, loading, dispatch and delivery — from a Honeywell
handheld (keyboard wedge) or the phone camera.

Same stack and conventions as the other Upande apps (`upande-quality-app`,
`upande-production`): **Expo SDK 54** (React Native 0.81, expo-router 6),
TypeScript, zustand, `src/theme.ts` design tokens, DM Sans / Poppins, Ionicons,
mandatory biometric unlock.

## Backend

All scans go to the whitelisted methods in the `upande_tambuzi` app,
`upande_tambuzi/mobile_api/`. The site must have that code deployed:

| Action | Endpoint (`upande_tambuzi.mobile_api.…`) |
|---|---|
| Login | `auth.mobile_login` (returns the `sid` in the body) |
| Setup / lookups | `setup.get_scan_setup`, `setup.search_employees`, `setup.get_employee`, `setup.validate_order_pick_list`, `setup.list_open_order_pick_lists` |
| Home figures (today, per process) | `setup.get_overview` |
| Field Rejects (Production) | `harvesting.field_rejects` |
| Production page: harvested vs received per greenhouse and variant, harvester KPIs | `harvesting.get_production_summary` |
| Harvesting | `harvesting.harvest`; lookups `harvesting.get_harvest_setup` (greenhouses, varieties), `harvesting.get_recent_varieties` |
| Receiving / Receiving Quarantined / Receiving Out | `receiving.receiving` |
| Ungraded Discard | `ungraded_discard.create_ungraded_discard` |
| Grading | `grading.fast_grading` |
| Grading Check | `bunch_actions.grading_check` |
| Graded Rejects (Packhouse) | `graded_rejects.graded_rejects` |
| Local Sale / Walk In Shop (Shop) | `shop.local_sale`, `shop.walk_in_shop_transfer` |
| Shop Discard (Shop) | `bunch_actions.graded_discard` |
| Ungrade | `ungrade_bunch.ungrade_bunch` |
| Stock Take | `stock_take.stock_take` |
| Vase | `vase.vase` |
| Packing | `packing.fast_packing` (OPL picked from `setup.list_open_order_pick_lists`) |
| Packing Reject | `bunch_actions.packing_reject` |
| Staging | `dispatch_flow.stage_box` |
| Loading Plan | `dispatch_flow.open_loading_plan`, `plan_box`, `unplan_box`, `get_loading_plan` |
| Loading | `dispatch_flow.open_loading_plan` (existing plan only), `load_box` |
| Dispatch | `dispatch_flow.list_open_loading_plans`, `dispatch_loading_plan` |
| Dispatch Form | `dispatch_form.create_dispatch_form` |
| Undispatch | `undispatch_box.undispatch_box` |
| Delivery | `delivery_form.delivery_form` |
| OTA manifest (expo-updates `updates.url`, guest GET) | `ota.manifest` |
| Device register (on sign-in and launch) | `devices.register_install`; Settings → Devices (System Manager) `devices.installs` |

The user signs in with their normal ERPNext credentials; every scan runs with
that user's permissions.

### Updates and the device register

Same setup as the Upande Sensors app (see `docs/OTA.md` and `docs/RELEASING.md`):

- **Patch releases (1.0.5 → 1.0.6) ship over the air.** `updates.url` is the Frappe
  proxy `upande_tambuzi.mobile_api.ota.manifest`, which serves the manifest published to
  GitHub Pages with the `expo-protocol-version` header expo-updates requires. The app
  checks at launch and on every return to the foreground and restarts into the bundle
  (`src/stores/updateStore.ts`, `src/components/UpdateController.tsx`).
- **Minor releases (1.0.x → 1.1.0) ship as an APK** on GitHub Releases
  (`expo.extra.githubRepo`). The app checks once a day, downloads it, and opens
  Android's installer; Settings → App updates has the manual button.
- **Device register.** Every sign-in and (hourly-throttled) launch reports a random
  install id, the device model/OS and the app version. Settings → This device →
  *Devices running the app* lists every handheld, who signed in on it and which build
  it runs (System Managers only).

The site needs `upande_tambuzi` deployed and `bench migrate` run (the
`Post Harvest App Install` doctypes).

### Instances

`src/services/instance-mapper.ts` lists the known Tambuzi servers. To change
the server, **hold the logo on the login screen for 3 seconds**: it offers the
known servers by name (production is the default) and a server address field.
Type the address without `https://`: the app uses https when the server answers
on it, else http, and plain http straight away for an IP address, localhost or
an address with a port (e.g. `192.168.88.245:8000`); Settings shows which server the app is signed in to. To add a
server, add it to `INSTANCES` (to show it on the login screen) and every URL it
answers on to `URL_TO_INSTANCE`.

| Instance | Environment | URLs |
|---|---|---|
| Tambuzi Local | development | http://192.168.88.245:8000 (LAN), http://10.0.2.2:8000 (emulator), http://localhost:8000 |
| Tambuzi | production | https://tambuzi.upande.com, https://tambuzi.frappe.cloud |

Development builds (`__DEV__`) open on **Tambuzi Local**; release builds open on
production. Tambuzi Local is the bench's default site (`tambuzi16`) served by
`bench start` on port 8000. The phone must be on the same Wi-Fi as the dev
machine; if the machine's IP changes, update it in `instance-mapper.ts`.

## How a scan session works

1. Set up the scanner (on the login screen the first time, later in Settings →
   "Process"): the **processes** it is used for (Production: harvesting
   and receiving, field rejects; Packhouse: receiving out, grading, packing;
   Dispatch: staging, loading plan, loading and dispatch; Shop: day 4 flowers
   moved to the shop (Local Sale), walk-in shop, vase and shop discard;
   Quality: grading check, graded rejects and packing reject). Graded bunches are
   never discarded in the packhouse: unsold ones go to the shop and are
   discarded there. and its **station** farm. Both are saved on the device and survive
   sign-out and "Forget this device". Home and the sidebar (☰) show only the
   chosen processes' actions. With several processes, home has one page per
   process, swiped left/right (dots show the page), and the title follows the
   page on screen: Production → Packhouse → Dispatch.
   The farm list comes from the server's Warehouse Mappings; if there are none,
   or the server can't be reached, the app says so and offers the last known or
   default farms.
2. Sign in and pick an action from home or the
   sidebar. Some actions need something set before buckets/bunches/boxes:
   - **Harvesting** — choose the greenhouse, the variety (the stem-length
     variant, e.g. `Jasmine-63CM`; the greenhouse's recent ones are listed
     first) and the harvester from the list, the
     bed if known, and type the stems; then scan the bucket QR. The stem count
     is cleared after each bucket and the cursor goes back to it. The most
     stems a bucket may hold comes from **Production Settings** (default 70 for
     roses, a limit per item group, e.g. Herbs and Foliage 200).
   - **Field Rejects** — greenhouse, variety, rejection reason and stems, then
     tap Record field rejects (a Field Rejects receipt and a Field Rejects
     Material Issue, as on the desk).
   - **Grading** — select the grader, or scan the grader QR.
   - **Packing** — choose the Order Pick List from the farm's open OPLs
     (scanning a printed OPL QR still works) and select the packer.
   - **Loading Plan / Loading** — scan the truck label first.
   - **Dispatch** — choose the truck (or scan its label). The loading sheet
     groups the boxes per customer, then per delivery point; dispatching makes
     one Delivery Note per customer and delivery point. The Dispatch truck
     button is enabled once every box is loaded.
   - **Undispatch** — type the reason. **Packing Reject** — choose the reason.
3. Scan. Each scan is sent to the server in order (fast scans queue up). The
   result shows as a green / orange / red banner with a beep or error tone, and
   the last 30 results stay in the list below.

The scan field keeps focus so the Honeywell trigger always lands in it. If the
status dot turns orange, tap "Tap here to resume scanning". Scanners that don't
send an Enter suffix still work for JSON labels (bunch, bucket, truck).

## Develop

```bash
npm install
npx expo start            # needs a development build — see below
npm run typecheck
npm run lint
```

There is no Java/Android SDK on the dev machine, so native builds go through EAS:

```bash
npx eas-cli@latest init                           # once: creates the EAS project id
npx eas-cli@latest build -p android --profile preview      # installable APK
npx eas-cli@latest build -p android --profile development  # dev client
```

Code layout:

- `app/` — routes: `index` (one swipeable page per process: today's figures + action tiles), `process/[key]` (one process's landing), `scan/[action]`, `settings`, `login`, `biometric-lock`, `camera-scanner`
- `src/scan/actions.ts` — every scan action: process, requirements, prompt, endpoint call and how replies are shown
- `src/scan/processes.ts` — the three processes (Production / Packhouse / Dispatch)
- `src/components/DrawerMenu.tsx` — sidebar with every action of the scanner's processes (open state in `src/stores/uiStore.ts`)
- `src/components/ScannerConfig.tsx` — processes + station picker (login and Settings)
- `src/scan/parse.ts` — label parsers (bunch / bucket / grader / truck / OPL / box)
- `src/scan/ScanField.tsx` — Honeywell + camera scan input
- `src/services/scan-api.ts` — typed wrappers for the backend endpoints
- `src/services/api.ts` — axios client with session cookie + silent re-login
