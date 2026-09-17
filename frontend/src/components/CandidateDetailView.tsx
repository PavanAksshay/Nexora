import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  GraduationCap,
  Briefcase,
  ExternalLink,
  Globe,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Code2,
  Eye,
  Clock,
  Layers,
  Check,
  AlertCircle,
  ChevronDown,
  XCircle,
  Calendar,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import type { AssessmentResult, Candidate, CandidateEvidence, SkillEvidence } from '../types';
import {
  generateAndSendAssessment,
  getAssessmentResult,
  getAssessmentStatus,
  getCandidateEvidence,
  submitHrDecision,
  type GeneratedAssessmentResponse,
} from '../services/api';
import { store } from '../services/store';
import { ResumeViewerModal } from './ResumeViewerModal';

interface CandidateDetailViewProps {
  candidate: Candidate;
  onCompareWithAnother?: (candidate: Candidate) => void;
  onBack?: () => void;
}

export function CandidateDetailView({ candidate, onCompareWithAnother, onBack }: CandidateDetailViewProps) {
  const navigate = useNavigate();
  const [localCandidate, setLocalCandidate] = useState(candidate);
  const [skillFilter, setSkillFilter] = useState<'all' | 'matched' | 'missing'>('all');
  const [showRequiredSkillsDropdown, setShowRequiredSkillsDropdown] = useState(false);
  const [showResumeViewer, setShowResumeViewer] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(candidate.assessmentResult || null);
  const [evidence, setEvidence] = useState<CandidateEvidence | null>(candidate.evidence || null);
  const [downstreamLoading, setDownstreamLoading] = useState(false);
  const [downstreamError, setDownstreamError] = useState<string | null>(null);
  const [hrLoading, setHrLoading] = useState(false);

  // Assessment generation state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [generatedAssessment, setGeneratedAssessment] = useState<GeneratedAssessmentResponse | null>(null);

  const c = localCandidate;

  const handleShortlist = () => {
    const updated = store.shortlistCandidate(c.id);
    setLocalCandidate(updated);
    toast.success(`${c.name} has been shortlisted.`);
  };

  const handleGenerateAndSendAssessment = async () => {
    setIsSendingInvite(true);
    setDownstreamError(null);
    try {
      const result = await generateAndSendAssessment(c.id);
      setGeneratedAssessment(result);
      const inviteUrl = result.invite_url || (result.token ? `${window.location.origin}/candidate/${result.token}` : null);
      const updated: Candidate = {
        ...c,
        currentStage: 'ASSESSMENT_SENT',
        assessmentStatus: 'invited',
        assessment: {
          candidateId: c.id,
          assessmentId: result.assessment_id,
          inviteId: result.invite_id,
          token: result.token,
          status: result.status,
          inviteUrl,
          candidateEmail: result.email?.recipient || c.email,
        },
      };
      setLocalCandidate(updated);
      toast.success(`Technical Assessment created & invitation email sent to ${result.email?.recipient || c.email}!`);
    } catch (err: any) {
      console.error('Failed to generate & send assessment:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Failed to generate assessment.';
      setDownstreamError(`Assessment generation failed: ${detail}`);
      toast.error(`Assessment creation failed: ${detail}`);
    } finally {
      setIsSendingInvite(false);
    }
  };

  const isPending = c.analysisPending;

  useEffect(() => {
    const fresh = store.getCandidate(candidate.id) || candidate;
    setLocalCandidate(fresh);
    setAssessment(fresh.assessmentResult || null);
    setEvidence(fresh.evidence || null);
  }, [candidate]);

  const refreshDownstream = async () => {
    if (!c.currentStage || c.currentStage === 'SCREENING' || c.currentStage === 'SHORTLISTED') {
      return;
    }
    setDownstreamLoading(true);
    setDownstreamError(null);
    try {
      const status = await getAssessmentStatus(c.id);
      setAssessment(status);
      setLocalCandidate((prev) => ({ ...prev, assessmentStatus: status.status }));
      if (status.status === 'evaluation_available') {
        const [result, candidateEvidence] = await Promise.all([
          getAssessmentResult(c.id),
          getCandidateEvidence(c.id),
        ]);
        setAssessment(result);
        setEvidence(candidateEvidence);
        setLocalCandidate((prev) => ({
          ...prev,
          assessmentStatus: result.status,
          assessmentResult: result,
          evidence: candidateEvidence,
          currentStage: prev.currentStage === 'ASSESSMENT_EVALUATED' ? 'HR_REVIEW' : prev.currentStage,
        }));
      }
    } catch (err) {
      console.error('Failed to load downstream assessment data:', err);
      setDownstreamError('Assessment data is currently unavailable.');
    } finally {
      setDownstreamLoading(false);
    }
  };

  useEffect(() => {
    void refreshDownstream();
  }, [c.id, c.currentStage]);

  useEffect(() => {
    if (!c.currentStage || !['ASSESSMENT_SENT', 'ASSESSMENT_STARTED', 'ASSESSMENT_SUBMITTED'].includes(c.currentStage)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshDownstream();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [c.id, c.currentStage]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const formatFraudTitle = (type?: string): string => {
    switch (type) {
      case 'white_font': return 'Invisible White-Font Layer (RGB 255)';
      case 'tiny_text': return '1.0pt Micro-Font ATS Keyword Injection';
      case 'off_margin_text': return 'Off-Margin Injected Metadata';
      case 'hidden_behind_image': return 'Text Hidden Behind Image Layer';
      case 'prompt_injection': return 'Adversarial Prompt Injection Attempt';
      default: return 'Formatting Anomaly Detected';
    }
  };

  const evidenceLevelBadge = (level: SkillEvidence['level']) => {
    switch (level) {
      case 'strong':
        return <span className="evidence-badge strong"><CheckCircle2 size={12} /> Strong Evidence</span>;
      case 'moderate':
        return <span className="evidence-badge moderate"><Sparkles size={12} /> Moderate Evidence</span>;
      case 'limited':
        return <span className="evidence-badge limited"><AlertTriangle size={12} /> Limited Evidence</span>;
      default:
        return <span className="evidence-badge not-found">Skill Not Detected</span>;
    }
  };

  // Build or retrieve skill evidence entries
  const getComputedSkillEvidence = (): Record<string, SkillEvidence> => {
    if (c.skillEvidence && Object.keys(c.skillEvidence).length > 0) {
      return c.skillEvidence;
    }
    const computed: Record<string, SkillEvidence> = {};
    const matched = c.matchedSkills || [];
    const missing = c.missingSkills || [];
    const all = Array.from(new Set([...matched, ...missing]));

    for (const skill of all) {
      const isMatched = matched.includes(skill);
      computed[skill] = {
        skill,
        level: isMatched ? 'strong' : 'not_found',
        priority: 'required',
        details: isMatched
          ? [`Evidenced in candidate profile and projects.`]
          : [`Not detected in verified experience (hidden/fraudulent mentions excluded).`],
        inProjects: isMatched,
        inWorkHistory: isMatched,
        yearsOfExperience: isMatched ? c.experienceYears : undefined
      };
    }
    return computed;
  };

  const skillEvidenceMap = getComputedSkillEvidence();
  const skillEntries = Object.entries(skillEvidenceMap);

  const jobRequiredSkills = Array.from(
    new Set([...(c.matchedSkills || []), ...(c.missingSkills || [])])
  );
  const candidateResumeSkills: string[] = (c.matchedSkills && c.matchedSkills.length > 0)
    ? c.matchedSkills
    : skillEntries.filter(([_, e]) => e.level !== 'not_found').map(([s]) => s);

  const alerts = c.verificationAlerts || [];
  const isSuspicious = alerts.length > 0 || c.verificationStatus === 'review_recommended';
  const latestEvaluation = assessment?.submissions.find((submission) => submission.evaluation)?.evaluation;

  const handleHrDecision = async (decision: 'HR_SELECTED' | 'REJECTED') => {
    const isRound3 = decision === 'HR_SELECTED';
    const reason = window.prompt(
      isRound3 ? 'Reason for selecting this candidate for Round 3?' : 'Reason for rejecting this candidate?',
      latestEvaluation?.explanation || ''
    );
    if (reason === null) return;
    setHrLoading(true);
    setDownstreamError(null);
    try {
      const updated = await submitHrDecision(c.id, decision, reason);
      setLocalCandidate((prev) => ({
        ...prev,
        ...updated,
        currentStage: isRound3 ? 'ROUND_3' : 'REJECTED',
      }));
      if (isRound3) {
        toast.success(`Candidate ${c.name} selected for Round 3! Automatic interview invitation email sent.`);
      } else {
        toast.info(`Candidate ${c.name} rejected.`);
      }
    } catch (err: any) {
      console.error('Failed to submit HR decision:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Could not submit HR decision.';
      setDownstreamError(detail);
      toast.error(detail);
    } finally {
      setHrLoading(false);
    }
  };

  return (
    <div className="candidate-detail-container">
      {/* Top Breadcrumb & Action Bar */}
      <div className="detail-top-bar">
        <button type="button" className="back-link-btn" onClick={handleBack}>
          <ArrowLeft size={16} /> Back to candidates
        </button>
        <div className="detail-actions-right">
          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            onClick={() => setShowResumeViewer(true)}
          >
            <Eye size={15} /> View Uploaded Resume
          </button>
          {onCompareWithAnother && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onCompareWithAnother(c)}
            >
              Compare Candidate
            </button>
          )}
        </div>
      </div>

      <div className="content-card" style={{ marginBottom: '16px' }}>
        <div className="card-heading-bar">
          <div>
            <h2>Assessment & HR Review</h2>
            <p>Current stage: <b>{(c.currentStage || 'SCREENING').replace(/_/g, ' ')}</b></p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void refreshDownstream()}
            disabled={downstreamLoading}
          >
            {downstreamLoading ? <Clock size={13} /> : <FileText size={13} />} Refresh
          </button>
        </div>

        {downstreamError && (
          <div className="alert-item" style={{ marginBottom: '12px' }}>
            <b className="alert-title">Downstream action failed</b>
            <p className="alert-message">{downstreamError}</p>
          </div>
        )}

        <div className="skill-ratio-grid">
          <div className="ratio-card">
            <span>Assessment Status</span>
            <b>{assessment?.status?.replace(/_/g, ' ') || c.assessmentStatus?.replace(/_/g, ' ') || 'Not sent'}</b>
          </div>
          <div className="ratio-card">
            <span>Overall Assessment</span>
            <b>{assessment?.overallScore != null ? `${assessment.overallScore.toFixed(1)}%` : 'Pending'}</b>
          </div>
          <div className="ratio-card">
            <span>Invite</span>
            {c.assessment?.inviteUrl ? (
              <a href={c.assessment.inviteUrl} target="_blank" rel="noreferrer">Open invite</a>
            ) : (
              <b>{assessment?.invite?.token || c.assessment?.token || 'Unavailable'}</b>
            )}
          </div>
        </div>

        {latestEvaluation && (
          <div className="match-breakdown-box" style={{ marginTop: '14px' }}>
            <div className="breakdown-row">
              <div className="breakdown-label"><span>Correctness</span><b>{latestEvaluation.correctnessScore ?? 'N/A'}%</b></div>
              <div className="breakdown-label"><span>Efficiency</span><b>{latestEvaluation.efficiencyScore ?? 'N/A'}%</b></div>
              <div className="breakdown-label"><span>Code Quality</span><b>{latestEvaluation.codeQualityScore ?? 'N/A'}%</b></div>
              <small className="breakdown-desc">
                Complexity: {latestEvaluation.timeComplexity || 'N/A'} time, {latestEvaluation.spaceComplexity || 'N/A'} space
              </small>
            </div>
            {latestEvaluation.strengths.length > 0 && <p><b>Strengths:</b> {latestEvaluation.strengths.join(', ')}</p>}
            {latestEvaluation.detectedIssues.length > 0 && <p><b>Issues:</b> {latestEvaluation.detectedIssues.join(', ')}</p>}
            {latestEvaluation.improvements.length > 0 && <p><b>Improvements:</b> {latestEvaluation.improvements.join(', ')}</p>}
          </div>
        )}

        {(c.submittedCode || assessment?.submissions?.[0]?.code) && (
          <div style={{ marginTop: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#FAFAFB', borderBottom: '1px solid var(--border-color)', fontSize: '12px', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Code2 size={14} />
                <span>Candidate Submitted Code ({c.submittedLanguage || assessment?.submissions?.[0]?.language || 'Python'})</span>
              </div>
              {c.submittedAt && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Submitted {new Date(c.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <pre style={{ margin: 0, padding: '14px', backgroundColor: '#09090b', color: '#F4F4F5', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.55, overflowX: 'auto', maxHeight: '280px' }}>
              <code>{c.submittedCode || assessment?.submissions?.[0]?.code}</code>
            </pre>
          </div>
        )}

        {evidence && (
          <div className="projects-timeline" style={{ marginTop: '14px' }}>
            {[...evidence.assessmentEvidence, ...evidence.comparisonEvidence].slice(0, 6).map((item) => (
              <div key={item.evidenceId} className="project-card">
                <div className="project-top">
                  <h4>{item.claim}</h4>
                  <span className="project-period">{item.source}</span>
                </div>
                <p className="project-desc">{item.value}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px', alignItems: 'center' }}>
          {(!c.currentStage || c.currentStage === 'SCREENING') && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleShortlist}
            >
              <CheckCircle2 size={14} /> Shortlist Candidate
            </button>
          )}

          {c.currentStage === 'SHORTLISTED' && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSendingInvite}
              onClick={() => setShowScheduleModal(true)}
            >
              <Sparkles size={14} /> Generate & Send Technical Assessment
            </button>
          )}

          {c.currentStage === 'ASSESSMENT_SENT' && (
            <>
              {c.assessment?.inviteUrl && (
                <a
                  href={c.assessment.inviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <ExternalLink size={14} /> Open Candidate Assessment Link
                </a>
              )}
              <span className="status-badge-inline status-strong">
                <Clock size={12} /> Assessment Invitation Dispatched
              </span>
            </>
          )}

          {(c.currentStage === 'HR_REVIEW' || c.currentStage === 'ASSESSMENT_EVALUATED' || c.currentStage === 'ASSESSMENT_SUBMITTED') && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                disabled={hrLoading}
                onClick={() => void handleHrDecision('HR_SELECTED')}
              >
                <CheckCircle2 size={14} /> Select for Round 3
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={hrLoading}
                onClick={() => void handleHrDecision('REJECTED')}
              >
                <AlertCircle size={14} /> Reject
              </button>
            </>
          )}

          {(c.currentStage === 'HR_SELECTED' || c.currentStage === 'ROUND_3') && (
            <span className="status-badge-inline status-strong" style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}>
              <CheckCircle2 size={14} /> Candidate Selected for Round 3
            </span>
          )}

          {c.currentStage === 'REJECTED' && (
            <span className="status-badge-inline status-flagged" style={{ backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
              <XCircle size={14} /> Candidate Rejected
            </span>
          )}
        </div>
      </div>

      {/* Main Three-Column Layout */}
      <div className="candidate-three-col-layout">
        {/* =========================================================================
            COLUMN 1: CANDIDATE PROFILE & CONTACT
            ========================================================================= */}
        <aside className="col-profile">
          <div className="profile-card">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-xl">
                {c.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <span className="profile-rank-chip">Rank #{c.rank}</span>
            </div>

            <h1 className="profile-name">{c.name}</h1>
            <p className="profile-role">{c.title}</p>

            <div className="profile-quick-meta">
              <div className="meta-item">
                <MapPin size={14} />
                <span>{c.location}</span>
              </div>
              <div className="meta-item">
                <Briefcase size={14} />
                <span>{c.experienceYears ? `${c.experienceYears} Years Experience` : 'Experience on file'}</span>
              </div>
            </div>

            {/* Resume Attachment Box */}
            <div className="resume-attachment-box">
              <div className="resume-attachment-head">
                <span className="resume-attachment-label">Resume Attachment</span>
                <span className="resume-filetype-badge">
                  {(c.resume?.fileType || 'PDF').toUpperCase()}
                </span>
              </div>
              <p className="resume-filename">
                {c.resume?.fileName || `${c.name}_Resume.pdf`}
              </p>
              <button
                type="button"
                onClick={() => setShowResumeViewer(true)}
                className="resume-doc-btn"
              >
                <Eye size={14} /> Open Document Viewer
              </button>
            </div>

            <hr className="profile-divider" />

            <div className="contact-section">
              <h4>Contact Information</h4>
              <div className="contact-list">
                <a href={`mailto:${c.email}`} className="contact-link">
                  <Mail size={14} />
                  <span>{c.email}</span>
                </a>
                {c.phone && (
                  <div className="contact-link">
                    <Phone size={14} />
                    <span>{c.phone}</span>
                  </div>
                )}
              </div>
            </div>

            <hr className="profile-divider" />

            <div className="links-section">
              <h4>Professional Links</h4>
              <div className="social-links-grid">
                {c.links?.linkedin ? (
                  <a
                    href={c.links.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="social-btn"
                  >
                    <ExternalLink size={15} />
                    <span>LinkedIn</span>
                    <ExternalLink size={12} className="ext-icon" />
                  </a>
                ) : (
                  <span className="social-btn disabled">
                    <ExternalLink size={15} />
                    <span>LinkedIn Profile</span>
                  </span>
                )}

                {c.links?.github ? (
                  <a
                    href={c.links.github}
                    target="_blank"
                    rel="noreferrer"
                    className="social-btn"
                  >
                    <Code2 size={15} />
                    <span>GitHub</span>
                    <ExternalLink size={12} className="ext-icon" />
                  </a>
                ) : (
                  <span className="social-btn disabled">
                    <Code2 size={15} />
                    <span>GitHub Profile</span>
                  </span>
                )}

                {c.links?.portfolio && (
                  <a
                    href={c.links.portfolio}
                    target="_blank"
                    rel="noreferrer"
                    className="social-btn full-width"
                  >
                    <Globe size={15} />
                    <span>Portfolio</span>
                    <ExternalLink size={12} className="ext-icon" />
                  </a>
                )}
              </div>
            </div>

            <hr className="profile-divider" />

            <div className="education-section">
              <h4>
                <GraduationCap size={15} /> Education
              </h4>
              {c.education && c.education.length > 0 ? (
                c.education.map((edu, idx) => (
                  <div key={idx} className="edu-entry">
                    <b>{edu.degree}</b>
                    <div className="edu-school">{edu.institution}</div>
                    <div className="edu-year">
                      {edu.year || ''}
                      {edu.details && (!edu.year || !edu.year.includes(edu.details)) ? (edu.year ? ` · ${edu.details}` : edu.details) : ''}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 italic">Education details on file in attached resume.</p>
              )}
            </div>
          </div>
        </aside>

        {/* =========================================================================
            COLUMN 2: SKILLS & EXPERIENCE EVIDENCE
            ========================================================================= */}
        <section className="col-skills-experience">
          {/* Section: Technical Skills */}
          <div className="content-card">
            <div className="card-heading-bar" style={{ position: 'relative' }}>
              <div>
                <h2>Technical Skills (Candidate Profile)</h2>
                <p>Verified skills directly detected in candidate's resume and verified work history.</p>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowRequiredSkillsDropdown((prev) => !prev)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    padding: '6px 12px',
                    backgroundColor: showRequiredSkillsDropdown ? 'var(--bg-subtle-hover)' : 'var(--bg-surface)',
                  }}
                >
                  <FileText size={13} />
                  <span>Job Required Skills ({jobRequiredSkills.length})</span>
                  <ChevronDown
                    size={13}
                    style={{
                      transform: showRequiredSkillsDropdown ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>

                {showRequiredSkillsDropdown && (
                  <div className="required-skills-dropdown-popover">
                    <div className="dropdown-popover-header">
                      <div>
                        <strong>Job Requirements</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {c.matchedSkills?.length || 0} of {jobRequiredSkills.length} skills matched
                        </div>
                      </div>
                      <span className="dropdown-match-badge">
                        {Math.round(((c.matchedSkills?.length || 0) / Math.max(1, jobRequiredSkills.length)) * 100)}% Match
                      </span>
                    </div>
                    <div className="dropdown-skills-list">
                      {jobRequiredSkills.map((skill) => {
                        const isMatched = (c.matchedSkills || []).includes(skill);
                        return (
                          <div key={skill} className={`dropdown-skill-row ${isMatched ? 'matched' : 'missing'}`}>
                            <div className="dropdown-skill-left">
                              {isMatched ? (
                                <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                              ) : (
                                <XCircle size={13} style={{ color: 'var(--text-light)', flexShrink: 0 }} />
                              )}
                              <span className="dropdown-skill-name">{skill}</span>
                            </div>
                            <span className={`dropdown-skill-pill ${isMatched ? 'evidenced' : 'gap'}`}>
                              {isMatched ? 'Present' : 'Missing'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {candidateResumeSkills.length > 0 ? (
              <div className="candidate-skills-compact-grid">
                {candidateResumeSkills.map((skillName) => {
                  const ev = skillEvidenceMap[skillName];
                  return (
                    <div key={skillName} className="candidate-skill-compact-badge">
                      <div className="skill-badge-top">
                        <span className="skill-badge-title">{skillName}</span>
                        <span className="skill-badge-status">
                          <CheckCircle2 size={11} /> Verified
                        </span>
                      </div>
                      <div className="skill-badge-bottom">
                        {ev?.yearsOfExperience ? (
                          <span className="skill-badge-tag">{ev.yearsOfExperience}y exp</span>
                        ) : (
                          <span className="skill-badge-tag">Evidenced</span>
                        )}
                        {ev?.inProjects && <span className="skill-badge-tag">Projects</span>}
                        {ev?.inWorkHistory && <span className="skill-badge-tag">Experience</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center bg-subtle" style={{ borderRadius: 'var(--radius-xs)', padding: '16px' }}>
                <Clock size={20} className="text-muted" style={{ margin: '0 auto 6px' }} />
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No skills parsed on resume yet.</p>
              </div>
            )}
          </div>

          {/* Section: Project Evidence */}
          <div className="content-card">
            <div className="card-heading-bar">
              <div>
                <h2>
                  <Layers size={18} /> Project Evidence
                </h2>
                <p>Demonstrated hands-on architectural and coding accomplishments.</p>
              </div>
            </div>

            {c.projects && c.projects.length > 0 ? (
              <div className="projects-timeline">
                {c.projects.map((proj, pIdx) => (
                  <div key={pIdx} className="project-card">
                    <div className="project-top">
                      <h4>{proj.title}</h4>
                      {proj.period && <span className="project-period">{proj.period}</span>}
                    </div>
                    <p className="project-desc">{proj.description}</p>
                    {proj.technologies && proj.technologies.length > 0 && (
                      <div className="tech-tags">
                        {proj.technologies.map((t) => (
                          <span key={t} className="tech-tag">
                            <Code2 size={11} /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {(proj.link || proj.github || proj.demoUrl || c.links?.github) && (
                      <div className="project-links-row" style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        {(proj.link || proj.github) && (
                          <a
                            href={proj.link || proj.github}
                            target="_blank"
                            rel="noreferrer"
                            className="project-link-badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '11.5px',
                              padding: '3px 8px',
                              borderRadius: 'var(--radius-xs)',
                              backgroundColor: 'var(--bg-subtle)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-color)',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            <Globe size={11} />
                            <span>Repository</span>
                            <ExternalLink size={10} style={{ opacity: 0.7 }} />
                          </a>
                        )}
                        {proj.demoUrl && (
                          <a
                            href={proj.demoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="project-link-badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '11.5px',
                              padding: '3px 8px',
                              borderRadius: 'var(--radius-xs)',
                              backgroundColor: 'var(--bg-subtle)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-color)',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            <Globe size={11} />
                            <span>Live Demo</span>
                            <ExternalLink size={10} style={{ opacity: 0.7 }} />
                          </a>
                        )}
                        {!proj.link && !proj.github && !proj.demoUrl && c.links?.github && (
                          <a
                            href={`${c.links.github}/${proj.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="project-link-badge"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '11.5px',
                              padding: '3px 8px',
                              borderRadius: 'var(--radius-xs)',
                              backgroundColor: 'var(--bg-subtle)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-color)',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            <Globe size={11} />
                            <span>View Project Repo</span>
                            <ExternalLink size={10} style={{ opacity: 0.7 }} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-4">Projects will be indexed once analysis is performed.</p>
            )}
          </div>

          {/* Section: Work Experience */}
          <div className="content-card">
            <div className="card-heading-bar">
              <div>
                <h2>
                  <Briefcase size={18} /> Experience Highlights
                </h2>
                <p>Commercial tenure and verified responsibilities.</p>
              </div>
            </div>

            {c.workHistory && c.workHistory.length > 0 ? (
              <div className="experience-list">
                {c.workHistory.map((job, jIdx) => (
                  <div key={jIdx} className="experience-card">
                    <div className="exp-top-row">
                      <div>
                        <b className="exp-role">{job.role}</b>
                        <div className="exp-company">{job.company || (job as any).organization}</div>
                      </div>
                      <div className="exp-period-wrap">
                        <span className="exp-period">{job.period}</span>
                      </div>
                    </div>
                    {job.highlights && job.highlights.length > 0 && (
                      <ul className="exp-highlights">
                        {job.highlights.map((h, hIdx) => (
                          <li key={hIdx}>{h}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-4">Detailed work history available in the attached resume document.</p>
            )}
          </div>
        </section>

        {/* =========================================================================
            COLUMN 3: JOB FIT & VERIFICATION ALERTS
            ========================================================================= */}
        <aside className="col-job-fit">
          {/* Main Fit Score Widget */}
          <div className="fit-score-card">
            <span className="fit-eyebrow">OVERALL CANDIDATE FIT</span>
            
            {isPending ? (
              <div className="py-6 text-center">
                <div className="text-3xl font-bold font-mono text-slate-400">—</div>
                <div className="text-xs font-semibold text-blue-400 mt-1 flex items-center justify-center gap-1">
                  <Clock size={13} />
                  Analysis Pending
                </div>
                <p className="text-[11px] text-slate-400 mt-2 max-w-[200px] mx-auto">
                  AI match score will be calculated once the intelligence engine runs.
                </p>
              </div>
            ) : (
              <>
                <div className="big-score-wrap">
                  <div className="big-score-number">{(c.finalScore || 0).toFixed(1)}%</div>
                  <div className="big-score-label">Final Match Score</div>
                </div>

                {/* Semantic vs Keyword Breakdown */}
                <div className="match-breakdown-box">
                  <div className="breakdown-row">
                    <div className="breakdown-label">
                      <span>Semantic Match</span>
                      <b>{c.semanticScore || 0}%</b>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill semantic"
                        style={{ width: `${c.semanticScore || 0}%` }}
                      />
                    </div>
                    <small className="breakdown-desc">Contextual alignment with role architecture</small>
                  </div>

                  <div className="breakdown-row">
                    <div className="breakdown-label">
                      <span>Keyword Match</span>
                      <b>{c.keywordScore || 0}%</b>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill keyword"
                        style={{ width: `${c.keywordScore || 0}%` }}
                      />
                    </div>
                    <small className="breakdown-desc">Direct technical term and skill detection</small>
                  </div>
                </div>

                {/* Required & Preferred Skills Counts */}
                <div className="skill-ratio-grid">
                  <div className="ratio-card">
                    <span>Required Skills</span>
                    <b>
                      {c.requiredSkillsMatched} / {c.requiredSkillsTotal}
                    </b>
                    <div className="ratio-status">
                      {c.requiredSkillsMatched === c.requiredSkillsTotal ? (
                        <span className="text-success">100% Coverage</span>
                      ) : (
                        <span>{Math.round((c.requiredSkillsMatched / (c.requiredSkillsTotal || 1)) * 100)}% Coverage</span>
                      )}
                    </div>
                  </div>

                  <div className="ratio-card">
                    <span>Preferred Skills</span>
                    <b>
                      {c.preferredSkillsMatched} / {c.preferredSkillsTotal}
                    </b>
                    <div className="ratio-status">
                      <span>{Math.round((c.preferredSkillsMatched / (c.preferredSkillsTotal || 1)) * 100)}% Coverage</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Matched Skills List */}
            {c.matchedSkills && c.matchedSkills.length > 0 && (
              <div className="skills-summary-box">
                <span className="summary-title">Matched Skills</span>
                <div className="skills-pill-wrap">
                  {c.matchedSkills.map((s) => (
                    <span key={s} className="matched-pill">
                      <CheckCircle2 size={12} /> {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* =========================================================================
              VERIFICATION CARD: FRAUD DETECTION OR VERIFIED INTEGRITY
              ========================================================================= */}
          <div className={`verification-card ${isSuspicious ? 'is-suspicious' : 'is-clean'}`}>
            <div className="verification-head">
              {isSuspicious ? (
                <div className="verif-title-wrap warning">
                  <ShieldAlert size={20} className="text-amber-500" />
                  <div>
                    <h4>Document Integrity Alert</h4>
                    <span className="verif-status-badge review">
                      Review Recommended ({alerts.length} Flagged)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="verif-title-wrap verified">
                  <ShieldCheck size={20} className="text-emerald-500" />
                  <div>
                    <h4>Verified Document Integrity</h4>
                    <span className="verif-status-badge ok">
                      ✓ Verified · No Anomalies Detected
                    </span>
                  </div>
                </div>
              )}
            </div>

            {isSuspicious ? (
              <div className="alert-content-body">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5">
                  <b>Anomaly Warning:</b> Concealed text, typography manipulations, or adversarial prompt injections were identified in this document. These items were purged prior to candidate ranking.
                </p>

                {alerts.map((alert: any, idx: number) => {
                  const fraudType = alert.type || alert.fraudType || 'formatting_anomaly';
                  const title = alert.title || formatFraudTitle(fraudType);
                  const message = alert.message || alert.description || alert.impact || 'Suspicious hidden content or formatting anomaly detected in document layer.';
                  const detected = alert.detectedValue || alert.detectedText || alert.extractedText || '';
                  const severity = alert.severity || 'warning';

                  return (
                    <div key={alert.id || idx} className="alert-item">
                      <div className="flex items-center justify-between mb-1">
                        <b className="alert-title">{title}</b>
                        <span className={`alert-severity-chip ${severity}`}>
                          {String(severity).toUpperCase()}
                        </span>
                      </div>
                      <p className="alert-message">{message}</p>
                      {detected && (
                        <div className="timeline-detail-box">
                          <small>Detected Hidden / Injected Content:</small>
                          <code>{detected}</code>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="score-independence-notice">
                  <div className="notice-icon">i</div>
                  <p>
                    <b>Scoring Policy:</b> The candidate fit score reflects only verified visible skills. Fraudulent keywords and fabricated claims have been excluded from calculations.
                  </p>
                </div>
              </div>
            ) : (
              <div className="verified-body">
                <p className="verified-main-desc">
                  This resume document successfully passed all Nexora automated fraud and formatting integrity checks.
                </p>
                <div className="verified-checklist">
                  <div className="check-item">
                    <Check size={14} className="text-emerald-600" />
                    <span>Standard Visible Typography (&ge; 8pt)</span>
                  </div>
                  <div className="check-item">
                    <Check size={14} className="text-emerald-600" />
                    <span>Document Margins & Printable Area Valid</span>
                  </div>
                  <div className="check-item">
                    <Check size={14} className="text-emerald-600" />
                    <span>Zero Invisible White-Font or Hidden Text Layers</span>
                  </div>
                  <div className="check-item">
                    <Check size={14} className="text-emerald-600" />
                    <span>Chronological Timeline & Experience Verified</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Resume Viewer Modal */}
      {showResumeViewer && (
        <ResumeViewerModal
          candidate={c}
          onClose={() => setShowResumeViewer(false)}
        />
      )}

      {/* Generate & Send Technical Assessment Modal */}
      {showScheduleModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '640px', width: '90%' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} className="text-primary" />
                <h3>Generate & Send Technical Assessment</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowScheduleModal(false)}
                disabled={isSendingInvite}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!generatedAssessment && !isSendingInvite && (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Click below to trigger 1-button AI assessment generation for <b>{c.name}</b>.
                  </p>
                  <div style={{ padding: '14px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                      <FileText size={14} /> Pipeline Input Verification:
                    </div>
                    <div>• <b>Candidate:</b> {c.name} ({c.email})</div>
                    <div>• <b>Job Description:</b> Resolved automatically from candidate analysis</div>
                    <div>• <b>Target Assessment Duration:</b> 60 minutes</div>
                    <div>• <b>Questions:</b> 2–3 technical questions customized to JD requirements</div>
                  </div>
                </>
              )}

              {isSendingInvite && (
                <div style={{ padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <Clock className="animate-spin text-primary" size={32} />
                  <h4 style={{ margin: 0, fontSize: '15px' }}>Generating Personalized Assessment...</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Synthesizing questions from JD and candidate resume, creating CodeAssess test, and dispatching invitation email.
                  </p>
                </div>
              )}

              {generatedAssessment && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ padding: '12px 16px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-xs)', color: '#065F46', fontSize: '13px' }}>
                    <b>✓ Assessment Generated & Invitation Email Dispatched!</b>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '15px' }}>{generatedAssessment.assessment.title}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Duration: <b>{generatedAssessment.assessment.duration_minutes} minutes</b> · Questions: <b>{generatedAssessment.assessment.questions.length}</b>
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Generated Questions:</span>
                    {generatedAssessment.assessment.questions.map((q, idx) => (
                      <div key={idx} style={{ padding: '10px 12px', backgroundColor: '#F8FAFC', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 600 }}>
                          <span>Q{idx + 1}: {q.skills.join(', ') || 'Coding Challenge'}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{q.estimate_minutes} min ({q.difficulty})</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{q.question_text}</p>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-xs)', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Candidate Unique Invite URL:</div>
                    <a
                      href={generatedAssessment.invite_url || `/candidate/${generatedAssessment.token}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--primary-color)', wordBreak: 'break-all', fontWeight: 500 }}
                    >
                      {generatedAssessment.invite_url || `http://localhost:5173/candidate/${generatedAssessment.token}`}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '12px 20px', borderTop: '1px solid var(--border-color)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowScheduleModal(false);
                  setGeneratedAssessment(null);
                }}
                disabled={isSendingInvite}
              >
                {generatedAssessment ? 'Close' : 'Cancel'}
              </button>
              {!generatedAssessment && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerateAndSendAssessment}
                  disabled={isSendingInvite}
                >
                  {isSendingInvite ? (
                    <>Generating...</>
                  ) : (
                    <>
                      <Sparkles size={14} /> Generate & Send Assessment
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
