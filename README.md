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
- Lia Mendoza: Administrator

## Suggested Walkthrough

1. Sign in as Mara Cruz and show the incident overview, road passability, unit status/type, and notifications.
2. Open **Dispatches**, choose **Re-optimize plan**, explain that the browser demo compares passable routes and chooses assignments by minimum total route distance, then review and confirm the plan.
3. Change a road edge's passability and show the active-route re-optimization notice.
4. Sign in as Rico Santos to show the assigned route and route-status controls.
5. Sign in as Lia Mendoza to show local demo account management and system activity.
6. Use **Reset sample** from the overview to restore the initial sample records between walkthroughs.

For the cleanest repeatable walkthrough, reset the sample before starting, use the Coordinator profile for steps 1–3, and use the Field Responder profile for step 4. The recommendation preview is a local simulation; it does not call the Python optimizer in presentation mode.

## Prototype Limitations

- Demo accounts, roles, notifications, and sample records are stored in this browser and are not secure authentication or persistent shared data.
- Sample edge distances may be coordinate-based estimates and are labeled as approximate. Do not present them as imported OSMnx road lengths or measured travel times.
- The map needs an internet connection for OpenStreetMap tiles and road-following geometry. If the routing service is unavailable, route lines fall back to schematic graph-node connections and the map displays a warning; these are not street-by-street directions.
- Adding an incident uses an external geocoder to match the selected barangay to a road node, so that step also requires an internet connection.
- Real database mode requires the backend, the migrations, and OSMnx `distance_km` values populated for every road edge.
- No SMS/email gateway, production authentication, or live CDRRMO data is configured.

## Development Checks

Run `npm run lint` and `npm run build` from this directory.
