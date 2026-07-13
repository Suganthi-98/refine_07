"""
SignalMapper — projects ProjectMetrics + ForecastResult into a flat list of
Observation Signals. Each Signal is a NEUTRAL deviation report (no cause).

RESOURCE LOAD FIX: reads ProjectMetrics.resource_sprint_loads (peak per
resource) instead of the dead available_capacity_hours.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.engines.metrics_engine import ProjectMetrics
from app.api.models_phase3 import ForecastResult, MonteCarloResult
from app.engines import cognition_common as cc


class Signal(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    metric_name: str
    current_value: float
    baseline_value: float
    deviation_pct: float = Field(..., description="(current - baseline) / baseline, as a fraction")
    significance: str = Field(..., description='"HIGH" | "MEDIUM" | "LOW"')
    entity_id: Optional[str] = Field(None, description="resource_id / sprint_id, or None")


_HIGH = 0.25
_MED = 0.10


def _significance(deviation_pct: float) -> str:
    d = abs(deviation_pct)
    if d >= _HIGH:
        return "HIGH"
    if d >= _MED:
        return "MEDIUM"
    return "LOW"


def _safe_pct(current: float, baseline: float) -> float:
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

    def _velocity_trend_signal(self, metrics) -> List[Signal]:
        vm = getattr(metrics, "velocity_metrics", None)
        if vm is None:
            return []
        trend = float(getattr(vm, "velocity_trend_pct", 0.0) or 0.0)
        trend_frac = trend / 100.0 if abs(trend) > 1.0 else trend
        return [Signal(
            metric_name="velocity_trend_pct",
            current_value=round(trend, 4),
            baseline_value=0.0,
            deviation_pct=round(trend_frac, 4),
            significance=_significance(trend_frac),
        )]

    def _on_time_probability_signal(self, monte_carlo) -> Optional[Signal]:
        if monte_carlo is None:
            return None
        otp = float(getattr(monte_carlo, "on_time_probability", 0.0) or 0.0)
        baseline = 0.85
        dev = _safe_pct(otp, baseline)
        return Signal(
            metric_name="on_time_probability",
            current_value=round(otp, 4),
            baseline_value=baseline,
            deviation_pct=round(dev, 4),
            significance=_significance(dev),
        )

    def _resource_load_signals(self, metrics) -> List[Signal]:
        peaks = cc.peak_resource_loads(metrics)
        if peaks:
            signals: List[Signal] = []
            for name, load in peaks.items():
                baseline = 1.0
                dev = _safe_pct(load, baseline)
                signals.append(Signal(
                    metric_name="load_ratio",
                    current_value=round(load, 4),
                    baseline_value=baseline,
                    deviation_pct=round(dev, 4),
                    significance=_significance(dev),
                    entity_id=name,
                ))
            return signals
        rm = getattr(metrics, "resource_metrics", None)
        if rm is None:
            return []
        devs = getattr(rm, "developer_metrics", None) or []
        signals = []
        for d in devs:
            alloc = float(getattr(d, "allocation_pct", 0.0) or 0.0)
            avail = float(getattr(d, "availability_pct", 1.0) or 1.0)
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

    def _remaining_vs_planned_signal(self, metrics, forecast) -> Optional[Signal]:
        current = float(getattr(metrics, "remaining_effort_hours", 0.0) or 0.0)
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

    def _carryover_signal(self, metrics) -> Optional[Signal]:
        rate = getattr(metrics, "historical_carryover_rate", None)
        if rate is None:
            return None
        rate = float(rate)
        reference = 1.0
        dev = _safe_pct(rate, 0.0) if rate == 0 else min(rate / reference, 5.0)
        return Signal(
            metric_name="carryover_rate",
            current_value=round(rate, 4),
            baseline_value=0.0,
            deviation_pct=round(dev, 4),
            significance=_significance(dev),
        )