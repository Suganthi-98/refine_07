"""
EMIOS EvidenceCollector (Stage 3).

Projects validated observations + Sprint Whisperer outputs + ProjectState into
an immutable EvidenceBundle. Collects only — states facts, never causes, never
links hypotheses (Stage 4 wires the edges).

Each EvidenceItem.source is tagged '<source>::<CATEGORY>' for routing.
"""
from __future__ import annotations

from typing import List, Optional
from uuid import uuid4

from app.domain.models import ProjectState
from app.domain.emios_models import (
    ValidationResult,
    EvidenceBundle,
    EvidenceItem,
)
from app.engines import cognition_common as cc

CAT_BLOCKER = "BLOCKER"
CAT_VELOCITY = "VELOCITY"
CAT_SCOPE = "SCOPE"
CAT_CAPACITY = "CAPACITY"
CAT_DEPENDENCY = "DEPENDENCY"
CAT_NEUTRAL = "NEUTRAL"

# Evidence is broader than hypothesis firing: record a resource fact from 0.9,
# even though the CAPACITY hypothesis only fires at cc.OVERLOAD_THRESHOLD (1.2).
RESOURCE_EVIDENCE_FLOOR = 0.9


def _tag(source: str, category: str) -> str:
    return f"{source}::{category}"


class EvidenceCollector:
    """Stage 3: gather everything relevant before theorizing."""

    RISK_EVIDENCE_MIN_SCORE = 41.0  # HIGH/CRITICAL band on the 0-100 risk scale

    def run(
        self,
        validation_result: Optional[ValidationResult],
        state: ProjectState,
        *,
        forecast=None,
        risk_result=None,
        metrics=None,
        monte_carlo=None,
        critical_path=None,
    ) -> EvidenceBundle:
        items: List[EvidenceItem] = []
        items.extend(self._delay_breakdown_evidence(forecast))
        items.extend(self._scope_evidence(forecast))
        items.extend(self._risk_driver_evidence(risk_result))
        items.extend(self._open_blocker_evidence(state))
        items.extend(self._velocity_evidence(metrics))
        items.extend(self._resource_load_evidence(metrics))
        items.extend(self._critical_path_blocked_evidence(state, critical_path))

        data_confidence = 1.0
        triggered_ids: List[str] = []
        if validation_result is not None:
            data_confidence = float(getattr(validation_result, "data_confidence", 1.0) or 1.0)
            triggered_ids = [
                getattr(o, "observation_id", "")
                for o in getattr(validation_result, "validated", []) or []
            ]

        return EvidenceBundle(
            bundle_id=f"evb-{uuid4().hex[:10]}",
            triggered_by_observation_ids=[i for i in triggered_ids if i],
            items=items,
            low_confidence_flag=data_confidence < 0.5,
            data_confidence=round(data_confidence, 4),
        )

    # --- delay breakdown --------------------------------------------------
    def _delay_breakdown_evidence(self, forecast) -> List[EvidenceItem]:
        if forecast is None:
            return []
        db = getattr(forecast, "delay_breakdown", None)
        if db is None:
            return []
        total = float(getattr(db, "expected_delay_days", 0.0) or 0.0)
        components = [
            ("Base remaining work", float(getattr(db, "remaining_days_base_work", 0.0) or 0.0), CAT_NEUTRAL),
            ("Blocker velocity loss", float(getattr(db, "remaining_days_blocker_loss", 0.0) or 0.0), CAT_BLOCKER),
            ("Spillover", float(getattr(db, "remaining_days_spillover", 0.0) or 0.0), CAT_VELOCITY),
        ]
        positive = [(n, v, c) for n, v, c in components if v > 0.0]
        if not positive:
            return []
        denom = total if total > 0 else sum(v for _, v, _ in positive)
        denom = denom or 1.0
        items = []
        for name, days, cat in positive:
            share = max(0.0, min(1.0, days / denom))
            items.append(EvidenceItem(
                fact=f"{name} contributes {days:.1f} delay-days ({share:.0%} of expected delay).",
                source=_tag("ForecastEngine.delay_breakdown", cat),
                weight=round(share, 4),
            ))
        return items

    # --- scope growth -----------------------------------------------------
    def _scope_evidence(self, forecast) -> List[EvidenceItem]:
        if forecast is None:
            return []
        scope_days = float(getattr(forecast, "scope_impact_days", 0.0) or 0.0)
        scope_pct = float(getattr(forecast, "scope_growth_percent", 0.0) or 0.0)
        if scope_days <= 0 and scope_pct <= 0:
            return []
        db = getattr(forecast, "delay_breakdown", None)
        total = float(getattr(db, "expected_delay_days", 0.0) or 0.0) if db else 0.0
        weight = max(
            round(max(0.0, min(1.0, scope_days / max(total, scope_days, 1.0))), 4),
            round(min(1.0, scope_pct / 100.0), 4),
        )
        return [EvidenceItem(
            fact=f"Scope growth adds {scope_days:.1f} delay-days ({scope_pct:.0f}% over baseline).",
            source=_tag("ForecastEngine.scope_impact_days", CAT_SCOPE),
            weight=weight,
        )]

    # --- top risk drivers -------------------------------------------------
    def _risk_driver_evidence(self, risk_result) -> List[EvidenceItem]:
        if risk_result is None:
            return []
        cat_map = {
            "BLOCKER": CAT_BLOCKER,
            "DEPENDENCY": CAT_DEPENDENCY,
            "RESOURCE": CAT_CAPACITY,
            "SCOPE": CAT_SCOPE,
            "SCHEDULE": CAT_NEUTRAL,
        }
        items = []
        for d in getattr(risk_result, "top_risk_drivers", None) or []:
            score = float(getattr(d, "score", 0.0) or 0.0)
            if score < self.RISK_EVIDENCE_MIN_SCORE:
                continue
            category = str(getattr(d, "category", "") or "").upper()
            title = getattr(d, "title", None) or category or "Risk"
            desc = getattr(d, "description", "") or ""
            items.append(EvidenceItem(
                fact=f"Risk driver '{title}' (score {score:.0f}/100): {desc}".strip(),
                source=_tag("RiskEngine.top_risk_drivers", cat_map.get(category, CAT_NEUTRAL)),
                weight=round(max(0.0, min(1.0, score / 100.0)), 4),
            ))
        return items

    # --- open blockers ----------------------------------------------------
    def _open_blocker_evidence(self, state) -> List[EvidenceItem]:
        items = []
        for b in cc.open_blockers(state):
            severity = getattr(b, "severity", None)
            weight = cc.SEVERITY_WEIGHT.get(severity, 0.6)
            delay = cc.blocker_delay_days(b)
            sev_label = getattr(severity, "value", str(severity))
            desc = getattr(b, "description", None) or getattr(b, "blocker_id", "blocker")
            items.append(EvidenceItem(
                fact=f"Open {sev_label} blocker {getattr(b, 'blocker_id', '?')}: {desc} (~{delay:.0f} delay-days).",
                source=_tag("ProjectState.blockers", CAT_BLOCKER),
                weight=round(weight, 4),
            ))
        return items

    # --- velocity trend (< -10%) ------------------------------------------
    def _velocity_evidence(self, metrics) -> List[EvidenceItem]:
        if metrics is None:
            return []
        trend = cc.velocity_trend_pct(metrics)
        if trend >= -10.0:
            return []
        return [EvidenceItem(
            fact=f"Velocity trend is {trend:.0f}% (declining).",
            source=_tag("MetricsEngine.velocity_trend_pct", CAT_VELOCITY),
            weight=round(max(0.0, min(1.0, abs(trend) / 50.0)), 4),
        )]

    # --- resource load (peak sprint load > floor) -------------------------
    def _resource_load_evidence(self, metrics) -> List[EvidenceItem]:
        if metrics is None:
            return []
        items = []
        for name, load in cc.peak_resource_loads(metrics).items():
            if load <= RESOURCE_EVIDENCE_FLOOR:
                continue
            items.append(EvidenceItem(
                fact=f"Resource {name} peak load ratio {load:.2f} (over {RESOURCE_EVIDENCE_FLOOR}).",
                source=_tag("MetricsEngine.resource_sprint_loads", CAT_CAPACITY),
                weight=round(max(0.0, min(1.0, load / 2.0)), 4),
            ))
        return items

    # --- critical-path items blocked --------------------------------------
    def _critical_path_blocked_evidence(self, state, critical_path) -> List[EvidenceItem]:
        cp_ids = cc.critical_path_ids(critical_path)
        if not cp_ids:
            return []
        items = []
        for b in cc.open_blockers(state):
            if cc.blocker_hits_critical_path(b, cp_ids):
                items.append(EvidenceItem(
                    fact=f"Critical-path item(s) blocked by {getattr(b, 'blocker_id', '?')}.",
                    source=_tag("CriticalPathEngine.blocked", CAT_DEPENDENCY),
                    weight=0.9,
                ))
        return items