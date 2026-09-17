"""Golden-path and failure integration tests for the downstream pipeline."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import AssessmentLink
from mywork.evidence.builder.candidate import build_candidate_evidence
from mywork.evidence.schemas.ranking import RankingEvidence


class GoldenPathDownstreamTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "golden.db")
        self.settings = Settings(
            database_path=self.db_path,
            auth_mode="development",
            codeassess_mode="mock",
            codeassess_api_url=None,
            codeassess_frontend_url="https://codeassess.nexora.internal",
            assessment_title="Senior Distributed Systems Assessment",
            interviewer_id=42,
        )
        self.app = create_app(self.settings)
        self.client = TestClient(self.app)
        self.container = self.app.state.container

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def headers(self) -> dict[str, str]:
        return {"X-Nexora-Dev-User": "test-recruiter"}

    def test_golden_path_complete_lifecycle(self) -> None:
        """Test the exact 17-step lifecycle for a single candidate."""
        cand_id = "cand_golden_001"
        analysis_id = "analysis_golden_2026"

        # 1. Candidate starts in SCREENING with ranking and resume data
        self.container.database.seed_analysis(analysis_id, "Senior Distributed Systems Engineer", "2026-09-13T00:00:00Z")
        self.container.database.create_candidate(
            candidate_id=cand_id,
            analysis_id=analysis_id,
            name="Aisha Khan",
            email="aisha.khan@example.com",
            resume_ref="resume_aisha_pdf",
            stage="SCREENING",
        )
        self.container.database.save_candidate_resume(
            cand_id,
            {
                "skills": ["Python", "FastAPI", "PostgreSQL"],
                "experience": [{"claim": "Backend systems engineering", "value": "4 years"}],
                "projects": [{"title": "High Throughput API", "description": "Built event bus"}],
            },
        )
        ranking = RankingEvidence(
            candidate_id=cand_id,
            candidate_name="Aisha Khan",
            rank=1,
            final_score=95.0,
            semantic_score=94.0,
            keyword_score=96.0,
            matched_skills=["Python", "FastAPI", "PostgreSQL"],
            missing_skills=["Kubernetes"],
        )
        self.container.database.save_ranking(ranking)

        # Verify candidate is in SCREENING
        c_res = self.client.get(f"/api/candidates/{cand_id}", headers=self.headers())
        self.assertEqual(c_res.status_code, 200)
        self.assertEqual(c_res.json()["current_stage"], "SCREENING")

        # 2. Shortlist candidate
        sl_res = self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers())
        self.assertEqual(sl_res.status_code, 200)
        self.assertTrue(sl_res.json()["changed"])

        # 3. Verify SHORTLISTED
        self.assertEqual(sl_res.json()["candidate"]["current_stage"], "SHORTLISTED")
        c_res = self.client.get(f"/api/candidates/{cand_id}", headers=self.headers())
        self.assertEqual(c_res.json()["current_stage"], "SHORTLISTED")

        # 4. Create assessment
        create_res = self.client.post(
            f"/api/candidates/{cand_id}/assessment",
            headers=self.headers(),
            json={"question_text": "Implement an in-memory priority message queue", "language": "python"},
        )
        self.assertEqual(create_res.status_code, 200)
        create_payload = create_res.json()

        # 5. Verify CodeAssess profile_id == Nexora candidate_id
        invite = self.container.codeassess.client.list_invites()[-1]
        self.assertEqual(invite.profile_id, cand_id)

        # 6. Verify invite created
        self.assertEqual(create_payload["candidate_id"], cand_id)
        self.assertEqual(create_payload["invite_id"], invite.id)
        self.assertEqual(create_payload["status"], "pending")
        self.assertTrue(create_payload["token"])

        # 7. Verify invite is persisted in Nexora SQLite DB
        link = self.container.database.get_assessment_link(cand_id)
        self.assertIsNotNone(link)
        self.assertEqual(link.candidate_id, cand_id)
        self.assertEqual(link.profile_id, cand_id)
        self.assertEqual(link.invite_id, invite.id)
        self.assertEqual(link.token, invite.token)
        self.assertIsNotNone(link.created_at)

        # 8. Verify email service receives the exact invite URL
        sent_email = self.container.email.messages[-1]
        self.assertEqual(sent_email.recipient, "aisha.khan@example.com")
        self.assertEqual(sent_email.assessment_url, link.invite_url)
        self.assertIn(link.token, sent_email.body)
        self.assertIn("Aisha Khan", sent_email.body)

        # 9. Simulate assessment started and submitted
        mock = self.container.codeassess.mock_client
        self.assertIsNotNone(mock)
        mock.seed_submission(cand_id, code="def queue(): pass")

        # Check status endpoint derives status and updates stage to ASSESSMENT_SUBMITTED
        status_res = self.client.get(f"/api/candidates/{cand_id}/assessment/status", headers=self.headers())
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["status"], "pending_evaluation")

        c_stage = self.client.get(f"/api/candidates/{cand_id}", headers=self.headers()).json()["current_stage"]
        self.assertEqual(c_stage, "ASSESSMENT_SUBMITTED")

        # 10. Simulate assessment submitted (already present in submissions list)
        self.assertEqual(len(mock.submissions), 1)

        # 11. Simulate AI evaluation
        submission_id = mock.submissions[-1].id
        ai_eval = mock.evaluate_submission(submission_id)
        self.assertIsNotNone(ai_eval)
        self.assertEqual(ai_eval.overall_score, 88)

        # 12. Retrieve assessment result
        result_res = self.client.get(f"/api/candidates/{cand_id}/assessment/result", headers=self.headers())
        self.assertEqual(result_res.status_code, 200)
        result_data = result_res.json()
        self.assertEqual(result_data["profile_id"], cand_id)
        self.assertEqual(result_data["status"], "evaluation_available")
        eval_payload = result_data["submissions"][0]["evaluation"]
        self.assertEqual(eval_payload["correctness_score"], 90)
        self.assertEqual(eval_payload["efficiency_score"], 85)
        self.assertEqual(eval_payload["code_quality_score"], 88)
        self.assertEqual(eval_payload["overall_score"], 88)
        self.assertTrue(eval_payload["is_correct"])
        self.assertEqual(eval_payload["time_complexity"], "O(n)")
        self.assertEqual(eval_payload["space_complexity"], "O(1)")

        c_stage = self.client.get(f"/api/candidates/{cand_id}", headers=self.headers()).json()["current_stage"]
        self.assertEqual(c_stage, "ASSESSMENT_EVALUATED")

        # 13. Build evidence dossier
        evidence_res = self.client.get(f"/api/candidates/{cand_id}/evidence/comparison", headers=self.headers())
        self.assertEqual(evidence_res.status_code, 200)
        dossier = evidence_res.json()

        # 14. Verify resume/ranking + assessment evidence are associated with SAME candidate_id
        self.assertEqual(dossier["candidate_id"], cand_id)
        self.assertEqual(dossier["candidate_name"], "Aisha Khan")
        self.assertEqual(dossier["ranking_evidence"]["candidate_id"], cand_id)
        self.assertGreaterEqual(len(dossier["resume_evidence"]), 1)
        for item in dossier["resume_evidence"]:
            self.assertEqual(item["provenance"]["candidate_id"], cand_id)
        self.assertGreaterEqual(len(dossier["assessment_evidence"]), 1)
        for item in dossier["assessment_evidence"]:
            self.assertEqual(item["provenance"]["candidate_id"], cand_id)

        # 15. Verify stage becomes HR_REVIEW
        c_stage = self.client.get(f"/api/candidates/{cand_id}", headers=self.headers()).json()["current_stage"]
        self.assertEqual(c_stage, "HR_REVIEW")

        # 16. Submit HR_SELECTED
        hr_res = self.client.post(
            f"/api/candidates/{cand_id}/hr-decision",
            headers=self.headers(),
            json={"decision": "HR_SELECTED", "reason": "Exceptional coding evaluation and strong backend alignment."},
        )
        self.assertEqual(hr_res.status_code, 200)
        self.assertEqual(hr_res.json()["current_stage"], "ROUND_3")

        # 17. Verify persisted HR decision
        decision = self.container.database.get_hr_decision(cand_id)
        self.assertIsNotNone(decision)
        self.assertEqual(decision.candidate_id, cand_id)
        self.assertEqual(decision.decision, "HR_SELECTED")
        self.assertIn("Exceptional coding evaluation", decision.reason)
        self.assertIsNotNone(decision.decided_at)

    def test_failures_and_edge_cases(self) -> None:
        """Test failure modes: unknown candidates, invalid transitions, idempotency, mismatches."""
        # 1. Unknown candidate
        missing_id = "cand_missing_999"
        self.assertEqual(self.client.post(f"/api/candidates/{missing_id}/shortlist", headers=self.headers()).status_code, 404)
        self.assertEqual(
            self.client.post(
                f"/api/candidates/{missing_id}/assessment",
                headers=self.headers(),
                json={"question_text": "Code", "language": "python"},
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get(f"/api/candidates/{missing_id}/assessment/status", headers=self.headers()).status_code, 404)
        self.assertEqual(self.client.get(f"/api/candidates/{missing_id}/assessment/result", headers=self.headers()).status_code, 404)
        self.assertEqual(self.client.get(f"/api/candidates/{missing_id}/evidence/comparison", headers=self.headers()).status_code, 404)
        self.assertEqual(
            self.client.post(f"/api/candidates/{missing_id}/hr-decision", headers=self.headers(), json={"decision": "HR_SELECTED"}).status_code,
            404,
        )

        # 2. Invalid stage transitions
        cand_id = "cand_test_002"
        self.container.database.seed_analysis("analysis_test", "Role", "2026-09-13T00:00:00Z")
        self.container.database.create_candidate(
            candidate_id=cand_id,
            analysis_id="analysis_test",
            name="Test User",
            email="test@example.com",
            stage="SCREENING",
        )

        # Candidate in SCREENING cannot create assessment (must be SHORTLISTED)
        res_screen_assess = self.client.post(
            f"/api/candidates/{cand_id}/assessment",
            headers=self.headers(),
            json={"question_text": "Code", "language": "python"},
        )
        self.assertEqual(res_screen_assess.status_code, 409)
        self.assertIn("must be shortlisted", res_screen_assess.json()["detail"])

        # Candidate in SCREENING cannot jump straight to HR decision
        res_screen_hr = self.client.post(
            f"/api/candidates/{cand_id}/hr-decision",
            headers=self.headers(),
            json={"decision": "HR_SELECTED"},
        )
        self.assertEqual(res_screen_hr.status_code, 409)

        # 3. CodeAssess failure safety
        # Shortlist candidate first
        self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers())
        self.assertEqual(self.container.database.get_candidate(cand_id).current_stage, "SHORTLISTED")

        # Inject exception in CodeAssess client
        original_add_question = self.container.codeassess.client.add_question
        self.container.codeassess.client.add_question = MagicMock(side_effect=RuntimeError("CodeAssess network failure"))

        res_fail = self.client.post(
            f"/api/candidates/{cand_id}/assessment",
            headers=self.headers(),
            json={"question_text": "Code", "language": "python"},
        )
        self.assertEqual(res_fail.status_code, 409)
        # Stage must be reverted back to SHORTLISTED (never stuck in ASSESSMENT_PENDING or marked ASSESSMENT_SENT)
        self.assertEqual(self.container.database.get_candidate(cand_id).current_stage, "SHORTLISTED")
        self.assertIsNone(self.container.database.get_assessment_link(cand_id))

        # Restore method
        self.container.codeassess.client.add_question = original_add_question

        # 4. Duplicate assessment creation idempotency
        # Create valid assessment
        res_first = self.client.post(
            f"/api/candidates/{cand_id}/assessment",
            headers=self.headers(),
            json={"question_text": "Code", "language": "python"},
        )
        self.assertEqual(res_first.status_code, 200)
        first_token = res_first.json()["token"]
        initial_invites_count = len(self.container.codeassess.client.list_invites())

        # Calling again should return existing invite idempotently without creating a new one in CodeAssess
        res_dup = self.client.post(
            f"/api/candidates/{cand_id}/assessment",
            headers=self.headers(),
            json={"question_text": "Code", "language": "python"},
        )
        self.assertEqual(res_dup.status_code, 200)
        self.assertEqual(res_dup.json()["token"], first_token)
        self.assertEqual(len(self.container.codeassess.client.list_invites()), initial_invites_count)

        # 5. Missing evaluation prevents HR decision
        # Candidate is currently in ASSESSMENT_SENT (not evaluated)
        hr_premature = self.client.post(
            f"/api/candidates/{cand_id}/hr-decision",
            headers=self.headers(),
            json={"decision": "HR_SELECTED"},
        )
        self.assertEqual(hr_premature.status_code, 409)
        self.assertIn("must be evaluated", hr_premature.json()["detail"])

        # 6. Cross-candidate assessment mismatch rejection
        from mywork.coding_assessment.schemas.responses import AssessmentResult
        mismatched_result = AssessmentResult(profile_id="other_candidate_id", status="evaluation_available")
        with self.assertRaises(ValueError) as ctx:
            build_candidate_evidence(
                candidate_id=cand_id,
                candidate_name="Test User",
                assessment=mismatched_result,
            )
        self.assertIn("another candidate", str(ctx.exception))

        # 7. Shortlist on REJECTED candidate fails
        cand_rejected = "cand_rejected_003"
        self.container.database.create_candidate(
            candidate_id=cand_rejected,
            analysis_id="analysis_test",
            name="Rejected User",
            email="rej@example.com",
            stage="REJECTED",
        )
        res_rej_sl = self.client.post(f"/api/candidates/{cand_rejected}/shortlist", headers=self.headers())
        self.assertEqual(res_rej_sl.status_code, 409)


if __name__ == "__main__":
    unittest.main()
