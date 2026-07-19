"""
physics.py
----------
Core distance math and threat-zone classification for NETRA32.

Distance is the plain 3D Euclidean distance between two points:

    d = sqrt( (x2-x1)^2 + (y2-y1)^2 + (z2-z1)^2 )

Zones:
    RED     -> distance < 2m   (critical / immediate proximity)
    YELLOW  -> 2m <= distance <= 6m (warning / inside detection field)
    GREEN   -> distance > 6m   (safe / outside detection field)
"""

import math
from typing import Tuple

Point3D = Tuple[float, float, float]

CRITICAL_RANGE_M = 2.0
DETECTION_RANGE_M = 6.0

RAPID_APPROACH_SPEED_MPS = 1.3   # planar speed threshold that counts as "rapid approach"
CONTINUOUS_PROXIMITY_SEC = 3.0    # time inside critical range before "continuous proximity" fires


def distance_3d(a: Point3D, b: Point3D) -> float:
    """Euclidean distance between two 3D points."""
    return math.sqrt(
        (a[0] - b[0]) ** 2 +
        (a[1] - b[1]) ** 2 +
        (a[2] - b[2]) ** 2
    )


def classify_zone(distance: float) -> str:
    """Map a distance in meters to a threat zone label."""
    if distance < CRITICAL_RANGE_M:
        return "red"
    if distance <= DETECTION_RANGE_M:
        return "yellow"
    return "green"
