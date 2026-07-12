"""
EMIOS HypothesisGenerator (Stage 4).

Enumerates ALL plausible causes from the EvidenceBundle + Sprint Whisperer
outputs (counters anchoring bias), always including a NULL hypothesis. Wires
each EvidenceItem to the hypotheses it supports/contradicts, and sets priors.
Posteriors stay 0.0 here (Stage 5 fills them).

Category is encoded in hypothesis_id as 'hyp-<category>-<hex>'.
"""
from __future__ import annotations

from typing import List
from uuid import uuid4

from app.domain.models import ProjectState
from app.domain.emios_models import (
    EvidenceBundle,
    EvidenceItem,
    Hypothesis,
    HypothesisStatus,
)
from app.engines import cognition_common as cc

BLOCKER = "BLOCKER"
VELOCITY = "VELOCITY"
SCOPE = "SCOPE"
CAPACITY = "CAPACITY"
DEPENDENCY = "DEPENDENCY"
NULL = "NULL"

PRIOR_CAP_LOW_CONFIDENCE = 0.5


def _hid(category: str) -> str:
    return f"hyp-{category.lower()}-{uuid4().hex[:6]}"


def hypothesis_category(h: Hypothesis) -> str:
    parts = (h.hypothesis_id or "").split("-")
    return parts[1].upper() if len(parts) >= 3 else NULL


def _evidence_category(item: EvidenceItem) -> str:
    src = item.source or ""
    return src.split("::")[1] if "::" in src else "NEUTRAL"


class HypothesisGenerator:
    """Stage 4: generate candidates + link evidence."""

    def run(
        self,
        bundle: EvidenceBundle,
        state: ProjectState,
        *,
        forecast=None,
        metrics=None,
        monte_carlo=None,
        critical_path=None,
    ) -> List[Hypothesis]:
        cp_ids = cc.critical_path_ids(critical_path)
        sprint_days = float(getattr(state.project_info, "sprint_duration_days", 14) or 14)
        low_conf = bool(getattr(bundle, "low_confidence_flag", False))

        hypotheses: List[Hypothesis] = []

        # 1. BLOCKER — a blocker >5 delay-days hitting the critical path.
        strong_blockers = [
            b for b in cc.open_blockers(state)
            if cc.blocker_delay_days(b) > 5.0 and cc.blocker_hits_critical_path(b, cp_ids)
        ]
        if strong_blockers:
            hypotheses.append(self._make(
                BLOCKER,
                "An external/critical blocker on the critical path is the primary cause of delay.",
                "If true, resolving the blocker should recover most of the forecast delay.",
                prior=0.75,
            ))

        # 2. VELOCITY — systematic slowdown (< -15%, declining 2+ sprints).
        trend = cc.velocity_trend_pct(metrics)
        series = cc.velocity_series(metrics)
        declining_2 = len(series) >= 3 and series[-1] < series[-2] < series[-3]
        if trend < -15.0 and (declining_2 or len(series) < 3):
            hypotheses.append(self._make(
                VELOCITY,
                "A systematic velocity slowdown across recent sprints is driving the delay.",
                "If true, per-sprint completed hours keep falling independent of any single blocker.",
                prior=0.6,
            ))

        # 3. SCOPE — scope growth > 15% of baseline.
        if cc.scope_growth_percent(forecast) > 15.0:
            hypotheses.append(self._make(
                SCOPE,
                "Scope growth beyond the original baseline is the primary cause of delay.",
                "If true, added/expanded items after baseline account for most of the extra effort.",
                prior=0.6,
            ))

        # 4. CAPACITY — a resource over the shared overload threshold.
        if cc.overloaded_resource_ids(metrics, threshold=cc.OVERLOAD_THRESHOLD):
            hypotheses.append(self._make(
                CAPACITY,
                f"Resource over-allocation (load ratio > {cc.OVERLOAD_THRESHOLD}) is constraining throughput.",
                "If true, the overloaded resources' items slip while others progress.",
                prior=0.55,
            ))

        # 5. DEPENDENCY — critical-path dependency with lead time > a sprint.
        if cc.critical_path_dependencies_over_lag(state, cp_ids, sprint_days):
            hypotheses.append(self._make(
                DEPENDENCY,
                "A long-lead dependency on the critical path is extending the schedule.",
                "If true, the dependent critical-path items cannot start until the lead time clears.",
                prior=0.5,
            ))

        # 6. NULL — the project is on track despite the signals.
        otp = cc.on_time_probability(monte_carlo)
        null_prior = max(0.1, otp if otp is not None else 0.1)
        hypotheses.append(self._make(
            NULL,
            "The project is fundamentally on track; observed signals are noise, not a systemic cause.",
            "If true, the on-time probability stays healthy and no single driver dominates the delay.",
            prior=null_prior,
        ))

        if low_conf:
            for h in hypotheses:
                h.prior = min(h.prior, PRIOR_CAP_LOW_CONFIDENCE)

        self._link_evidence(hypotheses, bundle)
        return hypotheses

    # ------------------------------------------------------------------ #
    def _make(self, category: str, statement: str, prediction: str, *, prior: float) -> Hypothesis:
        return Hypothesis(
            hypothesis_id=_hid(category),
            statement=statement,
            testable_prediction=prediction,
            prior=round(max(0.0, min(1.0, prior)), 4),
            posterior=0.0,
            status=HypothesisStatus.OPEN,
            supporting_evidence_ids=[],
        )

    def _link_evidence(self, hypotheses: List[Hypothesis], bundle: EvidenceBundle) -> None:
        by_cat = {hypothesis_category(h): h for h in hypotheses}
        null_h = by_cat.get(NULL)
        for idx, item in enumerate(bundle.items):
            ev_id = f"EV-{idx + 1:03d}"
            cat = _evidence_category(item)
            target = by_cat.get(cat)
            if target is not None:
                item.supports_hypothesis_ids.append(target.hypothesis_id)
                target.supporting_evidence_ids.append(ev_id)
                if null_h is not None and (item.weight or 0.0) >= 0.5:
                    item.contradicts_hypothesis_ids.append(null_h.hypothesis_id)