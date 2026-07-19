"""
main.py
-------
FastAPI application entry point.

Runs a background asyncio task that ticks the Simulator at 20Hz and
broadcasts the resulting JSON state to every connected WebSocket client
on /ws. Also exposes small REST endpoints to switch the active mock
scenario and to check backend health.

Run with:
    uvicorn app.main:app --reload --port 8000
(from inside the backend/ directory)
"""

import asyncio
import json
import time
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .simulator import Simulator

TICK_HZ = 20
TICK_DT = 1.0 / TICK_HZ

app = FastAPI(title="NETRA32 3D Simulation Backend", version="1.0.0")

# Wide-open CORS since this is a local demo served from a separate static
# file server (e.g. http://localhost:5500) talking to the API on :8000.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulator = Simulator()


class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict) -> None:
        if not self.active:
            return
        payload = json.dumps(message)
        dead: List[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)


manager = ConnectionManager()


@app.on_event("startup")
async def start_simulation_loop() -> None:
    asyncio.create_task(_simulation_loop())


async def _simulation_loop() -> None:
    """Ticks the simulator at TICK_HZ and broadcasts state to all clients."""
    last = time.perf_counter()
    while True:
        now = time.perf_counter()
        dt = now - last
        last = now
        state = simulator.tick(dt)
        await manager.broadcast(state)
        await asyncio.sleep(TICK_DT)


@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        # Greet the new client immediately so the UI isn't blank until the
        # next 20Hz tick fires.
        await websocket.send_text(json.dumps(simulator.current_state()))

        # Listen for optional control messages from this client
        # (e.g. {"action": "set_scenario", "scenario": "rapid_approach"})
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                if data.get("action") == "set_scenario":
                    simulator.set_scenario(data.get("scenario", "auto"))
            except (json.JSONDecodeError, AttributeError):
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/api/scenarios")
def list_scenarios():
    return {"scenarios": simulator.available_scenarios(), "active": simulator.scenario_mode}


@app.post("/api/scenario/{name}")
def set_scenario(name: str):
    ok = simulator.set_scenario(name)
    status_code = 200 if ok else 400
    return JSONResponse(
        {"ok": ok, "scenario_mode": simulator.scenario_mode},
        status_code=status_code,
    )


@app.get("/api/health")
def health():
    return {"status": "online", "tick_hz": TICK_HZ, "connected_clients": len(manager.active)}


@app.get("/")
def root():
    return {
        "service": "NETRA32 3D Simulation Backend",
        "websocket": "/ws",
        "docs": "/docs",
        "health": "/api/health",
    }
