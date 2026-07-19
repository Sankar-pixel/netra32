"""
scenarios.py
------------
Mock 3D human-movement generators.

Each scenario is a pure function of elapsed time `t` (seconds, always >= 0)
that returns a list of "raw target" dicts:

    {"id": str, "x": float, "y": float, "z": float, "label": str}

Coordinate convention (matches the Three.js frontend):
    X -> left/right
    Z -> forward/back
    Y -> height off the ground (meters). Standing eye/shoulder height is
         roughly 1.6-1.75m, crouching drops that to ~0.9-1.1m.

The wearer stands at the origin, roughly (0, 1.5, 0) chest height.
Every scenario is designed to loop cleanly (using `t % period`) so it can
run forever, either standalone or as one phase of the auto-cycle.
"""

import math
from typing import Callable, Dict, List


def idle_scenario(t: float) -> List[dict]:
    """No one around. Perimeter clear."""
    return []


def walk_past(t: float) -> List[dict]:
    """A single person walks laterally past the wearer at a steady ~4m offset."""
    period = 10.0
    tt = t % period
    p = tt / period
    x = -9.0 + p * 18.0
    z = 4.0
    y = 1.65
    return [{"id": "walker-1", "x": x, "y": y, "z": z, "label": "pedestrian (walk-by)"}]


def rapid_approach(t: float) -> List[dict]:
    """Someone closes distance quickly from outside the field to near the wearer."""
    period = 6.0
    tt = t % period
    p = tt / period
    dist = 9.0 - p * 8.0  # 9m -> 1m
    angle = math.radians(35)
    x = math.sin(angle) * dist
    z = math.cos(angle) * dist
    y = 1.7
    return [{"id": "rapid-1", "x": x, "y": y, "z": z, "label": "fast approach"}]


def crouch_intruder(t: float) -> List[dict]:
    """
    Someone approaches slowly, lowers their height (crouching / sneaking) as
    they close in, then lingers at close range to demonstrate the
    'continuous proximity' alert.
    """
    period = 14.0
    tt = t % period
    angle = math.radians(-50)

    if tt < 8.0:
        p = tt / 8.0
        dist = 8.5 - p * 7.0       # 8.5m -> 1.5m
        height = 1.7 - p * 0.7     # 1.7m -> 1.0m (crouching down)
    else:
        # lingers close to the wearer with a slight bob
        dist = 1.5
        height = 1.0 + 0.05 * math.sin(tt * 2.0)

    x = math.sin(angle) * dist
    z = math.cos(angle) * dist
    return [{"id": "crouch-1", "x": x, "y": height, "z": z, "label": "low-profile approach"}]


def multi_target(t: float) -> List[dict]:
    """Three people converge from different angles to demonstrate '3+ people nearby'."""
    period = 12.0
    tt = t % period
    p = tt / period
    start_dist, end_dist = 8.0, 3.0
    dist = start_dist - p * (start_dist - end_dist)
    out = []
    for i, angle_deg in enumerate([20, 160, 260]):
        rad = math.radians(angle_deg)
        x = math.sin(rad) * dist
        z = math.cos(rad) * dist
        out.append({"id": f"multi-{i}", "x": x, "y": 1.6, "z": z, "label": f"group member {i+1}"})
    return out


# Registry ---------------------------------------------------------------

SCENARIOS: Dict[str, Callable[[float], List[dict]]] = {
    "idle": idle_scenario,
    "walk_past": walk_past,
    "rapid_approach": rapid_approach,
    "crouch_intruder": crouch_intruder,
    "multi_target": multi_target,
}

# Order + per-scenario duration (seconds) used by the auto-cycle mode
SCENARIO_ORDER: List[str] = ["idle", "walk_past", "rapid_approach", "crouch_intruder", "multi_target"]

SCENARIO_DURATIONS: Dict[str, float] = {
    "idle": 6.0,
    "walk_past": 10.0,
    "rapid_approach": 6.0,
    "crouch_intruder": 14.0,
    "multi_target": 12.0,
}
