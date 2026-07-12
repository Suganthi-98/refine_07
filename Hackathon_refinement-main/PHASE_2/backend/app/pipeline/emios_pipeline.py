"""
EMIOS Pipeline — top-level contract bridging Sprint Whisperer's 9 deterministic
engines to the EMIOS 18-stage cognitive pipeline.

PipelineResult holds ALL 18 stage outputs as Optional fields: the 9 existing
Sprint Whisperer outputs are populated by run_emios_pipeline() today; the 9 new
cognition/knowledge outputs are stubbed (return None) until their engines land.

The 9-engine run order mirrors EngineRunner.run() in simulation_engine.py exactly,
so this uses the real constructors, not guessed ones.
"""
from __future__ import annotations

from dataclasses import dataclass, field
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

# --- New EMIOS cognition/knowledge outputs (types) -------------------------
from app.domain.emios_models import (
    ObservationCluster,
    ValidatedObservation,
    ValidationResult,
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
    """Holds every output of the combined 9+9 pipeline.

    Existing Sprint Whisperer engines populate the first block today.
    EMIOS cognitive-stage engines fill the rest as they come online; until
    then those fields stay None.
    """

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

    # ----- New EMIOS 18-stage cognitive outputs (9 net-new types) ----------
    # Stage 1
    observation_cluster: Optional[ObservationCluster] = None
    # Stage 2 (batch container: validated + suppressed + data_confidence + warnings)
    validation_result: Optional[ValidationResult] = None
    # Stage 3
    evidence_bundle: Optional[EvidenceBundle] = None
    # Stage 4 (generation) + Stage 5 (elimination survivors)
    hypotheses: Optional[List[Hypothesis]] = None
    surviving_hypotheses: Optional[List[Hypothesis]] = None
    # Stage 6
    diagnosis: Optional[Diagnosis] = None
    # Stages 7-11
    impact_matrix: Optional[ImpactMatrix] = None
    # Stage 12 (EMIOS Risk objects; distinct from the deterministic RiskResult above)
    risks: Optional[List[Risk]] = None
    # Stage 13
    tradeoff_matrix: Optional[TradeoffMatrix] = None
    # Stage 14
    decision: Optional[Decision] = None
    # Stage 15
    execution_plan: Optional[ExecutionPlan] = None
    # Stage 16
    trajectory_conformance: Optional[TrajectoryConformance] = None
    # Stage 17
    learning_record: Optional[LearningRecord] = None
    # Stage 18
    knowledge_node: Optional[KnowledgeNode] = None


# ---------------------------------------------------------------------------
# EMIOS stage stubs (1-18) — return None until each engine is implemented
# ---------------------------------------------------------------------------

def _stage_01_observe(state: ProjectState, result: PipelineResult) -> Optional[ObservationCluster]:
    """Stage 1: neutral anomaly/trend/threshold detection over metrics. No cause."""
    return None


def _stage_02_validate(
    state: ProjectState, cluster: Optional[ObservationCluster]
) -> Optional[ValidationResult]:
    """Stage 2: confirm signals are real, suppress artifacts, assign data_confidence.
    Returns the batch ValidationResult (validated + suppressed + data_confidence +
    warnings). Phase 2.1's EvidenceCollector reads .validated and .data_confidence."""
    return None


def _stage_03_collect_evidence(
    state: ProjectState, validation: Optional[ValidationResult], result: PipelineResult
) -> Optional[EvidenceBundle]:
    """Stage 3: gather correlated signals across time/entities into a bundle."""
    return None


def _stage_04_generate_hypotheses(
    bundle: Optional[EvidenceBundle],
) -> Optional[List[Hypothesis]]:
    """Stage 4: enumerate ALL plausible causes (counters anchoring bias)."""
    return None


def _stage_05_eliminate_hypotheses(
    hypotheses: Optional[List[Hypothesis]], bundle: Optional[EvidenceBundle]
) -> Optional[List[Hypothesis]]:
    """Stage 5: falsify aggressively; return survivors with updated posteriors."""
    return None


def _stage_06_root_cause(
    survivors: Optional[List[Hypothesis]], bundle: Optional[EvidenceBundle]
) -> Optional[Diagnosis]:
    """Stage 6: 5-Whys + Fishbone to the deepest actionable cause."""
    return None


def _stages_07_11_impact(
    state: ProjectState, diagnosis: Optional[Diagnosis], result: PipelineResult
) -> Optional[ImpactMatrix]:
    """Stages 7-11: schedule / quality / resource / business / org impact."""
    return None


def _stage_12_assess_risk(
    impact: Optional[ImpactMatrix], result: PipelineResult
) -> Optional[List[Risk]]:
    """Stage 12: convert impacts into prioritized Risk objects (prob × severity)."""
    return None


def _stage_13_tradeoffs(
    risks: Optional[List[Risk]], result: PipelineResult
) -> Optional[TradeoffMatrix]:
    """Stage 13: project each option across five axes; surface the sacrifice."""
    return None


def _stage_14_decide(matrix: Optional[TradeoffMatrix]) -> Optional[Decision]:
    """Stage 14: MCDA over alternatives with feasibility gates."""
    return None


def _stage_15_plan(decision: Optional[Decision]) -> Optional[ExecutionPlan]:
    """Stage 15: turn the decision into a runnable plan with owners + KPIs."""
    return None


def _stage_16_monitor(plan: Optional[ExecutionPlan], state: ProjectState) -> Optional[TrajectoryConformance]:
    """Stage 16: track KPIs vs predicted trajectory; emit deviations."""
    return None


def _stage_17_learn(
    conformance: Optional[TrajectoryConformance], decision: Optional[Decision]
) -> Optional[LearningRecord]:
    """Stage 17: compare predicted vs actual, update calibration + priors."""
    return None


def _stage_18_retain(learning: Optional[LearningRecord]) -> Optional[KnowledgeNode]:
    """Stage 18: write the episode into the KG as a reusable pattern."""
    return None


# ---------------------------------------------------------------------------
# run_emios_pipeline — 9 real engines, then 18 cognitive-stage stubs
# ---------------------------------------------------------------------------

def run_emios_pipeline(
    state: ProjectState,
    *,
    simulation_count: int = 1000,
    seed: int = MONTE_CARLO_SEED,
) -> PipelineResult:
    """Run the combined 9-engine + 18-stage EMIOS pipeline.

    Today: runs all 9 existing Sprint Whisperer engines in EngineRunner order
    and populates their outputs. Stages 1-18 call stubs that return None, so
    the cognitive fields stay unset until their engines are implemented.
    """
    result = PipelineResult()

    # ===== Existing Sprint Whisperer 9-engine pipeline (real calls) =========
    # Order mirrors EngineRunner.run() in simulation_engine.py.
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

    # Recommendations (V2 greedy optimizer) + its best-scenario simulation.
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

    # ===== EMIOS 18-stage cognitive pipeline (stubs, return None) ===========
    result.observation_cluster = _stage_01_observe(state, result)
    result.validation_result = _stage_02_validate(state, result.observation_cluster)
    result.evidence_bundle = _stage_03_collect_evidence(
        state, result.validation_result, result
    )
    result.hypotheses = _stage_04_generate_hypotheses(result.evidence_bundle)
    result.surviving_hypotheses = _stage_05_eliminate_hypotheses(
        result.hypotheses, result.evidence_bundle
    )
    result.diagnosis = _stage_06_root_cause(
        result.surviving_hypotheses, result.evidence_bundle
    )
    result.impact_matrix = _stages_07_11_impact(state, result.diagnosis, result)
    result.risks = _stage_12_assess_risk(result.impact_matrix, result)
    result.tradeoff_matrix = _stage_13_tradeoffs(result.risks, result)
    result.decision = _stage_14_decide(result.tradeoff_matrix)
    result.execution_plan = _stage_15_plan(result.decision)
    result.trajectory_conformance = _stage_16_monitor(result.execution_plan, state)
    result.learning_record = _stage_17_learn(result.trajectory_conformance, result.decision)
    result.knowledge_node = _stage_18_retain(result.learning_record)

    return result