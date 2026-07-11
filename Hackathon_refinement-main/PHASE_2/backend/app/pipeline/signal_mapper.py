"""
SignalMapper — projects ProjectMetrics + ForecastResult into a flat list of
Observation Signals (EMIOS Stage 1: Observation input stream).

Each Signal is a NEUTRAL deviation report: metric, current, baseline, deviation,
and a significance band. It contains no cause (Stage 1 rule).

NOTE on on_time_probability: it lives on MonteCarloResult, NOT ForecastResult
(verified against models_phase3.py). To keep your requested signature intact,
monte_carlo is an OPTIONAL third arg; when omitted the on-time signal is skipped
rather than fabricated. Pass result.monte_carlo to include it.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.engines.metrics_engine import ProjectMetrics
from app.api.models_phase3 import ForecastResult, MonteCarloResult


class Signal(BaseModel):
    """A neutral, non-causal deviation report for the Observation Engine."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    metric_name: str
    current_value: float
    baseline_value: float
    deviation_pct: float = Field(..., description="(current - baseline) / baseline, as a fraction")
    significance: str = Field(..., description='"HIGH" | "MEDIUM" | "LOW"')
    entity_id: Optional[str] = Field(None, description="resource_id / sprint_id, or None for project-level")


# Significance thresholds on absolute deviation fraction. Tunable per project;
# these are deliberately conservative so only real moves flag HIGH.
_HIGH = 0.25   # >= 25% deviation
_MED = 0.10    # >= 10% deviation


def _significance(deviation_pct: float) -> str:
    d = abs(deviation_pct)
    if d >= _HIGH:
        return "HIGH"
    if d >= _MED:
        return "MEDIUM"
    return "LOW"


def _safe_pct(current: float, baseline: float) -> float:
    """(current - baseline) / baseline, guarding divide-by-zero."""
    if baseline == 0:
        return 0.0 if current == 0 else 1.0
    return (current - baseline) / abs(baseline)


class SignalMapper:
    """Builds the Observation Engine's raw signal stream from deterministic outputs."""

    def map_to_observation_signals(
        self,
        metrics: ProjectMetrics,
        forecast: ForecastResult,
        monte_carlo: Optional[MonteCarloResult] = None,
    ) -> List[Signal]:
        signals: List[Signal] = []

        signals.extend(self._velocity_trend_signal(metrics))
        on_time = self._on_time_probability_signal(monte_carlo)
        if on_time is not None:
            signals.append(on_time)
        signals.extend(self._resource_load_signals(metrics))
        rem = self._remaining_vs_planned_signal(metrics, forecast)
        if rem is not None:
            signals.append(rem)
        carry = self._carryover_signal(metrics)
        if carry is not None:
            signals.append(carry)

        return signals

    # --- velocity_trend_pct: trend vs a flat (0%) baseline -----------------
    def _velocity_trend_signal(self, metrics: ProjectMetrics) -> List[Signal]:
        vm = getattr(metrics, "velocity_metrics", None)
        if vm is None:
            return []
        trend = float(getattr(vm, "velocity_trend_pct", 0.0) or 0.0)
        # velocity_trend_pct is already a percentage-change figure; baseline is
        # 0% (no trend). Express deviation directly as the trend fraction.
        trend_frac = trend / 100.0 if abs(trend) > 1.0 else trend
        return [Signal(
            metric_name="velocity_trend_pct",
            current_value=round(trend, 4),
            baseline_value=0.0,
            deviation_pct=round(trend_frac, 4),
            significance=_significance(trend_frac),
        )]

    # --- on_time_probability: current MC prob vs a 0.85 target baseline ----
    def _on_time_probability_signal(self, monte_carlo: Optional[MonteCarloResult]) -> Optional[Signal]:
        if monte_carlo is None:
            return None  # source lives on MC, not forecast — skip if not provided
        otp = float(getattr(monte_carlo, "on_time_probability", 0.0) or 0.0)
        # TODO Phase 6: replace with CalibrationStore.get_team_baseline(team_id),
        # or derive from historical MonteCarloResult mean across completed
        # projects. A team that historically delivers at 70% is not in distress
        # at 70%; a fixed 0.85 target flags them falsely until calibrated.
        baseline = 0.85  # a healthy delivery target; deviation below this is the signal
        dev = _safe_pct(otp, baseline)
        return Signal(
            metric_name="on_time_probability",
            current_value=round(otp, 4),
            baseline_value=baseline,
            deviation_pct=round(dev, 4),
            significance=_significance(dev),
        )

    # --- load_ratio per resource: assigned vs available capacity -----------
    def _resource_load_signals(self, metrics: ProjectMetrics) -> List[Signal]:
        rm = getattr(metrics, "resource_metrics", None)
        if rm is None:
            return []
        devs = getattr(rm, "developer_metrics", None) or []
        signals: List[Signal] = []
        for d in devs:
            # DeveloperMetrics has no load_ratio field (see NOTE 3); derive it as
            # OVER-COMMITMENT relative to capacity, NOT a completion fraction.
            # Prefer remaining work / remaining capacity when capacity is known.
            alloc = float(getattr(d, "allocation_pct", 0.0) or 0.0)
            avail = float(getattr(d, "availability_pct", 1.0) or 1.0)
            remaining = float(getattr(d, "remaining_effort_hours", 0.0) or 0.0)
            remaining_capacity = float(getattr(d, "available_capacity_hours", 0.0) or 0.0)

            if remaining_capacity > 0:
                # >1.0 means more work assigned than capacity to do it: overloaded.
                load_ratio = remaining / remaining_capacity
                baseline = 1.0
            else:
                # No capacity field: use allocation as the load proxy. 0.8 = fully
                # loaded; >0.8 = overloaded. More honest than a completion fraction.
                load_ratio = alloc * avail
                baseline = 0.8

            dev = _safe_pct(load_ratio, baseline)
            signals.append(Signal(
                metric_name="load_ratio",
                current_value=round(load_ratio, 4),
                baseline_value=baseline,
                deviation_pct=round(dev, 4),
                significance=_significance(dev),
                entity_id=getattr(d, "resource_id", None) or getattr(d, "name", None),
            ))
        return signals

    # --- total_remaining_hours vs planned throughput -----------------------
    def _remaining_vs_planned_signal(
        self, metrics: ProjectMetrics, forecast: ForecastResult
    ) -> Optional[Signal]:
        current = float(getattr(metrics, "remaining_effort_hours", 0.0) or 0.0)
        # Baseline = planned throughput still available across remaining sprints,
        # approximated as actual_avg_velocity * remaining_sprints. Fall back to
        # total_effort_hours if forecast_input_metrics isn't populated.
        fim = getattr(metrics, "forecast_input_metrics", None)
        remaining_sprints = float(getattr(fim, "remaining_sprints", 0.0) or 0.0) if fim else 0.0
        avg_velocity = float(getattr(metrics, "actual_avg_velocity", 0.0) or 0.0)
        planned_capacity = remaining_sprints * avg_velocity
        baseline = planned_capacity if planned_capacity > 0 else float(
            getattr(metrics, "total_effort_hours", 0.0) or 0.0
        )
        if baseline <= 0:
            return None
        dev = _safe_pct(current, baseline)
        return Signal(
            metric_name="total_remaining_hours",
            current_value=round(current, 2),
            baseline_value=round(baseline, 2),
            deviation_pct=round(dev, 4),
            significance=_significance(dev),
        )

    # --- carryover_rate vs a 0 (no-carryover) baseline ---------------------
    def _carryover_signal(self, metrics: ProjectMetrics) -> Optional[Signal]:
        rate = getattr(metrics, "historical_carryover_rate", None)
        if rate is None:
            return None
        rate = float(rate)
        # Baseline of 0 items/sprint = ideal. Any positive rate is the deviation;
        # normalize against a 1.0 items/sprint reference so the fraction is bounded
        # and comparable to the other signals' significance bands.
        reference = 1.0
        dev = _safe_pct(rate, 0.0) if rate == 0 else min(rate / reference, 5.0)
        return Signal(
            metric_name="carryover_rate",
            current_value=round(rate, 4),
            baseline_value=0.0,
            deviation_pct=round(dev, 4),
            significance=_significance(dev),
        )
