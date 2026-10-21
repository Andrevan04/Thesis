# Flood Dispatch Prototype

## Presentation Mode

The presentation run uses local sample data and browser-side route/assignment calculations. It does not require the Express backend, PostgreSQL, or Python optimizer.

1. Open a terminal in `frontend`.
2. Run `npm install` if dependencies have not been installed on this computer.
3. Run `npm run present`.
4. Open the URL printed by Vite. The default is `http://127.0.0.1:5173/Thesis/`.

Presentation mode is explicitly configured in `.env.presentation` with `VITE_DEMO_MODE=true`. If port 5173 is occupied, Vite will print the alternate port it selected.

## Demo Accounts

All demo accounts use password `demo123`.

- Mara Cruz: Coordinator
- Rico Santos: Field Responder / Dispatcher
- Sofia Reyes: Dispatcher for Rescue Unit 1
- Miguel Dela Cruz: Dispatcher for Rescue Unit 3
- Ana Bautista: Dispatcher for Rescue Unit 4
- Lia Mendoza: Administrator

Every dispatcher profile is permanently paired with one rescue unit (Rico Santos is paired with Rescue Unit 2). Pending incidents are automatically assigned to available units with feasible passable routes, and each dispatcher sees and updates only their paired unit's active routes. Automatic assignment runs when the dashboard loads or refreshes, after an incident is created, when unit or road availability changes, when a dispatch is completed, and after sample data is reset.

## Suggested Walkthrough

1. Sign in as Mara Cruz and show the incident overview, road passability, unit status/type, and notifications.
2. Open **Dispatches** and explain that the browser demo compares passable routes and assigns feasible pending incidents by minimum total route distance. Use **Re-optimize plan** to inspect recommendations.
3. Change a road edge's passability and show the active-route re-optimization notice.
4. Sign in as Rico Santos to show the assigned route and route-status controls.
5. Sign in as Lia Mendoza to show local demo account management and system activity.
6. Use **Reset sample** from the overview to restore the initial sample records between walkthroughs.

For the cleanest repeatable walkthrough, reset the sample before starting, use the Coordinator profile for steps 1–3, and use the Field Responder profile for step 4. Automatic assignment and recommendation previews are local simulations; they do not call the Python optimizer in presentation mode.

## Prototype Limitations

- Demo accounts, roles, notifications, and sample records are stored in this browser and are not secure authentication or persistent shared data. Dispatcher-to-unit pairings are part of this local prototype and are not stored as production user or unit assignments by the backend.
- Route optimization requires a positive `distance_km` per edge. Database mode uses imported distances and endpoint-validated per-edge `geometry_geojson`; missing values are reported without straight-line fallbacks.
- The demo is focused on 10 nearby barangays: Guinhawa, Catmon, Bulihan, Mojon, San Vicente (Poblacion), Tikay, Dakila, Atlag, Bangkal, and Santo Rosario (Poblacion). Other Malolos barangays remain listed but are disabled in incident intake. Demo incident pins are placed at road-access points within the selected barangay.
- The demo graph keeps its sample topology and passability flags, with destination nodes aligned to the sample incident locations. For the three seeded assignments, demo-only route fixtures provide a direct shortest route, a distinct longer passable route, and a route marked impassable for presentation; dispatch distance calculations use the same shortest fixture shown on the map. Fixture lengths and via points are based on OSRM road routes, while their passability classifications are simulated, not verified live closures or a surveyed Malolos street network. Other assignments use the loaded graph and omit route types that graph cannot supply.
- OpenStreetMap tiles and demo route geometry need an internet connection. The demo requests road-following geometry through the public OSRM service; if a route cannot reach both assigned-unit and incident markers, it is omitted with an error rather than drawn as a straight line. Red geometry is hidden only where it overlaps the recommended orange route, which is rendered above the alternatives.
- For incidents outside the preloaded road graph, the selected barangay pin remains at its configured road-access point; a route is shown only if the loaded graph can connect both endpoints. No schematic connector is drawn.
- Real database mode requires the backend, migrations 001–004, positive `distance_km` values, and actual `geometry_geojson` LineStrings populated for road edges. Migration 003 stores incident barangay coordinates; migration 004 adds the per-edge geometry field. Existing road-data imports must populate geometries from the source road network; demo OSRM geometry is never used in database mode.
- No SMS/email gateway, production authentication, or live CDRRMO data is configured.

## Development Checks

Run `npm run lint` and `npm run build` from this directory.
