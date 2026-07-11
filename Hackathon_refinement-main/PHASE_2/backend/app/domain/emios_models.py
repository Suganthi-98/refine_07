"""
EMIOS Domain Models — Cognition + Knowledge contexts.

Pydantic v2 models for the 9 NEW output types the EMIOS 18-stage cognitive
pipeline introduces on top of Sprint Whisperer's 9 deterministic engines.

Design rules (from the EMIOS blueprint):
  - An Observation NEVER contains a cause (Stage 1 is neutral).
  - Evidence is immutable once recorded; it supports OR contradicts hypotheses.
  - Every claim carries a calibrated confidence (held accountable in Learning).
  - Every recommendation/decision states its sacrifice (explicit tradeoffs).
  - Provenance is recorded on cognition entities for auditability.

All models allow arbitrary types so they can hold references to existing
Sprint Whisperer engine outputs (ProjectMetrics, ForecastResult, etc.) without
requiring those to be Pydantic-compatible.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class ObservationDirection(str, Enum):
    """Direction of a metric change, with no causal interpretation."""
    UP = "up"
    DOWN = "down"
    FLAT = "flat"


class DataConfidence(str, Enum):
    """How much we trust the underlying data (set in Validation)."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class HypothesisStatus(str, Enum):
    OPEN = "open"
    SUPPORTED = "supported"
    REJECTED = "rejected"


class ImpactDimension(str, Enum):
    SCHEDULE = "schedule"
    QUALITY = "quality"
    RESOURCE = "resource"
    BUSINESS = "business"
    ORGANIZATIONAL = "organizational"


class HealthState(str, Enum):
    """Project health state machine, shared with the Recovery Engine.

    SIX states, not five: the blueprint's Part 2 canonical state machine has
    Healthy → Watch → Warning → Critical → Recovery → Recovered, where
    RECOVERY is the transient 'plan is actively running' state and RECOVERED
    is the terminal 'exit KPIs met' state that then decays back to Healthy
    after N sustained sprints (Recovered → Healthy). They are distinct: a plan
    can fail out of RECOVERY back to CRITICAL (rollback) without ever reaching
    RECOVERED. Keep both — collapsing them loses the rollback vs. success
    distinction the Recovery state machine (Phase 5) depends on.
    """
    HEALTHY = "healthy"
    WATCH = "watch"
    WARNING = "warning"
    CRITICAL = "critical"
    RECOVERY = "recovery"
    RECOVERED = "recovered"


class DecisionStatus(str, Enum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    EXECUTED = "executed"
    EVALUATED = "evaluated"


class ExecutionPlanStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ADJUSTING = "adjusting"
    COMPLETED = "completed"
    ABORTED = "aborted"


# ---------------------------------------------------------------------------
# Stage 1 — Observation → ObservationCluster
# ---------------------------------------------------------------------------

class Observation(BaseModel):
    """A single neutral, non-causal statement about a metric change.

    RULE: an Observation never contains a cause. It only reports that a signal
    deviated from its expected band.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    observation_id: str
    metric_ref: str = Field(..., description="Which metric this observes, e.g. 'velocity'")
    magnitude: float = Field(..., description="Signed magnitude of the deviation")
    direction: ObservationDirection
    significance: Literal["HIGH", "MEDIUM", "LOW"] = Field(
        "LOW", description="Coarse significance band, stored directly (no float translation)"
    )
    baseline_ref: Optional[str] = Field(None, description="Baseline this was compared against")
    detected_at: datetime = Field(default_factory=_utcnow)
    source_engine: Optional[str] = Field(None, description="Engine/detector that emitted it")
    # --- Phase 1 Observation Engine fields (raw signal, still no cause) -----
    current_value: Optional[float] = Field(None, description="Observed metric value")
    baseline_value: Optional[float] = Field(None, description="Expected/baseline metric value")
    deviation_pct: Optional[float] = Field(None, description="(current - baseline) / baseline, as a fraction")
    entity_id: Optional[str] = Field(None, description="sprint_id, resource_id, or None for project-level")
    cause: None = Field(None, description="ALWAYS None — an Observation never contains a cause")


class ObservationCluster(BaseModel):
    """Stage 1 output: a related group of observations detected in one pass.

    cluster_severity and primary_signal are stored as explicit fields (not just
    folded into summary) because ValidationEngine, the ReasoningTrace UI, the AI
    advisor's ObservationSummaryFact, and Final.2 Invariant 1 all read them.
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    cluster_id: str
    observations: List[Observation] = Field(default_factory=list)
    detected_at: datetime = Field(default_factory=_utcnow)
    summary: str = Field("", description="Neutral one-line summary, still no cause")
    cluster_severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"] = Field(
        "LOW", description="Worst observation band; escalates to CRITICAL when 2+ HIGH coincide"
    )
    primary_signal: Optional[Observation] = Field(
        None, description="Single highest-significance observation (also causeless)"
    )


# ---------------------------------------------------------------------------
# Stage 2 — Validation → ValidatedObservation
# ---------------------------------------------------------------------------

class DataQualityIssue(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    issue_type: str = Field(..., description="e.g. 'data_lag', 'mislabeled_sprint', 'pto'")
    description: str
    suppresses_downstream: bool = Field(
        False, description="True if this issue should halt reasoning on the observation"
    )


class ValidatedObservation(BaseModel):
    """Stage 2 output: an observation confirmed real (not a data artifact)."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    observation: Observation
    data_confidence: DataConfidence = DataConfidence.MEDIUM
    triangulated_sources: List[str] = Field(default_factory=list)
    issues: List[DataQualityIssue] = Field(default_factory=list)
    is_valid: bool = Field(True, description="False if a suppressing data-quality issue was found")
    validated_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stage 3 — Evidence Collection → EvidenceBundle
# ---------------------------------------------------------------------------

class EvidenceItem(BaseModel):
    """A single timestamped, sourced, weighted fact. Immutable once recorded."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    fact: str
    source: str = Field(..., description="Which engine/entity produced this fact")
    weight: float = Field(1.0, description="Relative evidential weight")
    timestamp: datetime = Field(default_factory=_utcnow)
    supports_hypothesis_ids: List[str] = Field(default_factory=list)
    contradicts_hypothesis_ids: List[str] = Field(default_factory=list)


class EvidenceBundle(BaseModel):
    """Stage 3 output: everything relevant gathered before theorizing."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    bundle_id: str
    triggered_by_observation_ids: List[str] = Field(default_factory=list)
    items: List[EvidenceItem] = Field(default_factory=list)
    collected_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stages 4 & 5 — Hypothesis Generation / Elimination → [Hypothesis]
# ---------------------------------------------------------------------------

class Hypothesis(BaseModel):
    """A candidate cause with a testable prediction.

    Used by BOTH stage 4 (generation, status=OPEN) and stage 5 (elimination,
    which flips survivors to SUPPORTED and killed ones to REJECTED with a reason).
    """
    model_config = ConfigDict(arbitrary_types_allowed=True)

    hypothesis_id: str
    statement: str
    testable_prediction: str = Field(..., description="What must be true if this holds")
    prior: float = Field(0.0, ge=0.0, le=1.0)
    posterior: float = Field(0.0, ge=0.0, le=1.0)
    status: HypothesisStatus = HypothesisStatus.OPEN
    rejection_reason: Optional[str] = Field(
        None, description="Why the evidence killed it (explainability gold)"
    )
    supporting_evidence_ids: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Stage 6 — Root Cause Analysis → Diagnosis
# ---------------------------------------------------------------------------

class Diagnosis(BaseModel):
    """Stage 6 output: the deepest actionable cause with its causal chain."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    diagnosis_id: str
    root_cause: str
    causal_chain: List[str] = Field(
        default_factory=list, description="Ordered chain from symptom to root cause (5-Whys)"
    )
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    confidence_interval: Optional[List[float]] = Field(
        None, description="[low, high] bounds on confidence"
    )
    contributing_factors: List[str] = Field(default_factory=list)
    alternative_diagnoses: List[str] = Field(default_factory=list)
    supporting_hypothesis_id: Optional[str] = None
    diagnosed_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stages 7–11 — Multi-dimensional Impact → ImpactMatrix
# ---------------------------------------------------------------------------

class ImpactEstimate(BaseModel):
    """One dimension's impact: magnitude + confidence."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    dimension: ImpactDimension
    magnitude: float = Field(..., description="Dimension-specific magnitude (e.g. days, $, score)")
    unit: str = Field("", description="Unit of magnitude, e.g. 'days', 'USD', 'score'")
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    explanation: str = ""


class ImpactMatrix(BaseModel):
    """Stages 7-11 output: impact across all five dimensions."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    diagnosis_id: Optional[str] = None
    estimates: Dict[str, ImpactEstimate] = Field(
        default_factory=dict, description="Keyed by ImpactDimension value"
    )
    computed_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stage 12 — Risk Assessment → [Risk]
# ---------------------------------------------------------------------------

class Risk(BaseModel):
    """A prioritized risk: probability × severity over an exposure window."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    risk_id: str
    title: str
    probability: float = Field(0.0, ge=0.0, le=1.0)
    severity: float = Field(0.0, description="Impact severity if it materializes")
    exposure_window_days: Optional[float] = Field(
        None, description="How long the exposure persists"
    )
    time_to_materialize_days: Optional[float] = None
    trend: Optional[str] = Field(None, description="'growing' | 'decaying' | 'stable'")
    owner: Optional[str] = None
    mitigation: Optional[str] = None


# ---------------------------------------------------------------------------
# Stage 13 — Tradeoff Analysis → TradeoffMatrix
# ---------------------------------------------------------------------------

class TradeoffOption(BaseModel):
    """One candidate action projected across the five impact dimensions,
    with its explicit sacrifice stated (iron triangle + people + debt)."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    option_id: str
    label: str
    projected_impacts: Dict[str, float] = Field(
        default_factory=dict, description="Keyed by ImpactDimension value"
    )
    sacrifice: str = Field(..., description="The explicit cost/opportunity cost of choosing this")
    expected_value: Optional[float] = None


class TradeoffMatrix(BaseModel):
    """Stage 13 output: all options with their sacrifices side by side."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    options: List[TradeoffOption] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stage 14 — Decision Making → Decision
# ---------------------------------------------------------------------------

class Decision(BaseModel):
    """Stage 14 output: the chosen alternative with rationale and rejected options."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    decision_id: str
    chosen_option_id: str
    rationale: str
    expected_value: Optional[float] = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    rejected_option_ids: List[str] = Field(default_factory=list)
    rejected_reasons: Dict[str, str] = Field(
        default_factory=dict, description="option_id -> why it was rejected"
    )
    feasibility_gates_passed: bool = True
    status: DecisionStatus = DecisionStatus.PROPOSED
    decided_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stage 15 — Execution Planning → ExecutionPlan
# ---------------------------------------------------------------------------

class ExecutionStep(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    step_id: str
    description: str
    owner: Optional[str] = None
    depends_on: List[str] = Field(default_factory=list)
    kpi_target: Optional[str] = None


class ExecutionPlan(BaseModel):
    """Stage 15 output: a runnable plan bound to a Recovery state machine."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    plan_id: str
    decision_id: Optional[str] = None
    steps: List[ExecutionStep] = Field(default_factory=list)
    kpi_targets: Dict[str, float] = Field(default_factory=dict)
    exit_conditions: List[str] = Field(default_factory=list)
    rollback_plan: Optional[str] = None
    target_health_state: HealthState = HealthState.RECOVERED
    status: ExecutionPlanStatus = ExecutionPlanStatus.DRAFT
    created_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stage 16 — Monitoring → TrajectoryConformance
# ---------------------------------------------------------------------------

class KPIDeviation(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    kpi_name: str
    predicted: float
    actual: float
    deviation: float = Field(..., description="actual - predicted")
    within_tolerance: bool = True


class TrajectoryConformance(BaseModel):
    """Stage 16 output: is the plan working? Feeds deviations back to Observation."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    plan_id: Optional[str] = None
    deviations: List[KPIDeviation] = Field(default_factory=list)
    on_trajectory: bool = True
    early_abort_triggered: bool = False
    current_health_state: HealthState = HealthState.HEALTHY
    checked_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stage 17 — Learning → LearningRecord
# ---------------------------------------------------------------------------

class LearningRecord(BaseModel):
    """Stage 17 output: predicted vs actual, calibration + prior updates."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    record_id: str
    episode_ref: Optional[str] = Field(None, description="Which decision/plan episode this evaluates")
    diagnosis_was_correct: Optional[bool] = None
    decision_was_good: Optional[bool] = None
    brier_score: Optional[float] = Field(None, description="Confidence calibration score")
    what_worked: List[str] = Field(default_factory=list)
    what_didnt: List[str] = Field(default_factory=list)
    updated_priors: Dict[str, float] = Field(default_factory=dict)
    learned_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Stage 18 — Knowledge Retention → KnowledgeNode
# ---------------------------------------------------------------------------

class KnowledgeNode(BaseModel):
    """Stage 18 output: a reusable, cross-project pattern written to the KG."""
    model_config = ConfigDict(arbitrary_types_allowed=True)

    node_id: str
    pattern: str = Field(..., description="The reusable lesson/pattern")
    context_tags: List[str] = Field(
        default_factory=list, description="e.g. domain, team-type, scale"
    )
    applicability_conditions: List[str] = Field(default_factory=list)
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    provenance: Optional[str] = Field(None, description="Which engine + model version produced it")
    retained_at: datetime = Field(default_factory=_utcnow)