import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.services.oa_generator import (
    AssessmentDefinition,
    GeneratedAssessment,
    QuestionDefinition,
    generate_assessment,
)
from mywork.recruiter_ai.provider import CandidateRecord


class OaGeneratorTests(unittest.TestCase):
    def test_generate_assessment_is_personalized_and_bounded(self):
        jd = {
            "title": "Backend Engineer",
            "description": "Build REST APIs with FastAPI and PostgreSQL.",
            "responsibilities": [
                "Implement backend services in Python using FastAPI.",
                "Write PostgreSQL queries and migrations.",
                "Containerize services with Docker.",
            ],
            "required_technologies": ["Python", "FastAPI", "PostgreSQL", "Docker"],
            "seniority": "mid",
        }
        candidate = CandidateRecord(
            candidate_id="cand_014",
            candidate_name="Rahul",
            document_id="resume_014",
            resume_data={
                "email": "rahul@example.com",
                "skills": ["Python", "FastAPI", "PostgreSQL"],
                "experience": [{"claim": "Backend development", "value": "3 years"}],
                "projects": [{"title": "Hiring API", "description": "Built APIs"}],
            },
        )
        generated = generate_assessment(jd, candidate, use_llm=False)
        self.assertEqual(generated.job_title, "Backend Engineer")
        self.assertEqual(generated.candidate_id, "cand_014")
        self.assertEqual(generated.candidate_name, "Rahul")
        self.assertEqual(generated.candidate_email, "rahul@example.com")
        self.assertIsInstance(generated.definition, AssessmentDefinition)
        self.assertTrue(2 <= len(generated.definition.questions) <= 5)
        self.assertEqual(generated.definition.duration_minutes, 60)
        self.assertEqual(sum(q.estimate_minutes for q in generated.definition.questions), 60)
        skills = {q.skills[0] for q in generated.definition.questions if q.skills}
        self.assertTrue(bool(skills & {"Python", "FastAPI", "PostgreSQL"}))

    def test_missing_jd_raises(self):
        candidate = CandidateRecord(
            candidate_id="cand_014",
            candidate_name="Rahul",
            document_id="resume_014",
            resume_data={"email": "rahul@example.com", "skills": ["Python"]},
        )
        with self.assertRaises(ValueError):
            generate_assessment({}, candidate, use_llm=False)

    def test_malformed_llm_response_falls_back_to_deterministic(self):
        jd = {
            "title": "Backend Engineer",
            "description": "Build REST APIs with FastAPI and PostgreSQL.",
            "responsibilities": [
                "Implement backend services in Python using FastAPI.",
                "Write PostgreSQL queries.",
            ],
            "required_technologies": ["Python", "FastAPI", "PostgreSQL"],
        }
        candidate = CandidateRecord(
            candidate_id="cand_099",
            candidate_name="Maya",
            document_id="resume_099",
            resume_data={
                "email": "maya@example.com",
                "skills": ["Python", "FastAPI"],
                "experience": [{"claim": "Backend development", "value": "2 years"}],
            },
        )
        with patch("backend.app.services.oa_generator._openrouter_generate", side_effect=Exception("network")):
            generated = generate_assessment(jd, candidate, use_llm=True)
        self.assertTrue(2 <= len(generated.definition.questions) <= 5)
        self.assertEqual(generated.definition.duration_minutes, 60)
        self.assertTrue(any("FastAPI" in q.skills for q in generated.definition.questions))

    def test_empty_jd_fails_even_with_candidate(self):
        candidate = CandidateRecord(
            candidate_id="cand_x",
            candidate_name="X",
            document_id="rx",
            resume_data={"email": "x@example.com", "skills": ["Python"]},
        )
        with self.assertRaises(ValueError):
            generate_assessment({}, candidate, use_llm=False)

    def test_pydantic_schema_is_strict(self):
        invalid = {"title": "T", "description": "D", "duration_minutes": 60, "questions": []}
        with self.assertRaises(Exception):
            AssessmentDefinition.model_validate(invalid)

        invalid2 = {
            "title": "T",
            "description": "D",
            "duration_minutes": 60,
            "questions": [
                {"question_text": "Q", "language": "python", "difficulty": "medium", "type": "coding"}
            ],
        }
        with self.assertRaises(Exception):
            AssessmentDefinition.model_validate(invalid2)

    def test_email_contains_candidate_name_and_unique_link(self):
        candidate = CandidateRecord(
            candidate_id="cand_014",
            candidate_name="Rahul",
            document_id="resume_014",
            resume_data={"email": "rahul@example.com", "skills": ["Python"]},
        )
        generated = generate_assessment(
            {
                "title": "Backend Engineer",
                "description": "Build REST APIs.",
                "responsibilities": ["Implement backend services in Python using FastAPI."],
                "required_technologies": ["Python", "FastAPI"],
            },
            candidate,
            use_llm=False,
        )
        self.assertIn("Rahul", generated.definition.description)
        self.assertIn("Backend Engineer Technical Assessment", generated.definition.title)


class AssessmentSendAndRound3Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "flow.db")
        self.settings = Settings(
            database_path=self.db_path,
            auth_mode="development",
            codeassess_mode="mock",
            codeassess_api_url=None,
            codeassess_frontend_url="https://assess.example",
            assessment_title="Senior Backend Engineer Assessment",
            interviewer_id=7,
        )
        self.app = create_app(self.settings)
        self.client = TestClient(self.app)
        self.headers = {"X-Nexora-Dev-User": "recruiter@example.com"}

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _seed_candidate(self, candidate_id: str, email: str, name: str) -> None:
        self.app.state.container.database.seed_analysis(
            "analysis_demo", "Backend Engineer", "2026-09-13T00:00:00Z"
        )
        self.app.state.container.database.create_candidate(
            candidate_id=candidate_id,
            analysis_id="analysis_demo",
            name=name,
            email=email,
            resume_ref=f"resume_{candidate_id}",
            stage="SCREENING",
        )
        self.app.state.container.database.save_candidate_resume(
            candidate_id,
            {
                "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
                "experience": [{"claim": "Backend systems engineering", "value": "4 years"}],
                "projects": [{"title": "High Throughput API", "description": "Built event bus"}],
            },
        )
        from mywork.evidence.schemas.ranking import RankingEvidence
        ranking = RankingEvidence(
            candidate_id=candidate_id,
            candidate_name=name,
            rank=1,
            final_score=95.0,
            semantic_score=94.0,
            keyword_score=96.0,
            matched_skills=["Python", "FastAPI", "PostgreSQL"],
            missing_skills=["Kubernetes"],
        )
        self.app.state.container.database.save_ranking(ranking)

    def _post_send(self, cand_id: str, job_description: dict):
        return self.client.post(
            f"/api/candidates/{cand_id}/assessment/send",
            headers=self.headers,
            json=job_description,
        )

    def test_generate_and_send_creates_multiple_questions_and_email(self):
        cand_id = "cand_x_01"
        self._seed_candidate(cand_id, "rahul@example.com", "Rahul")
        self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers)
        job_description = {
            "title": "Backend Engineer",
            "description": "Build REST APIs with FastAPI and PostgreSQL.",
            "responsibilities": [
                "Implement backend services in Python using FastAPI.",
                "Write PostgreSQL queries and migrations.",
                "Containerize services with Docker.",
            ],
            "required_technologies": ["Python", "FastAPI", "PostgreSQL", "Docker"],
            "seniority": "mid",
        }
        send_response = self._post_send(cand_id, job_description)
        self.assertEqual(send_response.status_code, 200)
        payload = send_response.json()
        self.assertGreaterEqual(len(payload["assessment"]["questions"]), 2)
        self.assertTrue(payload["invite_url"].endswith(payload["token"]))
        self.assertTrue(payload["email_sent"])
        self.assertIsNotNone(payload["email"])
        self.assertEqual(payload["email"]["message_type"], "assessment_invitation")
        self.assertIn("Rahul", payload["email"]["body"])
        self.assertIn(payload["token"], payload["email"]["body"])
        self.assertIn("approximately 60 minutes", payload["assessment"]["description"])
        self.assertEqual(payload["assessment"]["duration_minutes"], 60)
        self.assertEqual(sum(q["estimate_minutes"] for q in payload["assessment"]["questions"]), 60)
        self.assertEqual(payload["stage"], "ASSESSMENT_SENT")

    def test_generate_and_send_idempotency_returns_existing_invite(self):
        cand_id = "cand_x_02"
        self._seed_candidate(cand_id, "aisha@example.com", "Aisha")
        self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers)
        job_description = {
            "title": "Backend Engineer",
            "description": "Build REST APIs.",
            "required_technologies": ["Python", "FastAPI"],
        }
        first = self._post_send(cand_id, job_description)
        self.assertEqual(first.status_code, 200)
        first_payload = first.json()
        first_token = first_payload["token"]
        initial_invites = len(self.app.state.container.codeassess.client.list_invites())
        second = self._post_send(cand_id, job_description)
        self.assertEqual(second.status_code, 200)
        second_payload = second.json()
        self.assertEqual(second_payload["token"], first_token)
        self.assertEqual(len(self.app.state.container.codeassess.client.list_invites()), initial_invites)
        self.assertFalse(second_payload["email_sent"])

    def test_candidate_not_shortlisted_rejects_generate(self):
        cand_id = "cand_x_03"
        self._seed_candidate(cand_id, "p@example.com", "Priya")
        response = self._post_send(cand_id, {"title": "Backend Engineer", "required_technologies": ["Python"]})
        self.assertEqual(response.status_code, 409)
        self.assertIn("shortlisted", response.json()["detail"].lower())

    def test_round3_selection_sends_progression_email(self):
        cand_id = "cand_x_04"
    def _evaluate_all_questions(self, cand_id: str) -> None:
        mock = self.app.state.container.codeassess.mock_client
        invite = next(item for item in mock.invites if item.profile_id == cand_id)
        questions = mock.questions.get(invite.test_id, [])
        for idx in range(len(questions)):
            mock.seed_submission(cand_id, code="def solve(): pass", question_index=idx)
            mock.evaluate_submission(mock.submissions[-1].id)

    def test_round3_selection_sends_progression_email(self):
        cand_id = "cand_x_04"
        self._seed_candidate(cand_id, "raj@example.com", "Raj")
        self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers)
        send_response = self._post_send(cand_id, {"title": "Backend Engineer", "required_technologies": ["Python", "FastAPI"]})
        self.assertEqual(send_response.status_code, 200)
        send_payload = send_response.json()
        self.assertTrue(send_payload["email_sent"])
        self._evaluate_all_questions(cand_id)
        self.client.get(f"/api/candidates/{cand_id}/assessment/status", headers=self.headers)
        result = self.client.get(f"/api/candidates/{cand_id}/assessment/result", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        hr = self.client.post(
            f"/api/candidates/{cand_id}/hr-decision",
            headers=self.headers,
            json={"decision": "HR_SELECTED", "reason": "Strong backend evidence"},
        )
        self.assertEqual(hr.status_code, 200)
        self.assertEqual(hr.json()["current_stage"], "ROUND_3")
        self.assertIsNotNone(hr.json()["round3_email"])
        self.assertEqual(hr.json()["round3_email"]["message_type"], "round3_invitation")
        self.assertIn("Raj", hr.json()["round3_email"]["body"])
        self.assertIn("Round 3 Interview Invitation", hr.json()["round3_email"]["subject"])

    def test_duplicate_round3_email_is_not_sent_again(self):
        cand_id = "cand_x_05"
        self._seed_candidate(cand_id, "raj2@example.com", "Raj 2")
        self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers)
        send_response = self._post_send(cand_id, {"title": "Backend Engineer", "required_technologies": ["Python"]})
        self.assertEqual(send_response.status_code, 200)
        send_payload = send_response.json()
        self.assertTrue(send_payload["email_sent"])
        self._evaluate_all_questions(cand_id)
        self.client.get(f"/api/candidates/{cand_id}/assessment/status", headers=self.headers)
        result = self.client.get(f"/api/candidates/{cand_id}/assessment/result", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        first = self.client.post(
            f"/api/candidates/{cand_id}/hr-decision",
            headers=self.headers,
            json={"decision": "HR_SELECTED"},
        )
        self.assertIsNotNone(first.json()["round3_email"])
        self.assertTrue(first.json()["round3_email"]["sent"])
        second = self.client.post(
            f"/api/candidates/{cand_id}/hr-decision",
            headers=self.headers,
            json={"decision": "HR_SELECTED"},
        )
        self.assertIsNone(second.json()["round3_email"])

    def test_rejection_does_not_send_round3_email(self):
        cand_id = "cand_x_06"
        self._seed_candidate(cand_id, "rej@example.com", "Rejected")
        self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers)
        send_response = self._post_send(cand_id, {"title": "Backend Engineer", "required_technologies": ["Python"]})
        self.assertEqual(send_response.status_code, 200)
        send_payload = send_response.json()
        self.assertTrue(send_payload["email_sent"])
        self._evaluate_all_questions(cand_id)
        self.client.get(f"/api/candidates/{cand_id}/assessment/status", headers=self.headers)
        result = self.client.get(f"/api/candidates/{cand_id}/assessment/result", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        hr = self.client.post(
            f"/api/candidates/{cand_id}/hr-decision",
            headers=self.headers,
            json={"decision": "REJECTED", "reason": "Low assessment evidence"},
        )
        self.assertEqual(hr.status_code, 200)
        self.assertEqual(hr.json()["current_stage"], "REJECTED")
        self.assertIsNone(hr.json()["round3_email"])

    def test_cross_candidate_assessment_isolation(self):
        cand_a = "cand_a_x"
        cand_b = "cand_b_x"
        self._seed_candidate(cand_a, "a@example.com", "Alpha")
        self._seed_candidate(cand_b, "b@example.com", "Beta")
        self.client.post(f"/api/candidates/{cand_a}/shortlist", headers=self.headers)
        send_response = self._post_send(cand_a, {"title": "Backend Engineer", "required_technologies": ["Python", "FastAPI"]})
        self.assertEqual(send_response.status_code, 200)
        send_payload = send_response.json()
        self.assertTrue(send_payload["email_sent"])
        link_a = self.app.state.container.database.get_assessment_link(cand_a)
        self.assertIsNotNone(link_a)
        self.assertEqual(link_a.profile_id, cand_a)
        aisha_link = self.app.state.container.database.get_assessment_link(cand_b)
        self.assertIsNone(aisha_link)

    def test_assessment_status_and_result_return_correct_profile_id(self):
        cand_id = "cand_x_07"
        self._seed_candidate(cand_id, "sam@example.com", "Sam")
        self.client.post(f"/api/candidates/{cand_id}/shortlist", headers=self.headers)
        send_response = self._post_send(cand_id, {"title": "Backend Engineer", "required_technologies": ["Python", "PostgreSQL"]})
        self.assertEqual(send_response.status_code, 200)
        send_payload = send_response.json()
        self.assertTrue(send_payload["email_sent"])
        mock = self.app.state.container.codeassess.mock_client
        mock.seed_submission(cand_id, code="def solve(): pass", question_index=0)
        self.client.get(f"/api/candidates/{cand_id}/assessment/status", headers=self.headers)
        mock.evaluate_submission(mock.submissions[-1].id)
        result = self.client.get(f"/api/candidates/{cand_id}/assessment/result", headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["profile_id"], cand_id)


if __name__ == "__main__":
    unittest.main()
