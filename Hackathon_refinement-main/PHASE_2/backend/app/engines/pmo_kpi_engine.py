"""
PMO KPI Engine

Computes executive-level PMO KPIs that a remaining-effort/velocity forecast
alone cannot surface: Schedule Performance Index, Sprint/Milestone Adherence,
Critical Path Drift, Dependency Pressure, Forecast Confidence Decomposition,
Recovery Feasibility, Calendar Variance, and Release Readiness Index.

Deliberately a SEPARATE engine from ForecastEngine. ForecastEngine answers
"when will we finish". This engine answers "are we behind plan right now,
is that lateness spreading, and can we still recover" -- questions a single
finish-date number structurally cannot answer on its own. See the
forecasting audit for the full rationale behind each KPI.

Consumes the outputs of MetricsEngine, ForecastEngine, and CriticalPathEngine
rather than re-deriving raw project data, so it can never disagree with the
forecast about basic facts like remaining effort or completion percentage.
"""
from typing import List, Set

from app.domain.models import ProjectState, SprintStatus, WorkItemStatus, BlockerStatus
from app.engines.metrics_engine import ProjectMetrics
from app.engines.critical_path_engine import CriticalPathResult
from app.api.models_phase3 import (
    ForecastResult,
    ForecastConfidenceDecomposition,
    PMOKpiSuite,
)


def _status_value(status) -> str:
    """Sprint/WorkItem/Blocker status fields are sometimes plain strings and
    sometimes the Enum member depending on how the workbook was parsed --
    normalize both to the raw string for comparison."""
    return status.value if hasattr(status, "value") else str(status)


class PMOKpiEngine:
    def __init__(
        self,
        project_state: ProjectState,
        metrics: ProjectMetrics,
        forecast_result: ForecastResult,
        cp_result: CriticalPathResult,
    ):
        self.project_state = project_state
        self.metrics = metrics
        self.forecast_result = forecast_result
        self.cp_result = cp_result

    def calculate(self) -> PMOKpiSuite:
        as_of = self.project_state.project_info.effective_as_of_date()

        planned_completion_pct, actual_completion_pct, spi = self._schedule_performance_index()
        sprint_adherence_index, sprints_due, sprints_on_time = self._sprint_adherence()
        milestone_adherence_score = self._milestone_adherence(as_of)
        cp_drift_days, cp_scope_growth_pct, cp_floored_count = self._critical_path_drift()
        dep_pressure_count, dep_pressure_hours = self._dependency_pressure()
        confidence_decomp = self._confidence_decomposition()
        recovery_feasible, recovery_margin_days, max_sustainable_velocity = self._recovery_feasibility()
        release_readiness, open_blockers, resolved_blockers = self._release_readiness()

        return PMOKpiSuite(
            schedule_performance_index=spi,
            planned_completion_pct=planned_completion_pct,
            actual_completion_pct=actual_completion_pct,
            sprint_adherence_index=sprint_adherence_index,
            sprints_due_count=sprints_due,
            sprints_on_time_count=sprints_on_time,
            milestone_adherence_score=milestone_adherence_score,
            critical_path_drift_days=cp_drift_days,
            critical_path_scope_growth_percent=cp_scope_growth_pct,
            critical_path_floored_item_count=cp_floored_count,
            dependency_pressure_item_count=dep_pressure_count,
            dependency_pressure_hours=dep_pressure_hours,
            confidence_decomposition=confidence_decomp,
            recovery_feasible=recovery_feasible,
            recovery_feasibility_margin_days=recovery_margin_days,
            max_sustainable_velocity=max_sustainable_velocity,
            calendar_variance_days=float(self.forecast_result.schedule_diagnostics.calendar_variance_days),
            release_readiness_index=release_readiness,
            open_blocker_count=open_blockers,
            resolved_blocker_count=resolved_blockers,
        )

    # ------------------------------------------------------------------
    # Schedule Performance Index
    # ------------------------------------------------------------------
    def _schedule_performance_index(self):
        project_start = self.project_state.project_info.forecast_anchor_date()
        target_end = self.project_state.project_info.target_end_date
        planned_window_days = max(1.0, (target_end - project_start).days)

        real_elapsed_days = float(self.forecast_result.schedule_diagnostics.real_elapsed_days)
        planned_completion_pct = max(0.0, min(1.0, real_elapsed_days / planned_window_days))

        actual_completion_pct = float(self.forecast_result.completion_percentage)

        if planned_completion_pct <= 0.0:
            # No time has elapsed yet by plan -- SPI is undefined/not yet
            # meaningful, report neutral (1.0) rather than a divide-by-zero
            # or a misleadingly large number.
            spi = 1.0
        else:
            spi = round(actual_completion_pct / planned_completion_pct, 3)

        return round(planned_completion_pct, 3), round(actual_completion_pct, 3), spi

    # ------------------------------------------------------------------
    # Sprint Adherence Index
    # ------------------------------------------------------------------
    def _sprint_adherence(self):
        as_of = self.project_state.project_info.effective_as_of_date()
        due_sprints = [s for s in self.project_state.sprints if s.end_date <= as_of]
        if not due_sprints:
            return 1.0, 0, 0
        on_time = [s for s in due_sprints if _status_value(s.status) == SprintStatus.COMPLETED.value]
        return round(len(on_time) / len(due_sprints), 3), len(due_sprints), len(on_time)

    # ------------------------------------------------------------------
    # Milestone Adherence Score (partial credit)
    # ------------------------------------------------------------------
    def _milestone_adherence(self, as_of) -> float:
        due_sprints = [s for s in self.project_state.sprints if s.end_date <= as_of]
        if not due_sprints:
            return 1.0

        items_by_sprint = {}
        for wi in self.project_state.work_items:
            items_by_sprint.setdefault(wi.assigned_sprint, []).append(wi)

        scores = []
        for s in due_sprints:
            if _status_value(s.status) == SprintStatus.COMPLETED.value:
                scores.append(1.0)
                continue
            items = items_by_sprint.get(s.sprint_name, [])
            if not items:
                # No items tracked against this sprint and it isn't marked
                # complete -- treat as no credit rather than skipping it,
                # since silently excluding it would hide a real gap.
                scores.append(0.0)
                continue
            scores.append(sum(max(0.0, min(1.0, wi.progress_pct)) for wi in items) / len(items))

        return round(sum(scores) / len(scores), 3)

    # ------------------------------------------------------------------
    # Critical Path Drift
    # ------------------------------------------------------------------
    def _critical_path_drift(self):
        drift_days = round(float(self.cp_result.calendar_shift_hours) / 24.0, 2)
        scope_growth_pct = round(float(self.cp_result.critical_path_growth_percent), 2)
        floored_count = len(self.cp_result.calendar_floored_items)
        return drift_days, scope_growth_pct, floored_count

    # ------------------------------------------------------------------
    # Dependency Pressure
    # ------------------------------------------------------------------
    def _dependency_pressure(self):
        floored: Set[str] = set(self.cp_result.calendar_floored_items)
        if not floored:
            return 0, 0.0

        work_items_by_id = {wi.item_id: wi for wi in self.project_state.work_items}
        pressured_item_ids: Set[str] = set()

        for dep in self.project_state.dependencies:
            if dep.predecessor_item_id in floored:
                successor = work_items_by_id.get(dep.successor_item_id)
                if successor is None:
                    continue
                if _status_value(successor.status) in (
                    WorkItemStatus.COMPLETED.value,
                    WorkItemStatus.DONE.value,
                ):
                    continue
                pressured_item_ids.add(successor.item_id)

        pressure_hours = sum(
            max(0.0, work_items_by_id[item_id].remaining_effort_hrs)
            for item_id in pressured_item_ids
        )
        return len(pressured_item_ids), round(pressure_hours, 2)

    # ------------------------------------------------------------------
    # Forecast Confidence Decomposition
    # ------------------------------------------------------------------
    def _confidence_decomposition(self) -> ForecastConfidenceDecomposition:
        # Effort confidence: penalize high scope growth -- the more the
        # estimate has already moved, the less trustworthy the remaining
        # estimate is.
        scope_growth_pct = float(getattr(self.forecast_result, "scope_growth_percent", 0.0) or 0.0)
        effort_confidence = max(0.0, min(1.0, 1.0 - (scope_growth_pct / 50.0)))

        # Velocity confidence: penalize high variance relative to the mean --
        # a volatile team is a harder team to forecast.
        avg_velocity = float(getattr(self.metrics, "actual_avg_velocity", 0.0) or 0.0)
        velocity_std = float(getattr(self.metrics, "velocity_std_dev", 0.0) or 0.0)
        if avg_velocity > 0:
            velocity_confidence = max(0.0, min(1.0, 1.0 - (velocity_std / avg_velocity)))
        else:
            velocity_confidence = 0.5  # no historical data -- neither confident nor alarmed

        # Calendar confidence: penalize a large gap between real elapsed time
        # and what sprint status labels alone would imply. This is the
        # component that directly flags a stalled/mislabeled sprint.
        calendar_variance_days = abs(float(self.forecast_result.schedule_diagnostics.calendar_variance_days))
        sprint_days = max(1.0, float(self.project_state.project_info.sprint_duration_days or 14))
        calendar_confidence = max(0.0, min(1.0, 1.0 - (calendar_variance_days / sprint_days)))

        components = {
            "effort_confidence": effort_confidence,
            "velocity_confidence": velocity_confidence,
            "calendar_confidence": calendar_confidence,
        }
        weakest = min(components, key=components.get)

        return ForecastConfidenceDecomposition(
            effort_confidence=round(effort_confidence, 3),
            velocity_confidence=round(velocity_confidence, 3),
            calendar_confidence=round(calendar_confidence, 3),
            weakest_component=weakest,
            overall_confidence_score=float(self.forecast_result.confidence.confidence_score),
        )

    # ------------------------------------------------------------------
    # Recovery Feasibility
    # ------------------------------------------------------------------
    def _recovery_feasibility(self):
        as_of = self.project_state.project_info.effective_as_of_date()
        target_end = self.project_state.project_info.target_end_date
        remaining_window_days = max(0.0, (target_end - as_of).total_seconds() / 86400.0)

        sprint_days = max(1.0, float(self.project_state.project_info.sprint_duration_days or 14))
        avg_velocity = float(getattr(self.metrics, "actual_avg_velocity", 0.0) or 0.0)
        velocity_std = float(getattr(self.metrics, "velocity_std_dev", 0.0) or 0.0)

        # Max SUSTAINABLE velocity, not a one-off best sprint: avg + 1 std
        # dev. Using the single best historical sprint would treat a lucky
        # outlier as the new normal; this is a defensible "best plausible
        # sustained pace" instead.
        max_sustainable_velocity = max(avg_velocity, avg_velocity + velocity_std)
        if max_sustainable_velocity <= 0:
            max_sustainable_velocity = float(getattr(self.metrics, "effective_project_velocity", 0.0) or 1.0)

        remaining_effort = float(self.forecast_result.remaining_effort_hours)
        days_needed_at_max_pace = (
            (remaining_effort / max_sustainable_velocity) * sprint_days
            if max_sustainable_velocity > 0 else float("inf")
        )

        margin_days = round(remaining_window_days - days_needed_at_max_pace, 2)
        feasible = margin_days >= 0

        return feasible, margin_days, round(max_sustainable_velocity, 2)

    # ------------------------------------------------------------------
    # Release Readiness Index
    # ------------------------------------------------------------------
    def _release_readiness(self):
        blockers = self.project_state.blockers
        if not blockers:
            return 1.0, 0, 0
        resolved = [b for b in blockers if _status_value(b.status) == BlockerStatus.RESOLVED.value]
        open_count = len(blockers) - len(resolved)
        return round(len(resolved) / len(blockers), 3), open_count, len(resolved)
