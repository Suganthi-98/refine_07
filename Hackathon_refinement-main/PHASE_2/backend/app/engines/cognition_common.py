"""
EMIOS Phase 2 — shared deterministic derivations for the cognition stages.

Nothing here computes new project analytics. These helpers only re-read
already-parsed ProjectState + Sprint Whisperer outputs so the four Phase 2
engines agree on the same definitions.

RESOURCE LOAD NOTE: DeveloperMetrics has NO capacity field (only allocation_pct,
availability_pct, assigned/remaining_effort_hours). The authoritative per-sprint
load lives on ProjectMetrics.resource_sprint_loads as
{resource_name: {sprint_name: load_ratio}}. We take each resource's peak load
across sprints; alloc*avail is a last-resort fallback only.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Set

from app.domain.models import (
    ProjectState,
    Blocker,
    BlockerStatus,
    BlockerSeverity,
)

# Resource is 'overloaded' above this load ratio. Defined ONCE and imported by
# both HypothesisGenerator and HypothesisEliminator so the two never diverge.
OVERLOAD_THRESHOLD: float = 1.2

_SEVERITY_DELAY_DAYS = {
    BlockerSeverity.CRITICAL: 21.0,
    BlockerSeverity.HIGH: 14.0,
    BlockerSeverity.MEDIUM: 7.0,
    BlockerSeverity.LOW: 3.0,
}
SEVERITY_WEIGHT = {
    BlockerSeverity.CRITICAL: 1.0,
    BlockerSeverity.HIGH: 0.8,
    BlockerSeverity.MEDIUM: 0.6,
    BlockerSeverity.LOW: 0.4,
}


# --- blockers --------------------------------------------------------------
def is_open_blocker(blocker: Blocker) -> bool:
    status = getattr(blocker, "status", None)
    resolved = getattr(blocker, "actual_resolution_date", None) is not None
    return (status == BlockerStatus.OPEN) or (status is None and not resolved)


def open_blockers(state: ProjectState) -> List[Blocker]:
    return [b for b in getattr(state, "blockers", []) or [] if is_open_blocker(b)]


def blocker_delay_days(blocker: Blocker) -> float:
    est = getattr(blocker, "estimated_delay_days", None)
    if est is not None:
        return float(est)
    raised = getattr(blocker, "raised_date", None)
    target = getattr(blocker, "target_resolution_date", None)
    if raised is not None and target is not None:
        return max(0.0, (target - raised).days)
    return _SEVERITY_DELAY_DAYS.get(getattr(blocker, "severity", BlockerSeverity.MEDIUM), 7.0)


# --- critical path ---------------------------------------------------------
def critical_path_ids(critical_path) -> Set[str]:
    if critical_path is None:
        return set()
    ids = (
        getattr(critical_path, "critical_path", None)
        or getattr(critical_path, "critical_path_items", None)
        or []
    )
    return set(ids)


def blocker_hits_critical_path(blocker: Blocker, cp_ids: Set[str]) -> bool:
    if not cp_ids:
        return False
    impacted = set(getattr(blocker, "impacted_item_ids", []) or [])
    related = getattr(blocker, "related_item_id", None)
    if related:
        impacted.add(related)
    return bool(impacted & cp_ids)


def critical_path_dependencies_over_lag(
    state: ProjectState, cp_ids: Set[str], sprint_days: float
) -> list:
    out = []
    for dep in getattr(state, "dependencies", []) or []:
        pred = getattr(dep, "predecessor_item_id", None)
        succ = getattr(dep, "successor_item_id", None)
        touches_cp = (pred in cp_ids) or (succ in cp_ids)
        lag = float(getattr(dep, "lag_days", 0) or 0)
        if touches_cp and lag > sprint_days:
            out.append(dep)
    return out


def critical_path_blocked_dependencies(
    state: ProjectState, cp_ids: Set[str], sprint_days: float
) -> list:
    blocked = list(critical_path_dependencies_over_lag(state, cp_ids, sprint_days))
    blocked_items: Set[str] = set()
    for b in open_blockers(state):
        blocked_items |= set(getattr(b, "impacted_item_ids", []) or [])
        r = getattr(b, "related_item_id", None)
        if r:
            blocked_items.add(r)
    for dep in getattr(state, "dependencies", []) or []:
        pred = getattr(dep, "predecessor_item_id", None)
        succ = getattr(dep, "successor_item_id", None)
        touches_cp = (pred in cp_ids) or (succ in cp_ids)
        if touches_cp and ((pred in blocked_items) or (succ in blocked_items)) and dep not in blocked:
            blocked.append(dep)
    return blocked


# --- resources (reads resource_sprint_loads; NO capacity field on dev) -----
def developer_metrics(metrics) -> list:
    rm = getattr(metrics, "resource_metrics", None)
    if rm is None:
        return []
    return list(getattr(rm, "developer_metrics", None) or [])


def resource_sprint_loads(metrics) -> Dict[str, Dict[str, float]]:
    """{resource_name: {sprint_name: load_ratio}} computed by MetricsEngine.
    Authoritative overload source — DeveloperMetrics carries no capacity."""
    return getattr(metrics, "resource_sprint_loads", None) or {}


def peak_resource_loads(metrics) -> Dict[str, float]:
    """Max load ratio across sprints per resource (resource_name -> ratio)."""
    peaks: Dict[str, float] = {}
    for name, by_sprint in resource_sprint_loads(metrics).items():
        vals = [float(v) for v in (by_sprint or {}).values() if v is not None]
        if vals:
            peaks[name] = max(vals)
    return peaks


def _dev_load_fallback(dev) -> float:
    """Fallback only: no capacity field exists, so alloc*avail (≤1.0).
    Real overload (>1.0) can only come from resource_sprint_loads."""
    alloc = float(getattr(dev, "allocation_pct", 0.0) or 0.0)
    avail = float(getattr(dev, "availability_pct", 1.0) or 1.0)
    return alloc * avail


def overloaded_resource_ids(metrics, threshold: float = OVERLOAD_THRESHOLD) -> List[str]:
    """Resource identifiers whose load exceeds threshold. Prefers the
    authoritative resource_sprint_loads; falls back to developer_metrics."""
    peaks = peak_resource_loads(metrics)
    if peaks:
        return [name for name, load in peaks.items() if load > threshold]
    return [
        (getattr(d, "resource_id", None) or getattr(d, "name", "?"))
        for d in developer_metrics(metrics)
        if _dev_load_fallback(d) > threshold
    ]


def resource_peak_load(metrics, resource_name: str) -> float:
    return peak_resource_loads(metrics).get(resource_name, 0.0)


# --- velocity / scope / probability ---------------------------------------
def velocity_trend_pct(metrics) -> float:
    vm = getattr(metrics, "velocity_metrics", None)
    if vm is None:
        return 0.0
    return float(getattr(vm, "velocity_trend_pct", 0.0) or 0.0)


def velocity_series(metrics) -> List[float]:
    vm = getattr(metrics, "velocity_metrics", None)
    if vm is None:
        return []
    return [float(v) for v in (getattr(vm, "velocity_by_sprint", None) or [])]


def scope_growth_percent(forecast) -> float:
    if forecast is None:
        return 0.0
    return float(getattr(forecast, "scope_growth_percent", 0.0) or 0.0)


def on_time_probability(monte_carlo) -> Optional[float]:
    if monte_carlo is None:
        return None
    return float(getattr(monte_carlo, "on_time_probability", 0.0) or 0.0)