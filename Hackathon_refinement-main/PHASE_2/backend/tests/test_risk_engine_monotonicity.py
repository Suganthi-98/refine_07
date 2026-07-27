"""
Risk Engine monotonicity regression tests.

These tests guard against the "mean-over-active-components" bug in
RiskEngine: several sub-score methods used to average only the *triggered*
risk components (`sum(risk_components) / len(risk_components)`). Because an
untriggered/resolved component simply dropped out of the list instead of
counting as 0, resolving a genuine risk factor could shrink the denominator
enough to *raise* the resulting average - i.e. fixing a problem could make
the dashboard show MORE risk, not less.

The fix uses a fixed-denominator (or additive-capped, for schedule) model so
every possible driver "slot" always counts, contributing 0 when it isn't
triggered. That guarantees monotonicity: for every risk category, and for
the overall risk score, resolving a genuinely fixing action must never
increase the score, all else held equal.
"""

import pytest
from datetime import datetime, timedelta

from app.domain.models import (
    ProjectInfo, Resource, Sprint, WorkItem, Dependency, Blocker, ProjectState,
    SkillLevel, WorkItemType, Priority, WorkItemStatus, SprintStatus, BlockerSeverity,
    BlockerStatus, BlockerCategory, DependencyType,
)
from app.engines.metrics_engine import MetricsEngine
from app.engines.dependency_engine import DependencyGraphEngine
from app.engines.critical_path_engine import CriticalPathEngine
from app.engines.spillover_engine import SpilloverAnalysisEngine
from app.engines.forecast_engine import ForecastEngine
from app.engines.monte_carlo_engine import MonteCarloEngine
from app.engines.impact_scoring_engine import ImpactScoringEngine
from app.engines.risk_engine import RiskEngine


def _analyze(project_state):
    """Run the full engine pipeline and return the RiskResult."""
    metrics = MetricsEngine(project_state).calculate()
    dep_engine = DependencyGraphEngine(project_state)
    dag = dep_engine.build_dag()
    cp_engine = CriticalPathEngine(project_state, dag)
    cp_result = cp_engine.analyze()
    spillover = SpilloverAnalysisEngine(project_state, metrics.average_item_effort).analyze()
    forecast = ForecastEngine(project_state, metrics, cp_result, spillover).calculate()
    mc_engine = MonteCarloEngine(project_state, metrics, cp_result, spillover, simulation_count=1000)
    monte_carlo = mc_engine.calculate()
    impact_scores = ImpactScoringEngine(project_state, dag).score()

    risk_engine = RiskEngine(
        project_state, metrics, cp_result, dag, spillover, forecast, monte_carlo, impact_scores
    )
    return risk_engine.analyze()


def _base_project(num_work_items=6, num_deps=0, blockers=None, allocation_pct=0.6, availability_pct=1.0):
    """Build a project state with a configurable set of blockers/dependencies
    so we can compare a "before" state against an "after resolution" state."""
    start_date = datetime(2025, 1, 1)
    end_date = datetime(2025, 3, 1)
    project_info = ProjectInfo(
        project_name="Monotonicity Test Project",
        sponsor="Test Sponsor",
        business_unit="Engineering",
        project_manager="Test PM",
        customer="Test Customer",
        status="Active",
        start_date=start_date,
        target_end_date=end_date,
        sprint_duration_days=14,
        methodology="Agile Scrum",
    )

    team = [
        Resource(
            resource_id="R1",
            name="Alice",
            role="Engineer",
            primary_skill="Python",
            secondary_skill="C++",
            skill_level=SkillLevel.SENIOR,
            allocation_pct=allocation_pct,
            availability_pct=availability_pct,
        ),
        Resource(
            resource_id="R2",
            name="Bob",
            role="Engineer",
            primary_skill="Python",
            secondary_skill="JavaScript",
            skill_level=SkillLevel.SENIOR,
            allocation_pct=allocation_pct,
            availability_pct=availability_pct,
        ),
    ]

    sprints = [
        Sprint(
            sprint_id="S1",
            sprint_name="Sprint 1",
            sprint_number=1,
            start_date=start_date,
            end_date=start_date + timedelta(days=14),
            working_days=10,
            sprint_goal="Development",
            status=SprintStatus.IN_PROGRESS,
            planned_velocity_hrs=80.0,
            carryover_count=0,
        ),
    ]

    work_items = []
    for i in range(num_work_items):
        work_items.append(
            WorkItem(
                item_id=f"WI-{i:03d}",
                title=f"Task {i}",
                work_type=WorkItemType.TASK,
                assigned_sprint="S1",
                original_sprint="S1",
                priority=Priority.MEDIUM,
                status=WorkItemStatus.IN_PROGRESS,
                estimated_effort_hrs=10.0,
                current_estimate_hrs=10.0,
                remaining_effort_hrs=6.0,
                assigned_resource="R1" if i % 2 == 0 else "R2",
                required_skill="Python",
            )
        )

    # Build a strictly acyclic chain of dependencies (item i depends on
    # item i-1) to avoid infinite recursion in the critical-path DFS.
    dependencies = []
    for i in range(min(num_deps, max(0, num_work_items - 1))):
        pred = work_items[i].item_id
        succ = work_items[i + 1].item_id
        dependencies.append(
            Dependency(
                dependency_id=f"DEP-{i:03d}",
                predecessor_item_id=pred,
                successor_item_id=succ,
                dependency_type=DependencyType.FINISH_TO_START,
            )
        )

    return ProjectState(
        project_id="proj-monotonicity",
        project_info=project_info,
        team=team,
        sprints=sprints,
        work_items=work_items,
        dependencies=dependencies,
        blockers=blockers or [],
        actuals=[],
    )


def _make_blocker(blocker_id, severity, impacted_item_ids, resolved=False):
    return Blocker(
        blocker_id=blocker_id,
        related_item_id=impacted_item_ids[0],
        description="Test blocker",
        severity=severity,
        status=BlockerStatus.RESOLVED if resolved else BlockerStatus.OPEN,
        category=BlockerCategory.OTHER,
        impacted_item_ids=impacted_item_ids,
        raised_date=datetime(2025, 1, 2),
        actual_resolution_date=datetime(2025, 1, 5) if resolved else None,
    )


class TestDependencyRiskMonotonicity:
    def test_resolving_blocker_never_increases_dependency_score(self):
        # A single blocker keeps this focused on the fixed-denominator fix
        # (density / critical-path / bottleneck / cascade / baseline slots)
        # without also exercising the separate highest-severity-selection
        # logic used when multiple blockers are active simultaneously.
        item_ids = [f"WI-{i:03d}" for i in range(6)]

        before_state = _base_project(
            num_work_items=6,
            num_deps=5,
            blockers=[_make_blocker("B1", BlockerSeverity.LOW, item_ids[:2], resolved=False)],
        )
        after_state = _base_project(
            num_work_items=6,
            num_deps=5,
            blockers=[_make_blocker("B1", BlockerSeverity.LOW, item_ids[:2], resolved=True)],
        )

        before_result = _analyze(before_state)
        after_result = _analyze(after_state)

        assert after_result.dependency_risk.score <= before_result.dependency_risk.score + 1e-6, (
            f"Resolving a blocker must not raise dependency risk: "
            f"before={before_result.dependency_risk.score}, after={after_result.dependency_risk.score}"
        )
        assert after_result.overall_risk_score <= before_result.overall_risk_score + 1e-6


class TestResourceRiskMonotonicity:
    def test_resolving_allocation_imbalance_never_increases_resource_score(self):
        # High utilization triggers the utilization risk slot; dropping
        # utilization must not raise the resulting resource score even
        # though it changes which slots are active.
        before_state = _base_project(num_work_items=6, allocation_pct=0.97, availability_pct=1.0)
        after_state = _base_project(num_work_items=6, allocation_pct=0.90, availability_pct=1.0)

        before_result = _analyze(before_state)
        after_result = _analyze(after_state)

        assert after_result.resource_risk.score <= before_result.resource_risk.score + 1e-6, (
            f"Lowering utilization must not raise resource risk: "
            f"before={before_result.resource_risk.score}, after={after_result.resource_risk.score}"
        )


class TestScheduleRiskMonotonicity:
    def test_resolving_spillover_never_increases_schedule_score(self):
        # A project with blocker-driven spillover pressure contributing to
        # the schedule signal; resolving the blocker must not raise the
        # resulting schedule score.
        item_ids = [f"WI-{i:03d}" for i in range(6)]
        before_state = _base_project(
            num_work_items=6,
            blockers=[_make_blocker("B1", BlockerSeverity.HIGH, item_ids[:3], resolved=False)],
        )
        after_state = _base_project(
            num_work_items=6,
            blockers=[_make_blocker("B1", BlockerSeverity.HIGH, item_ids[:3], resolved=True)],
        )

        before_result = _analyze(before_state)
        after_result = _analyze(after_state)

        assert after_result.schedule_risk.score <= before_result.schedule_risk.score + 1e-6, (
            f"Resolving a blocker must not raise schedule risk: "
            f"before={before_result.schedule_risk.score}, after={after_result.schedule_risk.score}"
        )
        assert after_result.overall_risk_score <= before_result.overall_risk_score + 1e-6


class TestOverallRiskMonotonicity:
    @pytest.mark.parametrize("severity", [
        BlockerSeverity.CRITICAL,
        BlockerSeverity.HIGH,
        BlockerSeverity.MEDIUM,
        BlockerSeverity.LOW,
    ])
    def test_resolving_any_single_blocker_never_increases_overall_score(self, severity):
        item_ids = [f"WI-{i:03d}" for i in range(6)]
        before_state = _base_project(
            num_work_items=6,
            num_deps=4,
            blockers=[_make_blocker("B1", severity, item_ids[:2], resolved=False)],
        )
        after_state = _base_project(
            num_work_items=6,
            num_deps=4,
            blockers=[_make_blocker("B1", severity, item_ids[:2], resolved=True)],
        )

        before_result = _analyze(before_state)
        after_result = _analyze(after_state)

        assert after_result.overall_risk_score <= before_result.overall_risk_score + 1e-6, (
            f"Resolving a {severity} blocker must not raise overall risk score: "
            f"before={before_result.overall_risk_score}, after={after_result.overall_risk_score}"
        )
