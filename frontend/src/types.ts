export type AnalysisStatus = 'draft' | 'processing' | 'completed' | 'failed';

export type SkillPriority = 'required' | 'preferred';

export type EvidenceLevel = 'strong' | 'moderate' | 'limited' | 'not_found';

export interface SkillEvidence {
  skill: string;
  priority: SkillPriority;
  level: EvidenceLevel;
  details: string[];
  yearsOfExperience?: number;
  inProjects?: boolean;
  inSkillsSection?: boolean;
  inWorkHistory?: boolean;
}

export type VerificationStatus = 'verified' | 'review_recommended' | 'unverified';

export interface VerificationAlert {
  id: string;
  type: 'timeline_overlap' | 'unusual_gap' | 'unverified_credential' | 'white_font' | 'tiny_text' | 'off_margin_text' | 'hidden_behind_image' | 'formatting_anomaly';
  severity: 'warning' | 'info' | 'high' | 'critical' | 'low';
  title: string;
  message: string;
  timelineDetails?: string;
  pageNumber?: number;
  confidenceScore?: number;
  detectedValue?: string;
  expectedValue?: string;
  boundingBox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    width: number;
    height: number;
  };
  evidence?: Record<string, any>;
  reviewRecommended: boolean;
  impactOnScore: 0; // Explicitly zero: verification alerts never reduce candidate fit scores
}

export interface FraudFinding {
  id: string;
  fraudType: 'white_font' | 'tiny_text' | 'off_margin_text' | 'hidden_behind_image' | 'suspicious_formatting' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  pageNumber: number;
  description: string;
  extractedText: string;
  detectedValue: string;
  expectedValue: string;
  boundingBox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    width: number;
    height: number;
  };
  evidence?: Record<string, any>;
}

export interface FraudReport {
  fraudDetected: boolean;
  riskScore: number; // 0 - 100
  confidenceScore: number;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  scanSummary: string;
  findings: FraudFinding[];
}

export interface ResumeDocument {
  id: string;
  fileName: string;
  fileUrl?: string;
  fileType: string; // 'pdf' | 'docx' | 'txt'
  fileSize?: number;
  fileBlob?: Blob;
  uploadedAt: string;
  parsingStatus?: 'pending' | 'completed' | 'failed';
  fraudReport?: FraudReport;
}

export interface JobSkill {
  name: string;
  priority: SkillPriority;
  category: 'technical' | 'frontend' | 'backend' | 'database' | 'cloud' | 'architecture';
  matchingCount: number;
  missingCount: number;
}

export interface CandidateProject {
  title: string;
  description: string;
  technologies: string[];
  relevanceToJd?: 'High' | 'Moderate' | 'Low';
  period?: string;
  contribution?: string;
  link?: string;
  github?: string;
  demoUrl?: string;
}

export interface CandidateExperience {
  company?: string;
  organization?: string;
  role: string;
  period: string;
  isInternship?: boolean;
  isOverlap?: boolean;
  relevanceToJd?: 'High' | 'Moderate' | 'Low';
  technologies?: string[];
  highlights?: string[];
}

export interface CandidateEducation {
  degree: string;
  institution: string;
  year?: string;
  cgpa?: number | string;
  cgpaScale?: number;
  details?: string;
}

export interface CandidateLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface ExternalEvidence {
  githubRepos?: string[];
  detectedTech?: string[];
  profileHealth?: string;
}

export interface ScoreBreakdown {
  semanticMatch: number;      // Max 35
  keywordMatch: number;       // Max 25
  experienceScore: number;    // Max 15
  projectsScore: number;      // Max 15
  educationScore: number;     // Max 10
  totalScore: number;         // Max 100
}

export type CandidateStage =
  | 'SCREENING'
  | 'SHORTLISTED'
  | 'ASSESSMENT_PENDING'
  | 'ASSESSMENT_SENT'
  | 'ASSESSMENT_STARTED'
  | 'ASSESSMENT_SUBMITTED'
  | 'ASSESSMENT_EVALUATED'
  | 'HR_REVIEW'
  | 'HR_SELECTED'
  | 'ROUND_3'
  | 'REJECTED';

export type AssessmentStatus =
  | 'no_assessment'
  | 'invited'
  | 'in_progress'
  | 'pending_evaluation'
  | 'evaluation_available'
  | 'unknown';

export interface AssessmentInvite {
  candidateId: string;
  assessmentId: number;
  inviteId: number;
  token: string;
  status: string;
  inviteUrl: string | null;
  scheduledAt?: string;
  scheduledDurationMinutes?: number;
  inviteSentAt?: string;
  candidateEmail?: string;
}

export interface AssessmentEvaluation {
  id?: number | null;
  submissionId?: number | null;
  correctnessScore?: number | null;
  efficiencyScore?: number | null;
  codeQualityScore?: number | null;
  overallScore?: number | null;
  isCorrect?: boolean | null;
  timeComplexity?: string | null;
  spaceComplexity?: string | null;
  strengths: string[];
  detectedIssues: string[];
  improvements: string[];
  explanation?: string | null;
}

export interface AssessmentSubmission {
  id: number;
  inviteId: number;
  questionId: number;
  code: string;
  language: string;
  status: string;
  stdout?: string | null;
  stderr?: string | null;
  executionTimeMs?: number | null;
  evaluation?: AssessmentEvaluation | null;
}

export interface AssessmentResult {
  profileId: string;
  status: AssessmentStatus;
  overallScore?: number | null;
  submissions: AssessmentSubmission[];
  invite?: {
    id: number;
    testId: number;
    candidateName: string;
    candidateEmail: string;
    profileId?: string | null;
    token: string;
    status: string;
  } | null;
  assessment?: {
    id: number;
    title: string;
    description?: string | null;
    interviewerId: number;
  } | null;
  questions: {
    id: number;
    testId: number;
    questionText: string;
    language: string;
  }[];
}

export interface EvidenceItem {
  evidenceId: string;
  source: string;
  category: string;
  claim: string;
  value: string;
  score?: number | null;
  confidence?: number | null;
  provenance?: Record<string, any>;
}

export interface CandidateEvidence {
  candidateId: string;
  candidateName: string;
  resumeEvidence: EvidenceItem[];
  rankingEvidence?: Record<string, any> | null;
  assessmentEvidence: EvidenceItem[];
  comparisonEvidence: EvidenceItem[];
  evidenceReferences: string[];
  missingEvidence?: Record<string, any>[];
  overallConfidence?: number | null;
}

export interface HRDecision {
  decision: 'HR_SELECTED' | 'REJECTED';
  reason?: string | null;
}

export interface Candidate {
  id: string;
  jobId?: string;
  name: string;
  title: string;
  email: string;
  phone?: string;
  location: string;
  rank: number;
  
  // Score details (Nullable when AI analysis has not been executed)
  finalScore?: number;
  semanticScore?: number;
  keywordScore?: number;
  semanticScoreWeight?: number;
  keywordScoreWeight?: number;
  experienceScoreWeight?: number;
  projectScoreWeight?: number;
  educationScoreWeight?: number;
  scoreBreakdown?: ScoreBreakdown;
  analysisPending?: boolean;

  requiredSkillsMatched: number;
  requiredSkillsTotal: number;
  preferredSkillsMatched: number;
  preferredSkillsTotal: number;
  matchedSkills: string[];
  missingSkills: string[];
  skillEvidence: Record<string, SkillEvidence>;
  explanation: string;
  summary?: string;
  skills?: string[];
  experience: string;
  experienceYears: number;

  // Candidate dimension details
  cgpa?: number;
  cgpaScale?: number;
  totalInternships?: number;
  relevantInternships?: number;
  relevantExperienceYears?: number;
  totalProjects?: number;
  relevantProjectsCount?: number;

  education: CandidateEducation[];
  projects: CandidateProject[];
  workHistory: CandidateExperience[];
  links: CandidateLinks;
  externalEvidence?: ExternalEvidence;
  verificationAlerts: VerificationAlert[];
  verificationStatus: VerificationStatus;
  currentStage?: CandidateStage;
  assessment?: AssessmentInvite | null;
  assessmentStatus?: AssessmentStatus;
  assessmentResult?: AssessmentResult | null;
  evidence?: CandidateEvidence | null;
  hrDecision?: HRDecision | null;
  
  // Assessment Code Submission
  submittedCode?: string;
  submittedLanguage?: string;
  submittedAt?: string;
  
  // Resume File
  resume?: ResumeDocument;
  appliedAt?: string;
  claimsVsEvidence?: { claim: string; evidenceFound: string; strength: 'Strong' | 'Moderate' | 'Limited' | 'Not Found' }[];
  evidenceIntegrity?: {
    coveragePercent: number;
    skillEvidenceLevel: 'Strong' | 'Moderate' | 'Limited';
    projectEvidenceLevel: 'Strong' | 'Moderate' | 'Limited';
    experienceEvidenceLevel: 'Strong' | 'Moderate' | 'Limited';
    claimSpecificity: 'High' | 'Moderate' | 'Limited';
    timelineConsistency: 'Verified' | 'Review Recommended';
    aiWritingSignal: 'Low' | 'Moderate' | 'Insufficient Evidence';
  };
}

export interface JobOpening {
  id: string;
  title: string;
  department?: string;
  location?: string;
  employmentType?: string; // 'Full-time' | 'Part-time' | 'Contract' | 'Remote'
  description: string;
  requirements?: string;
  responsibilities?: string;
  skillsRequired: string[];
  preferredSkills?: string[];
  experienceMinYears?: number;
  experienceMaxYears?: number;
  status: 'open' | 'closed' | 'draft';
  candidateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Analysis {
  id: string;
  jobId?: string;
  jobTitle: string;
  jobDescriptionFileName: string;
  candidateCount: number;
  status: AnalysisStatus;
  createdAt: string;
  requiredSkills: JobSkill[];
  candidates: Candidate[];
}

export interface HiringWeights {
  frontend: number; // 0-100
  backend: number; // 0-100
  cloud: number; // 0-100
  experience: number; // 0-100
  projects: number; // 0-100
  requiredSkills: number; // 0-100
  education: number; // 0-100
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface HiringWeights {
  frontend: number; // 0-100
  backend: number; // 0-100
  cloud: number; // 0-100
  experience: number; // 0-100
  projects: number; // 0-100
  requiredSkills: number; // 0-100
}
