"""Candidate-safe operations over the typed CodeAssess client."""

import os

from ..client.errors import AdapterValidationError, AmbiguousResultError
from ..client.interfaces import CodeAssessClient
from ..mapper.candidate_mapping import CandidateMapping
from ..schemas.requests import AssessmentCreateRequest, InviteCreateRequest
from ..schemas.responses import (
    AssessmentResponse,
    AssessmentResult,
    InviteResponse,
    SubmissionWithEvaluation,
)


class AssessmentService:
    """Hide provider URLs and candidate/profile correlation from Nexa tools."""

    INVITE_ROUTE = "/candidate/test/{token}"

    def __init__(
        self,
        client: CodeAssessClient,
        frontend_url: str | None = None,
    ) -> None:
        self._client = client
        self._frontend_url = (
            frontend_url
            if frontend_url is not None
            else os.getenv("CODING_ASSESSMENT_FRONTEND_URL")
        )

    @property
    def frontend_url(self) -> str | None:
        return self._frontend_url

    def create_assessment(
        self, request: AssessmentCreateRequest
    ) -> AssessmentResponse:
        return self._client.create_assessment(request)

    def create_candidate_invite(
        self,
        candidate_id: str,
        profile_id: str,
        assessment_id: int,
        candidate_name: str,
        candidate_email: str,
        scheduled_at: str | None = None,
    ) -> InviteResponse:
        mapping = self._mapping(candidate_id, profile_id)
        request = InviteCreateRequest(
            candidate_name=candidate_name,
            candidate_email=candidate_email,
            profile_id=mapping.profile_id,
            scheduled_at=scheduled_at,
        )
        return self._client.create_invite(assessment_id, request)

    def get_candidate_assessment_status(self, candidate_id: str) -> AssessmentResult:
        return self._load_candidate_result(candidate_id)

    def get_candidate_assessment_result(self, candidate_id: str) -> AssessmentResult:
        return self._load_candidate_result(candidate_id)

    def build_invite_url(self, invite: InviteResponse) -> str | None:
        """Build the verified candidate route when frontend configuration exists."""

        if not self._frontend_url:
            return None
        return (
            self._frontend_url.rstrip("/")
            + self.INVITE_ROUTE.format(token=invite.token)
        )

    def _load_candidate_result(self, candidate_id: str) -> AssessmentResult:
        mapping = self._mapping(candidate_id, candidate_id)
        invites = [
            invite
            for invite in self._client.list_invites()
            if invite.profile_id == mapping.profile_id
        ]
        if not invites:
            return AssessmentResult(profile_id=mapping.profile_id, status="no_assessment")
        if len(invites) > 1:
            raise AmbiguousResultError(
                f"Multiple CodeAssess invites found for {mapping.profile_id}"
            )

        invite = invites[0]
        assessment = self._client.get_assessment(invite.test_id)
        questions = self._client.get_questions(invite.test_id)
        submissions = [
            submission
            for submission in self._client.get_submissions()
            if submission.invite_id == invite.id
        ]
        status = self._derive_status(invite.status, questions, submissions)
        scores = [
            submission.evaluation.overall_score
            for submission in submissions
            if submission.evaluation is not None
            and submission.evaluation.overall_score is not None
        ]
        overall_score = sum(scores) / len(scores) if scores else None
        return AssessmentResult(
            profile_id=mapping.profile_id,
            invite=invite,
            assessment=assessment,
            questions=questions,
            submissions=submissions,
            status=status,
            overall_score=overall_score,
        )

    @staticmethod
    def _mapping(candidate_id: str, profile_id: str) -> CandidateMapping:
        try:
            return CandidateMapping.create(candidate_id, profile_id)
        except ValueError as exc:
            raise AdapterValidationError(str(exc)) from exc

    @staticmethod
    def _derive_status(
        invite_status: str,
        questions: list[object],
        submissions: list[SubmissionWithEvaluation],
    ) -> str:
        if not submissions:
            return "invited" if invite_status == "pending" else "unknown"

        latest_by_question: dict[int, SubmissionWithEvaluation] = {}
        for submission in submissions:
            current = latest_by_question.get(submission.question_id)
            if current is None or submission.id > current.id:
                latest_by_question[submission.question_id] = submission

        if any(item.evaluation is None for item in latest_by_question.values()):
            return "pending_evaluation"
        if questions and len(latest_by_question) >= len(questions):
            return "evaluation_available"
        return "in_progress"