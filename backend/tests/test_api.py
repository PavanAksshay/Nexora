import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app


class NexoraApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        settings = Settings(
            database_path=str(Path(self.temp_dir.name) / "nexora.db"),
            auth_mode="development",
            codeassess_mode="mock",
            codeassess_api_url=None,
            codeassess_frontend_url="https://assess.example",
        )
        self.client = TestClient(create_app(settings))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def headers(self) -> dict[str, str]:
        return {"X-Nexora-Dev-User": "test"}

    def test_candidate_retrieval_and_rankings(self) -> None:
        response = self.client.get("/api/candidates", headers=self.headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual({item["candidate_id"] for item in response.json()}, {"cand_014", "cand_021", "cand_030"})
        rankings = self.client.get("/api/rankings", headers=self.headers())
        self.assertEqual(rankings.status_code, 200)
        self.assertEqual(rankings.json()[0]["candidate_id"], "cand_014")
        analysis = self.client.get("/api/analyses/analysis_demo", headers=self.headers())
        self.assertEqual(analysis.status_code, 200)
        self.assertEqual(analysis.json()["job_title"], "Senior Full Stack Engineer")

    def test_shortlist_is_idempotent_and_invalid_candidate_fails(self) -> None:
        first = self.client.post("/api/candidates/cand_014/shortlist", headers=self.headers())
        second = self.client.post("/api/candidates/cand_014/shortlist", headers=self.headers())
        missing = self.client.post("/api/candidates/missing/shortlist", headers=self.headers())
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.json()["changed"])
        self.assertFalse(second.json()["changed"])
        self.assertEqual(missing.status_code, 404)

    def test_assessment_invite_email_and_identity(self) -> None:
        self.client.post("/api/candidates/cand_014/shortlist", headers=self.headers())
        response = self.client.post(
            "/api/candidates/cand_014/assessment",
            headers=self.headers(),
            json={"question_text": "Implement a backend API", "language": "python"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["candidate_id"], "cand_014")
        self.assertEqual(payload["invite_id"], 500)
        self.assertEqual(payload["invite_url"], "https://assess.example/candidate/test/mock-token-500")
        email = self.client.app.state.container.email.messages[-1]
        self.assertEqual(email.recipient, "rahul@example.com")
        self.assertIn("mock-token-500", email.body)
        self.assertEqual(self.client.post(
            "/api/candidates/cand_021/assessment",
            headers=self.headers(),
            json={"question_text": "Implement a backend API", "language": "python"},
        ).status_code, 409)

    def test_golden_path_result_evidence_hr_and_chat(self) -> None:
        self.client.post("/api/candidates/cand_014/shortlist", headers=self.headers())
        self.client.post(
            "/api/candidates/cand_014/assessment",
            headers=self.headers(),
            json={"question_text": "Implement a backend API", "language": "python"},
        )
        mock = self.client.app.state.container.codeassess.mock_client
        mock.seed_submission("cand_014")
        status = self.client.get("/api/candidates/cand_014/assessment/status", headers=self.headers())
        self.assertEqual(status.json()["status"], "pending_evaluation")
        mock.evaluate_submission(900)
        result = self.client.get("/api/candidates/cand_014/assessment/result", headers=self.headers())
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["profile_id"], "cand_014")
        evidence = self.client.get("/api/candidates/cand_014/evidence/comparison", headers=self.headers())
        self.assertEqual(evidence.status_code, 200)
        decision = self.client.post(
            "/api/candidates/cand_014/hr-decision",
            headers=self.headers(),
            json={"decision": "HR_SELECTED", "reason": "Evidence supports backend capability"},
        )
        self.assertEqual(decision.json()["current_stage"], "ROUND_3")
        chat = self.client.post(
            "/api/recruiter/chat",
            headers=self.headers(),
            json={"message": "Why is Rahul ranked above Arjun?"},
        )
        self.assertEqual(chat.status_code, 200)
        self.assertEqual(chat.json()["intent"], "candidate_comparison")
        self.assertTrue(chat.json()["evidence"])

    def test_hr_decision_requires_evaluated_candidate(self) -> None:
        response = self.client.post(
            "/api/candidates/cand_014/hr-decision",
            headers=self.headers(),
            json={"decision": "HR_SELECTED"},
        )
        self.assertEqual(response.status_code, 409)

    def test_auth_boundary_rejects_without_firebase_or_dev_mode(self) -> None:
        from backend.app.main import create_app

        settings = Settings(
            database_path=str(Path(self.temp_dir.name) / "firebase-mode.db"),
            auth_mode="firebase",
            codeassess_mode="mock",
        )
        response = TestClient(create_app(settings)).get("/api/candidates")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
