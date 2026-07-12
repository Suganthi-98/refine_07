"""
EMIOS Pipeline — top-level contract bridging Sprint Whisperer's 9 deterministic
engines to the EMIOS 18-stage cognitive pipeline.

Stages 1-6 are LIVE (Observation, Validation, Evidence, Hypothesis Generation,
Hypothesis Elimination, Root Cause Analysis). Stages 7-18 call stubs that return
None until their engines land.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

# --- Existing Sprint Whisperer engine outputs (types) ----------------------
from app.engines.metrics_engine import MetricsEngine, ProjectMetrics
from app.engines.dependency_engine import DependencyGraphEngine, DependencyDAG
from app.engines.critical_path_engine import CriticalPathEngine, CriticalPathResult
from app.engines.spillover_engine import SpilloverAnalysisEngine, SpilloverAnalysis
from app.engines.forecast_engine import ForecastEngine
from app.engines.monte_carlo_engine import MonteCarloEngine
from app.engines.impact_scoring_engine import ImpactScoringEngine
from app.engines.risk_engine import RiskEngine
from app.api.models_phase3 import ForecastResult, MonteCarloResult, RiskResult
from app.engines.recommendation_engine.recommendation_engine_v2 import RecommendationEngineV2
from app.engines.recommendation_engine.models import Recommendation, SimulationResult

from app.domain.models import ProjectState

# --- EMIOS cognitive-stage engines (Stages 1-6 LIVE) -----------------------
from app.engines.observation_engine import ObservationEngine
from app.engines.validation_engine import ValidationEngine
from app.engines.evidence_collector import EvidenceCollector
from app.engines.hypothesis_generator import HypothesisGenerator
from app.engines.hypothesis_eliminator import HypothesisEliminator
from app.engines.root_cause_analyzer import RootCauseAnalyzer

# --- New EMIOS cognition/knowledge outputs (types) -------------------------
from app.domain.emios_models import (
    ObservationCluster,
    ValidationResult,
    ArtifactType,
    EvidenceBundle,
    Hypothesis,
    Diagnosis,
    ImpactMatrix,
    Risk,
    TradeoffMatrix,
    Decision,
    ExecutionPlan,
    TrajectoryConformance,
    LearningRecord,
    KnowledgeNode,
)

MONTE_CARLO_SEED: int = 42


# ---------------------------------------------------------------------------
# PipelineResult — all 18 stage outputs, every field Optional
# ---------------------------------------------------------------------------
@dataclass
class PipelineResult:
    # ----- Existing Sprint Whisperer engine outputs (9) --------------------
    metrics: Optional[ProjectMetrics] = None
    dependency_dag: Optional[DependencyDAG] = None
    critical_path: Optional[CriticalPathResult] = None
    spillover: Optional[SpilloverAnalysis] = None
    forecast: Optional[ForecastResult] = None
    monte_carlo: Optional[MonteCarloResult] = None
    risk_result: Optional[RiskResult] = None
    recommendations: Optional[List[Recommendation]] = None
    simulation: Optional[SimulationResult] = None

    # ----- New EMIOS 18-stage cognitive outputs ----------------------------
    observation_cluster: Optional[ObservationCluster] = None      # Stage 1
    validation_result: Optional[ValidationResult] = None          # Stage 2
    evidence_bundle: Optional[EvidenceBundle] = None              # Stage 3
    hypotheses: Optional[List[Hypothesis]] = None                # Stage 4
    surviving_hypotheses: Optional[List[Hypothesis]] = None      # Stage 5
    diagnosis: Optional[Diagnosis] = None                        # Stage 6
    impact_matrix: Optional[ImpactMatrix] = None                 # Stages 7-11
    risks: Optional[List[Risk]] = None                           # Stage 12
    tradeoff_matrix: Optional[TradeoffMatrix] = None             # Stage 13
    decision: Optional[Decision] = None                          # Stage 14
    execution_plan: Optional[ExecutionPlan] = None               # Stage 15
    trajectory_conformance: Optional[TrajectoryConformance] = None  # Stage 16
    learning_record: Optional[LearningRecord] = None             # Stage 17
    knowledge_node: Optional[KnowledgeNode] = None               # Stage 18


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _velocity_artifact_suppressed(validation: Optional[ValidationResult]) -> bool:
    """True if Stage 2 suppressed a velocity observation as a planned
    capacity reduction (PTO). Lets Stage 5 kill the VELOCITY hypothesis."""
    if validation is None:
        return False
    for s in getattr(validation, "suppressed", []) or []:
        obs = getattr(s, "observation", None)
        metric = getattr(obs, "metric_ref", None)
        if metric == "velocity" and getattr(s, "artifact_type", None) == ArtifactType.PLANNED_CAPACITY_REDUCTION:
            return True
    return False


# ---------------------------------------------------------------------------
# EMIOS stage functions (1-6 LIVE, 7-18 stubs)
# ---------------------------------------------------------------------------
def _stage_01_observe(state: ProjectState, result: PipelineResult) -> Optional[ObservationCluster]:
    if result.metrics is None or result.forecast is None:
        return None
    return ObservationEngine().run(
        state=state,
        metrics=result.metrics,
        forecast=result.forecast,
        monte_carlo=result.monte_carlo,
    )


def _stage_02_validate(state: ProjectState, cluster: Optional[ObservationCluster]) -> Optional[ValidationResult]:
    if cluster is None:
        return None
    return ValidationEngine().run(cluster=cluster, state=state)


def _stage_03_collect_evidence(
    state: ProjectState, validation: Optional[ValidationResult], result: PipelineResult
) -> Optional[EvidenceBundle]:
    if validation is None:
        return None
    return EvidenceCollector().run(
        validation, state,
        forecast=result.forecast,
        risk_result=result.risk_result,
        metrics=result.metrics,
        monte_carlo=result.monte_carlo,
        critical_path=result.critical_path,
    )


def _stage_04_generate_hypotheses(
    bundle: Optional[EvidenceBundle], state: ProjectState, result: PipelineResult
) -> Optional[List[Hypothesis]]:
    if bundle is None:
        return None
    return HypothesisGenerator().run(
        bundle, state,
        forecast=result.forecast,
        metrics=result.metrics,
        monte_carlo=result.monte_carlo,
        critical_path=result.critical_path,
    )


def _stage_05_eliminate_hypotheses(
    hypotheses: Optional[List[Hypothesis]],
    bundle: Optional[EvidenceBundle],
    state: ProjectState,
    result: PipelineResult,
) -> Optional[List[Hypothesis]]:
    if not hypotheses or bundle is None:
        return None
    return HypothesisEliminator().run(
        hypotheses, bundle, state,
        forecast=result.forecast,
        metrics=result.metrics,
        monte_carlo=result.monte_carlo,
        critical_path=result.critical_path,
        velocity_artifact_suppressed=_velocity_artifact_suppressed(result.validation_result),
    )


def _stage_06_root_cause(
    survivors: Optional[List[Hypothesis]], state: ProjectState, result: PipelineResult
) -> Optional[Diagnosis]:
    if not survivors:
        return None
    return RootCauseAnalyzer().run(
        survivors, state,
        forecast=result.forecast,
        metrics=result.metrics,
        monte_carlo=result.monte_carlo,
        critical_path=result.critical_path,
    )


# ---- Stages 7-18 remain stubs until their engines are implemented ----------
def _stages_07_11_impact(state, diagnosis, result): return None
def _stage_12_assess_risk(impact, result): return None
def _stage_13_tradeoffs(risks, result): return None
def _stage_14_decide(matrix): return None
def _stage_15_plan(decision): return None
def _stage_16_monitor(plan, state): return None
def _stage_17_learn(conformance, decision): return None
def _stage_18_retain(learning): return None


# ---------------------------------------------------------------------------
# run_emios_pipeline
# ---------------------------------------------------------------------------
def run_emios_pipeline(
    state: ProjectState,
    *,
    simulation_count: int = 1000,
    seed: int = MONTE_CARLO_SEED,
) -> PipelineResult:
    result = PipelineResult()

    # ===== Existing Sprint Whisperer 9-engine pipeline (real calls) =========
    result.metrics = MetricsEngine(state).calculate()
    result.dependency_dag = DependencyGraphEngine(state).build_dag()
    result.critical_path = CriticalPathEngine(state, result.dependency_dag).analyze()
    result.spillover = SpilloverAnalysisEngine(
        state, result.metrics.average_item_effort
    ).analyze()
    result.forecast = ForecastEngine(
        state, result.metrics, result.critical_path, result.spillover
    ).calculate()
    result.monte_carlo = MonteCarloEngine(
        project_state=state,
        metrics=result.metrics,
        cp_result=result.critical_path,
        spillover=result.spillover,
        simulation_count=simulation_count,
        seed=seed,
    ).calculate()
    impact_scores = ImpactScoringEngine(state, result.dependency_dag).score()
    result.risk_result = RiskEngine(
        project_state=state,
        metrics=result.metrics,
        cp_result=result.critical_path,
        dag=result.dependency_dag,
        spillover=result.spillover,
        forecast=result.forecast,
        monte_carlo=result.monte_carlo,
        impact_scores=impact_scores,
    ).analyze()

    rec_engine = RecommendationEngineV2(
        project_state=state, simulation_count=simulation_count
    )
    result.recommendations = rec_engine.generate(top_n=5)
    if result.recommendations:
        try:
            result.simulation = rec_engine.simulate(
                result.recommendations[0].recommendation_id
            )
        except Exception:
            result.simulation = None

    # ===== EMIOS cognitive pipeline =========================================
    # Stages 1-6: LIVE.
    result.observation_cluster = _stage_01_observe(state, result)
    result.validation_result = _stage_02_validate(state, result.observation_cluster)
    result.evidence_bundle = _stage_03_collect_evidence(state, result.validation_result, result)
    result.hypotheses = _stage_04_generate_hypotheses(result.evidence_bundle, state, result)
    result.surviving_hypotheses = _stage_05_eliminate_hypotheses(
        result.hypotheses, result.evidence_bundle, state, result
    )
    result.diagnosis = _stage_06_root_cause(result.surviving_hypotheses, state, result)

    # Stages 7-18: stubs (return None) until engines are implemented.
    result.impact_matrix = _stages_07_11_impact(state, result.diagnosis, result)
    result.risks = _stage_12_assess_risk(result.impact_matrix, result)
    result.tradeoff_matrix = _stage_13_tradeoffs(result.risks, result)
    result.decision = _stage_14_decide(result.tradeoff_matrix)
    result.execution_plan = _stage_15_plan(result.decision)
    result.trajectory_conformance = _stage_16_monitor(result.execution_plan, state)
    result.learning_record = _stage_17_learn(result.trajectory_conformance, result.decision)
    result.knowledge_node = _stage_18_retain(result.learning_record)

    return result