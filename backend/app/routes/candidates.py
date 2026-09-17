"""Candidate, ranking, shortlist, assessment, and HR routes."""

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..auth import RecruiterIdentity, get_current_recruiter
from ..models import PIPELINE_STAGES
from ..schemas import (
    AnalysisResponse,
    AssessmentCreateRequest,
    AssessmentResponse,
    CandidateResponse,
    HRDecisionRequest,
    HRDecisionResponse,
    RankingResponse,
    ShortlistResponse,
)
from ..services.pipeline import PipelineError, _email_description

import sys as _sys

router = APIRouter(prefix="/api", tags=["candidates"])



@router.get("/candidates/{candidate_id}/assessment/generate")
async def generate_assessment(
    candidate_id: str,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        job_description = payload if isinstance(payload, dict) else {}
        generated = _pipeline(request).generate_assessment(candidate_id, job_description)
        return {
            "candidate_id": generated.candidate_id,
            "job_title": generated.job_title,
            "title": generated.definition.title,
            "description": generated.definition.description,
            "duration_minutes": generated.definition.duration_minutes,
            "questions": [
                {
                    "question_text": q.question_text,
                    "language": q.language,
                    "difficulty": q.difficulty,
                    "type": q.type,
                    "skills": q.skills,
                    "source_requirements": q.source_requirements,
                    "estimate_minutes": q.estimate_minutes,
                }
                for q in generated.questions_used
            ],
        }
    except PipelineError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Assessment generation failed") from exc


def _pipeline(request: Request):
    return request.app.state.container.pipeline


def _candidate_response(candidate) -> CandidateResponse:
    return CandidateResponse(**candidate.__dict__)


@router.get("/rankings", response_model=list[RankingResponse])
def get_rankings(
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    return [item.model_dump() for item in _pipeline(request).rankings()]


@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(
    analysis_id: str,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    analysis = _pipeline(request).database.get_analysis(analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return AnalysisResponse(**analysis.__dict__)


@router.get("/candidates", response_model=list[CandidateResponse])
def get_candidates(
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    return [_candidate_response(item) for item in _pipeline(request).database.list_candidates()]


@router.get("/candidates/{candidate_id}", response_model=CandidateResponse)
def get_candidate(
    candidate_id: str,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        return _candidate_response(_pipeline(request).candidate(candidate_id))
    except PipelineError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/candidates/{candidate_id}/shortlist", response_model=ShortlistResponse)
def shortlist_candidate(
    candidate_id: str,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        candidate, changed = _pipeline(request).shortlist(candidate_id)
        return ShortlistResponse(candidate=_candidate_response(candidate), changed=changed)
    except PipelineError as exc:
        code = 404 if "not found" in str(exc) else 409
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.post("/candidates/{candidate_id}/assessment", response_model=AssessmentResponse)
def create_assessment(
    candidate_id: str,
    payload: AssessmentCreateRequest,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        _, assessment, invite, invite_url = _pipeline(request).create_assessment(
            candidate_id, payload.question_text, payload.language
        )
        assessment_id = assessment.id if hasattr(assessment, "id") else assessment
        invite_id = invite.id if hasattr(invite, "id") else invite.invite_id
        return AssessmentResponse(
            candidate_id=candidate_id,
            assessment_id=assessment_id,
            invite_id=invite_id,
            token=invite.token,
            status=invite.status,
            invite_url=invite_url,
        )
    except PipelineError as exc:
        code = 404 if "not found" in str(exc) else 409
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Assessment service unavailable: {exc}") from exc


@router.post("/candidates/{candidate_id}/assessment/send")
def send_generated_assessment(
    candidate_id: str,
    payload: dict,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        job_description = payload if isinstance(payload, dict) else {}
        if not isinstance(job_description, dict):
            job_description = {}
        generated = _pipeline(request).generate_assessment(candidate_id, job_description)
        candidate, assessment_id_raw, link, invite_url, sent, link_obj, *_ = _pipeline(request).create_generated_assessment(
            candidate_id, generated
        )
        assessment_id = assessment_id_raw if isinstance(assessment_id_raw, int) else getattr(assessment_id_raw, "id", 0)
        def _link_attr(link, names):
            current = link
            for name in names:
                try:
                    current = getattr(current, name)
                except Exception:
                    return None
            return current

        payload = {
            "candidate_id": candidate_id,
            "assessment_id": assessment_id,
            "invite_id": _link_attr(link, ["id"]) or _link_attr(link, ["invite_id"]),
            "token": _link_attr(link, ["token"]) or _link_attr(link, ["invite", "token"]),
            "status": _link_attr(link, ["status"]) or _link_attr(link, ["invite", "status"]),
            "invite_url": invite_url,
            "assessment": {
                "title": generated.definition.title,
                "description": generated.definition.description,
                "duration_minutes": generated.definition.duration_minutes,
                "questions": [
                    {
                        "question_text": q.question_text,
                        "language": q.language,
                        "difficulty": q.difficulty,
                        "type": q.type,
                        "skills": q.skills,
                        "source_requirements": q.source_requirements,
                        "estimate_minutes": q.estimate_minutes,
                    }
                    for q in generated.questions_used
                ],
            },
            "email_sent": getattr(sent, "sent", bool(sent)) if sent is not None else False,
            "email": _email_description(sent) if hasattr(sent, "recipient") else None,
            "stage": candidate.current_stage,
        }
        return payload
    except PipelineError as exc:
        code = 404 if "not found" in str(exc) else 409
        raise HTTPException(status_code=code, detail=str(exc)) from exc
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"Assessment send failed: {exc}") from exc


@router.get("/candidates/{candidate_id}/assessment/status")
def assessment_status(
    candidate_id: str,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        return _pipeline(request).assessment_status(candidate_id).model_dump(mode="json")
    except PipelineError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Assessment service unavailable") from exc


@router.get("/candidates/{candidate_id}/assessment/result")
def assessment_result(
    candidate_id: str,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        return _pipeline(request).assessment_result(candidate_id).model_dump(mode="json")
    except PipelineError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Assessment service unavailable") from exc


@router.get("/candidates/{candidate_id}/evidence/comparison")
def evidence_comparison(
    candidate_id: str,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        return _pipeline(request).evidence_comparison(candidate_id).model_dump(mode="json")
    except PipelineError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Assessment evidence unavailable") from exc


@router.post("/candidates/{candidate_id}/hr-decision", response_model=HRDecisionResponse)
def hr_decision(
    candidate_id: str,
    payload: HRDecisionRequest,
    request: Request,
    _: RecruiterIdentity = Depends(get_current_recruiter),
):
    try:
        updated, sent_email = _pipeline(request).hr_decision(
            candidate_id, payload.decision, payload.reason
        )
        response = _candidate_response(updated)
        response_dict = response.model_dump()
        response_dict["round3_email"] = _email_description(sent_email) if sent_email is not None else None
        return response_dict
    except PipelineError as exc:
        code = 404 if "not found" in str(exc) else 409
        raise HTTPException(status_code=code, detail=str(exc)) from exc
