"""API module initialization."""
from app.api.models import ApiResponse, UploadResponse, ErrorCodes
from app.api.routes.diagnosis import router as diagnosis_router

__all__ = ["ApiResponse", "UploadResponse", "ErrorCodes"]
# In the function that registers all routers (or wherever you call app.include_router):
