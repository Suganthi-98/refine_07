"""
Learning Outcome API Route (Phase 6a — Stage 17a support)

LearningEngine (app/engines/learning_engine.py) is fully implemented and
already handles a real ActualSprintOutcome correctly -- it just never
received one, because nothing in the pipeline had anywhere to store or
look one up. This route is that missing piece.

Endpoints:
- POST /api/learning/outcome            — record a real sprint outcome
- GET  /api/learning/outcome/{sprint_id} — retrieve a previously recorded outcome
- GET  /api/learning/calibration        — retrieve the running CalibrationProfile for a team

Once an outcome is recorded here, the next call to run_emios_pipeline()
for this session should be invoked with
    actual_outcome=store.get_latest_actual_outcome(session_id)
so Stage 17a (LearningEngine) computes a real Brier score instead of
degrading to "no outcome data yet."
"""

from fastapi import APIRouter, HTTPException, Query

from app.api.models import ApiResponse, ErrorCodes
from app.domain.emios_models import ActualSprintOutcome
from app.storage import store
from app.storage.calibration_store import CalibrationStore

router = APIRouter(prefix="/api/learning", tags=["Learning"])


@router.post("/outcome")
async def record_outcome(
    outcome: ActualSprintOutcome,
    session_id: str = Query(..., description="Session ID"),
) -> dict:
    """
    Record the real outcome of a sprint once it has closed.

    Body fields (see ActualSprintOutcome in app/domain/emios_models.py):
      - sprint_id: str
      - actual_velocity_hrs: float
      - actual_delay_days: Optional[float]   (None if sprint still in progress)
      - blocker_ids_resolved: List[str]
      - item_ids_completed: List[str]
      - diagnosis_confirmed: Optional[bool]  (PM manually flags whether the
        diagnosis/root-cause the pipeline reported turned out to be correct)

    Overwrites any previously recorded outcome for the same sprint_id --
    PMs may file a correction as more information becomes available.
    """
    try:
        session_id = session_id.strip()
        stored = store.record_actual_outcome(session_id, outcome)
        if not stored:
            raise HTTPException(
                status_code=404,
                detail=ApiResponse(
                    success=False,
                    error_code=ErrorCodes.SESSION_NOT_FOUND,
                    message=f"Session {session_id} not found",
                ).model_dump(mode="json"),
            )

        return ApiResponse(
            success=True,
            data=outcome.model_dump(mode="json"),
            message=f"Outcome recorded for sprint {outcome.sprint_id}. "
            f"It will be used the next time this session's pipeline runs.",
        ).model_dump()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=ApiResponse(
                success=False,
                error_code=ErrorCodes.INTERNAL_ERROR,
                message=f"Failed to record outcome: {str(e)}",
            ).model_dump(mode="json"),
        )


@router.get("/outcome/{sprint_id}")
async def get_outcome(
    sprint_id: str,
    session_id: str = Query(..., description="Session ID"),
) -> dict:
    """Retrieve a previously recorded outcome for one sprint, if any."""
    session_id = session_id.strip()
    if store.get_session(session_id) is None:
        raise HTTPException(
            status_code=404,
            detail=ApiResponse(
                success=False,
                error_code=ErrorCodes.SESSION_NOT_FOUND,
                message=f"Session {session_id} not found",
            ).model_dump(mode="json"),
        )

    outcome = store.get_actual_outcome(session_id, sprint_id)
    if outcome is None:
        raise HTTPException(
            status_code=404,
            detail=ApiResponse(
                success=False,
                error_code=ErrorCodes.NOT_FOUND,
                message=f"No outcome recorded for sprint {sprint_id}",
            ).model_dump(mode="json"),
        )

    return ApiResponse(
        success=True,
        data=outcome.model_dump(mode="json"),
        message="Outcome retrieved successfully",
    ).model_dump()


@router.get("/calibration")
async def get_calibration(
    team_id: str = Query("default", description="Team ID"),
) -> dict:
    """
    Retrieve the running calibration profile for a team: velocity bias,
    probability over/underestimate, and Brier score history accumulated
    across every LearningEngine episode so far. Returns null data if no
    episodes have been recorded for this team yet.
    """
    profile = CalibrationStore.get(team_id)
    return ApiResponse(
        success=True,
        data=profile.model_dump(mode="json") if profile is not None else None,
        message=(
            "Calibration profile retrieved successfully"
            if profile is not None
            else f"No calibration data yet for team '{team_id}'"
        ),
    ).model_dump()
