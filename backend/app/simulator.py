"""
simulator.py
------------
Owns the live simulation state:
  - which scenario is currently active (or "auto" cycling through all of them)
  - per-target tracking (previous position -> instantaneous planar speed,
    how long a target has been inside the critical range)
  - the resulting alert state machine, matching the physical NETRA32's
    haptic pattern logic:

      idle        -> no one within 6m
      one         -> exactly 1 person within 6m
      two         -> exactly 2 people within 6m
      three       -> 3 or more people within 6m
      rapid       -> any target closing distance faster than the rapid-approach threshold
      continuous  -> any target has remained inside the critical (<2m) range for 3+ seconds

Priority when multiple conditions are true: rapid > continuous > count-based.
"""

import math
import time
from typing import Dict, List, Optional

from .physics import (
    distance_3d,
    classify_zone,
    RAPID_APPROACH_SPEED_MPS,
    CONTINUOUS_PROXIMITY_SEC,
    DETECTION_RANGE_M,
    CRITICAL_RANGE_M,
)
from .scenarios import SCENARIOS, SCENARIO_ORDER, SCENARIO_DURATIONS

WEARER_POSITION = (0.0, 1.5, 0.0)  # approx chest height


class TargetTrack:
    """
    Per-target running state used to derive:
      - `speed`: raw planar movement speed (m/s) — shown in telemetry as
        "how fast is this target moving", regardless of direction.
      - `closing_speed`: rate the target's 3D distance to the wearer is
        shrinking (m/s) — this is what actually drives the "rapid approach"
        alert. A fast target moving *sideways* (not toward the wearer)
        should not trigger it; only a target that is truly closing distance
        quickly should.
    """

    __slots__ = ("id", "prev_pos", "prev_t", "prev_dist", "close_since", "speed", "closing_speed")

    def __init__(self, target_id: str):
        self.id = target_id
        self.prev_pos: Optional[tuple] = None
        self.prev_t: Optional[float] = None
        self.prev_dist: Optional[float] = None
        self.close_since: Optional[float] = None
        self.speed: float = 0.0
        self.closing_speed: float = 0.0

    def update(self, pos: tuple, dist: float, now: float) -> None:
        if self.prev_pos is not None and self.prev_t is not None:
            dt = max(1e-3, now - self.prev_t)
            dx = pos[0] - self.prev_pos[0]
            dz = pos[2] - self.prev_pos[2]
            planar_dist = math.sqrt(dx * dx + dz * dz)
            self.speed = planar_dist / dt
            if self.prev_dist is not None:
                # positive => distance to wearer is shrinking (closing in)
                self.closing_speed = (self.prev_dist - dist) / dt
        self.prev_pos = pos
        self.prev_t = now
        self.prev_dist = dist


class Simulator:
    """Drives the 20Hz tick loop and produces the JSON payload broadcast to clients."""

    def __init__(self):
        self.scenario_mode = "auto"           # "auto" or a specific scenario key
        self.auto_index = 0
        self.current_auto_scenario = SCENARIO_ORDER[0]
        self.scenario_elapsed = 0.0
        self.server_time = 0.0
        self.tracks: Dict[str, TargetTrack] = {}

    # -- control -----------------------------------------------------

    def available_scenarios(self) -> List[str]:
        return list(SCENARIOS.keys()) + ["auto"]

    def set_scenario(self, name: str) -> bool:
        if name != "auto" and name not in SCENARIOS:
            return False
        self.scenario_mode = name
        self.scenario_elapsed = 0.0
        self.tracks = {}
        if name != "auto":
            self.current_auto_scenario = name
        return True

    def _active_scenario_key(self) -> str:
        return self.current_auto_scenario if self.scenario_mode == "auto" else self.scenario_mode

    # -- simulation ----------------------------------------------------

    def tick(self, dt: float) -> dict:
        self.server_time += dt
        self.scenario_elapsed += dt

        active_key = self._active_scenario_key()
        duration = SCENARIO_DURATIONS.get(active_key, 12.0)

        if self.scenario_mode == "auto" and self.scenario_elapsed >= duration:
            self.scenario_elapsed = 0.0
            self.auto_index = (self.auto_index + 1) % len(SCENARIO_ORDER)
            self.current_auto_scenario = SCENARIO_ORDER[self.auto_index]
            self.tracks = {}
            active_key = self.current_auto_scenario

        raw_targets = SCENARIOS[active_key](self.scenario_elapsed)

        targets_out = []
        nearby_count = 0
        rapid = False
        continuous = False
        closest: Optional[float] = None

        for rt in raw_targets:
            tid = rt["id"]
            pos = (rt["x"], rt["y"], rt["z"])

            dist = distance_3d(WEARER_POSITION, pos)
            zone = classify_zone(dist)

            track = self.tracks.setdefault(tid, TargetTrack(tid))
            track.update(pos, dist, self.server_time)

            if dist <= DETECTION_RANGE_M:
                nearby_count += 1
            if closest is None or dist < closest:
                closest = dist

            # "rapid approach" = distance to the wearer is shrinking fast,
            # AND the target is already inside (or at) the detection field —
            # keeps this consistent with nearby_count so the UI never shows
            # "rapid approach" while simultaneously reporting 0 nearby targets.
            if track.closing_speed > RAPID_APPROACH_SPEED_MPS and dist <= DETECTION_RANGE_M:
                rapid = True

            if dist < CRITICAL_RANGE_M:
                if track.close_since is None:
                    track.close_since = self.server_time
                elif self.server_time - track.close_since > CONTINUOUS_PROXIMITY_SEC:
                    continuous = True
            else:
                track.close_since = None

            targets_out.append({
                "id": tid,
                "x": round(pos[0], 3),
                "y": round(pos[1], 3),
                "z": round(pos[2], 3),
                "distance": round(dist, 2),
                "speed": round(track.speed, 2),
                "zone": zone,
                "label": rt.get("label", "unknown"),
            })

        # stale tracks (targets that vanished this frame) are naturally
        # dropped next tick since we rebuild targets_out from raw_targets only

        if rapid:
            alert_state = "rapid"
        elif continuous:
            alert_state = "continuous"
        elif nearby_count >= 3:
            alert_state = "three"
        elif nearby_count == 2:
            alert_state = "two"
        elif nearby_count == 1:
            alert_state = "one"
        else:
            alert_state = "idle"

        return {
            "type": "state",
            "server_time": round(self.server_time, 2),
            "scenario": active_key,
            "scenario_mode": self.scenario_mode,
            "wearer": {"x": WEARER_POSITION[0], "y": WEARER_POSITION[1], "z": WEARER_POSITION[2]},
            "targets": targets_out,
            "alert": {
                "state": alert_state,
                "nearby_count": nearby_count,
                "closest_distance": round(closest, 2) if closest is not None else None,
            },
        }

    def current_state(self) -> dict:
        """Snapshot without advancing time — used to greet a newly-connected client."""
        return self.tick(0.0)
