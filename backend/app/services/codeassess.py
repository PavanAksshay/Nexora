"""CodeAssess composition boundary for Nexora."""

from dataclasses import dataclass
from typing import Any

from mywork.coding_assessment.client.codeassess import CodeAssessApiClient
from mywork.coding_assessment.client.http import CodeAssessHttpClient
from mywork.coding_assessment.client.interfaces import CodeAssessClient
from mywork.coding_assessment.schemas.requests import (
    AssessmentCreateRequest,
    QuestionCreateRequest,
)
from mywork.coding_assessment.schemas.responses import (
    AIEvaluation,
    AssessmentResponse,
    AssessmentResult,
    InviteResponse,
    QuestionResponse,
    SubmissionWithEvaluation,
)
from mywork.coding_assessment.services.assessment_service import AssessmentService


class MockCodeAssessClient:
    """Explicit local adapter double; never selected in external mode."""

    def __init__(self) -> None:
        self.tests: dict[int, AssessmentResponse] = {}
        self.questions: dict[int, list[QuestionResponse]] = {}
        self.invites: list[InviteResponse] = []
        self.submissions: list[SubmissionWithEvaluation] = []
        self.next_test_id = 100
        self.next_invite_id = 500
        self.next_submission_id = 900

    def create_assessment(self, request: AssessmentCreateRequest) -> AssessmentResponse:
        response = AssessmentResponse(
            id=self.next_test_id,
            title=request.title,
            description=request.description,
            interviewer_id=request.interviewer_id,
        )
        self.next_test_id += 1
        self.tests[response.id] = response
        self.questions[response.id] = []
        return response

    def get_assessment(self, assessment_id: int) -> AssessmentResponse:
        return self.tests[assessment_id]

    def add_question(self, assessment_id: int, request: QuestionCreateRequest) -> QuestionResponse:
        question = QuestionResponse(
            id=len(self.questions[assessment_id]) + 1,
            test_id=assessment_id,
            question_text=request.question_text,
            language=request.language,
        )
        self.questions[assessment_id].append(question)
        return question

    def get_questions(self, assessment_id: int) -> list[QuestionResponse]:
        return self.questions[assessment_id]

    def create_invite(self, assessment_id: int, request: Any) -> InviteResponse:
        invite = InviteResponse(
            id=self.next_invite_id,
            test_id=assessment_id,
            candidate_name=request.candidate_name,
            candidate_email=request.candidate_email,
            profile_id=request.profile_id,
            scheduled_at=request.scheduled_at,
            token=f"mock-token-{self.next_invite_id}",
            status="pending",
        )
        self.next_invite_id += 1
        self.invites.append(invite)
        return invite

    def resolve_invite(self, token: str) -> InviteResponse:
        return next(item for item in self.invites if item.token == token)

    def list_invites(self) -> list[InviteResponse]:
        return list(self.invites)

    def get_submissions(self) -> list[SubmissionWithEvaluation]:
        return list(self.submissions)

    def get_submission_report(self, submission_id: int) -> str:
        return f"<html><body>Mock report {submission_id}</body></html>"

    def evaluate_submission(self, submission_id: int) -> AIEvaluation:
        submission = next(item for item in self.submissions if item.id == submission_id)
        if submission.evaluation is None:
            submission.evaluation = AIEvaluation(
                id=submission_id + 1000,
                submission_id=submission_id,
                correctness_score=90,
                efficiency_score=85,
                code_quality_score=88,
                overall_score=88,
                is_correct=True,
                time_complexity="O(n)",
                space_complexity="O(1)",
                strengths=["Mock evaluation for local adapter tests"],
                detected_issues=[],
                improvements=[],
                explanation="Mock evaluation; no external CodeAssess call was made.",
            )
        return submission.evaluation

    def seed_submission(
        self, candidate_id: str, code: str = "def solve(): return 1", question_index: int = 0
    ) -> None:
        invite = next(item for item in self.invites if item.profile_id == candidate_id)
        questions = self.questions.get(invite.test_id, [])
        if not questions:
            raise RuntimeError(f"No questions found for assessment {invite.test_id}")
        idx = min(max(question_index, 0), len(questions) - 1)
        question = questions[idx]
        self.submissions.append(
            SubmissionWithEvaluation(
                id=self.next_submission_id,
                invite_id=invite.id,
                question_id=question.id,
                code=code,
                language=question.language,
                status="submitted",
                stdout="1",
                stderr=None,
                execution_time_ms=4,
                evaluation=None,
            )
        )
        self.next_submission_id += 1

    def seed_submissions_for_candidate(
        self, candidate_id: str, codes: list[str], question_index: int = 0
    ) -> list[int]:
        submission_ids: list[int] = []
        for code in codes:
            self.seed_submission(candidate_id, code, question_index)
            submission_ids.append(self.submissions[-1].id)
        return submission_ids


@dataclass
class CodeAssessIntegration:
    client: CodeAssessClient
    service: AssessmentService
    mock_client: MockCodeAssessClient | None = None

    def create_candidate_assessment(
        self,
        candidate_id: str,
        candidate_name: str,
        candidate_email: str,
        interviewer_id: int,
        title: str,
        question_text: str,
        language: str,
    ) -> tuple[AssessmentResponse, InviteResponse, str | None]:
        """Legacy single-question creation kept for backward compatibility."""
        return self.create_candidate_assessment_from_definition(
            candidate_id=candidate_id,
            candidate_name=candidate_name,
            candidate_email=candidate_email,
            interviewer_id=interviewer_id,
            title=title,
            questions=[
                {
                    "question_text": question_text,
                    "language": language,
                    "difficulty": "medium",
                    "type": "coding",
                    "skills": [],
                    "source_requirements": [],
                }
            ],
        )

    def create_candidate_assessment_from_definition(
        self,
        candidate_id: str,
        candidate_name: str,
        candidate_email: str,
        interviewer_id: int,
        title: str,
        questions: list[dict[str, object]],
    ) -> tuple[AssessmentResponse, InviteResponse, str | None]:
        """Create a multi-question assessment from a structured question list.

        Each question is persisted in CodeAssess before the candidate invite is
        created so that the assessment is not left incomplete.
        """
        assessment = self.service.create_assessment(
            AssessmentCreateRequest(title=title, interviewer_id=interviewer_id)
        )
        question_ids: list[int] = []
        for item in questions:
            text = str(item.get("question_text", "")).strip()
            language = str(item.get("language", "python")).strip() or "python"
            if not text:
                raise ValueError("Generated question text must not be empty")
            response = self.client.add_question(
                assessment.id,
                QuestionCreateRequest(question_text=text, language=language),
            )
            question_ids.append(response.id)
        invite = self.service.create_candidate_invite(
            candidate_id=candidate_id,
            profile_id=candidate_id,
            assessment_id=assessment.id,
            candidate_name=candidate_name,
            candidate_email=candidate_email,
        )
        invite_url = self.service.build_invite_url(invite)
        if invite_url is None:
            invite_url = self.build_invite_url_manual(invite, self.service._frontend_url)
        return assessment, invite, invite_url

    def build_invite_url_manual(
        self,
        invite: InviteResponse,
        frontend_url: str | None,
    ) -> str:
        if frontend_url:
            return f"{frontend_url}/candidate/{invite.token}"
        return f"https://localhost/candidate/{invite.token}"


    def get_result(self, candidate_id: str) -> AssessmentResult:
        return self.service.get_candidate_assessment_result(candidate_id)


def build_integration(
    mode: str,
    api_url: str | None,
    frontend_url: str | None,
) -> CodeAssessIntegration:
    if mode == "mock":
        mock = MockCodeAssessClient()
        return CodeAssessIntegration(
            client=mock,
            service=AssessmentService(mock, frontend_url=frontend_url),
            mock_client=mock,
        )
    if not api_url:
        raise RuntimeError("CODING_ASSESSMENT_API_URL is required in external mode")
    http = CodeAssessHttpClient(base_url=api_url)
    client = CodeAssessApiClient(http)
    return CodeAssessIntegration(
        client=client,
        service=AssessmentService(client, frontend_url=frontend_url),
    )
