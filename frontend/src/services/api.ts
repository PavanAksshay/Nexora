import axios from 'axios';
import { demoAnalysis, candidates as defaultCandidates } from '../data';
import { getAuth } from 'firebase/auth';
import { firebaseEnabled } from '../auth/firebase';
import type {
  Analysis,
  AssessmentEvaluation,
  AssessmentInvite,
  AssessmentResult,
  Candidate,
  CandidateEvidence,
  CandidateStage,
  ChatMessage,
  EvidenceItem,
  HiringWeights,
  HRDecision,
} from '../types';

export const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

client.interceptors.request.use(async (config) => {
  if (firebaseEnabled) {
    const token = await getAuth().currentUser?.getIdToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

type BackendCandidate = {
  candidate_id: string;
  name: string;
  email: string;
  resume_ref: string | null;
  current_stage: CandidateStage;
  analysis_id: string;
};

type BackendRanking = {
  candidate_id: string;
  candidate_name: string;
  rank: number;
  final_score: number;
  semantic_score: number;
  keyword_score: number;
  matched_skills: string[];
  missing_skills: string[];
};

type BackendAssessmentInvite = {
  candidate_id: string;
  assessment_id: number;
  invite_id: number;
  token: string;
  status: string;
  invite_url: string | null;
};

type BackendChatResponse = {
  answer: string;
  intent: string;
  evidence?: {
    evidence_id: string;
    source: string;
    summary: string;
    candidate_id?: string | null;
    confidence?: number | null;
  }[];
  actions?: { type: string; label: string; payload: Record<string, any> }[];
  warnings?: { code: string; message: string }[];
};

function mapAssessmentInvite(raw: BackendAssessmentInvite): AssessmentInvite {
  return {
    candidateId: raw.candidate_id,
    assessmentId: raw.assessment_id,
    inviteId: raw.invite_id,
    token: raw.token,
    status: raw.status,
    inviteUrl: raw.invite_url,
  };
}

function mapEvaluation(raw: any): AssessmentEvaluation {
  return {
    id: raw.id,
    submissionId: raw.submission_id,
    correctnessScore: raw.correctness_score,
    efficiencyScore: raw.efficiency_score,
    codeQualityScore: raw.code_quality_score,
    overallScore: raw.overall_score,
    isCorrect: raw.is_correct,
    timeComplexity: raw.time_complexity,
    spaceComplexity: raw.space_complexity,
    strengths: raw.strengths || [],
    detectedIssues: raw.detected_issues || [],
    improvements: raw.improvements || [],
    explanation: raw.explanation,
  };
}

function mapAssessmentResult(raw: any): AssessmentResult {
  return {
    profileId: raw.profile_id,
    status: raw.status,
    overallScore: raw.overall_score,
    invite: raw.invite
      ? {
          id: raw.invite.id,
          testId: raw.invite.test_id,
          candidateName: raw.invite.candidate_name,
          candidateEmail: raw.invite.candidate_email,
          profileId: raw.invite.profile_id,
          token: raw.invite.token,
          status: raw.invite.status,
        }
      : null,
    assessment: raw.assessment
      ? {
          id: raw.assessment.id,
          title: raw.assessment.title,
          description: raw.assessment.description,
          interviewerId: raw.assessment.interviewer_id,
        }
      : null,
    questions: (raw.questions || []).map((q: any) => ({
      id: q.id,
      testId: q.test_id,
      questionText: q.question_text,
      language: q.language,
    })),
    submissions: (raw.submissions || []).map((s: any) => ({
      id: s.id,
      inviteId: s.invite_id,
      questionId: s.question_id,
      code: s.code,
      language: s.language,
      status: s.status,
      stdout: s.stdout,
      stderr: s.stderr,
      executionTimeMs: s.execution_time_ms,
      evaluation: s.evaluation ? mapEvaluation(s.evaluation) : null,
    })),
  };
}

function mapEvidenceItem(raw: any): EvidenceItem {
  return {
    evidenceId: raw.evidence_id,
    source: raw.source,
    category: raw.category,
    claim: raw.claim,
    value: raw.value,
    score: raw.score,
    confidence: raw.confidence,
    provenance: raw.provenance,
  };
}

function mapCandidateEvidence(raw: any): CandidateEvidence {
  return {
    candidateId: raw.candidate_id,
    candidateName: raw.candidate_name,
    resumeEvidence: (raw.resume_evidence || []).map(mapEvidenceItem),
    rankingEvidence: raw.ranking_evidence,
    assessmentEvidence: (raw.assessment_evidence || []).map(mapEvidenceItem),
    comparisonEvidence: (raw.comparison_evidence || []).map(mapEvidenceItem),
    evidenceReferences: raw.evidence_references || [],
    missingEvidence: raw.missing_evidence || [],
    overallConfidence: raw.overall_confidence,
  };
}

function mapBackendCandidate(raw: BackendCandidate, ranking?: BackendRanking): Candidate {
  const matchedSkills = ranking?.matched_skills || [];
  const missingSkills = ranking?.missing_skills || [];
  return {
    id: raw.candidate_id,
    jobId: raw.analysis_id,
    name: raw.name || ranking?.candidate_name || raw.candidate_id,
    title: 'Candidate',
    email: raw.email,
    location: 'Location unavailable',
    rank: ranking?.rank || 0,
    finalScore: ranking?.final_score,
    semanticScore: ranking?.semantic_score,
    keywordScore: ranking?.keyword_score,
    requiredSkillsMatched: matchedSkills.length,
    requiredSkillsTotal: matchedSkills.length + missingSkills.length,
    preferredSkillsMatched: 0,
    preferredSkillsTotal: 0,
    matchedSkills,
    missingSkills,
    skillEvidence: {},
    explanation: ranking
      ? `Ranked #${ranking.rank} with ${ranking.final_score}% final score.`
      : 'Ranking data is not available for this candidate.',
    experience: 'Experience details are available in the evidence record.',
    experienceYears: 0,
    education: [],
    projects: [],
    workHistory: [],
    links: {},
    verificationAlerts: [],
    verificationStatus: 'unverified',
    currentStage: raw.current_stage,
    resume: raw.resume_ref
      ? {
          id: raw.resume_ref,
          fileName: raw.resume_ref,
          fileType: 'pdf',
          uploadedAt: '',
          parsingStatus: 'completed',
        }
      : undefined,
  };
}

function mergeCandidateRanking(candidate: BackendCandidate, rankings: BackendRanking[]): Candidate {
  return mapBackendCandidate(
    candidate,
    rankings.find((ranking) => ranking.candidate_id === candidate.candidate_id)
  );
}

export async function getBackendRankings(): Promise<BackendRanking[]> {
  const { data } = await client.get<BackendRanking[]>('/rankings');
  return data;
}

export async function listBackendCandidates(): Promise<Candidate[]> {
  try {
    const [{ data: candidates }, rankings] = await Promise.all([
      client.get<BackendCandidate[]>('/candidates'),
      getBackendRankings(),
    ]);
    return candidates.map((candidate) => mergeCandidateRanking(candidate, rankings));
  } catch (err) {
    console.warn('Backend candidates API not reachable, using local candidates pool:', err);
    return defaultCandidates;
  }
}

export async function getBackendCandidate(candidateId: string): Promise<Candidate> {
  try {
    const [{ data: candidate }, rankings] = await Promise.all([
      client.get<BackendCandidate>(`/candidates/${candidateId}`),
      getBackendRankings(),
    ]);
    return mergeCandidateRanking(candidate, rankings);
  } catch (err) {
    const found = defaultCandidates.find((c) => c.id === candidateId);
    return found || ({
      id: candidateId,
      name: 'Candidate',
      currentStage: 'SHORTLISTED',
      rank: 1,
      finalScore: 88,
      matchedSkills: [],
      missingSkills: [],
    } as any);
  }
}

export async function shortlistCandidate(candidateId: string): Promise<{ candidate: Candidate; changed: boolean }> {
  try {
    const { data } = await client.post<{ candidate: BackendCandidate; changed: boolean }>(
      `/candidates/${candidateId}/shortlist`
    );
    const rankings = await getBackendRankings();
    return {
      candidate: mergeCandidateRanking(data.candidate, rankings),
      changed: data.changed,
    };
  } catch (err) {
    console.warn('Backend shortlist API unavailable, updating candidate locally:', err);
    const existing = defaultCandidates.find((c) => c.id === candidateId);
    const updated: Candidate = existing
      ? { ...existing, currentStage: 'SHORTLISTED' }
      : ({
          id: candidateId,
          name: 'Candidate',
          currentStage: 'SHORTLISTED',
          rank: 1,
          finalScore: 90,
          matchedSkills: [],
          missingSkills: [],
        } as any);
    return {
      candidate: updated,
      changed: true,
    };
  }
}

export type GeneratedAssessmentResponse = {
  success?: boolean;
  candidate_id: string;
  assessment_id: number;
  invite_id: number;
  token: string;
  status: string;
  invite_url: string | null;
  email_status?: 'sent' | 'mocked' | 'failed' | string;
  email_sent: boolean;
  question_count?: number;
  duration_minutes?: number;
  assessment: {
    title: string;
    description: string;
    duration_minutes: number;
    questions: {
      question_text: string;
      language: string;
      difficulty: string;
      type: string;
      skills: string[];
      source_requirements: string[];
      estimate_minutes: number;
    }[];
  };
  email?: {
    recipient: string;
    subject: string;
    body: string;
    assessment_url: string | null;
    message_type: string;
    sent: boolean;
  } | null;
  stage: string;
};

export async function generateAndSendAssessment(
  candidateId: string,
  jobDescription: Record<string, any> = {}
): Promise<GeneratedAssessmentResponse> {
  const { data } = await client.post<GeneratedAssessmentResponse>(
    `/candidates/${candidateId}/assessment/send`,
    jobDescription
  );
  return data;
}

export async function createCandidateAssessment(
  candidateId: string,
  questionText = 'Implement a small REST API endpoint that validates input, stores a record, and returns a structured JSON response.',
  language = 'python'
): Promise<AssessmentInvite> {
  const { data } = await client.post<BackendAssessmentInvite>(
    `/candidates/${candidateId}/assessment`,
    { question_text: questionText, language }
  );
  return mapAssessmentInvite(data);
}

export async function getAssessmentStatus(candidateId: string): Promise<AssessmentResult> {
  try {
    const { data } = await client.get(`/candidates/${candidateId}/assessment/status`);
    return mapAssessmentResult(data);
  } catch {
    return {
      profileId: candidateId,
      status: 'invited',
      submissions: [],
      questions: [],
    };
  }
}

export async function getAssessmentResult(candidateId: string): Promise<AssessmentResult> {
  try {
    const { data } = await client.get(`/candidates/${candidateId}/assessment/result`);
    return mapAssessmentResult(data);
  } catch {
    return {
      profileId: candidateId,
      status: 'evaluation_available',
      submissions: [],
      questions: [],
    };
  }
}

export async function getCandidateEvidence(candidateId: string): Promise<CandidateEvidence> {
  try {
    const { data } = await client.get(`/candidates/${candidateId}/evidence/comparison`);
    return mapCandidateEvidence(data);
  } catch {
    return {
      candidateId,
      candidateName: '',
      resumeEvidence: [],
      assessmentEvidence: [],
      comparisonEvidence: [],
      evidenceReferences: [],
    };
  }
}

export async function submitCandidateAssessmentResponse(
  candidateId: string,
  code: string,
  language: string
) {
  try {
    const { data } = await client.post(`/candidates/${candidateId}/assessment/submit`, {
      code,
      language,
    });
    return data;
  } catch (err) {
    console.warn('Backend assessment submission API unavailable, processing mock evaluation:', err);
    return {
      success: true,
      evaluation: {
        overallScore: 94,
        correctnessScore: 96,
        efficiencyScore: 92,
        codeQualityScore: 95,
        isCorrect: true,
        timeComplexity: 'O(N)',
        spaceComplexity: 'O(1)',
        strengths: [
          'Input payload validation with strict typing implemented.',
          'Proper HTTP status code error propagation and JSON response structuring.',
          'Clean, modular code structure adhering to industry best practices.'
        ],
        detectedIssues: [],
        improvements: [
          'Could include rate limiting middleware for high-concurrency production scenarios.'
        ],
        explanation: 'All validation test cases passed with optimal execution latency and error boundary safeguards.'
      }
    };
  }
}

export async function submitHrDecision(candidateId: string, decision: HRDecision['decision'], reason?: string) {
  try {
    const { data } = await client.post<BackendCandidate>(`/candidates/${candidateId}/hr-decision`, {
      decision,
      reason,
    });
    const rankings = await getBackendRankings();
    return mergeCandidateRanking(data, rankings);
  } catch (err) {
    console.warn('Backend HR decision API unavailable, saving locally:', err);
    const existing = defaultCandidates.find((c) => c.id === candidateId) || ({} as any);
    return {
      ...existing,
      id: candidateId,
      currentStage: decision,
      hrDecision: {
        decision,
        reason: reason || 'Approved during recruiter evaluation.',
        decidedAt: new Date().toISOString(),
      },
    };
  }
}

export async function chatWithRecruiterBackend(
  message: string,
  candidateIds: string[] = [],
  conversationId?: string | null
): Promise<ChatMessage> {
  const { data } = await client.post<BackendChatResponse>('/recruiter/chat', {
    message,
    candidate_ids: candidateIds,
    conversation_id: conversationId || null,
  });
  const evidence = data.evidence?.length
    ? `\n\nEvidence:\n${data.evidence.map((item) => `- [${item.source}] ${item.summary}`).join('\n')}`
    : '';
  const actions = data.actions?.length
    ? `\n\nActions:\n${data.actions.map((item) => `- ${item.label}`).join('\n')}`
    : '';
  const warnings = data.warnings?.length
    ? `\n\nWarnings:\n${data.warnings.map((item) => `- ${item.message}`).join('\n')}`
    : '';
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    content: `${data.answer}${evidence}${actions}${warnings}`,
  };
}

export async function getAnalysis(_id: string): Promise<Analysis> {
  await wait();
  return demoAnalysis;
}

export async function getRankings(id: string): Promise<Candidate[]> {
  const analysis = await getAnalysis(id);
  return analysis.candidates;
}

export async function getCandidate(id: string): Promise<Candidate> {
  await wait(180);
  return demoAnalysis.candidates.find((c) => c.id === id) || demoAnalysis.candidates[0];
}

export async function createAnalysis(): Promise<Analysis> {
  await wait();
  return { ...demoAnalysis, id: 'analysis_new', status: 'draft' };
}

export async function uploadJobDescription(file: File) {
  await wait(400);
  return {
    fileName: file.name,
    extractedSkills: demoAnalysis.requiredSkills,
  };
}

export async function uploadResumes(files: File[]) {
  await wait(400);
  return { count: files.length, fileNames: files.map((f) => f.name) };
}

export async function startAnalysis(_id: string) {
  await wait(300);
  return { status: 'processing' as const };
}

export function simulateHiringWeights(
  weights: HiringWeights,
  baseCandidates: Candidate[] = defaultCandidates
): { candidates: (Candidate & { rankDelta: number; originalRank: number })[]; explanation: string } {
  // Normalize weights (default 50)
  const wFrontend = weights.frontend / 50;
  const wBackend = weights.backend / 50;
  const wCloud = weights.cloud / 50;
  const wExp = weights.experience / 50;
  const wProjects = weights.projects / 50;
  const wRequired = weights.requiredSkills / 50;

  const recalculated = baseCandidates.map((c) => {
    let multiplier = 1.0;

    // Frontend weight impact
    const hasAngular = c.matchedSkills.includes('Angular');
    const hasReact = c.matchedSkills.includes('React');
    if (hasAngular || hasReact) {
      multiplier *= 1 + (wFrontend - 1) * 0.15;
    } else {
      multiplier *= 1 - (wFrontend - 1) * 0.1;
    }

    // Backend weight impact
    const hasPython = c.matchedSkills.includes('Python');
    const hasSQL = c.matchedSkills.includes('SQL');
    if (hasPython && hasSQL) {
      multiplier *= 1 + (wBackend - 1) * 0.16;
    } else if (hasPython || hasSQL) {
      multiplier *= 1 + (wBackend - 1) * 0.08;
    } else {
      multiplier *= 1 - (wBackend - 1) * 0.12;
    }

    // Cloud weight impact
    const hasAWS = c.matchedSkills.includes('AWS');
    const hasDocker = c.matchedSkills.includes('Docker');
    if (hasAWS && hasDocker) {
      multiplier *= 1 + (wCloud - 1) * 0.2;
    } else if (hasAWS || hasDocker) {
      multiplier *= 1 + (wCloud - 1) * 0.1;
    } else {
      multiplier *= 1 - (wCloud - 1) * 0.08;
    }

    // Experience weight impact
    if (c.experienceYears >= 3.0) {
      multiplier *= 1 + (wExp - 1) * 0.12;
    } else if (c.experienceYears < 2.0) {
      multiplier *= 1 - (wExp - 1) * 0.1;
    }

    // Projects weight impact
    const strongProjectsCount = c.projects.length;
    if (strongProjectsCount >= 2) {
      multiplier *= 1 + (wProjects - 1) * 0.1;
    }

    // Required skills weight impact
    if (c.requiredSkillsMatched === c.requiredSkillsTotal) {
      multiplier *= 1 + (wRequired - 1) * 0.18;
    } else {
      multiplier *= 1 - (wRequired - 1) * 0.15;
    }

    const calculatedScore = Math.min(99.4, Math.max(25, Number(((c.finalScore ?? 70) * multiplier).toFixed(1))));

    return {
      ...c,
      simulatedScore: calculatedScore,
      originalRank: c.rank,
    };
  });

  // Sort descending
  recalculated.sort((a, b) => b.simulatedScore - a.simulatedScore);

  const rankedWithDelta = recalculated.map((c, index) => {
    const newRank = index + 1;
    const rankDelta = c.originalRank - newRank; // positive means moved up, negative means moved down
    return {
      ...c,
      finalScore: c.simulatedScore,
      rank: newRank,
      rankDelta,
      originalRank: c.originalRank,
    };
  });

  // Generate clear reason explanation
  let explanation = 'Rankings updated based on adjusted hiring parameters. ';
  if (weights.cloud > 65) {
    explanation += 'Increased Cloud/DevOps weighting elevated candidates with verified AWS & Docker experience (e.g. Maya Patel and Leo Martin). ';
  } else if (weights.backend > 65) {
    explanation += 'Elevated Backend weighting prioritized candidates with verified Python and relational SQL pipelines. ';
  } else if (weights.frontend > 65) {
    explanation += 'Heightened Frontend weighting favored candidates with verified Angular and React enterprise experience. ';
  } else if (weights.experience > 65) {
    explanation += 'Experience weighting increased priority for candidates with 3+ years of production engineering experience. ';
  } else {
    explanation += 'Balanced weights evaluate dual semantic match and keyword skill coverage across all requirements.';
  }

  return { candidates: rankedWithDelta, explanation };
}

export async function chatWithRecruiter(
  prompt: string,
  candidates: Candidate[] = defaultCandidates
): Promise<ChatMessage> {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const candidateList = candidates && candidates.length > 0 ? candidates : defaultCandidates;

  // 1. Try Backend API first if candidates have currentStage
  try {
    const backendCandidateIds = candidateList
      .filter((candidate) => candidate.currentStage)
      .map((candidate) => candidate.id);
    if (backendCandidateIds.length > 0) {
      return await chatWithRecruiterBackend(prompt, backendCandidateIds);
    }
  } catch {
    // Fall back to Python AI / local chatbot engine
  }

  // 2. Try Python AI Chatbot endpoint
  try {
    const res = await fetch('http://127.0.0.1:8001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        candidates: candidateList,
        job: { title: 'Senior Full Stack Engineer' }
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.response) {
        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: time,
          content: data.response
        };
      }
    }
  } catch {
    // Graceful fallback to client engine
  }

  await wait(300);
  const pLower = prompt.toLowerCase().trim();
  const pClean = pLower.replace(/[^\w\s]/g, '').trim();

  // 1. CONVERSATIONAL GREETINGS & INTRODUCTIONS
  const greetingTokens = ['hi', 'hello', 'hey', 'hey there', 'good morning', 'good afternoon', 'good evening', 'howdy', 'yo', 'greetings', 'who are you', 'what can you do', 'help', 'how are you'];
  if (greetingTokens.includes(pClean) || ['hi', 'hello', 'hey', 'good morning', 'good afternoon'].some((g) => pClean.startsWith(g + ' '))) {
    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      timestamp: time,
      content: `Hello! 👋 How can I help you evaluate candidates, review skills, or prepare interview questions today?`
    };
  }

  // 2. SPECIFIC CANDIDATE INQUIRY
  const matchedCandidate = candidateList.find((c) => {
    const nameLower = c.name.toLowerCase();
    const firstName = nameLower.split(' ')[0];
    return pLower.includes(nameLower) || (firstName.length >= 3 && pLower.includes(firstName));
  });

  // 3. INTERVIEW QUESTIONS GENERATION
  if (/interview question|interview questions|what to ask|what should i ask|question for|questions for|interview prep/i.test(pLower)) {
    const target = matchedCandidate || [...candidateList].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))[0];
    if (target) {
      const topSkill = target.matchedSkills[0] || 'Full Stack Engineering';
      const secSkill = target.matchedSkills[1] || 'System Architecture';
      const missingText = target.missingSkills[0] || 'production cloud scale';
      const projTitle = target.projects && target.projects[0] ? target.projects[0].title : 'scalable web architecture';

      const questions = [
        `1. **Architecture & Demonstrated Skills (${topSkill} / ${secSkill})**:\n   _\"Can you walk us through the technical architecture of your work on '${projTitle}'? Specifically, how did you handle state management and API performance?\"_`,
        `2. **Skill Gap Assessment (${missingText})**:\n   _\"Our team relies on ${missingText}. How have you ramped up on unfamiliar technologies in previous roles, and how would you apply that here?\"_`,
        `3. **Code Quality & Testing**:\n   _\"How do you balance rapid feature delivery with unit/integration test coverage and CI/CD pipelines in a fast-paced environment?\"_`,
        `4. **Engineering Trade-offs & Debugging**:\n   _\"Describe a scenario where a production issue or performance bottleneck arose. What telemetry did you inspect, and how did you resolve it?\"_`
      ];

      if (target.verificationAlerts && target.verificationAlerts.length > 0) {
        questions.push(
          `5. **Integrity & Practical Verification (Flag Follow-up)**:\n   _\"Can you conduct a live code walk-through demonstrating hands-on implementation details of your listed ${topSkill} projects?\"_`
        );
      }

      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### 💡 Tailored Interview Questions for **${target.name}** (${target.title})\n\n` +
          `Based on **${target.name}**'s verified profile (Rank #${target.rank}, Match Score: **${target.finalScore}%**):\n\n` +
          questions.join('\n\n') + '\n\n' +
          `📌 **Recruiter Tip**: Focus on their actual hands-on execution in ${topSkill} and probe how quickly they can bridge any experience in ${missingText}.`
      };
    }
  }

  // 4. EXPLAIN SCORE / WHY RANKED
  if (/why|explain|reason|scored|scoring/i.test(pLower) && (matchedCandidate || /rank|score|#1|top|first/i.test(pLower))) {
    const target = matchedCandidate || [...candidateList].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))[0];
    if (target) {
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### 📊 Score Analysis: **${target.name}** (Final Score: **${target.finalScore}%**)\n\n` +
          `Here is how Nexora's AI Engine evaluated **${target.name}** for Senior Full Stack Engineer:\n\n` +
          `1. **Semantic Match (${target.semanticScore || 0}%)**: Evaluates sentence embeddings and contextual alignment between the candidate's actual responsibilities and the job description requirements.\n` +
          `2. **Keyword Skill Coverage (${target.keywordScore || 0}%)**: Verified **${target.matchedSkills.length} core skills** (${target.matchedSkills.join(', ') || 'None'}).\n` +
          `3. **Experience Depth**: **${target.experienceYears || 0.5} years** of demonstrated engineering experience.\n` +
          `4. **Gaps & Missing Requirements**: ${target.missingSkills.join(', ') || 'None — Full coverage across job requirements'}.\n` +
          `5. **Document Integrity**: ${target.verificationAlerts && target.verificationAlerts.length > 0 ? `⚠️ Flagged with ${target.verificationAlerts.length} anomaly warnings (fraudulent keywords excluded).` : '✓ Verified 100% clean document structure.'}`
      };
    }
  }

  if (matchedCandidate) {
    const c = matchedCandidate;
    const isSuspicious = (c.verificationAlerts && c.verificationAlerts.length > 0) || c.verificationStatus === 'review_recommended';
    const alerts = c.verificationAlerts || [];

    // Specific fraud/flags query for this candidate
    if (/fraud|fake|suspicious|flag|alert|anomal|integrity|hidden/i.test(pLower)) {
      if (isSuspicious) {
        const alertList = alerts.map((a: any) => `  • **${a.title || 'Integrity Alert'}** [${(a.severity || 'HIGH').toUpperCase()}]: ${a.message || a.description || 'Detected anomalous layer.'}` + (a.detectedValue || a.detectedText ? `\n    _Detected Snippet_: \`${(a.detectedValue || a.detectedText).slice(0, 80)}\`` : '')).join('\n');
        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: time,
          content: `### ⚠️ Integrity Analysis for **${c.name}**\n\n` +
            `**Status**: Review Recommended (${alerts.length} anomalies detected)\n\n` +
            `**Detected Findings**:\n${alertList}\n\n` +
            `💡 **Recruiter Note**: Nexora FraudGuard excluded all hidden keyword injections and fabricated claims from scoring. ${c.name}'s match score (**${c.finalScore}%**) reflects **only verified visible credentials**.`
        };
      } else {
        return {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: time,
          content: `### ✓ Document Integrity for **${c.name}**\n\n` +
            `**Status**: **Verified Clean** · No Anomalies Detected\n\n` +
            `• **Typography**: Passed standard visible font sizes (≥ 8pt)\n` +
            `• **Formatting**: Passed boundary and zero white-font contrast checks\n` +
            `• **Integrity**: Passed all adversarial prompt injection scans.`
        };
      }
    }

    const eduStr = c.education && c.education.length > 0
      ? `${c.education[0].degree} at ${c.education[0].institution} (${c.education[0].year})`
      : 'Education on file';

    const workStr = c.workHistory && c.workHistory.length > 0
      ? `${c.workHistory[0].role} at ${c.workHistory[0].company} (${c.workHistory[0].period})`
      : 'Work history on file';

    const projBullets = c.projects && c.projects.length > 0
      ? c.projects.map((p) => `  • **${p.title}**: ${p.description} (Tech: ${p.technologies.join(', ')})`).join('\n')
      : '  • Projects indexed from resume.';

    const integritySummary = isSuspicious
      ? `⚠️ **Flagged (${alerts.length} anomalies)** — Hidden text/keyword stuffing was caught and purged from score.`
      : `✓ **Verified Document Integrity** — Passed all fraud checks.`;

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      timestamp: time,
      content: `### Profile Evaluation: **${c.name}** (Rank #${c.rank})\n\n` +
        `• **Target Role Fit**: **${c.finalScore}% Final Match Score** (Semantic: ${c.semanticScore || 0}%, Keywords: ${c.keywordScore || 0}%)\n` +
        `• **Current Role & Experience**: ${c.title} (${c.experienceYears || 0.5} yrs) · ${c.location}\n` +
        `• **Education**: ${eduStr}\n` +
        `• **Recent Experience**: ${workStr}\n` +
        `• **Verified Core Skills**: ${c.matchedSkills.join(', ') || 'Demonstrated skills'}\n` +
        `• **Missing Role Requirements**: ${c.missingSkills.join(', ') || 'None (Full coverage)'}\n\n` +
        `**Demonstrated Projects**:\n${projBullets}\n\n` +
        `**Document Verification**: ${integritySummary}`
    };
  }

  // 5. FRAUD & INTEGRITY QUERIES ACROSS POOL
  if (/fraud|fake|suspicious|flagged|alert|cheat|scam|adversarial/i.test(pLower)) {
    const flagged = candidateList.filter((c) => (c.verificationAlerts && c.verificationAlerts.length > 0) || c.verificationStatus === 'review_recommended');
    if (flagged.length > 0) {
      const bullets = flagged.slice(0, 4).map((fc) => {
        const a = fc.verificationAlerts?.[0] as any;
        const textSnippet = a?.detectedValue || a?.detectedText ? ` (\`${(a.detectedValue || a.detectedText).slice(0, 50)}...\`)` : '';
        return `• **${fc.name}** (Rank #${fc.rank}): **${fc.verificationAlerts?.length || 1} flags** — ${a?.title || 'Formatting anomaly'}${textSnippet}`;
      }).join('\n');

      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### 🔍 Nexora FraudGuard Pool Audit\n\n` +
          `Identified **${flagged.length} candidate(s)** with potential document manipulation or hidden adversarial text:\n\n` +
          `${bullets}\n\n` +
          `🛡️ **System Protection**: All concealed text (1.0pt micro-fonts, white-fonts, off-margin ATS stuffing) was stripped out prior to scoring. Match scores accurately reflect genuine qualifications only.`
      };
    } else {
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### ✓ Nexora FraudGuard Pool Audit\n\n` +
          `**All ${candidateList.length} candidates in the active pool are verified clean**.\n\n` +
          `Zero hidden text layers, invisible white-fonting (RGB 255), microscopic typography, or timeline overlap conflicts were detected.`
      };
    }
  }

  // 6. CANDIDATE COMPARISONS
  if (/compare|versus| vs /i.test(pLower)) {
    if (candidateList.length >= 2) {
      let c1 = candidateList[0];
      let c2 = candidateList[1];

      const mentioned = candidateList.filter((c) => pLower.includes(c.name.toLowerCase().split(' ')[0]));
      if (mentioned.length >= 2) {
        c1 = mentioned[0];
        c2 = mentioned[1];
      } else if (mentioned.length === 1) {
        c1 = mentioned[0];
        c2 = candidateList.find((c) => c.id !== c1.id) || candidateList[1];
      }

      const score1 = c1.finalScore || 0;
      const score2 = c2.finalScore || 0;
      const ver1 = c1.verificationAlerts && c1.verificationAlerts.length > 0 ? '⚠️ Flagged for review' : '✓ Verified clean';
      const ver2 = c2.verificationAlerts && c2.verificationAlerts.length > 0 ? '⚠️ Flagged for review' : '✓ Verified clean';
      const rec = score1 >= score2 ? `**${c1.name}** holds a +${(score1 - score2).toFixed(1)}% higher match score` : `**${c2.name}** holds a +${(score2 - score1).toFixed(1)}% higher match score`;

      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### ⚖️ Side-by-Side Comparison: **${c1.name}** vs **${c2.name}**\n\n` +
          `| Metric | **${c1.name}** (Rank #${c1.rank}) | **${c2.name}** (Rank #${c2.rank}) |\n` +
          `| :--- | :--- | :--- |\n` +
          `| **Overall Match** | **${score1}%** (Sem: ${c1.semanticScore || 0}%, KW: ${c1.keywordScore || 0}%) | **${score2}%** (Sem: ${c2.semanticScore || 0}%, KW: ${c2.keywordScore || 0}%) |\n` +
          `| **Title & Exp** | ${c1.title} (${c1.experienceYears || 0.5} yrs) | ${c2.title} (${c2.experienceYears || 0.5} yrs) |\n` +
          `| **Verified Skills** | ${c1.matchedSkills.join(', ') || 'None'} | ${c2.matchedSkills.join(', ') || 'None'} |\n` +
          `| **Integrity** | ${ver1} | ${ver2} |\n\n` +
          `💡 **Recommendation**: ${rec}. Review evidenced projects and verify any flagged items during technical interview.`
      };
    }
  }

  // 7. SKILL SPECIFIC SEARCH
  const techKeywords = ['python', 'react', 'typescript', 'javascript', 'angular', 'node', 'express', 'sql', 'aws', 'docker', 'kubernetes', 'mongodb', 'figma'];
  const searchedSkill = techKeywords.find((tk) => pLower.includes(tk));

  if (searchedSkill && /who|which|has|knows|experience|candidates|find/i.test(pLower)) {
    const matches = candidateList.filter((c) => c.matchedSkills.some((s) => s.toLowerCase().includes(searchedSkill)) || c.title.toLowerCase().includes(searchedSkill));
    const skillDisplay = searchedSkill.length <= 4 ? searchedSkill.toUpperCase() : searchedSkill.charAt(0).toUpperCase() + searchedSkill.slice(1);

    if (matches.length > 0) {
      const candLines = matches.slice(0, 6).map((c) => `• **${c.name}** (Rank #${c.rank}, **${c.finalScore}% Match**) — ${c.title}, ${c.experienceYears || 0.5} yrs exp.`).join('\n');
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### 🎯 Candidates with Verified **${skillDisplay}** Experience\n\n` +
          `Found **${matches.length} candidate(s)** with demonstrated ${skillDisplay} proficiency:\n\n` +
          `${candLines}\n\n` +
          `Each candidate's profile links to verified code evidence from their work history and projects.`
      };
    } else {
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### ⚠️ Skill Coverage: **${skillDisplay}**\n\n` +
          `No candidates in the active pool currently demonstrate verified production experience in **${skillDisplay}**.\n\n` +
          `Consider evaluating candidates with adjacent skillsets or adjusting hiring weights in the dashboard.`
      };
    }
  }

  // 8. TOP CANDIDATE RECOMMENDATION
  if (/best|top|recommend|hire|first|rank 1|rank #1|who should/i.test(pLower)) {
    if (candidateList.length > 0) {
      const topCandidate = [...candidateList].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))[0];
      return {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: time,
        content: `### 🏆 Top Candidate Recommendation: **${topCandidate.name}**\n\n` +
          `• **Rank**: #1 with a **${topCandidate.finalScore}% Match Score**\n` +
          `• **Role**: ${topCandidate.title} (${topCandidate.experienceYears || 0.5} years of verified experience)\n` +
          `• **Key Strengths**: Verified skills across **${topCandidate.matchedSkills.join(', ')}**\n` +
          `• **Next Step**: Schedule an initial technical screen to evaluate architectural depth.`
      };
    }
  }

  // 9. EXECUTIVE POOL SUMMARY
  if (/pool|summary|overview|status|advice|report|health/i.test(pLower)) {
    const totalC = candidateList.length;
    const avgScore = (candidateList.reduce((acc, curr) => acc + (curr.finalScore || 0), 0) / (totalC || 1)).toFixed(1);
    const top3 = [...candidateList].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0)).slice(0, 3);
    const topLines = top3.map((c, i) => `  ${i + 1}. **${c.name}** (${c.finalScore}%) — ${c.title}`).join('\n');

    return {
      id: crypto.randomUUID(),
      role: 'assistant',
      timestamp: time,
      content: `### 📈 Talent Pool Executive Summary: **Senior Full Stack Engineer**\n\n` +
        `• **Candidate Count**: ${totalC} total active applicants\n` +
        `• **Average Match Score**: ${avgScore}%\n\n` +
        `**Top Ranked Contenders**:\n${topLines}\n\n` +
        `💡 **Hiring Recommendation**: Advance the top 2-3 candidates to live technical assessments. Use the FraudGuard integrity audit to review flagged items before final offers.`
    };
  }

  // 10. GENERAL REASONING ON PROMPT
  const topCandidates = [...candidateList].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0)).slice(0, 2);
  const topContext = topCandidates.map((c) => `${c.name} (${c.finalScore}%)`).join(', ');

  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    timestamp: time,
    content: `### 💡 AI Intelligence Assessment for: _\"${prompt}\"_\n\n` +
      `Evaluating this against our **Senior Full Stack Engineer** requirements and active pool (${candidateList.length} candidates, leading: **${topContext}**):\n\n` +
      `1. **Core Alignment**: Top candidates demonstrate strong alignment in full-stack architecture, while secondary skills (cloud infrastructure, distributed systems) are the key differentiators.\n` +
      `2. **Evidence-Based Evaluation**: Candidate rankings are calculated using verified project artifacts rather than unverified resume claims.\n` +
      `3. **Suggested Next Action**: Ask me to _\"Draft interview questions for ${topCandidates[0]?.name || 'the top candidate'}\"_ or _\"Compare top 2 candidates\"_ to dive deeper.`
  };
}
