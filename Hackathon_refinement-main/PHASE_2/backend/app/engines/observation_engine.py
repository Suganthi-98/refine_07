"""
EMIOS Observation Engine (Stage 1).

Detects anomalies in project signals WITHOUT interpreting their cause.
Hard architectural rule: an Observation NEVER contains a cause. It only reports
"metric X deviated from baseline by Y%, significance Z, direction D."

Consumes already-computed Sprint Whisperer outputs (ProjectMetrics, ForecastResult,
MonteCarloResult) plus raw ProjectState. Computes no forecast/risk math of its own.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from app.domain.models import (
    ProjectState,
    BlockerStatus,
    BlockerSeverity,
    SprintStatus,
    WorkItemStatus,
)
from app.domain.emios_models import (
    Observation,
    ObservationCluster,
    ObservationDirection,
)
from app.engines.metrics_engine import ProjectMetrics
from app.api.models_phase3 import ForecastResult, MonteCarloResult
from app.engines import cognition_common as cc  # shared resource-load source


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _significance_from_deviation(deviation_pct: float) -> str:
    """HIGH = |dev| > 30%, MEDIUM = 15-30%, LOW = otherwise.
    deviation_pct is a PERCENT (e.g. 31.0 == 31%)."""
    d = abs(deviation_pct)
    if d > 30.0:
        return "HIGH"
    if d >= 15.0:
        return "MEDIUM"
    return "LOW"


def _direction(deviation_pct: float, higher_is_better: bool) -> str:
    if abs(deviation_pct) < 5.0:
        return "STABLE"
    positive = deviation_pct > 0
    if higher_is_better:
        return "IMPROVING" if positive else "DEGRADING"
    return "DEGRADING" if positive else "IMPROVING"


class ObservationEngine:
    """Stage 1: emits a neutral ObservationCluster from deterministic outputs."""

    BASELINE_WINDOW: int = 6

    def run(
        self,
        state: ProjectState,
        metrics: ProjectMetrics,
        forecast: ForecastResult,
        monte_carlo: Optional[MonteCarloResult] = None,
    ) -> ObservationCluster:
        observations: List[Observation] = []

        observations.extend(self._detect_velocity_anomaly(state, metrics))
        observations.extend(self._detect_probability_anomaly(monte_carlo))
        observations.extend(self._detect_resource_overload(metrics))
        observations.extend(self._detect_blocker_escalation(state))
        observations.extend(self._detect_carryover_anomaly(state, metrics))
        observations.extend(self._detect_scope_growth(forecast))

        cluster_severity = self._worst_severity(observations)
        primary = self._primary_signal(observations)

        return ObservationCluster(
            cluster_id=f"obs-{uuid4().hex[:10]}",
            observations=observations,
            detected_at=_utcnow(),
            summary=self._summary(primary, observations),
            cluster_severity=cluster_severity,
            primary_signal=primary,
        )

    # ------------------------------------------------------------------ #
    def _make(
        self,
        metric: str,
        current: float,
        baseline: float,
        *,
        higher_is_better: bool,
        entity_id: Optional[str] = None,
        significance_override: Optional[str] = None,
    ) -> Observation:
        deviation_pct = ((current - baseline) / abs(baseline) * 100.0) if baseline else 0.0
        significance = significance_override or _significance_from_deviation(deviation_pct)
        return Observation(
            observation_id=f"o-{uuid4().hex[:8]}",
            metric_ref=metric,
            magnitude=round(current - baseline, 4),
            direction=self._dir_enum(deviation_pct, higher_is_better),
            significance=significance,
            current_value=round(current, 4),
            baseline_value=round(baseline, 4),
            deviation_pct=round(deviation_pct, 4),
            entity_id=entity_id,
            detected_at=_utcnow(),
            source_engine="ObservationEngine",
            cause=None,  # HARD RULE.
        )

    @staticmethod
    def _dir_enum(deviation_pct: float, higher_is_better: bool) -> ObservationDirection:
        if abs(deviation_pct) < 5.0:
            return ObservationDirection.FLAT
        return ObservationDirection.UP if deviation_pct > 0 else ObservationDirection.DOWN

    def _band(self, obs: Observation) -> str:
        return obs.significance

    # ------------------------------------------------------------------ #
    # Detector 1 — velocity anomaly
    # ------------------------------------------------------------------ #
    def _detect_velocity_anomaly(
        self, state: ProjectState, metrics: ProjectMetrics
    ) -> List[Observation]:
        vm = getattr(metrics, "velocity_metrics", None)
        series = list(getattr(vm, "velocity_by_sprint", []) or []) if vm else []
        if len(series) < 2:
            return []
        current = float(series[-1])
        prior = series[:-1][-self.BASELINE_WINDOW:]
        baseline = sum(prior) / len(prior) if prior else current
        if baseline <= 0:
            return []
        obs = self._make("velocity", current, baseline, higher_is_better=True)
        return [obs]

    # ------------------------------------------------------------------ #
    # Detector 2 — on-time probability anomaly
    # ------------------------------------------------------------------ #
    def _detect_probability_anomaly(
        self, monte_carlo: Optional[MonteCarloResult]
    ) -> List[Observation]:
        if monte_carlo is None:
            return []
        otp = float(getattr(monte_carlo, "on_time_probability", 0.0) or 0.0)
        baseline = 0.65
        if otp < 0.30:
            band = "HIGH"
        elif otp < 0.50:
            band = "MEDIUM"
        else:
            band = "LOW"
        obs = self._make(
            "on_time_probability", otp, baseline,
            higher_is_better=True, significance_override=band,
        )
        return [obs]

    # ------------------------------------------------------------------ #
    # Detector 3 — resource overload  (FIXED: reads resource_sprint_loads)
    # ------------------------------------------------------------------ #
    def _detect_resource_overload(self, metrics: ProjectMetrics) -> List[Observation]:
        """DeveloperMetrics has NO capacity field, so the old remaining/capacity
        ratio silently fell back to alloc*avail (<=1.0) and could never flag
        overload. The authoritative per-sprint load lives on
        ProjectMetrics.resource_sprint_loads; we flag each resource whose PEAK
        load across sprints exceeds 1.0. Baseline is 1.0 (fully loaded)."""
        out: List[Observation] = []
        peaks = cc.peak_resource_loads(metrics)  # {resource_name: peak_ratio}
        if peaks:
            for name, load in peaks.items():
                if load <= 1.0:
                    continue
                out.append(self._make(
                    "resource_load_ratio", load, 1.0,
                    higher_is_better=False, entity_id=name,
                ))
            return out
        # Fallback only when resource_sprint_loads is empty (alloc*avail <= 1.0,
        # so this rarely fires — preserved for parity with older inputs).
        rm = getattr(metrics, "resource_metrics", None)
        devs = getattr(rm, "developer_metrics", None) or [] if rm else []
        for d in devs:
            alloc = float(getattr(d, "allocation_pct", 0.0) or 0.0)
            avail = float(getattr(d, "availability_pct", 1.0) or 1.0)
            load_ratio = alloc * avail
            if load_ratio <= 1.0:
                continue
            out.append(self._make(
                "resource_load_ratio", load_ratio, 1.0,
                higher_is_better=False,
                entity_id=getattr(d, "resource_id", None) or getattr(d, "name", None),
            ))
        return out

    # ------------------------------------------------------------------ #
    # Detector 4 — blocker escalation
    # ------------------------------------------------------------------ #
    def _detect_blocker_escalation(self, state: ProjectState) -> List[Observation]:
        sprint_days = float(state.project_info.sprint_duration_days or 14)
        out: List[Observation] = []
        for b in getattr(state, "blockers", []) or []:
            status = getattr(b, "status", None)
            resolved = getattr(b, "actual_resolution_date", None) is not None
            is_open = (status == BlockerStatus.OPEN) or (status is None and not resolved)
            if not is_open:
                continue
            est_delay = self._blocker_delay_days(b)
            if est_delay <= sprint_days:
                continue
            obs = self._make(
                "blocker_delay_days", est_delay, sprint_days,
                higher_is_better=False,
                entity_id=getattr(b, "blocker_id", None),
            )
            out.append(obs)
        return out

    @staticmethod
    def _blocker_delay_days(blocker) -> float:
        est = getattr(blocker, "estimated_delay_days", None)
        if est is not None:
            return float(est)
        raised = getattr(blocker, "raised_date", None)
        target = getattr(blocker, "target_resolution_date", None)
        if raised is not None and target is not None:
            return max(0.0, (target - raised).days)
        return {
            BlockerSeverity.CRITICAL: 21.0,
            BlockerSeverity.HIGH: 14.0,
            BlockerSeverity.MEDIUM: 7.0,
            BlockerSeverity.LOW: 3.0,
        }.get(getattr(blocker, "severity", BlockerSeverity.MEDIUM), 7.0)

    # ------------------------------------------------------------------ #
    # Detector 5 — carryover anomaly (rate > 20%)
    # ------------------------------------------------------------------ #
    def _detect_carryover_anomaly(
        self, state: ProjectState, metrics: ProjectMetrics
    ) -> List[Observation]:
        rate = getattr(metrics, "historical_carryover_rate", None)
        if rate is None:
            return []
        total_items = float(getattr(metrics, "total_items", 0) or 0)
        completed_sprints = float(getattr(metrics, "completed_sprints", 0) or 0)
        avg_items_per_sprint = (total_items / completed_sprints) if completed_sprints > 0 else 0.0
        carry_fraction = (
            (float(rate) / avg_items_per_sprint) if avg_items_per_sprint > 0 else 0.0
        )
        if carry_fraction <= 0.20:
            return []
        obs = self._make(
            "carryover_rate", carry_fraction, 0.20, higher_is_better=False
        )
        return [obs]

    # ------------------------------------------------------------------ #
    # Detector 6 — scope growth (> 10% of baseline)
    # ------------------------------------------------------------------ #
    def _detect_scope_growth(self, forecast: ForecastResult) -> List[Observation]:
        pct = float(getattr(forecast, "scope_growth_percent", 0.0) or 0.0)
        if pct <= 10.0:
            return []
        obs = self._make(
            "scope_growth_pct", pct, 10.0, higher_is_better=False
        )
        return [obs]

    # ------------------------------------------------------------------ #
    # Cluster aggregation
    # ------------------------------------------------------------------ #
    def _worst_severity(self, observations: List[Observation]) -> str:
        order = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
        if not observations:
            return "LOW"
        worst = max(observations, key=lambda o: order.get(self._band(o), 0))
        band = self._band(worst)
        high_count = sum(1 for o in observations if self._band(o) == "HIGH")
        if band == "HIGH" and high_count >= 2:
            return "CRITICAL"
        return band

    def _primary_signal(self, observations: List[Observation]) -> Optional[Observation]:
        if not observations:
            return None
        return max(
            observations,
            key=lambda o: (o.significance, abs(o.deviation_pct or 0.0)),
        )

    def _summary(self, primary: Optional[Observation], observations: List[Observation]) -> str:
        if primary is None:
            return "No anomalies detected; all signals within expected bands."
        return (
            f"{len(observations)} signal(s) detected. Primary: {primary.metric_ref} "
            f"at {primary.current_value} vs baseline {primary.baseline_value} "
            f"({primary.deviation_pct:+.0f}%)."
        )