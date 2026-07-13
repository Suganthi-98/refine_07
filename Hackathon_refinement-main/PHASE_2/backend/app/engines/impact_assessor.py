"""
EMIOS ImpactAssessor (Stages 7-11): Multi-dimensional Impact Assessment.

Produces an ImpactMatrix keyed by ImpactDimension.value, one ImpactEstimate per
dimension, plus dominant_dimension (highest magnitude, deterministic tiebreak).
Magnitude is a 0-10 severity score; facts + leading indicator + time-to-
materialize are folded into `explanation`.
"""
from __future__ import annotations

from typing import Optional

from app.domain.models import ProjectState
from app.domain.emios_models import Diagnosis, ImpactMatrix, ImpactEstimate, ImpactDimension
from app.engines import cognition_common as cc

_UNIT = "score(0-10)"

_DOMINANCE_PRIORITY = {
    ImpactDimension.SCHEDULE.value: 5,
    ImpactDimension.BUSINESS.value: 4,
    ImpactDimension.RESOURCE.value: 3,
    ImpactDimension.QUALITY.value: 2,
    ImpactDimension.ORGANIZATIONAL.value: 1,
}


def _clamp10(x: float) -> float:
    return round(max(0.0, min(10.0, x)), 2)


def _clamp01(x: float) -> float:
    return round(max(0.0, min(1.0, x)), 4)


class ImpactAssessor:
    """Stages 7-11: schedule / quality / resource / business / organizational."""

    def run(
        self,
        diagnosis: Optional[Diagnosis],
        state: ProjectState,
        *,
        forecast=None,
        risk_result=None,
        monte_carlo=None,
        metrics=None,
        critical_path=None,
        impact_scores=None,
    ) -> ImpactMatrix:
        estimates = {}
        for est in (
            self._schedule(state, forecast, monte_carlo, critical_path),
            self._quality(metrics, impact_scores),
            self._resource(metrics),
            self._business(state, forecast, monte_carlo),
            self._organizational(metrics, state),
        ):
            estimates[est.dimension.value] = est

        dominant = None
        if estimates:
            dominant = max(
                estimates.values(),
                key=lambda e: (e.magnitude, _DOMINANCE_PRIORITY.get(e.dimension.value, 0)),
            ).dimension.value

        return ImpactMatrix(
            diagnosis_id=getattr(diagnosis, "diagnosis_id", None),
            estimates=estimates,
            dominant_dimension=dominant,
        )

    def _schedule(self, state, forecast, monte_carlo, critical_path) -> ImpactEstimate:
        delay = float(getattr(forecast, "expected_delay_days", 0.0) or 0.0) if forecast else 0.0
        otp = cc.on_time_probability(monte_carlo)
        sprint_days = float(getattr(state.project_info, "sprint_duration_days", 14) or 14)
        mag = _clamp10((delay / max(sprint_days, 1.0)) * 5.0)
        cp_len = len(cc.critical_path_ids(critical_path))
        facts = [f"Forecast delay {delay:+.1f} days"]
        if otp is not None:
            facts.append(f"on-time probability {otp:.0%}")
        facts.append(f"{cp_len} item(s) on the critical path (zero slack)")
        conf = _clamp01(0.5 + min(0.4, abs(delay) / (sprint_days * 4.0)))
        return ImpactEstimate(
            dimension=ImpactDimension.SCHEDULE, magnitude=mag, unit=_UNIT, confidence=conf,
            explanation="; ".join(facts)
            + f". Leading indicator: slip on any critical-path item. Materializes within ~{sprint_days:.0f} days.",
        )

    def _quality(self, metrics, impact_scores) -> ImpactEstimate:
        rework_rate = cc.rework_rate(metrics) if metrics else 0.0
        reopened_count = cc.reopened_count(metrics) if metrics else 0
        qm = getattr(metrics, "quality_metrics", None) if metrics else None
        defect_density = float(getattr(qm, "defect_density", 0.0) or 0.0) if qm else 0.0
        high_risk = len(getattr(impact_scores, "high_risk_items", []) or []) if impact_scores else 0
        mag = _clamp10(
            rework_rate * 10.0 * 0.6
            + min(defect_density, 5.0) * 0.5
            + min(reopened_count, 10) * 0.2
            + min(high_risk, 10) * 0.1
        )
        conf = _clamp01(0.4 + (0.3 if qm is not None else 0.0) + min(0.3, high_risk / 20.0))
        return ImpactEstimate(
            dimension=ImpactDimension.QUALITY, magnitude=mag, unit=_UNIT, confidence=conf,
            explanation=(
                f"Rework {rework_rate:.0%}, defect density {defect_density:.2f}, "
                f"{reopened_count} reopened item(s), {high_risk} high-risk item(s). "
                "Leading indicator: rising reopen/defect rate. Materializes over 1-2 sprints."
            ),
        )

    def _resource(self, metrics) -> ImpactEstimate:
        peaks = cc.peak_resource_loads(metrics) if metrics else {}
        overloaded = cc.overloaded_resource_ids(metrics) if metrics else []
        max_load = max(peaks.values()) if peaks else 0.0
        team = 0
        rm = getattr(metrics, "resource_metrics", None) if metrics else None
        if rm is not None:
            team = int(getattr(rm, "team_size", 0) or 0)
        share = (len(overloaded) / team) if team > 0 else 0.0
        mag = _clamp10((max(0.0, max_load - 1.0)) * 6.0 + share * 6.0)
        conf = _clamp01(0.5 + (0.3 if peaks else 0.0))
        names = ", ".join(overloaded[:3]) or "none"
        return ImpactEstimate(
            dimension=ImpactDimension.RESOURCE, magnitude=mag, unit=_UNIT, confidence=conf,
            explanation=(
                f"Peak load {max_load:.2f}; {len(overloaded)}/{team or '?'} resource(s) over "
                f"{cc.OVERLOAD_THRESHOLD} ({names}). "
                "Leading indicator: sustained >1.0 load across sprints. Materializes immediately."
            ),
        )

    def _business(self, state, forecast, monte_carlo) -> ImpactEstimate:
        delay = float(getattr(forecast, "expected_delay_days", 0.0) or 0.0) if forecast else 0.0
        otp = cc.on_time_probability(monte_carlo)
        info = state.project_info
        has_release = getattr(info, "release_date", None) is not None
        base = (delay / 30.0) * 5.0 if delay > 0 else 0.0
        if otp is not None:
            base += (1.0 - otp) * 4.0
        if has_release and delay > 0:
            base += 1.5
        mag = _clamp10(base)
        conf = _clamp01(0.45 + (0.25 if otp is not None else 0.0) + (0.15 if has_release else 0.0))
        rel = "committed release date at risk" if has_release else "internal target date"
        return ImpactEstimate(
            dimension=ImpactDimension.BUSINESS, magnitude=mag, unit=_UNIT, confidence=conf,
            explanation=(
                f"{delay:+.1f} days vs target ({rel}); on-time probability "
                f"{('%.0f%%' % (otp * 100)) if otp is not None else 'n/a'}. "
                "Leading indicator: forecast finish crossing the committed date. Materializes at release."
            ),
        )

    def _organizational(self, metrics, state) -> ImpactEstimate:
        carry = float(getattr(metrics, "historical_carryover_rate", 0.0) or 0.0) if metrics else 0.0
        trend = cc.velocity_trend_pct(metrics) if metrics else 0.0
        overloaded = len(cc.overloaded_resource_ids(metrics)) if metrics else 0
        mag = _clamp10(
            min(carry, 5.0) * 0.8
            + (abs(trend) / 10.0 if trend < 0 else 0.0)
            + overloaded * 1.0
        )
        conf = _clamp01(0.4 + (0.2 if metrics else 0.0))
        return ImpactEstimate(
            dimension=ImpactDimension.ORGANIZATIONAL, magnitude=mag, unit=_UNIT, confidence=conf,
            explanation=(
                f"Carryover rate {carry:.1f}/sprint, velocity trend {trend:.0f}%, "
                f"{overloaded} chronically overloaded resource(s). "
                "Leading indicator: repeated carryover + falling velocity (burnout signal). "
                "Materializes over multiple sprints."
            ),
        )