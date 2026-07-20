"""
Sprint Health route — full per-person competency + spillover + overbilling analysis.

GET /api/sprint-health?session_id=<id>

Returns structured data for the Sprint Health tab:
  - per-person competency profile (skill matches, overrun patterns, recommendations)
  - spillover items with root cause classification
  - overbilling items with root cause classification
  - prevention recommendations per person
  - summary metrics
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, List, Optional, Any

from app.api.models import ApiResponse
from app.storage.session_store import store

router = APIRouter(prefix="/api", tags=["Sprint Health"])


def _safe(obj, *attrs, default=None):
    for attr in attrs:
        if obj is None:
            return default
        obj = getattr(obj, attr, None)
    return obj if obj is not None else default


def _classify_spillover_root_cause(wi, res, sprint_load: float, sprint_cap: float, overrun_pct) -> Dict:
    """Classify why an item spilled into the next sprint."""
    skill_match = None
    if res and wi.required_skill and hasattr(res, "covers_skill"):
        try:
            skill_match = res.covers_skill(wi.required_skill)
        except Exception:
            skill_match = None

    overload_pct = round((sprint_load / sprint_cap - 1) * 100) if sprint_cap > 0 else 0
    overrun = round(overrun_pct * 100) if overrun_pct is not None else None

    if skill_match is False:
        root_cause = "SKILL_MISMATCH"
        explanation = (
            f"Work required '{wi.required_skill}' but {_safe(res,'resource_id','unknown')} "
            f"specialises in '{_safe(res,'primary_skill','unknown')}'. "
            "Assigning work outside primary skill area leads to learning overhead and spillover."
        )
        prevention = (
            "Match work to primary skill before sprint planning. "
            "If secondary skill coverage is needed, pair with a primary-skill owner for the first sprint."
        )
    elif overload_pct > 20:
        root_cause = "OVERBOOKED"
        explanation = (
            f"{_safe(res,'resource_id','Owner')} was committed to {round(sprint_load)}h "
            f"against {round(sprint_cap)}h capacity ({overload_pct}% over). "
            "Capacity overcommitment forces items to slip regardless of skill level."
        )
        prevention = (
            "Cap per-person sprint load at 85% of capacity. "
            "Use the Resource Load view before finalising sprint assignments."
        )
    elif overrun is not None and overrun > 40:
        root_cause = "COMPETENCY_GAP"
        explanation = (
            f"Skill was correctly matched but actual effort was {overrun}% above estimate. "
            f"'{wi.required_skill}' was within {_safe(res,'resource_id','the owner')}'s profile "
            "but the specific task complexity was underestimated — a signal of advancing-skill work."
        )
        prevention = (
            "Flag items where overrun exceeds 30% for post-sprint review. "
            "Pair with a senior team member on similar items next cycle and recalibrate estimates using actuals."
        )
    else:
        root_cause = "CAPACITY"
        explanation = "Sprint capacity was insufficient to complete the item within the planned window."
        prevention = "Review sprint load balance and blocker status at the mid-sprint checkpoint."

    return {
        "root_cause": root_cause,
        "explanation": explanation,
        "prevention": prevention,
        "skill_match": skill_match,
        "overload_pct": overload_pct if overload_pct > 0 else 0,
    }


def _classify_overbilling_root_cause(wi, res, overrun_pct: float) -> Dict:
    """Classify why an item took more hours than estimated."""
    skill_match = None
    if res and wi.required_skill and hasattr(res, "covers_skill"):
        try:
            skill_match = res.covers_skill(wi.required_skill)
        except Exception:
            skill_match = None

    overrun = round(overrun_pct * 100)

    if skill_match is False:
        root_cause = "SKILL_MISMATCH"
        explanation = (
            f"Work required '{wi.required_skill}' but was assigned to "
            f"{_safe(res,'resource_id','unknown')} whose primary skill is "
            f"'{_safe(res,'primary_skill','unknown')}'. "
            "Working in an unfamiliar domain inflates actual effort by 30–90%."
        )
        prevention = (
            "Before assigning, verify skill match in the Resource Matrix. "
            "If no primary-skill owner is available, plan for a 40% effort buffer and pair-program."
        )
        severity = "HIGH" if overrun > 50 else "MEDIUM"
    elif overrun > 50:
        root_cause = "COMPETENCY_GAP"
        explanation = (
            f"Skill was correctly matched but actual effort was {overrun}% above estimate. "
            "This indicates the team member is still developing depth in this area — "
            "the task required more advanced knowledge than currently mastered."
        )
        prevention = (
            "Run a competency workshop or pair with a domain expert for this skill area. "
            "Add a 25% complexity buffer to estimates for this person on similar tasks until "
            "overrun drops below 15% consistently."
        )
        severity = "HIGH" if overrun > 70 else "MEDIUM"
    elif overrun > 25:
        root_cause = "ESTIMATION_DRIFT"
        explanation = (
            f"Skill matched correctly but estimate was {overrun}% low. "
            "This is a systematic underestimation pattern for this task category."
        )
        prevention = (
            "Apply a 1.3× multiplier to future estimates for this task type. "
            "Use historical actuals from completed items as the baseline, not ideal-case estimates."
        )
        severity = "MEDIUM"
    else:
        root_cause = "MINOR_VARIANCE"
        explanation = f"Small overrun ({overrun}%) within acceptable estimation noise."
        prevention = "No action needed. Monitor for trend."
        severity = "LOW"

    return {
        "root_cause": root_cause,
        "explanation": explanation,
        "prevention": prevention,
        "skill_match": skill_match,
        "severity": severity,
    }


@router.get("/sprint-health")
def get_sprint_health(session_id: str = Query(...)):
    """
    Full sprint health analysis — competency, spillover, and overbilling
    with root cause classification and per-person prevention recommendations.
    """
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    result = store.get_pipeline_result(session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Pipeline result not yet available — load demo first")

    hist = getattr(result, "historical_analysis", None)
    if hist is None:
        raise HTTPException(status_code=404, detail="Historical analysis not available for this session")

    state = store.get_project_state(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Project state not found")

    # Build lookup maps
    wi_map = {w.item_id: w for w in state.work_items}
    res_map = {r.resource_id: r for r in state.team}

    # ── Per-person sprint load per sprint ─────────────────────────────────────
    from collections import defaultdict
    person_sprint_load: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    person_sprint_cap: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for wi in state.work_items:
        owner = wi.assigned_resource or ""
        sprint = wi.assigned_sprint or ""
        person_sprint_load[owner][sprint] += float(wi.estimated_effort_hrs or 0)

    for r in state.team:
        daily_cap = float(getattr(r, "daily_capacity_hrs", 8.0) or 8.0)
        avail = float(getattr(r, "availability_pct", 1.0) or 1.0)
        sprint_cap = daily_cap * avail * 10  # 10-day sprint
        for sprint_name in person_sprint_load[r.resource_id]:
            person_sprint_cap[r.resource_id][sprint_name] = sprint_cap

    # ── Spillover items with root cause ───────────────────────────────────────
    spillover_items = []
    for sp in (getattr(hist, "spillover", []) or []):
        wi = wi_map.get(sp.item_id)
        if not wi:
            continue
        res = res_map.get(wi.assigned_resource)
        sprint = wi.assigned_sprint or sp.original_sprint or ""
        s_load = person_sprint_load[wi.assigned_resource][sprint]
        s_cap = person_sprint_cap.get(wi.assigned_resource, {}).get(sprint, 80.0)
        est = float(wi.estimated_effort_hrs or 0)
        actual = float(wi.actual_effort_hrs or 0)
        overrun_pct = (actual - est) / est if est > 0 and actual > 0 else None

        rc = _classify_spillover_root_cause(wi, res, s_load, s_cap, overrun_pct)

        spillover_items.append({
            "item_id": sp.item_id,
            "item_title": getattr(sp, "item_title", wi.item_title if hasattr(wi, "item_title") else sp.item_id),
            "from_sprint": sp.original_sprint,
            "to_sprint": sp.landed_sprint,
            "sprints_delayed": sp.sprints_delayed,
            "reason_category": sp.reason_category,
            "owner": wi.assigned_resource,
            "required_skill": wi.required_skill,
            "owner_primary_skill": _safe(res, "primary_skill"),
            "owner_secondary_skill": _safe(res, "secondary_skill"),
            "estimated_hrs": est,
            "actual_hrs": actual,
            "overrun_pct": round(overrun_pct * 100) if overrun_pct is not None else None,
            "sprint_load_hrs": round(s_load),
            "sprint_capacity_hrs": round(s_cap),
            **rc,
        })

    # ── Overbilling items with root cause ─────────────────────────────────────
    overbilling_items = []
    for o in sorted(getattr(hist, "overbilling", []) or [], key=lambda x: x.overrun_pct, reverse=True):
        wi = wi_map.get(o.item_id)
        if not wi:
            continue
        res = res_map.get(wi.assigned_resource)
        rc = _classify_overbilling_root_cause(wi, res, o.overrun_pct)

        overbilling_items.append({
            "item_id": o.item_id,
            "item_title": getattr(o, "item_title", o.item_id),
            "sprint_id": o.sprint_id,
            "owner": wi.assigned_resource,
            "required_skill": wi.required_skill,
            "owner_primary_skill": _safe(res, "primary_skill"),
            "owner_secondary_skill": _safe(res, "secondary_skill"),
            "estimated_hrs": o.estimated_hrs,
            "actual_hrs": o.actual_hrs,
            "overrun_hrs": round(o.actual_hrs - o.estimated_hrs, 1),
            "overrun_pct": round(o.overrun_pct * 100),
            **rc,
        })

    # ── Per-person competency profile ─────────────────────────────────────────
    person_stats: Dict[str, Any] = {}
    for r in state.team:
        rid = r.resource_id
        ob_items = [o for o in overbilling_items if o["owner"] == rid]
        sp_items = [s for s in spillover_items if s["owner"] == rid]
        skill_mismatches = [o for o in ob_items if o["root_cause"] == "SKILL_MISMATCH"]
        competency_gaps = [o for o in ob_items if o["root_cause"] == "COMPETENCY_GAP"]
        high_severity = [o for o in ob_items if o.get("severity") == "HIGH"]

        avg_overrun = (
            sum(o["overrun_pct"] for o in ob_items) / len(ob_items) if ob_items else 0
        )

        # Derive competency health signal
        if len(competency_gaps) >= 2 or (len(ob_items) > 0 and avg_overrun > 50):
            health = "NEEDS_IMPROVEMENT"
            health_label = "Needs improvement"
            health_color = "rose"
        elif len(skill_mismatches) > 0 or avg_overrun > 30:
            health = "WATCH"
            health_label = "Watch"
            health_color = "amber"
        elif len(ob_items) > 0 and avg_overrun <= 20:
            health = "GOOD"
            health_label = "Good"
            health_color = "emerald"
        else:
            health = "GOOD"
            health_label = "Good"
            health_color = "emerald"

        # Derive prevention recommendations for this person
        person_preventions = []
        if skill_mismatches:
            person_preventions.append({
                "type": "SKILL_ASSIGNMENT",
                "action": f"Always assign '{r.primary_skill}' work to {rid}. "
                          f"Found {len(skill_mismatches)} item(s) outside their profile causing major overruns.",
                "priority": "HIGH",
            })
        if competency_gaps:
            skills_needing_dev = list({o["required_skill"] for o in competency_gaps})
            person_preventions.append({
                "type": "COMPETENCY_DEVELOPMENT",
                "action": (
                    f"Recommend targeted upskilling for {rid} in: {', '.join(skills_needing_dev[:2])}. "
                    f"Average overrun on matched-skill work is {round(avg_overrun)}% — "
                    "indicates advancing-skill tasks exceed current depth."
                ),
                "priority": "HIGH" if avg_overrun > 50 else "MEDIUM",
            })
        if sp_items and not skill_mismatches and not competency_gaps:
            overload_sp = [s for s in sp_items if s["root_cause"] == "OVERBOOKED"]
            if overload_sp:
                person_preventions.append({
                    "type": "CAPACITY_PLANNING",
                    "action": (
                        f"Cap {rid}'s sprint load at 85% of their {round(_safe(r,'daily_capacity_hrs',8)*10)}h "
                        "sprint capacity. Overcommitment caused spillover despite correct skill assignment."
                    ),
                    "priority": "MEDIUM",
                })

        # Completed items (baseline for productivity)
        completed = [w for w in state.work_items
                     if w.assigned_resource == rid
                     and str(w.status).upper().startswith("COMPLET")]
        total_assigned = [w for w in state.work_items if w.assigned_resource == rid]

        person_stats[rid] = {
            "resource_id": rid,
            "name": getattr(r, "name", rid),
            "primary_skill": r.primary_skill,
            "secondary_skill": r.secondary_skill,
            "total_assigned": len(total_assigned),
            "completed_count": len(completed),
            "overbilling_count": len(ob_items),
            "spillover_count": len(sp_items),
            "skill_mismatch_count": len(skill_mismatches),
            "competency_gap_count": len(competency_gaps),
            "high_severity_count": len(high_severity),
            "avg_overrun_pct": round(avg_overrun),
            "health": health,
            "health_label": health_label,
            "health_color": health_color,
            "preventions": person_preventions,
        }

    # ── Summary ───────────────────────────────────────────────────────────────
    skill_mismatch_total = sum(1 for o in overbilling_items if o["root_cause"] == "SKILL_MISMATCH")
    competency_gap_total = sum(1 for o in overbilling_items if o["root_cause"] == "COMPETENCY_GAP")
    overbooked_total = sum(1 for s in spillover_items if s["root_cause"] == "OVERBOOKED")
    total_wasted_hrs = sum(o["overrun_hrs"] for o in overbilling_items)

    summary = {
        "sprints_analysed": getattr(hist, "sprints_analysed", 0),
        "total_spillover_items": len(spillover_items),
        "total_overbilling_items": len(overbilling_items),
        "total_wasted_hrs": round(total_wasted_hrs, 1),
        "skill_mismatch_count": skill_mismatch_total,
        "competency_gap_count": competency_gap_total,
        "overbooked_count": overbooked_total,
        "people_needing_improvement": sum(
            1 for p in person_stats.values() if p["health"] == "NEEDS_IMPROVEMENT"
        ),
        "people_to_watch": sum(1 for p in person_stats.values() if p["health"] == "WATCH"),
        "historical_summary": getattr(hist, "summary", ""),
        "prevention_recommendations": [
            {
                "trigger": r.trigger,
                "action": r.action,
                "sprint_to_apply": r.sprint_to_apply,
                "confidence": r.confidence,
                "evidence": (r.evidence[:3] if r.evidence else []),
            }
            for r in (getattr(hist, "prevention_recommendations", []) or [])
        ],
    }

    return ApiResponse(
        success=True,
        message="Sprint health analysis retrieved",
        data={
            "summary": summary,
            "people": list(person_stats.values()),
            "spillover_items": spillover_items,
            "overbilling_items": overbilling_items,
        },
    )
