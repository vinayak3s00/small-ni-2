# Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
# Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
# or use of this file, via any medium, is strictly prohibited.
# See the LICENSE file at the repository root. Contact: legal@abetworks.in

"""Explainable scoring engine for AbetVerticals.

Baseline requirement: scores refresh in <=30s and *show their reasoning*.
Weights come from the per-vertical Intelligence Pack (`scoring.yaml`), so the
same engine serves realty / care / admit with different signal weights.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ScoringPack:
    """Signal weights + human-readable reason labels for one vertical."""

    vertical: str
    weights: dict[str, int]
    labels: dict[str, str]

    @classmethod
    def from_manifest(cls, manifest: dict) -> "ScoringPack":
        scoring = manifest.get("scoring", {})
        signals = scoring.get("signals", {})
        labels = scoring.get("labels", {})
        return cls(
            vertical=manifest.get("vertical", "unknown"),
            weights={k: int(v) for k, v in signals.items()},
            # default label = signal key prettified
            labels={k: labels.get(k, k.replace("_", " ")) for k in signals},
        )


@dataclass(frozen=True)
class ScoreResult:
    score: int
    reasons: list[str]
    refreshed_at: str


def score_record(pack: ScoringPack, signals: dict[str, bool]) -> ScoreResult:
    """Compute an explainable score.

    - `signals` is a map of signal_key -> present(bool).
    - The score is the sum of weights for present signals, capped at 100.
    - Reasons are the human labels for the signals that fired, ordered by weight
      (highest contribution first) so the top reason is the most decisive.
    """
    fired = [(key, pack.weights[key]) for key, present in signals.items()
             if present and key in pack.weights]
    fired.sort(key=lambda kv: kv[1], reverse=True)

    total = min(sum(weight for _, weight in fired), 100)
    reasons = [pack.labels[key] for key, _ in fired]

    return ScoreResult(
        score=total,
        reasons=reasons,
        refreshed_at=datetime.now(timezone.utc).isoformat(),
    )
