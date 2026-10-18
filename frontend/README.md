# Flood Dispatch Prototype

## Presentation Mode

The presentation run uses local sample data and does not require the Express backend or PostgreSQL.

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
2. Open **Dispatches**, choose **Re-optimize plan**, explain the Dijkstra route distances and Hungarian minimum-distance assignment, then confirm the dispatch.
3. Change a road edge's passability and show the active-route re-optimization notice.
4. Sign in as Rico Santos to show the assigned route and route-status controls.
5. Sign in as Lia Mendoza to show local demo account management and system activity.
6. Use **Reset sample** from the overview to restore the initial sample records between walkthroughs.

## Prototype Limitations

- Demo accounts, roles, notifications, and sample records are stored in this browser and are not secure authentication or persistent shared data.
- Sample edge distances may be coordinate-based estimates and are labeled as approximate. Do not present them as imported OSMnx road lengths or measured travel times.
- The map draws straight graph links if external street geometry is unavailable; those links are not street-by-street navigation directions.
- Real database mode requires the backend, the migrations, and OSMnx `distance_km` values populated for every road edge.
- No SMS/email gateway, production authentication, or live CDRRMO data is configured.

## Development Checks

Run `npm run lint` and `npm run build` from this directory.
