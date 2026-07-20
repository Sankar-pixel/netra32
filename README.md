# NETRA32 — 3D Simulation Architecture

A dual-layer simulation of the NETRA32 360° multi-people proximity alert wearable:

- **Backend** (Python / FastAPI): a live 3D coordinate engine that ticks at
  20Hz, generates mock human-movement scenarios, computes 3D Euclidean
  distances, and runs the same alert-state logic as the physical device.
  State is broadcast to every connected client over a WebSocket.
- **Frontend** (HTML5 + Three.js / WebGL): a dark, cybernetic dashboard with
  a real 3D radar viewport — grid floor, a radar boundary dome, and moving
  capsule "people" that change color with threat level — plus telemetry and
  haptic-pattern sidebars, all driven live by the backend.

```
netra32-3d-simulation/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI app, WebSocket endpoint, REST routes
│   │   ├── simulator.py     # 20Hz tick loop, per-target tracking, alert state machine
│   │   ├── scenarios.py     # mock 3D movement generators (walk-by, rapid approach, crouch, group)
│   │   └── physics.py       # 3D Euclidean distance + zone classification
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/main.js           # Three.js scene, OrbitControls, WebSocket client, haptic engine
└── README.md
```

## 1. Requirements

- Python 3.9+
- Any modern browser with WebGL2 support (Chrome, Edge, Firefox, Safari)
- Internet access on first load (Three.js and Google Fonts are pulled from a
  CDN — no local npm install / build step needed)

## 2. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

You should see Uvicorn come up on `http://localhost:8000`. Sanity-check it:

```bash
curl http://localhost:8000/api/health
# {"status":"online","tick_hz":20,"connected_clients":0}
```

Interactive API docs are auto-generated at `http://localhost:8000/docs`.

## 3. Run the frontend

The frontend is static — any local web server works. From the project root:

```bash
cd frontend
python -m http.server 5500
```

Then open **http://localhost:5500** in your browser.

> Open the file directly with `file://` also mostly works, but some browsers
> restrict WebSocket/module behavior on the `file://` origin — serving it
> over `http://` (as above) is the reliable path and only takes one command.

## 4. Using the simulator

- The backend starts in **auto-cycle** mode: it loops through every mock
  scenario on its own (idle → walk-by → rapid approach → crouch/low-profile
  → multi-target group → repeat).
- Use the **Scenario Control** panel on the left to force a specific
  scenario, or jump back to **Auto Cycle**. This sends a `POST` to
  `/api/scenario/{name}` on the backend, which every connected client will
  then see reflected in the next broadcast.
- Drag in the 3D viewport to orbit the camera, scroll to zoom, right-drag to
  pan (standard OrbitControls).
- The **Haptic Status** panel mirrors the real device's silent vibration
  patterns (short/long pulse sequences) and includes an optional audio
  toggle that plays a low-frequency "motor thud" so you can *hear* what the
  wearer would feel.
- The **Event Log** timestamps every scenario switch and alert-state
  transition.

## 5. Architecture notes

- **Why WebSocket + REST together?** The WebSocket (`/ws`) is one-directional
  from the backend's point of view for state — it broadcasts the simulation
  at a fixed 20Hz regardless of who's listening. Scenario switching is a
  REST `POST` so it's simple to trigger from `curl`, a second browser tab,
  or any other tool, and every connected client picks up the change on the
  very next tick.
- **Distance math**: `backend/app/physics.py` implements the literal 3D
  Euclidean distance `d = sqrt((x2-x1)² + (y2-y1)² + (z2-z1)²)` between the
  wearer's approximate chest height (0, 1.5, 0) and each target's `(x, y, z)`
  — so a crouching target genuinely reads as a shorter or longer distance
  depending on the height component, not just floor-plane distance.
- **Speed / rapid-approach detection**: the backend keeps each target's
  previous position and timestamp (`simulator.py: TargetTrack`) and derives
  planar speed from consecutive ticks — no client-side involvement needed.
- **Continuous proximity**: a target's "time spent under 2m" is tracked
  server-side per target ID, so the continuous-proximity alert fires
  correctly even if multiple targets enter/exit the critical range at
  different times.
- **Frontend smoothing**: the browser only receives a new position every
  50ms (20Hz); `js/main.js` lerps each target's rendered position toward the
  latest server value every animation frame so motion looks fluid at 60fps
  instead of visibly stepping.

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Header shows "Disconnected — retrying in 2s…" | Backend isn't running, or is on a different port than `CONFIG.WS_URL` in `frontend/js/main.js`. |
| Scenario buttons don't change anything | Backend REST API unreachable — check the Event Log panel for a "Failed to reach backend REST API" message, and confirm `CONFIG.API_BASE` matches where Uvicorn is running. |
| Blank/black 3D viewport | Browser lacks WebGL2, or Three.js failed to load from the CDN (check DevTools console / network access). |
| CORS errors in the browser console | Backend already ships with permissive CORS (`allow_origins=["*"]`) — this usually means the backend isn't actually running at `CONFIG.API_BASE`. |

## 7. Changing the backend/frontend addresses

If you deploy the backend somewhere other than `localhost:8000`, update the
two constants at the top of `frontend/js/main.js`:

```js
const CONFIG = {
  WS_URL: 'ws://localhost:8000/ws',
  API_BASE: 'http://localhost:8000',
  ...
};
```
## Hardware structure

<img width="1600" height="893" alt="netruh" src="https://github.com/user-attachments/assets/3e59b7bc-3aea-4948-bb64-221c2e86ed2a" />



## Idea

<img width="1536" height="1024" alt="netru" src="https://github.com/user-attachments/assets/ad24a419-b459-4b40-95ea-032069858e03" />


## 🚀 Features

- **🔄 360° Omnidirectional Detection**
Full surrounding coverage for real-time proximity awareness.

- **👥 Multi-Person Detection**
Detects and tracks multiple people simultaneously.

- **📳 Silent Haptic Alerts**
Different vibration patterns indicate proximity level and approaching threats.

- **🤖 Embedded AI Processing**
On-device inference for intelligent detection without cloud processing.

-**🔒 Privacy First**
No cameras, microphones, or internet connection required.

- **📡 Offline Operation**
Fully functional without Wi-Fi or cloud services.

- **🔋 Long Battery Life**
Designed for extended operation with efficient power management.

- **🎯 Compact & Concealable**
Lightweight design suitable for everyday wear.

## 🏗 Hardware Architecture

**NETRA32 consists of a layered modular architecture:**

- Outer Protective Shell
- 360° Radar Sensor Layer
- ESP32-Based Sensor Fusion Board
- Power Management Module
- Rechargeable Li-Po Battery
- Base Support Structure

This modular design simplifies future upgrades and maintenance while maintaining a compact form factor.

## ⚙️ Key Specifications

- Processor: ESP32 Series Microcontroller
- Detection: 360° Multi-Person Proximity
- Alert Method: Haptic Vibration Feedback
- Power: Rechargeable Li-Po Battery
- Connectivity: Offline Operation
- AI Processing: On-device Embedded Intelligence
- Form Factor: Compact Wearable

## 📱Potential Applications
-Personal safety and security
-Industrial worker protection
-Smart workplace monitoring
-Healthcare and assisted living
-Defense and tactical awareness
-Indoor navigation assistance
-Research in embedded AI and wearable systems


## SIMULATION
<img width="1872" height="902" alt="Screenshot 2026-07-20 141315" src="https://github.com/user-attachments/assets/b175963e-5d76-4d27-ba07-de6c136ccd47" />

