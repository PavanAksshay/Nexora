"""SQLite persistence models represented as typed records."""

from dataclasses import dataclass


PIPELINE_STAGES = (
    "SCREENING",
    "SHORTLISTED",
    "ASSESSMENT_PENDING",
    "ASSESSMENT_SENT",
    "ASSESSMENT_STARTED",
    "ASSESSMENT_SUBMITTED",
    "ASSESSMENT_EVALUATED",
    "HR_REVIEW",
    "HR_SELECTED",
    "ROUND_3",
    "REJECTED",
)


@dataclass(frozen=True)
class CandidateState:
    candidate_id: str
    name: str
    email: str
    resume_ref: str | None
    current_stage: str
    analysis_id: str


@dataclass(frozen=True)
class AnalysisState:
    analysis_id: str
    job_title: str
    status: str
    created_at: str


@dataclass(frozen=True)
class AssessmentLink:
    candidate_id: str
    assessment_id: int
    invite_id: int
    token: str
    status: str
    invite_url: str | None
    profile_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass(frozen=True)
class HRDecision:
    candidate_id: str
    decision: str
    reason: str | None
    decided_at: str | None = None
