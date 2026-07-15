"""
tests/test_phase4_recovery_plans.py

Integration test for Phase 4 Stage 15: RecoveryPlanBuilder.

Design note: unlike Stage 13/14, Stage 15 is NOT a from-scratch engine --
it's a thin adapter (`_stage_15_plan` in emios_pipeline.py) over the
existing, mature `RecoveryPlanEngine` (app/engines/recovery_plan_engine/),
which already generates 3 simulated, scored, ranked plans. Because that
engine's scoring depends on real simulated interactions between actions
(SimulationEngine), hand-built SimpleNamespace fixtures would just be
testing our own assumptions about simulator behavior rather than the real
thing. So this test runs the actual pipeline against the actual demo
workbook, the same way scripts/validate_emios_pipeline.py is expected to.
"""
from __future__ import annotations

import sys

import pytest

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

# Prime the pre-existing circular import between forecast_engine.py and
# app/api/routes/demo.py by importing app.api first. See test_phase4_tradeoffs.py
# / test_phase4_decision.py handoff notes for the same issue.
import app.api  # noqa: F401

from app.core.config import settings
from app.parsers.workbook_parser import WorkbookParser
from app.pipeline.emios_pipeline import run_emios_pipeline
from app.engines.recovery_plan_engine.models import RecoveryPlanArchetype


@pytest.fixture(scope="module")
def pipeline_result():
    parser = WorkbookParser(settings.demo_workbook_path)
    state = parser.parse()
    return run_emios_pipeline(state)


def test_recovery_plans_present(pipeline_result):
    assert pipeline_result.recovery_plans is not None
    assert len(pipeline_result.recovery_plans) > 0


def test_three_distinct_archetypes(pipeline_result):
    """Spec: 3 strategies (SAFE, AGGRESSIVE, MINIMAL_DISRUPTION)."""
    archetypes = {p.archetype for p in pipeline_result.recovery_plans}
    assert archetypes == {
        RecoveryPlanArchetype.SAFE,
        RecoveryPlanArchetype.AGGRESSIVE,
        RecoveryPlanArchetype.MINIMAL_DISRUPTION,
    }


def test_exactly_one_recommended_plan(pipeline_result):
    recommended = [p for p in pipeline_result.recovery_plans if p.label == "Recommended"]
    assert len(recommended) == 1


def test_plans_ranked_by_composite_score_descending(pipeline_result):
    scores = [p.score.composite_score for p in pipeline_result.recovery_plans]
    assert scores == sorted(scores, reverse=True)


def test_each_plan_has_marginal_outcome_metrics(pipeline_result):
    """'Marginals' = each plan must carry its own projected on-time
    probability, expected delay, and risk -- not a shared/global number."""
    seen = set()
    for p in pipeline_result.recovery_plans:
        assert 0.0 <= p.score.deadline_probability <= 1.0
        assert isinstance(p.score.expected_delay_days, float)
        assert p.score.overall_risk_score >= 0.0
        seen.add((p.score.deadline_probability, p.score.expected_delay_days))
    # marginals must actually differ across plans, not be a copy-pasted constant
    assert len(seen) > 1


def test_each_plan_has_narrative_explanation(pipeline_result):
    for p in pipeline_result.recovery_plans:
        assert p.explanation.narrative_summary.strip() != ""
        assert len(p.explanation.why_recommended) > 0
