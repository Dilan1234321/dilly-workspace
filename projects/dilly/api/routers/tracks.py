"""
Track scoring frameworks built from company hiring guidelines.

- GET /tracks/frameworks — list all tracks with frameworks (summary, company count, average scores).
- GET /tracks/{track}/framework — single track framework for display or scoring reference.
"""

from fastapi import APIRouter, HTTPException

from projects.dilly.api.company_criteria import get_frameworks_by_track

router = APIRouter(tags=["tracks"])


@router.get("/tracks/frameworks")
async def list_track_frameworks():
    """
    Return scoring frameworks per track, built from company hiring guidelines.
    Each framework: track, companies, summary, average_scores, source_note.
    No auth required.
    """
    frameworks = get_frameworks_by_track()
    return {"frameworks": list(frameworks.values())}


@router.get("/tracks/{track}/framework")
async def get_track_framework(track: str):
    """
    Return the scoring framework for one track (from company guidelines).
    Used to show "How we score [Tech/Finance/Consulting]" and align scoring with employers.
    """
    frameworks = get_frameworks_by_track()
    # Normalize: Tech, tech -> same
    track_key = (track or "").strip().lower()
    if not track_key:
        raise HTTPException(status_code=400, detail="Track required.")
    # Frameworks keys are from company rules (e.g. tech, finance, consulting)
    if track_key not in frameworks:
        raise HTTPException(status_code=404, detail=f"No framework for track '{track}'.")
    return frameworks[track_key]
