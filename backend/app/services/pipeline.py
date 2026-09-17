"""Nexora-owned pipeline transitions and mywork orchestration."""

from dataclasses import asdict
from datetime import datetime, timezone

from mywork.evidence.builder.candidate import build_candidate_evidence
from mywork.recruiter_ai.agent.orchestrator import RecruiterAIOrchestrator
from mywork.recruiter_ai.schemas.requests import ChatRequest as NexaChatRequest
from mywork.recruiter_ai.tools.service import NexaToolService

from ..db import Database
from ..models import AssessmentLink, CandidateState, HRDecision
from ..providers.fixture import SQLiteNexoraProvider
from .codeassess import CodeAssessIntegration
from .email import EmailMessage, EmailService
from .oa_generator import GeneratedAssessment, generate_assessment


class PipelineError(Exception):
    pass


class PipelineService:
    def __init__(
        self,
        database: Database,
        provider: SQLiteNexoraProvider,
        codeassess: CodeAssessIntegration,
        email: EmailService,
        assessment_title: str,
        interviewer_id: int,
    ) -> None:
        self.database = database
        self.provider = provider
        self.codeassess = codeassess
        self.email = email
        self.assessment_title = assessment_title
        self.interviewer_id = interviewer_id
        self.tools = NexaToolService(provider, codeassess.service)
        self.orchestrator = RecruiterAIOrchestrator(provider, self.tools)
        # Duplicate-request guards so recruiters can safely retry actions.
        self._pending_assessments: set[str] = set()
        self._sent_round3_emails: set[str] = set()

    def candidate(self, candidate_id: str) -> CandidateState:
        candidate = self.database.get_candidate(candidate_id)
        if candidate is None:
            raise PipelineError(f"Candidate {candidate_id} not found")
        return candidate

    def rankings(self):
        return self.tools.get_rankings().data

    def shortlist(self, candidate_id: str) -> tuple[CandidateState, bool]:
        candidate = self.candidate(candidate_id)
        if candidate.current_stage == "SCREENING":
            updated = self.database.update_stage(candidate_id, "SHORTLISTED")
            return updated, True
        if candidate.current_stage in {
            "SHORTLISTED",
            "ASSESSMENT_PENDING",
            "ASSESSMENT_SENT",
            "ASSESSMENT_STARTED",
            "ASSESSMENT_SUBMITTED",
            "ASSESSMENT_EVALUATED",
            "HR_REVIEW",
            "HR_SELECTED",
        }:
            return candidate, False
        raise PipelineError(f"Cannot shortlist candidate in {candidate.current_stage}")

    def create_assessment(self, candidate_id: str, question_text: str, language: str):
        candidate = self.candidate(candidate_id)

        # Idempotency: if valid invite already exists, return existing link without duplicate creation
        existing_link = self.database.get_assessment_link(candidate_id)
        if existing_link is not None and candidate.current_stage in {
            "SHORTLISTED",
            "ASSESSMENT_PENDING",
            "ASSESSMENT_SENT",
            "ASSESSMENT_STARTED",
            "ASSESSMENT_SUBMITTED",
            "ASSESSMENT_EVALUATED",
            "HR_REVIEW",
            "HR_SELECTED",
        }:
            return candidate, existing_link.assessment_id, existing_link, existing_link.invite_url

        if candidate.current_stage not in {"SHORTLISTED", "ASSESSMENT_PENDING"}:
            raise PipelineError(
                f"Candidate must be shortlisted before assessment creation; current stage is {candidate.current_stage}"
            )

        previous_stage = candidate.current_stage
        self.database.update_stage(candidate_id, "ASSESSMENT_PENDING")
        try:
            assessment, invite, invite_url = self.codeassess.create_candidate_assessment(
                candidate_id=candidate.candidate_id,
                candidate_name=candidate.name,
                candidate_email=candidate.email,
                interviewer_id=self.interviewer_id,
                title=self.assessment_title,
                question_text=question_text,
                language=language,
            )
            now = datetime.now(timezone.utc).isoformat()
            link = AssessmentLink(
                candidate_id=candidate_id,
                assessment_id=assessment.id,
                invite_id=invite.id,
                token=invite.token,
                status=invite.status,
                invite_url=invite_url,
                profile_id=candidate.candidate_id,
                created_at=now,
                updated_at=now,
            )
            self.database.save_assessment_link(link)
            self.email.send_assessment_invitation(
                recipient=candidate.email,
                candidate_name=candidate.name,
                job_title=self.assessment_title,
                assessment_url=invite_url,
            )
            updated = self.database.update_stage(candidate_id, "ASSESSMENT_SENT")
            return updated, assessment, invite, invite_url
        except Exception as exc:
            # Revert stage safely to avoid partial/corrupt mappings
            self.database.update_stage(candidate_id, previous_stage)
            raise PipelineError(f"Assessment creation failed: {exc}") from exc

    def generate_assessment(self, candidate_id: str, job_description: dict) -> GeneratedAssessment:
        """Generate a personalized assessment from the JD and candidate resume.

        This is intentionally separate from assessment *creation* so the recruiter UI
        can show generated questions before anything is sent to CodeAssess.
        """
        candidate = self.candidate(candidate_id)
        if candidate.current_stage != "SHORTLISTED" and self.database.get_assessment_link(candidate_id) is None:
            raise PipelineError(
                f"Candidate must be shortlisted before assessment generation; current stage is {candidate.current_stage}"
            )
        provider_candidate = self.provider.get_candidate(candidate_id)
        if provider_candidate is None:
            raise PipelineError(f"Candidate data unavailable for {candidate_id}")

        jd_to_use = dict(job_description or {})
        analysis = self.database.get_analysis(candidate.analysis_id)
        if analysis and not jd_to_use.get("title"):
            jd_to_use["title"] = analysis.job_title
        ranking = self.provider.get_candidate_ranking(candidate_id)
        if ranking:
            if not jd_to_use.get("required_technologies"):
                jd_to_use["required_technologies"] = list(ranking.matched_skills + ranking.missing_skills)
            if not jd_to_use.get("description"):
                jd_to_use["description"] = f"Technical role for {jd_to_use.get('title', 'Software Engineer')}."

        return generate_assessment(jd_to_use, provider_candidate, use_llm=True)

    def create_generated_assessment(
        self, candidate_id: str, generated: GeneratedAssessment
    ) -> tuple:
        """Persist a previously generated assessment into CodeAssess and email it.

        This pathway is used after the recruiter approves the generated questions.
        It is idempotent: if a valid invite already exists for the candidate, it is
        returned rather than creating a duplicate CodeAssess assessment.
        """
        candidate = self.candidate(candidate_id)

        existing_link = self.database.get_assessment_link(candidate_id)
        if existing_link is not None and candidate.current_stage in {
            "SHORTLISTED",
            "ASSESSMENT_PENDING",
            "ASSESSMENT_SENT",
            "ASSESSMENT_STARTED",
            "ASSESSMENT_SUBMITTED",
            "ASSESSMENT_EVALUATED",
            "HR_REVIEW",
            "HR_SELECTED",
            "ROUND_3",
        }:
            return (
                candidate,
                existing_link.assessment_id,
                existing_link,
                existing_link.invite_url,
                False,
                existing_link,
                existing_link.token,
                existing_link.status,
            )

        if candidate.current_stage not in {"SHORTLISTED", "ASSESSMENT_PENDING"}:
            raise PipelineError(
                f"Candidate must be shortlisted before assessment creation; current stage is {candidate.current_stage}"
            )

        # Do not allow a candidate into the pending state if another pending
        # assessment is still being processed for them.
        if candidate_id in self._pending_assessments:
            raise PipelineError("An assessment is already being processed for this candidate")

        self._pending_assessments.add(candidate_id)
        previous_stage = candidate.current_stage
        try:
            self.database.update_stage(candidate_id, "ASSESSMENT_PENDING")
            assessment, invite, invite_url = self.codeassess.create_candidate_assessment_from_definition(
                candidate_id=candidate.candidate_id,
                candidate_name=candidate.name,
                candidate_email=candidate.email,
                interviewer_id=self.interviewer_id,
                title=generated.definition.title,
                questions=[
                    {
                        "question_text": q.question_text,
                        "language": q.language,
                        "difficulty": q.difficulty,
                        "type": q.type,
                        "skills": list(q.skills),
                        "source_requirements": list(q.source_requirements),
                    }
                    for q in generated.definition.questions
                ],
            )
            now = datetime.now(timezone.utc).isoformat()
            link = AssessmentLink(
                candidate_id=candidate_id,
                assessment_id=assessment.id,
                invite_id=invite.id,
                token=invite.token,
                status=invite.status,
                invite_url=invite_url,
                profile_id=candidate.candidate_id,
                created_at=now,
                updated_at=now,
            )
            self.database.save_assessment_link(link)
            sent = self.email.send_assessment_invitation(
                recipient=candidate.email,
                candidate_name=candidate.name,
                job_title=generated.job_title,
                assessment_url=self.codeassess.build_invite_url_manual(invite, self.codeassess.service.frontend_url),
            )
            updated = self.database.update_stage(candidate_id, "ASSESSMENT_SENT")
            return (
                updated,
                assessment,
                invite,
                invite_url,
                sent,
                link,
                link.token,
                link.status,
            )
        except Exception as exc:
            self.database.update_stage(candidate_id, previous_stage)
            raise PipelineError(f"Assessment creation failed: {exc}") from exc
        finally:
            self._pending_assessments.discard(candidate_id)

    def assessment_status(self, candidate_id: str):
        self.candidate(candidate_id)
        result = self.codeassess.service.get_candidate_assessment_status(candidate_id)
        stage = _stage_for_assessment_status(result.status)
        if stage and self.database.get_candidate(candidate_id).current_stage not in {
            "HR_REVIEW",
            "HR_SELECTED",
            "REJECTED",
        }:
            self.database.update_stage(candidate_id, stage)

        # Keep assessment_link status synchronized
        link = self.database.get_assessment_link(candidate_id)
        if link is not None:
            self.database.save_assessment_link(
                AssessmentLink(
                    candidate_id=link.candidate_id,
                    assessment_id=link.assessment_id,
                    invite_id=link.invite_id,
                    token=link.token,
                    status=result.status,
                    invite_url=link.invite_url,
                    profile_id=link.profile_id or candidate_id,
                    created_at=link.created_at,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
            )
        return result

    def assessment_result(self, candidate_id: str):
        self.candidate(candidate_id)
        result = self.codeassess.get_result(candidate_id)
        if result.status == "no_assessment":
            raise PipelineError(f"No assessment found for candidate {candidate_id}")
        if result.status == "evaluation_available":
            cand = self.database.get_candidate(candidate_id)
            if cand and cand.current_stage not in {"HR_REVIEW", "HR_SELECTED", "REJECTED"}:
                self.database.update_stage(candidate_id, "ASSESSMENT_EVALUATED")
        return result

    def evidence_comparison(self, candidate_id: str):
        candidate = self.candidate(candidate_id)
        result = self.codeassess.get_result(candidate_id)
        evidence = build_candidate_evidence(
            candidate_id=candidate.candidate_id,
            candidate_name=candidate.name,
            resume=self.provider.get_candidate_resume_data(candidate_id),
            ranking=self.provider.get_candidate_ranking(candidate_id),
            assessment=result,
            document_id=candidate.resume_ref,
        )
        if candidate.current_stage == "ASSESSMENT_EVALUATED":
            self.database.update_stage(candidate_id, "HR_REVIEW")
        return evidence

    def hr_decision(self, candidate_id: str, decision: str, reason: str | None):
        candidate = self.candidate(candidate_id)
        normalized = decision.upper()
        if normalized not in {"HR_SELECTED", "REJECTED"}:
            raise PipelineError("decision must be HR_SELECTED or REJECTED")

        if candidate.current_stage == normalized or (candidate.current_stage == "ROUND_3" and normalized == "HR_SELECTED"):
            return candidate, None

        if candidate.current_stage == "ASSESSMENT_EVALUATED":
            candidate = self.database.update_stage(candidate_id, "HR_REVIEW")
        elif candidate.current_stage != "HR_REVIEW":
            raise PipelineError("Candidate must be evaluated before HR decision")

        now = datetime.now(timezone.utc).isoformat()
        self.database.save_hr_decision(
            HRDecision(
                candidate_id=candidate_id,
                decision=normalized,
                reason=reason,
                decided_at=now,
            )
        )
        if normalized == "HR_SELECTED":
            updated = self.database.update_stage(candidate_id, "ROUND_3")
            if candidate_id not in self._sent_round3_emails:
                sent = self.email.send_round3_invitation(
                    recipient=candidate.email,
                    candidate_name=candidate.name,
                    job_title=self.assessment_title,
                    interview_details=None,
                )
                self._sent_round3_emails.add(candidate_id)
                return updated, sent
            return updated, None

        updated = self.database.update_stage(candidate_id, "REJECTED")
        return updated, None

    # Defensive compatibility alias; create_generated_assessment is the canonical entry point.

    def chat(self, message: str, candidate_ids: list[str], conversation_id: str | None):
        return self.orchestrator.handle(
            NexaChatRequest(
                message=message,
                candidate_ids=candidate_ids,
                conversation_id=conversation_id,
            )
        )


def _stage_for_assessment_status(status: str) -> str | None:
    return {
        "invited": "ASSESSMENT_SENT",
        "in_progress": "ASSESSMENT_STARTED",
        "pending_evaluation": "ASSESSMENT_SUBMITTED",
        "evaluation_available": "ASSESSMENT_EVALUATED",
    }.get(status)


def _email_description(email: EmailMessage) -> dict:
    return {
        "recipient": email.recipient,
        "subject": email.subject,
        "body": email.body,
        "assessment_url": email.assessment_url,
        "message_type": email.message_type,
        "sent": email.sent,
    }
