"""
Reasoning trace route — Phase 3 / Final.1.

Returns the full PipelineResult as JSON so the frontend ReasoningTrace
component (Phase 5) and the validate_emios_pipeline.py gate script (Phase 4)
can inspect the complete reasoning chain.
"""
from dataclasses import asdict
from fastapi import APIRouter, HTTPException, Query

from app.api.models import ApiResponse
from app.storage.session_store import store as session_store

router = APIRouter(prefix="/api", tags=["Reasoning Trace"])


def _safe_serialize(obj):
    """Convert PipelineResult (dataclass) to a JSON-serialisable dict."""
    try:
        return asdict(obj)
    except Exception:
        pass
    # Fallback: pydantic model or plain object
    if hasattr(obj, "model_dump"):
        return obj.model_dump(exclude_none=True)
    if hasattr(obj, "__dict__"):
        out = {}
        for k, v in obj.__dict__.items():
            if k.startswith("_"):
                continue
            try:
                import json
                json.dumps(v)
                out[k] = v
            except (TypeError, ValueError):
                out[k] = str(v)
        return out
    return str(obj)


@router.get("/reasoning-trace")
def get_reasoning_trace(session_id: str = Query(...)):
    """
    Return the complete PipelineResult for a session as a JSON dict.

    Used by:
    - Frontend ReasoningTrace.jsx (Phase 5)
    - scripts/validate_emios_pipeline.py INV checks (Phase 4)
    """
    result = session_store.get(session_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        data = _safe_serialize(result)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to serialize pipeline result: {exc}",
        )

    return ApiResponse(
        success=True,
        message="Reasoning trace retrieved",
        data=data,
    )
