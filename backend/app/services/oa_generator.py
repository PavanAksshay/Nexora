"""JD + resume-driven technical assessment question generation for Nexora.

The generator does not invent marks, execution results, or CodeAssess
evaluation. It produces a structured assessment definition that CodeAssess
then owns and evaluates.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from mywork.recruiter_ai.provider import CandidateRecord


class QuestionDefinition(BaseModel):
    model_config = {"extra": "forbid"}

    question_text: str = Field(min_length=1)
    language: str = Field(default="python", min_length=1)
    difficulty: str = Field(default="medium", min_length=1)
    type: str = Field(default="coding", min_length=1)
    skills: list[str] = Field(default_factory=list)
    source_requirements: list[str] = Field(default_factory=list)
    estimate_minutes: int = Field(default=20, ge=5, le=120)


class AssessmentDefinition(BaseModel):
    model_config = {"extra": "forbid"}

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    duration_minutes: int = Field(default=60, ge=15, le=180)
    questions: list[QuestionDefinition] = Field(min_length=2, max_length=5)


@dataclass(frozen=True)
class GeneratedAssessment:
    definition: AssessmentDefinition
    job_title: str
    candidate_id: str
    candidate_email: str
    candidate_name: str
    questions_used: list[QuestionDefinition]


def _json_model(model: BaseModel, **kwargs: Any) -> dict[str, Any]:
    data = model.model_dump(mode="json", **kwargs)
    return data


def _synthesize_questions(jd: dict[str, Any], candidate: CandidateRecord) -> list[QuestionDefinition]:
    """Deterministic fallback derived strictly from the actual JD and resume.

    This is intentionally conservative: it only emits questions when the JD
    contains interpretable technical context and the candidate is shortlisted.
    """
    questions: list[QuestionDefinition] = []

    requirements = _extract_requirements(jd)
    candidate_skills = _extract_candidate_skills(candidate)

    core = _prioritize(requirements, candidate_skills)
    if not core:
        return questions

    # Keep to a short assessment; total expectation is roughly 60 minutes.
    weighted = _weight_questions(core, jd)

    total_estimated = 0
    for item in weighted:
        skill = item["skill"]
        estimate = item["estimate_minutes"]
        questions.append(
            QuestionDefinition(
                question_text=_question_text(item, candidate),
                language=_question_language(item),
                difficulty="medium",
                type=_question_type(item),
                skills=[skill],
                source_requirements=[skill],
                estimate_minutes=estimate,
            )
        )
        total_estimated += estimate

    if not questions or total_estimated == 0:
        return questions

    # Normalize so the assessment is designed for roughly 60 minutes total.
    if total_estimated != 60:
        normalized: list[QuestionDefinition] = []
        remaining = 60
        for idx, q in enumerate(questions):
            next_count = len(questions) - idx
            share = max(5, round(60 * (q.estimate_minutes / total_estimated)))
            assigned = max(5, min(remaining - (next_count - 1) * 5, share))
            assigned = min(assigned, remaining - (next_count - 1) * 5)
            assigned = max(5, assigned)
            normalized.append(q.model_copy(update={"estimate_minutes": assigned}))
            remaining -= assigned
        if normalized and normalized[-1].estimate_minutes != remaining:
            normalized[-1] = normalized[-1].model_copy(update={"estimate_minutes": remaining})
        questions = normalized

    questions = [q if isinstance(q, QuestionDefinition) else QuestionDefinition.model_validate(q) for q in questions]
    return questions



def _extract_requirements(jd: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    description = str(jd.get("description") or "").strip()
    responsibilities = jd.get("responsibilities")
    if isinstance(responsibilities, list):
        responsibilities = [str(item) for item in responsibilities]
    elif responsibilities is None:
        responsibilities = [description] if description else []
    else:
        responsibilities = [str(responsibilities)]

    technologies = jd.get("required_technologies")
    if not isinstance(technologies, list):
        technologies = []
    technologies = [str(t) for t in technologies]

    for text in responsibilities:
        if not text:
            continue
        token_skill = _tokenize_tech(text)
        for tech in technologies:
            if tech.lower() in text.lower():
                items.append({"skill": tech, "context": text, "weight": 2})
            elif tech.lower() in token_skill:
                items.append({"skill": tech, "context": text, "weight": 1})

    for tech in technologies:
        if not any(item["skill"].lower() == tech.lower() for item in items):
            items.append(
                {
                    "skill": tech,
                    "context": description or f"Role requires working knowledge of {tech}.",
                    "weight": 1,
                }
            )

    return items


def _extract_candidate_skills(candidate: CandidateRecord) -> list[str]:
    resume = candidate.resume_data or {}
    skills = resume.get("skills") or []
    if isinstance(skills, str):
        skills = [skills]
    return [str(s) for s in skills if s]


def _tokenize_tech(text: str) -> set[str]:
    lowered = text.lower()
    tokens: set[str] = set()
    for chunk in re_split(lowered):
        if len(chunk) >= 3 and chunk.isalnum():
            tokens.add(chunk)
    return tokens


def re_split(text: str) -> list[str]:
    import re

    return re.findall(r"[a-z0-9_]+", text)


def _prioritize(requirements: list[dict[str, Any]], candidate_skills: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    candidate_norm = [s.lower() for s in candidate_skills]
    if requirements:
        for item in sorted(requirements, key=lambda x: -x["weight"]):
            key = item["skill"].lower()
            if key in seen:
                continue
            seen.add(key)
            item = dict(item)
            item["matched_by_candidate"] = key in candidate_norm
            out.append(item)

    # If fewer than 2 items, supplement from candidate skills
    if len(out) < 2:
        for skill in candidate_skills:
            key = skill.lower()
            if key not in seen:
                seen.add(key)
                out.append({
                    "skill": skill,
                    "context": f"Candidate experience with {skill}.",
                    "weight": 1,
                    "matched_by_candidate": True,
                })
                if len(out) >= 3:
                    break

    # If still fewer than 2 items, add structured fallback questions
    fallbacks = [
        {"skill": "System Architecture & API Design", "context": "Design robust API contract, input validation, and error boundaries.", "weight": 1, "matched_by_candidate": False},
        {"skill": "Algorithmic Logic & Edge Cases", "context": "Implement core logic with optimal execution efficiency and test cases.", "weight": 1, "matched_by_candidate": False},
    ]
    for fallback in fallbacks:
        if len(out) >= 2:
            break
        key = fallback["skill"].lower()
        if key not in seen:
            seen.add(key)
            out.append(fallback)

    return out


def _weight_questions(
    core: list[dict[str, Any]], jd: dict[str, Any]
) -> list[dict[str, Any]]:
    seniority = str(jd.get("seniority") or "mid").lower()
    base_minutes = 25 if seniority in ("senior", "lead", "staff") else 20
    out: list[dict[str, Any]] = []
    for idx, item in enumerate(core[:3]):
        item = dict(item)
        item["estimate_minutes"] = base_minutes if idx == 0 else 20
        out.append(item)
    return out


def _question_text(item: dict[str, Any], candidate: CandidateRecord) -> str:
    skill = item["skill"]
    context = item.get("context") or f"Build a solution using {skill}."
    matched = item.get("matched_by_candidate")
    if matched:
        prompt = (
            f"Design and implement a small, production-style solution using {skill} that addresses: {context} "
            f"Assume the candidate has hands-on experience with {skill}. Focus the evaluation on correctness, "
            f"error handling, API or data design where relevant, and clear code structure."
        )
    else:
        prompt = (
            f"Design and implement a small solution using {skill} that addresses: {context} "
            f"Focus the evaluation on whether the candidate can apply {skill} correctly under realistic constraints."
        )
    return prompt


def _question_language(item: dict[str, Any]) -> str:
    return "python"


def _question_type(item: dict[str, Any]) -> str:
    return "coding"


def _select_questions(core: list[dict[str, Any]], max_questions: int = 3) -> list[QuestionDefinition]:
    """Select up to max_questions from the prioritized core list and build QuestionDefinition models."""
    questions: list[QuestionDefinition] = []
    total_estimated = 0
    for item in core[:max_questions]:
        skill = item["skill"]
        estimate = item.get("estimate_minutes", 20)
        questions.append(
            QuestionDefinition(
                question_text=_question_text(item, None),
                language=_question_language(item),
                difficulty="medium",
                type=_question_type(item),
                skills=[skill],
                source_requirements=[skill],
                estimate_minutes=estimate,
            )
        )
        total_estimated += estimate

    if questions and total_estimated != 60:
        normalized: list[QuestionDefinition] = []
        remaining = 60
        for idx, q in enumerate(questions):
            next_count = len(questions) - idx
            share = max(5, round(60 * (q.estimate_minutes / total_estimated)))
            assigned = max(5, min(remaining - (next_count - 1) * 5, share))
            assigned = min(assigned, remaining - (next_count - 1) * 5)
            assigned = max(5, assigned)
            normalized.append(q.model_copy(update={"estimate_minutes": assigned}))
            remaining -= assigned
        if normalized and normalized[-1].estimate_minutes != remaining:
            normalized[-1] = normalized[-1].model_copy(update={"estimate_minutes": remaining})
        questions = normalized

    questions = [q if isinstance(q, QuestionDefinition) else QuestionDefinition.model_validate(q) for q in questions]
    return questions


def _openrouter_generate(
    jd: dict[str, Any], candidate: CandidateRecord, model: str | None, timeout: float
) -> AssessmentDefinition:
    import httpx

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise _OpenRouterUnavailable("OPENROUTER_API_KEY is not configured")

    system_prompt = (
        "You are a technical hiring assessment generator used by Nexora.\n"
        "Generate a SHORT personalized technical assessment for a SHORTLISTED candidate.\n"
        "Use the job description AND the candidate's resume.\n"
        "Output ONLY valid JSON. No prose before or after the JSON.\n"
        "Return exactly this schema:\n"
        + _schema_hint()
    )

    user_payload = {
        "job_description": jd,
        "candidate": {
            "candidate_id": candidate.candidate_id,
            "candidate_name": candidate.candidate_name,
            "email": (candidate.resume_data or {}).get("email"),
            "skills": _extract_candidate_skills(candidate),
            "experience": (candidate.resume_data or {}).get("experience"),
            "projects": (candidate.resume_data or {}).get("projects"),
        },
        "instructions": {
            "target_duration_minutes": 60,
            "question_count_min": 2,
            "question_count_max": 3,
            "must_be_personalized": True,
            "must_validate_candidate_claims": True,
            "must_not_invent_marks_or_execution_results": True,
            "must_not_expose_private_resume_details_unnecessarily": True,
            "focus_on_most_important_role_requirements": True,
            "prefer_candidate_claimed_technologies": True,
        },
    }

    payload = {
        "model": model or os.getenv("OPENROUTER_MODEL", "openrouter/free"),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, sort_keys=True, default=str)},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "nexora_assessment",
                "strict": True,
                "schema": _json_schema(),
            },
        },
        "temperature": 0.1,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-Title": "Nexora OA Generator",
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
            )
        resp.raise_for_status()
        body = resp.json()
        content = body["choices"][0]["message"]["content"]
        if isinstance(content, str):
            parsed = json.loads(content)
        else:
            parsed = content
        return AssessmentDefinition.model_validate(parsed)
    except (json.JSONDecodeError, ValidationError, KeyError, TypeError, ValueError) as exc:
        raise _MalformedGenerationOutput("OpenRouter returned malformed assessment JSON") from exc
    except httpx.HTTPError as exc:
        raise _OpenRouterUnavailable("OpenRouter request failed") from exc


def _json_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "title": {"type": "string", "minLength": 1, "maxLength": 200},
            "description": {"type": "string", "minLength": 1, "maxLength": 4000},
            "duration_minutes": {"type": "integer", "minimum": 15, "maximum": 180},
            "questions": {
                "type": "array",
                "minItems": 2,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "question_text": {"type": "string", "minLength": 1},
                        "language": {"type": "string", "minLength": 1},
                        "difficulty": {"type": "string", "minLength": 1},
                        "type": {"type": "string", "minLength": 1},
                        "skills": {"type": "array", "items": {"type": "string"}},
                        "source_requirements": {"type": "array", "items": {"type": "string"}},
                        "estimate_minutes": {"type": "integer", "minimum": 5, "maximum": 120},
                    },
                    "required": ["question_text", "language", "difficulty", "type", "skills", "source_requirements"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["title", "description", "duration_minutes", "questions"],
        "additionalProperties": False,
    }


def _schema_hint() -> str:
    import textwrap

    return textwrap.dedent(
        """
        Required JSON schema:
        {
          "title": "string",
          "description": "string",
          "duration_minutes": 60,
          "questions": [
            {
              "question_text": "string",
              "language": "python",
              "difficulty": "medium",
              "type": "coding",
              "skills": ["Python"],
              "source_requirements": ["Python"],
              "estimate_minutes": 25
            }
          ]
        }
        """
    ).strip()


class _OpenRouterUnavailable(Exception):
    pass


class _MalformedGenerationOutput(Exception):
    pass


def generate_assessment(
    jd: dict[str, Any],
    candidate: CandidateRecord,
    *,
    use_llm: bool = True,
    llm_timeout: float = 30.0,
) -> GeneratedAssessment:
    """Generate a personalized assessment from the JD and candidate resume.

    The output is validated with Pydantic. If LLM generation is enabled but
    fails or returns malformed JSON, the function falls back to a deterministic
    generator that is still derived from the real JD and resume.
    """
    job_title = str(jd.get("title") or jd.get("job_title") or "Technical Role").strip() or "Technical Role"
    candidate_name = candidate.candidate_name
    candidate_id = candidate.candidate_id
    resume = candidate.resume_data or {}
    candidate_email = str(resume.get("email") or "").strip() or "candidate@example.com"

    if not jd:
        raise ValueError("Job description is required to generate an assessment")

    definition: AssessmentDefinition
    questions: list[QuestionDefinition]

    if use_llm:
        try:
            definition = _openrouter_generate(jd, candidate, model=None, timeout=llm_timeout)
            questions = definition.questions
        except Exception:
            questions = _synthesize_questions(jd, candidate)
            definition = _fallback_definition(job_title, candidate, questions)
    else:
        questions = _synthesize_questions(jd, candidate)
        definition = _fallback_definition(job_title, candidate, questions)

    if not questions or len(questions) < 2:
        raise ValueError("Could not generate assessment questions for this JD and candidate")

    questions = _ensure_question_models(questions)

    total_estimated = sum(q.estimate_minutes for q in questions)
    if total_estimated == 0:
        raise ValueError("Could not generate assessment questions for this JD and candidate")

    if total_estimated != 60:
        normalized: list[QuestionDefinition] = []
        remaining = 60
        for idx, q in enumerate(questions):
            next_count = len(questions) - idx
            share = max(5, round(60 * (q.estimate_minutes / total_estimated)))
            assigned = max(5, min(remaining - (next_count - 1) * 5, share))
            assigned = min(assigned, remaining - (next_count - 1) * 5)
            assigned = max(5, assigned)
            normalized.append(q.model_copy(update={"estimate_minutes": assigned}))
            remaining -= assigned
        if normalized and normalized[-1].estimate_minutes != remaining:
            normalized[-1] = normalized[-1].model_copy(update={"estimate_minutes": remaining})
        questions = normalized

    definition = AssessmentDefinition(
        title=f"{job_title} Technical Assessment",
        description=(
            f"Personalized technical assessment for {candidate_name} "
            f"for the {job_title} position (approximately 60 minutes). Questions are derived from the job "
            f"description and the candidate's resume/claimed skills."
        ),
        duration_minutes=60,
        questions=questions,
    )

    return GeneratedAssessment(
        definition=definition,
        job_title=job_title,
        candidate_id=candidate_id,
        candidate_email=candidate_email,
        candidate_name=candidate_name,
        questions_used=definition.questions,
    )


def _ensure_question_models(questions: list[Any]) -> list[QuestionDefinition]:
    """Coerce raw dict items into validated QuestionDefinition models."""
    return [q if isinstance(q, QuestionDefinition) else QuestionDefinition.model_validate(q) for q in questions]


def _fallback_definition(
    job_title: str,
    candidate: CandidateRecord,
    questions: list[QuestionDefinition],
) -> AssessmentDefinition:
    return AssessmentDefinition(
        title=f"{job_title} Technical Assessment",
        description=(
            f"Personalized technical assessment for {candidate.candidate_name} "
            f"for the {job_title} position (approximately 60 minutes). Questions are derived from the job "
            f"description and the candidate's resume/claimed skills."
        ),
        duration_minutes=60,
        questions=questions,
    )



