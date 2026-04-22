"""
Unit tests for compute_maneuver() in nav_assist.py.

compute_maneuver() is pure Python with no cereal/openpilot runtime dependencies,
so we stub out the module-level imports before importing to keep tests self-contained.
We use SimpleNamespace to mimic capnp message attribute access.
"""
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock

# Stub modules that require openpilot/cereal runtime before importing nav_assist
for mod in (
  "cereal",
  "cereal.messaging",
  "openpilot",
  "openpilot.common",
  "openpilot.common.params",
  "openpilot.common.realtime",
  "openpilot.common.swaglog",
):
  if mod not in sys.modules:
    sys.modules[mod] = MagicMock()

from frogpilot.navigation.nav_assist import (  # noqa: E402
  compute_maneuver,
  MANEUVER_NONE,
  MANEUVER_LEFT,
  MANEUVER_RIGHT,
  MANEUVER_STRAIGHT,
  MANEUVER_EXIT,
  CONF_HIGH,
  CONF_LOW,
)


def nav_instr(type="", modifier="", distance=0.0):
  """Build a minimal fake navInstruction capnp message."""
  return SimpleNamespace(
    maneuverType=type,
    maneuverModifier=modifier,
    maneuverDistance=distance,
  )


class TestComputeManeuver:
  def test_none_returns_none_class(self):
    cls, dist, conf = compute_maneuver(None)
    assert cls == MANEUVER_NONE
    assert dist == 0.0
    assert conf == 0.0

  def test_left_turn_via_modifier(self):
    cls, dist, conf = compute_maneuver(nav_instr("turn", "left", 250.0))
    assert cls == MANEUVER_LEFT
    assert dist == 250.0
    assert conf == CONF_HIGH

  def test_left_turn_via_type(self):
    cls, dist, conf = compute_maneuver(nav_instr("turn left", "", 100.0))
    assert cls == MANEUVER_LEFT
    assert dist == 100.0
    assert conf == CONF_HIGH

  def test_right_turn_via_modifier(self):
    cls, dist, conf = compute_maneuver(nav_instr("turn", "right", 180.0))
    assert cls == MANEUVER_RIGHT
    assert dist == 180.0
    assert conf == CONF_HIGH

  def test_right_turn_via_type(self):
    cls, dist, conf = compute_maneuver(nav_instr("turn right", "", 80.0))
    assert cls == MANEUVER_RIGHT
    assert dist == 80.0
    assert conf == CONF_HIGH

  def test_exit_via_type(self):
    cls, dist, conf = compute_maneuver(nav_instr("exit", "", 500.0))
    assert cls == MANEUVER_EXIT
    assert dist == 500.0
    assert conf == CONF_HIGH

  def test_exit_via_ramp_modifier(self):
    cls, dist, conf = compute_maneuver(nav_instr("", "ramp", 400.0))
    assert cls == MANEUVER_EXIT
    assert dist == 400.0
    assert conf == CONF_HIGH

  def test_exit_via_off_ramp_modifier(self):
    cls, dist, conf = compute_maneuver(nav_instr("", "off ramp", 350.0))
    assert cls == MANEUVER_EXIT
    assert dist == 350.0
    assert conf == CONF_HIGH

  def test_straight_continue(self):
    cls, dist, conf = compute_maneuver(nav_instr("continue", "", 1000.0))
    assert cls == MANEUVER_STRAIGHT
    assert dist == 1000.0
    assert conf == CONF_LOW

  def test_straight_head(self):
    cls, dist, conf = compute_maneuver(nav_instr("head", "", 800.0))
    assert cls == MANEUVER_STRAIGHT
    assert dist == 800.0
    assert conf == CONF_LOW

  def test_straight_merge(self):
    cls, dist, conf = compute_maneuver(nav_instr("merge", "", 600.0))
    assert cls == MANEUVER_STRAIGHT
    assert dist == 600.0
    assert conf == CONF_LOW

  def test_straight_via_modifier(self):
    cls, dist, conf = compute_maneuver(nav_instr("", "straight", 600.0))
    assert cls == MANEUVER_STRAIGHT
    assert dist == 600.0
    assert conf == CONF_LOW

  def test_unknown_type_falls_through_to_straight(self):
    # Any non-empty, non-matching type should default to STRAIGHT
    cls, dist, conf = compute_maneuver(nav_instr("new name", "", 200.0))
    assert cls == MANEUVER_STRAIGHT
    assert conf == CONF_LOW

  def test_zero_distance_suppresses_confidence(self):
    # Known maneuver class but distance=0 → confidence must be 0
    cls, dist, conf = compute_maneuver(nav_instr("turn", "left", 0.0))
    assert cls == MANEUVER_LEFT
    assert dist == 0.0
    assert conf == 0.0

  def test_case_insensitive_matching(self):
    cls, dist, conf = compute_maneuver(nav_instr("Turn", "LEFT", 120.0))
    assert cls == MANEUVER_LEFT
    assert conf == CONF_HIGH

  def test_empty_type_and_modifier_is_none(self):
    # Valid distance but no type or modifier → NONE, no confidence
    cls, dist, conf = compute_maneuver(nav_instr("", "", 300.0))
    assert cls == MANEUVER_NONE
    assert conf == 0.0
