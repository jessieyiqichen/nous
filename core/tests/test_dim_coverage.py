"""Unit tests for Blind Spots confidence override logic."""

import pytest

from dim_coverage import override_blind_spots_confidence


def _coverage(confidence: str) -> dict:
    return {
        "dimensions": [
            {"name": "Decision Architecture", "confidence": "high"},
            {"name": "Blind Spots", "confidence": confidence},
        ]
    }


def _blind_spots(coverage: dict) -> str:
    return next(
        d["confidence"] for d in coverage["dimensions"] if d["name"] == "Blind Spots"
    )


@pytest.mark.unit
def test_fewer_than_two_conflicts_changes_nothing():
    cov = _coverage("low")
    override_blind_spots_confidence(cov, 1)
    assert _blind_spots(cov) == "low"


@pytest.mark.unit
def test_two_conflicts_raises_to_medium():
    cov = _coverage("none")
    override_blind_spots_confidence(cov, 2)
    assert _blind_spots(cov) == "medium"


@pytest.mark.unit
def test_four_conflicts_raises_to_high():
    cov = _coverage("low")
    override_blind_spots_confidence(cov, 4)
    assert _blind_spots(cov) == "high"


@pytest.mark.unit
def test_never_downgrades_existing_high():
    cov = _coverage("high")
    override_blind_spots_confidence(cov, 2)
    assert _blind_spots(cov) == "high"


@pytest.mark.unit
def test_other_dimensions_untouched():
    cov = _coverage("low")
    override_blind_spots_confidence(cov, 4)
    assert cov["dimensions"][0]["confidence"] == "high"
