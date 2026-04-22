#!/usr/bin/env python3
# nav_assist.py - Shadow-mode navigation assistant for FrogPilot
# SAFETY: Read-only observer. Does NOT publish to any planner or actuator channel.
# Gate: Params key 'NavAssistShadowEnabled' (default False)

import math
import time

import cereal.messaging as messaging
from openpilot.common.params import Params
from openpilot.common.realtime import set_realtime_priority

# Maneuver classes emitted by this module
MANEUVER_NONE = "none"
MANEUVER_LEFT = "left"
MANEUVER_RIGHT = "right"
MANEUVER_STRAIGHT = "straight"
MANEUVER_EXIT = "exit"

# Confidence thresholds
CONF_HIGH = 0.75
CONF_LOW = 0.30

# Publish rate (Hz) - matches frogpilotNavigation service rate
PUBLISH_HZ = 1.0


def compute_maneuver(nav_instruction: dict) -> tuple[str, float, float]:
  """
  Derive maneuver class, distance, and confidence from a navInstruction message.
  Returns (maneuver_class, distance_m, confidence).
  This is shadow-mode: result is logged only, not fed to planner.
  """
  maneuver_class = MANEUVER_NONE
  distance_m = 0.0
  confidence = 0.0

  if not nav_instruction:
    return maneuver_class, distance_m, confidence

  # Distance to next maneuver in metres
  dist = nav_instruction.get("distanceToTurn", 0.0)
  modifier = nav_instruction.get("modifier", "").lower()
  action = nav_instruction.get("type", "").lower()

  distance_m = float(dist)

  # Derive maneuver class from modifier and action
  if "left" in modifier or "left" in action:
    maneuver_class = MANEUVER_LEFT
  elif "right" in modifier or "right" in action:
    maneuver_class = MANEUVER_RIGHT
  elif "ramp" in modifier or "exit" in action or "off ramp" in modifier:
    maneuver_class = MANEUVER_EXIT
  elif action in ("continue", "head", "merge") or "straight" in modifier:
    maneuver_class = MANEUVER_STRAIGHT
  elif action != "":
    maneuver_class = MANEUVER_STRAIGHT

  # Confidence: higher when distance is known and action is unambiguous
  if distance_m > 0 and maneuver_class != MANEUVER_NONE:
    if maneuver_class in (MANEUVER_LEFT, MANEUVER_RIGHT, MANEUVER_EXIT):
      confidence = CONF_HIGH
    else:
      confidence = CONF_LOW
  else:
    confidence = 0.0

  return maneuver_class, distance_m, confidence


def nav_assist_thread():
  params = Params()

  # Hard gate: bail immediately if not enabled
  if not params.get_bool("NavAssistShadowEnabled"):
    print("[nav_assist] NavAssistShadowEnabled=False, exiting.")
    return

  set_realtime_priority(5)

  # Subscribe to upstream nav and FrogPilot state channels (read-only)
  sm = messaging.SubMaster([
    "navInstruction",
    "navRoute",
    "frogpilotNavigation",
    "frogpilotPlan",
    "frogpilotCarState",
    "carState",
    "modelV2",
  ])

  # Publish ONLY to frogpilotNavigation (shadow fields)
  # This channel is already published by frogpilot_process;
  # nav_assist adds its own shadow fields without overwriting controls fields.
  pm = messaging.PubMaster(["frogpilotNavigation"])

  print("[nav_assist] Shadow mode active. Logging only - no control effect.")

  last_publish = 0.0

  while True:
    sm.update()

    # Re-check param each cycle to allow hot-disable
    if not params.get_bool("NavAssistShadowEnabled"):
      print("[nav_assist] NavAssistShadowEnabled toggled off, exiting.")
      break

    now = time.monotonic()
    if (now - last_publish) < (1.0 / PUBLISH_HZ):
      continue
    last_publish = now

    # Read nav instruction
    nav_instr = sm["navInstruction"].to_dict() if sm.updated["navInstruction"] else {}

    # Compute shadow maneuver prediction
    maneuver_class, distance_m, confidence = compute_maneuver(nav_instr)

    # Read existing FrogPilotNavigation values (written by frogpilot_process)
    fp_nav = sm["frogpilotNavigation"]

    # Publish shadow fields into frogpilotNavigation
    # NOTE: We carry forward the existing fields from frogpilot_process to
    # avoid overwriting approachingIntersection, approachingTurn, navigationSpeedLimit.
    msg = messaging.new_message("frogpilotNavigation")
    msg.frogpilotNavigation.approachingIntersection = fp_nav.approachingIntersection
    msg.frogpilotNavigation.approachingTurn = fp_nav.approachingTurn
    msg.frogpilotNavigation.navigationSpeedLimit = fp_nav.navigationSpeedLimit
    # Shadow-only fields:
    msg.frogpilotNavigation.maneuverClass = maneuver_class
    msg.frogpilotNavigation.maneuverDistanceM = distance_m
    msg.frogpilotNavigation.navAssistConfidence = confidence
    msg.frogpilotNavigation.navAssistActive = True
    pm.send("frogpilotNavigation", msg)

    print(
      f"[nav_assist] maneuver={maneuver_class} dist={distance_m:.1f}m "
      f"conf={confidence:.2f} "
      f"approachingIntersection={fp_nav.approachingIntersection} "
      f"approachingTurn={fp_nav.approachingTurn}"
    )


def main():
  nav_assist_thread()


if __name__ == "__main__":
  main()
