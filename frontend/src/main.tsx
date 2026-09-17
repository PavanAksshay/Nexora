import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import {
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  ChevronLeft,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
  Users,
  AlertTriangle,
  FileCheck2,
  Cpu,
  Layers,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  Eye,
  Columns2,
  Briefcase
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { demoAnalysis, candidates as initialCandidates, jobSkills } from './data';
import { firebaseAuth, firebaseEnabled } from './auth/firebase';
import { SkillCoverageTable } from './components/SkillCoverageTable';
import { SkillCandidatesDrawer } from './components/SkillCandidatesDrawer';
import { CandidateDetailView } from './components/CandidateDetailView';
import { CandidateComparisonModal } from './components/CandidateComparisonModal';
import { HiringSimulator } from './components/HiringSimulator';
import { RecruiterChatbot } from './components/RecruiterChatbot';
import { JobOpeningsTable } from './components/JobOpeningsTable';
import { JobCandidatesView } from './components/JobCandidatesView';
import { CandidateAssessmentPortal } from './components/CandidateAssessmentPortal';
import { store } from './services/store';
import { getBackendCandidate } from './services/api';
import type { Candidate, JobSkill, JobOpening } from './types';
import './styles.css';

// ---------------------------------------------------------------------------
// AUTHENTICATION CONTEXT
// ---------------------------------------------------------------------------
interface User {
  name: string;
  email: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  signIn: () => Promise<void>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  signIn: async () => {},
  signInDemo: () => {},
  signOut: async () => {},
});

const useAuth = () => useContext(AuthContext);

// ---------------------------------------------------------------------------
// APPLICATION SHELL & BRAND LOGO
// ---------------------------------------------------------------------------
export function NexoraLogo({ className = '', size = 32, collapsed = false }: { className?: string; size?: number; collapsed?: boolean }) {
  return (
    <div className={`nexora-logo ${collapsed ? 'collapsed' : ''} ${className}`}>
      <div className="logo-mark" style={{ width: size, height: size, minWidth: size }}>
        <svg
          width={Math.round(size * 0.65)}
          height={Math.round(size * 0.65)}
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="nexoraGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3f3f46" />
              <stop offset="100%" stopColor="#09090b" />
            </linearGradient>
            <linearGradient id="nexoraGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#71717a" />
              <stop offset="100%" stopColor="#18181b" />
            </linearGradient>
          </defs>
          {/* Left Vertical Pillar */}
          <path d="M4 23V5L10 5V23H4Z" fill="url(#nexoraGrad1)" />
          {/* Diagonal Nexus Slash */}
          <path d="M8 5L20 23H24L12 5H8Z" fill="url(#nexoraGrad2)" />
          {/* Right Vertical Pillar */}
          <path d="M18 5L24 5V23H18V5Z" fill="url(#nexoraGrad1)" />
          {/* Central AI Quantum Sparkle Dot */}
          <circle cx="14" cy="14" r="2.2" fill="#ffffff" />
          <path d="M14 9.5V18.5M9.5 14H18.5" stroke="#ffffff" strokeWidth="1" strokeLinecap="square" />
        </svg>
      </div>
      {!collapsed && (
        <div className="logo-text">
          <span className="brand-name">NEXORA</span>
          <span className="brand-subtitle">TALENT INTELLIGENCE</span>
        </div>
      )}
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  const navItems: [string, React.ComponentType<{ size?: number }>, string][] = [
    ['/dashboard', LayoutDashboard, 'Dashboard'],
    ['/analysis', Briefcase, 'Job Openings'],
    ['/settings', Settings, 'Settings'],
  ];

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      {/* Sidebar Navigation */}
      <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <NexoraLogo size={30} collapsed={sidebarCollapsed} />
          <button
            type="button"
            className="sidebar-collapse-toggle-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(([to, Icon, label]) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon size={18} />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`user-profile-widget ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <div className="avatar avatar-sm">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AR'}
            </div>
            {!sidebarCollapsed && (
              <div className="user-meta">
                <span className="user-name">{user?.name || 'Alex Recruiter'}</span>
                <small className="user-email">{user?.email || 'alex@nexora.app'}</small>
              </div>
            )}
            <button
              type="button"
              className="signout-btn"
              onClick={signOut}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={`app-main-viewport ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-trigger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            <Menu size={20} />
          </button>

          <button
            type="button"
            className="desktop-sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <div className="topbar-actions" style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="icon-button"
              title="Notifications"
              aria-label="Notifications"
              onClick={() => toast.info('Candidate intelligence scans active.')}
            >
              <Bell size={18} />
            </button>

            <div className="avatar avatar-sm">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AR'}
            </div>
          </div>
        </header>

        <main className="app-main-content">{children}</main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOGIN PAGE
// ---------------------------------------------------------------------------
function LoginPage() {
  const { signIn, signInDemo } = useAuth();

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-brand-header">
          <NexoraLogo />
          <p className="login-tagline">Candidate intelligence for better hiring.</p>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <h2>Recruiter Sign In</h2>
            <p>Access your recruitment workspace to analyze candidates and skill coverage.</p>
          </div>

          <div className="login-actions">
            <button type="button" className="btn-google" onClick={signIn}>
              <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
              <ArrowRight size={16} />
            </button>

            <div className="login-divider">
              <span>or</span>
            </div>

            <button type="button" className="btn-demo-signin" onClick={signInDemo}>
              <Sparkles size={16} />
              <span>Enter with Demo Recruiter Workspace</span>
            </button>
          </div>

          <div className="login-card-footer">
            <small>
              By continuing, you agree to Nexora’s Terms of Service and Privacy Policy.
            </small>
          </div>
        </div>

        <footer className="login-footer">
          <span>© 2026 NEXORA · Candidate intelligence for better hiring</span>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD (WITH INTEGRATED HIRING ANALYTICS)
// ---------------------------------------------------------------------------
function DashboardPage() {
  const navigate = useNavigate();

  // Score distribution histogram
  const scoreDistribution = [
    { range: '90–100', count: 2, fill: '#2563eb' },
    { range: '80–89', count: 4, fill: '#3b82f6' },
    { range: '70–79', count: 4, fill: '#60a5fa' },
    { range: '60–69', count: 3, fill: '#f59e0b' },
    { range: '<60', count: 5, fill: '#94a3b8' },
  ];

  // Skill coverage chart
  const skillCoverageData = [
    { skill: 'SQL', matching: 15, missing: 3 },
    { skill: 'Python', matching: 12, missing: 6 },
    { skill: 'TypeScript', matching: 12, missing: 6 },
    { skill: 'React', matching: 11, missing: 7 },
    { skill: 'Angular', matching: 8, missing: 10 },
    { skill: 'Docker', matching: 8, missing: 10 },
    { skill: 'AWS', matching: 6, missing: 12 },
  ];

  // Match quality donut chart
  const matchQualityData = [
    { name: 'Strong Match (≥80%)', value: 6, color: '#16a34a' },
    { name: 'Good Match (70–79%)', value: 4, color: '#2563eb' },
    { name: 'Needs Review (60–69%)', value: 3, color: '#f59e0b' },
    { name: 'Low Match (<60%)', value: 5, color: '#94a3b8' },
  ];

  return (
    <div className="dashboard-view">
      {/* Welcome Banner */}
      <div className="dashboard-welcome-banner">
        <div>
          <span className="eyebrow">NEXORA DASHBOARD</span>
          <h1>Recruiter Intelligence Overview</h1>
          <p>
            Candidate intelligence for better hiring. Active analysis for <b>Senior Full Stack Engineer</b>.
          </p>
        </div>
        <div className="welcome-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/candidates')}
          >
            <Users size={16} /> View All Candidates
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/analysis/new')}
          >
            <Plus size={16} /> New Analysis
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stat-cards-grid">
        <div className="stat-card">
          <div className="stat-card-head">
            <span className="stat-label">Candidates Analyzed</span>
            <Users size={16} className="stat-icon" />
          </div>
          <div className="stat-number">18</div>
          <small className="stat-sub">100% parsed & scored from active pool</small>
        </div>

        <div className="stat-card">
          <div className="stat-card-head">
            <span className="stat-label">Strong Matches</span>
            <CheckCircle2 size={16} className="stat-icon text-success" />
          </div>
          <div className="stat-number">6</div>
          <small className="stat-sub">Match scores ≥ 80% with dual validation</small>
        </div>

        <div className="stat-card">
          <div className="stat-card-head">
            <span className="stat-label">Need Review</span>
            <AlertTriangle size={16} className="stat-icon text-warning" />
          </div>
          <div className="stat-number">4</div>
          <small className="stat-sub">Timeline checks or partial skill coverage</small>
        </div>

        <div className="stat-card">
          <div className="stat-card-head">
            <span className="stat-label">Required Skills</span>
            <FileCheck2 size={16} className="stat-icon text-primary" />
          </div>
          <div className="stat-number">5</div>
          <small className="stat-sub">Python, Angular, React, SQL, TypeScript</small>
        </div>
      </div>

      {/* Recent Analysis Card */}
      <div className="recent-analysis-card">
        <div className="recent-file-icon">
          <FileText size={22} />
        </div>
        <div className="recent-info">
          <div className="recent-title-wrap">
            <h4>Senior Full Stack Engineer</h4>
            <span className="status-badge-inline status-strong">
              <CheckCircle2 size={12} /> Analysis Completed
            </span>
          </div>
          <p>
            Full_Stack_Developer_JD.pdf · 18 candidate resumes · Evaluated Sep 12, 2026
          </p>
        </div>
        <div className="recent-score-preview">
          <small>Top Candidate Match</small>
          <b>94.0%</b>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate('/analysis/analysis_123/results')}
        >
          View Analysis Results <ChevronRight size={16} />
        </button>
      </div>

      {/* Analytics Visualization Section */}
      <div className="dashboard-charts-grid">
        {/* Chart 1: Candidate Score Distribution */}
        <div className="chart-panel">
          <div className="chart-head">
            <h3>Candidate Score Distribution</h3>
            <p>Histogram of candidate match scores across the talent pool.</p>
          </div>
          <div className="chart-body" style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="range" stroke="#94a3b8" fontSize={12} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [`${value} Candidates`, 'Count']}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '0px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="count" radius={[0, 0, 0, 0]}>
                  {scoreDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Skill Coverage */}
        <div className="chart-panel">
          <div className="chart-head">
            <h3>Skill Coverage Overview</h3>
            <p>Candidate evidence counts across extracted role skills.</p>
          </div>
          <div className="chart-body" style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={skillCoverageData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} domain={[0, 18]} />
                <YAxis dataKey="skill" type="category" stroke="#475569" fontSize={12} tickLine={false} width={80} />
                <Tooltip
                  formatter={(val, name) => [
                    `${val} Candidates`,
                    name === 'matching' ? 'Matching' : 'Missing',
                  ]}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '0px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="matching" fill="#2563eb" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Match Quality */}
        <div className="chart-panel">
          <div className="chart-head">
            <h3>Match Quality Breakdown</h3>
            <p>Proportion of candidate tiers in active pool.</p>
          </div>
          <div className="chart-body donut-chart-wrap" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={matchQualityData}
                  dataKey="value"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={3}
                >
                  {matchQualityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => [`${val} Candidates`, 'Count']}
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '0px', border: '1px solid #e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-legend">
              {matchQualityData.map((item) => (
                <div key={item.name} className="legend-item">
                  <span className="legend-color-dot" style={{ backgroundColor: item.color }} />
                  <span className="legend-label">{item.name}</span>
                  <b>{item.value}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 4: Skill Gaps Shortage */}
        <div className="chart-panel">
          <div className="chart-head">
            <h3>Candidate Skill Shortages</h3>
            <p>Required and preferred skills with the largest candidate gaps.</p>
          </div>
          <div className="skill-gaps-list">
            <div className="skill-gap-item">
              <div className="gap-info">
                <b>AWS (Cloud)</b>
                <span className="gap-tag preferred">Preferred</span>
              </div>
              <div className="gap-bar-wrap">
                <div className="gap-bar-fill" style={{ width: '67%' }} />
              </div>
              <span className="gap-count">12 missing (33% coverage)</span>
            </div>

            <div className="skill-gap-item">
              <div className="gap-info">
                <b>Angular (Frontend)</b>
                <span className="gap-tag required">Required</span>
              </div>
              <div className="gap-bar-wrap">
                <div className="gap-bar-fill" style={{ width: '56%' }} />
              </div>
              <span className="gap-count">10 missing (44% coverage)</span>
            </div>

            <div className="skill-gap-item">
              <div className="gap-info">
                <b>Docker (Cloud)</b>
                <span className="gap-tag preferred">Preferred</span>
              </div>
              <div className="gap-bar-wrap">
                <div className="gap-bar-fill" style={{ width: '56%' }} />
              </div>
              <span className="gap-count">10 missing (44% coverage)</span>
            </div>

            <div className="skill-gap-item">
              <div className="gap-info">
                <b>React (Frontend)</b>
                <span className="gap-tag required">Required</span>
              </div>
              <div className="gap-bar-wrap">
                <div className="gap-bar-fill" style={{ width: '39%' }} />
              </div>
              <span className="gap-count">7 missing (61% coverage)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Candidates Quick Preview */}
      <div className="section-header-row">
        <div>
          <h2>Top Ranked Candidates</h2>
          <p>Highest-scoring candidates evaluating semantic and keyword signals.</p>
        </div>
        <button
          type="button"
          className="btn btn-text"
          onClick={() => navigate('/analysis/analysis_123/results')}
        >
          Inspect Full Ranking <ChevronRight size={15} />
        </button>
      </div>

      <div className="top-candidates-preview-grid">
        {initialCandidates.slice(0, 3).map((c) => (
          <div
            key={c.id}
            className="top-candidate-card"
            onClick={() => navigate(`/candidate/${c.id}`)}
          >
            <div className="top-card-header">
              <span className="top-rank-badge">#{c.rank}</span>
              <div className="top-score-badge">
                <b>{c.finalScore !== undefined ? `${c.finalScore.toFixed(1)}%` : '—'}</b>
                <small>Match</small>
              </div>
            </div>
            <h3 className="top-candidate-name">{c.name}</h3>
            <p className="top-candidate-role">{c.title}</p>
            <div className="top-card-skills">
              {c.matchedSkills.slice(0, 3).map((s) => (
                <span key={s} className="skill-tag">
                  {s}
                </span>
              ))}
            </div>
            <div className="top-card-footer">
              <span className="top-exp">{c.experienceYears} Years Exp</span>
              <span className="view-link">
                View Profile <ChevronRight size={13} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <RecruiterChatbot candidates={initialCandidates} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW ANALYSIS PAGE (BALANCED 2-COLUMN UPLOAD)
// ---------------------------------------------------------------------------
function NewAnalysisPage() {
  const navigate = useNavigate();
  const [jdFiles, setJdFiles] = useState<File[]>([]);
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);

  // React Dropzone for Job Description
  const {
    getRootProps: getJdProps,
    getInputProps: getJdInputProps,
    isDragActive: isJdDrag,
  } = useDropzone({
    multiple: false,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    onDrop: (accepted) => {
      if (accepted.length > 0) {
        setJdFiles([accepted[0]]);
        toast.success(`Job Description "${accepted[0].name}" loaded`);
      }
    },
  });

  // React Dropzone for Resumes
  const {
    getRootProps: getResumeProps,
    getInputProps: getResumeInputProps,
    isDragActive: isResumeDrag,
  } = useDropzone({
    multiple: true,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    onDrop: (accepted) => {
      setResumeFiles((prev) => {
        const combined = [...prev, ...accepted];
        return combined.slice(0, 25);
      });
      toast.success(`Added ${accepted.length} candidate resumes`);
    },
  });

  // Quick Loader for Demo Package (18 resumes expected)
  const handleLoadDemoPackage = () => {
    // Generate 18 synthetic mock file objects
    const mockJd = new File(['Role: Senior Full Stack Engineer...'], 'Full_Stack_Developer_JD.pdf', {
      type: 'application/pdf',
    });
    const mockResumes = initialCandidates.map((c) => {
      return new File([`Resume for ${c.name}`], `${c.name.replace(/\s+/g, '_')}_Resume.pdf`, {
        type: 'application/pdf',
      });
    });

    setJdFiles([mockJd]);
    setResumeFiles(mockResumes);
    toast.success('Loaded Job Description + 18 candidate resumes');
  };

  const handleRemoveResume = (index: number) => {
    setResumeFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartAnalysis = () => {
    if (jdFiles.length === 0 || resumeFiles.length === 0) {
      toast.error('Please upload both a Job Description and candidate resumes.');
      return;
    }
    navigate('/analysis/analysis_123/loading');
  };

  return (
    <div className="new-analysis-view">
      <div className="new-analysis-header">
        <div>
          <span className="eyebrow">NEW ANALYSIS PIPELINE</span>
          <h1>Upload Documents for Intelligence Analysis</h1>
          <p>
            Upload one Job Description and candidate resumes. Nexora will parse requirements, extract skills, and run dual semantic/keyword evaluations.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLoadDemoPackage}
            title="Populate with the 18 demo candidate resumes"
          >
            <Sparkles size={15} /> Load 18 Demo Resumes Package
          </button>
        </div>
      </div>

      {/* Balanced 2-Column Upload Layout */}
      <div className="upload-two-column-grid">
        {/* Column 1: Job Description */}
        <div className="upload-column-card">
          <div className="column-head">
            <div className="column-step-badge">01</div>
            <div>
              <h3>Job Description</h3>
              <p>Upload the target role requirements (PDF, DOCX, TXT).</p>
            </div>
          </div>

          <div
            {...getJdProps()}
            className={`dropzone-box ${isJdDrag ? 'drag-active' : ''} ${jdFiles.length > 0 ? 'has-file' : ''}`}
          >
            <input {...getJdInputProps()} />
            <div className="dropzone-icon">
              <Upload size={24} />
            </div>
            <b>{jdFiles.length > 0 ? 'Replace Job Description' : 'Drop Job Description here'}</b>
            <p>or click to browse files</p>
            <small>Supports PDF, DOCX, TXT (up to 10MB)</small>
          </div>

          {jdFiles.length > 0 && (
            <div className="file-preview-card">
              <div className="file-icon">
                <FileText size={20} />
              </div>
              <div className="file-details">
                <b>{jdFiles[0].name}</b>
                <small>{(jdFiles[0].size / 1024).toFixed(1)} KB · Ready for parsing</small>
              </div>
              <span className="status-badge-inline status-strong">
                <Check size={13} /> Loaded
              </span>
              <button
                type="button"
                className="remove-file-btn"
                onClick={() => setJdFiles([])}
                aria-label="Remove JD"
              >
                <X size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Column 2: Candidate Resumes */}
        <div className="upload-column-card">
          <div className="column-head">
            <div className="column-step-badge">02</div>
            <div>
              <h3>Candidate Resumes</h3>
              <p>Upload applicant profiles for batch evaluation.</p>
            </div>
            <div className="resume-counter-badge">
              <b>{resumeFiles.length}</b> resumes loaded
            </div>
          </div>

          <div
            {...getResumeProps()}
            className={`dropzone-box ${isResumeDrag ? 'drag-active' : ''}`}
          >
            <input {...getResumeInputProps()} />
            <div className="dropzone-icon">
              <Users size={24} />
            </div>
            <b>Drop candidate resumes here</b>
            <p>or click to select multiple files</p>
            <span className="expected-notice">
              <Sparkles size={12} /> 15–18 resumes expected for optimal ranking
            </span>
          </div>

          {/* Uploaded File List */}
          {resumeFiles.length > 0 && (
            <div className="uploaded-resumes-list">
              <div className="list-meta-bar">
                <span>Uploaded Resumes ({resumeFiles.length})</span>
                <button
                  type="button"
                  className="btn-clear-all"
                  onClick={() => setResumeFiles([])}
                >
                  Clear all
                </button>
              </div>
              <div className="files-scroll-box">
                {resumeFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="resume-file-row">
                    <FileText size={16} className="file-row-icon" />
                    <div className="file-row-info">
                      <b>{file.name}</b>
                      <small>{(file.size / 1024).toFixed(1)} KB</small>
                    </div>
                    <span className="ready-indicator">Ready</span>
                    <button
                      type="button"
                      className="remove-file-btn"
                      onClick={() => handleRemoveResume(idx)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Launch Bar */}
      <div className="analysis-launch-bar">
        <div className="launch-summary">
          <span className="summary-title">PIPELINE READINESS</span>
          <p>
            {jdFiles.length > 0 ? (
              <span className="ready-text">✓ Job Description: {jdFiles[0].name}</span>
            ) : (
              <span className="pending-text">○ Job Description pending upload</span>
            )}
            <br />
            {resumeFiles.length > 0 ? (
              <span className="ready-text">
                ✓ {resumeFiles.length} candidate resumes staged (15–18 expected)
              </span>
            ) : (
              <span className="pending-text">○ Candidate resumes pending upload</span>
            )}
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={jdFiles.length === 0 || resumeFiles.length === 0}
          onClick={handleStartAnalysis}
        >
          <span>Analyze Candidates</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ANALYSIS LOADING STATE (MULTI-STAGE PIPELINE)
// ---------------------------------------------------------------------------
function LoadingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const pipelineStages = [
    { title: 'Uploading documents', desc: 'Securely staging JD and candidate resumes' },
    { title: 'Reading Job Description', desc: 'Extracting seniority, role scope, and objectives' },
    { title: 'Extracting required skills', desc: 'Categorizing required vs preferred capabilities' },
    { title: 'Analyzing candidate resumes', desc: 'Parsing employment history, education, and projects' },
    { title: 'Calculating semantic matches', desc: 'Evaluating contextual architecture alignment' },
    { title: 'Calculating keyword matches', desc: 'Checking direct technical terms & evidence depth' },
    { title: 'Generating candidate rankings', desc: 'Synthesizing dual scores and verification checks' },
    { title: 'Preparing skill coverage', desc: 'Compiling coverage ratios and gap analysis' },
  ];

  useEffect(() => {
    if (currentStep >= pipelineStages.length) {
      const timer = setTimeout(() => {
        navigate('/analysis/analysis_123/results');
      }, 700);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setCurrentStep((prev) => prev + 1);
    }, 480);
    return () => clearTimeout(timer);
  }, [currentStep, navigate, pipelineStages.length]);

  return (
    <div className="loading-pipeline-view">
      <div className="pipeline-card">
        <div className="pipeline-spinner-head">
          <div className="pipeline-icon-wrap">
            <Cpu size={32} />
          </div>
          <span className="eyebrow">INTELLIGENCE PIPELINE IN PROGRESS</span>
          <h2>Analyzing Candidates & Skill Coverage</h2>
          <p>
            NEXORA is executing a multi-tier evaluation pipeline across your candidate pool.
          </p>
        </div>

        <div className="pipeline-stages-list">
          {pipelineStages.map((stage, idx) => {
            const isDone = idx < currentStep;
            const isActive = idx === currentStep;

            return (
              <div
                key={stage.title}
                className={`pipeline-stage-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
              >
                <div className="stage-indicator">
                  {isDone ? <Check size={14} /> : <span>0{idx + 1}</span>}
                </div>
                <div className="stage-content">
                  <b>{stage.title}</b>
                  <small>{stage.desc}</small>
                </div>
                <span className="stage-badge">
                  {isDone ? 'Completed' : isActive ? 'Processing...' : 'Queued'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="pipeline-footer-note">
          <small>
            Processing results conform strictly to extracted Job Description skills and candidate evidence.
          </small>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ANALYSIS RESULTS PAGE (SKILL-FIRST WITH PROMINENT COVERAGE TABLE)
// ---------------------------------------------------------------------------
function AnalysisResultsPage() {
  const navigate = useNavigate();
  const [candidates] = useState<Candidate[]>(initialCandidates);
  const [skills] = useState<JobSkill[]>(jobSkills);

  // Drawer states
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSkill, setDrawerSkill] = useState('Angular');
  const [drawerMode, setDrawerMode] = useState<'matching' | 'missing'>('matching');

  // Simulator & Comparison modal states
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareA, setCompareA] = useState<Candidate>(initialCandidates[0]);
  const [compareB, setCompareB] = useState<Candidate>(initialCandidates[1]);

  const handleViewMatching = (skillName: string) => {
    setDrawerSkill(skillName);
    setDrawerMode('matching');
    setDrawerOpen(true);
  };

  const handleViewMissing = (skillName: string) => {
    setDrawerSkill(skillName);
    setDrawerMode('missing');
    setDrawerOpen(true);
  };

  const handleQuickCompare = (candA: Candidate, candB: Candidate) => {
    setCompareA(candA);
    setCompareB(candB);
    setCompareModalOpen(true);
  };

  return (
    <div className="analysis-results-view">
      {/* Header */}
      <div className="results-header-banner">
        <div>
          <span className="eyebrow">RECRUITMENT INTELLIGENCE & RANKINGS</span>
          <h1>Senior Full Stack Engineer</h1>
          <p>
            Full_Stack_Developer_JD.pdf · <b>18</b> Candidates Evaluated · Completed Sep 12, 2026
          </p>
        </div>
        <div className="results-head-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSimulatorOpen(true)}
          >
            <SlidersHorizontal size={16} /> Hiring Simulator
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/analysis/new')}
          >
            <Plus size={16} /> New Analysis
          </button>
        </div>
      </div>

      {/* Overview Statistics */}
      <div className="results-stats-row">
        <div className="stat-card">
          <span className="stat-label">Candidate Pool</span>
          <div className="stat-number">18</div>
          <small className="stat-sub">Parsed & evaluated</small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Top Match Score</span>
          <div className="stat-number text-primary">94.0%</div>
          <small className="stat-sub">Rahul Sharma (#1)</small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pool Average Match</span>
          <div className="stat-number">82.6%</div>
          <small className="stat-sub">Across 5 required skills</small>
        </div>
        <div className="stat-card">
          <span className="stat-label">Strong Matches</span>
          <div className="stat-number text-success">6</div>
          <small className="stat-sub">Scores ≥ 80% with dual fit</small>
        </div>
      </div>

      {/* =====================================================================
          MOST IMPORTANT SECTION: SKILL COVERAGE TABLE
          ===================================================================== */}
      <section className="results-section skill-first-section">
        <SkillCoverageTable
          skills={skills}
          onViewMatching={handleViewMatching}
          onViewMissing={handleViewMissing}
          onViewEvidence={handleViewMatching}
        />
      </section>

      {/* Top 3 Candidates Highlight with Why Rationale */}
      <section className="results-section">
        <div className="section-head-bar">
          <div>
            <h2>Top Recommended Candidates</h2>
            <p>High-signal candidates with verified evidence and dual matching validation.</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleQuickCompare(candidates[0], candidates[1])}
          >
            <Columns2 size={14} /> Compare Top 2
          </button>
        </div>

        <div className="top-candidates-why-grid">
          {candidates.slice(0, 3).map((c) => (
            <article key={c.id} className="top-why-card">
              <div className="why-card-top">
                <div className="avatar avatar-md">
                  {c.name
                    .split(' ')
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div>
                  <div className="why-name-row">
                    <b>{c.name}</b>
                    <span className="rank-tag">#{c.rank}</span>
                  </div>
                  <small>{c.title}</small>
                </div>
                <div className="why-score-pill">
                  <b>{c.finalScore !== undefined ? `${c.finalScore.toFixed(1)}%` : '—'}</b>
                </div>
              </div>

              <div className="why-dual-scores">
                <span className="dual-chip">Semantic: <b>{c.semanticScore ?? 0}%</b></span>
                <span className="dual-chip">Keywords: <b>{c.keywordScore ?? 0}%</b></span>
                <span className="dual-chip">Exp: <b>{c.experienceYears} yrs</b></span>
              </div>

              <p className="why-explanation">{c.explanation}</p>

              <div className="why-skills-breakdown">
                <div className="matched-line">
                  <small>Matched:</small>
                  <span>{c.matchedSkills.slice(0, 4).join(' · ')}</span>
                </div>
                {c.missingSkills.length > 0 && (
                  <div className="missing-line">
                    <small>Gaps:</small>
                    <span>{c.missingSkills.join(' · ')}</span>
                  </div>
                )}
              </div>

              {c.verificationAlerts.length > 0 && (
                <div className="why-alert-badge">
                  <ShieldAlert size={12} />
                  <span>Review Recommended: Anomaly detected</span>
                </div>
              )}

              <div className="why-card-footer">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm full-width"
                  onClick={() => navigate(`/candidate/${c.id}`)}
                >
                  View Candidate Profile <ArrowRight size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* All Candidates Ranked Table */}
      <section className="results-section">
        <div className="section-head-bar">
          <div>
            <h2>Complete Candidate Pool Rankings</h2>
            <p>Dual semantic and keyword evaluations across all 18 applicant resumes.</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/candidates')}
          >
            <Users size={15} /> Search & Filter Pool
          </button>
        </div>

        <div className="rankings-table-wrap">
          <table className="rankings-table">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Candidate</th>
                <th scope="col">Key Evidenced Skills</th>
                <th scope="col" className="text-center">Semantic</th>
                <th scope="col" className="text-center">Keywords</th>
                <th scope="col" className="text-center">Verification</th>
                <th scope="col" className="text-right">Match Score</th>
                <th scope="col" className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="candidate-table-row">
                  <td className="rank-cell">
                    <span className="rank-pill">#{c.rank}</span>
                  </td>
                  <td>
                    <div className="candidate-cell-info">
                      <b>{c.name}</b>
                      <small>{c.title} · {c.location}</small>
                    </div>
                  </td>
                  <td>
                    <div className="skills-inline-wrap">
                      {c.matchedSkills.slice(0, 3).map((s) => (
                        <span key={s} className="skill-tag">
                          {s}
                        </span>
                      ))}
                      {c.matchedSkills.length > 3 && (
                        <small className="more-skills">+{c.matchedSkills.length - 3}</small>
                      )}
                    </div>
                  </td>
                  <td className="text-center">
                    <span className="score-subtle">{c.semanticScore}%</span>
                  </td>
                  <td className="text-center">
                    <span className="score-subtle">{c.keywordScore}%</span>
                  </td>
                  <td className="text-center">
                    {c.verificationAlerts.length > 0 ? (
                      <span className="status-badge-inline status-review" title="Timeline verification recommended">
                        <ShieldAlert size={12} /> Review
                      </span>
                    ) : (
                      <span className="status-badge-inline status-strong" title="Verified - No flaws detected">
                        <ShieldCheck size={12} /> Verified
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <b className="final-score-text">{c.finalScore !== undefined ? `${c.finalScore.toFixed(1)}%` : '—'}</b>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/candidate/${c.id}`)}
                    >
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Slide-over Drawer for Matching/Missing Candidates */}
      <SkillCandidatesDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        skillName={drawerSkill}
        mode={drawerMode}
        candidates={candidates}
      />

      {/* Hiring Simulator Drawer */}
      <HiringSimulator
        isOpen={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        baseCandidates={candidates}
      />

      {/* Comparison Modal */}
      <CandidateComparisonModal
        isOpen={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        candidateA={compareA}
        candidateB={compareB}
      />

      {/* Recruiter Intelligence Chatbot */}
      <RecruiterChatbot candidates={candidates} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CANDIDATES POOL VIEW (WITH SEARCH, FILTERS & COMPARISON)
// ---------------------------------------------------------------------------
function CandidatesPage() {
  const navigate = useNavigate();
  const [candidates] = useState<Candidate[]>(initialCandidates);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'strong' | 'good' | 'review'>('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [verifFilter, setVerifFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'rank' | 'score' | 'semantic' | 'keyword' | 'exp'>('rank');

  // Multi-select for side-by-side comparison
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) {
        toast.info('Comparing 2 candidates. Selection updated.');
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((c) => {
        // Search query
        const matchesQuery =
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.matchedSkills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
        if (!matchesQuery) return false;

        // Tier filter
        const score = c.finalScore ?? 0;
        if (tierFilter === 'strong' && score < 80) return false;
        if (tierFilter === 'good' && (score < 70 || score >= 80)) return false;
        if (tierFilter === 'review' && score >= 70) return false;

        // Skill filter
        if (skillFilter !== 'all' && !c.matchedSkills.includes(skillFilter)) return false;

        // Verification filter
        if (verifFilter === 'verified' && c.verificationAlerts.length > 0) return false;
        if (verifFilter === 'review' && c.verificationAlerts.length === 0) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return (b.finalScore ?? 0) - (a.finalScore ?? 0);
        if (sortBy === 'semantic') return (b.semanticScore ?? 0) - (a.semanticScore ?? 0);
        if (sortBy === 'keyword') return (b.keywordScore ?? 0) - (a.keywordScore ?? 0);
        if (sortBy === 'exp') return b.experienceYears - a.experienceYears;
        return a.rank - b.rank;
      });
  }, [candidates, searchQuery, tierFilter, skillFilter, verifFilter, sortBy]);

  const candidateA = candidates.find((c) => c.id === selectedIds[0]) || candidates[0];
  const candidateB = candidates.find((c) => c.id === selectedIds[1]) || candidates[1];

  return (
    <div className="candidates-view">
      <div className="candidates-header">
        <div>
          <span className="eyebrow">APPLICANT POOL</span>
          <h1>Candidate Pool Intelligence</h1>
          <p>Search, filter, and inspect all 18 evaluated profiles with dual score validation.</p>
        </div>

        {selectedIds.length === 2 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCompareOpen(true)}
          >
            <Columns2 size={16} /> Compare 2 Selected Candidates
          </button>
        )}
      </div>

      {/* Filters & Search Toolbar */}
      <div className="filter-toolbar-card">
        <div className="search-input-wrap">
          <Search size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate name, role, or technical skill..."
          />
        </div>

        <div className="dropdown-filters-wrap">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as any)}
            className="filter-select"
            aria-label="Filter by Match Tier"
          >
            <option value="all">All Match Tiers</option>
            <option value="strong">Strong Match (≥80%)</option>
            <option value="good">Good Match (70–79%)</option>
            <option value="review">Needs Review (&lt;70%)</option>
          </select>

          <select
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="filter-select"
            aria-label="Filter by Skill"
          >
            <option value="all">All Skills</option>
            <option value="Python">Python</option>
            <option value="Angular">Angular</option>
            <option value="React">React</option>
            <option value="SQL">SQL</option>
            <option value="TypeScript">TypeScript</option>
            <option value="AWS">AWS</option>
            <option value="Docker">Docker</option>
          </select>

          <select
            value={verifFilter}
            onChange={(e) => setVerifFilter(e.target.value)}
            className="filter-select"
            aria-label="Filter by Verification Status"
          >
            <option value="all">All Verification</option>
            <option value="verified">Verified Only</option>
            <option value="review">Review Recommended</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="filter-select"
            aria-label="Sort Candidates"
          >
            <option value="rank">Sort by Default Rank</option>
            <option value="score">Sort by Final Score</option>
            <option value="semantic">Sort by Semantic Match</option>
            <option value="keyword">Sort by Keyword Match</option>
            <option value="exp">Sort by Experience</option>
          </select>
        </div>
      </div>

      {/* Candidates Table */}
      <div className="rankings-table-wrap">
        <table className="rankings-table">
          <thead>
            <tr>
              <th scope="col" style={{ width: 40 }}>
                Compare
              </th>
              <th scope="col">Rank</th>
              <th scope="col">Candidate</th>
              <th scope="col">Evidenced Skills</th>
              <th scope="col" className="text-center">Semantic</th>
              <th scope="col" className="text-center">Keywords</th>
              <th scope="col" className="text-center">Experience</th>
              <th scope="col" className="text-center">Verification</th>
              <th scope="col" className="text-right">Match Score</th>
              <th scope="col" className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredCandidates.map((c) => {
              const isSelected = selectedIds.includes(c.id);

              return (
                <tr key={c.id} className={`candidate-table-row ${isSelected ? 'row-selected' : ''}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(c.id)}
                      title="Select to compare"
                      aria-label={`Select ${c.name} for comparison`}
                    />
                  </td>
                  <td className="rank-cell">
                    <span className="rank-pill">#{c.rank}</span>
                  </td>
                  <td>
                    <div className="candidate-cell-info">
                      <b>{c.name}</b>
                      <small>{c.title} · {c.location}</small>
                    </div>
                  </td>
                  <td>
                    <div className="skills-inline-wrap">
                      {c.matchedSkills.slice(0, 4).map((s) => (
                        <span key={s} className="skill-tag">
                          {s}
                        </span>
                      ))}
                      {c.matchedSkills.length > 4 && (
                        <small className="more-skills">+{c.matchedSkills.length - 4}</small>
                      )}
                    </div>
                  </td>
                  <td className="text-center">
                    <span className="score-subtle">{c.semanticScore}%</span>
                  </td>
                  <td className="text-center">
                    <span className="score-subtle">{c.keywordScore}%</span>
                  </td>
                  <td className="text-center">
                    <span className="exp-subtle">{c.experienceYears} yrs</span>
                  </td>
                  <td className="text-center">
                    {c.verificationAlerts.length > 0 ? (
                      <span className="status-badge-inline status-review">
                        <ShieldAlert size={12} /> Review
                      </span>
                    ) : (
                      <span className="status-badge-inline status-strong">
                        <ShieldCheck size={12} /> Verified
                      </span>
                    )}
                  </td>
                  <td className="text-right">
                    <b className="final-score-text">{c.finalScore !== undefined ? `${c.finalScore.toFixed(1)}%` : '—'}</b>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/candidate/${c.id}`)}
                    >
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Side-by-side comparison modal */}
      <CandidateComparisonModal
        isOpen={compareOpen}
        onClose={() => setCompareOpen(false)}
        candidateA={candidateA}
        candidateB={candidateB}
      />

      <RecruiterChatbot candidates={candidates} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ANALYSIS & JOB OPENINGS PAGES
// ---------------------------------------------------------------------------
function AnalysisJobOpeningsPage() {
  const navigate = useNavigate();
  return (
    <div className="analysis-job-openings-view">
      <JobOpeningsTable
        onSelectJob={(job) => navigate(`/analysis/${job.id}/candidates`)}
      />
      <RecruiterChatbot candidates={initialCandidates} />
    </div>
  );
}

function JobCandidatesRoutePage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobOpening | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = new URLSearchParams(window.location.search);
  const initialOpenUpload = searchParams.get('upload') === 'true';

  useEffect(() => {
    let isMounted = true;
    const fetchJob = async () => {
      if (!jobId) return;
      const data = await store.getJobOpening(jobId);
      if (isMounted) {
        setJob(data);
        setLoading(false);
      }
    };
    fetchJob();
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading candidate applications...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="py-20 text-center text-slate-400">
        <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-white">Job Opening Not Found</h3>
        <p className="text-xs text-slate-500 mt-1">The requested job opening could not be located.</p>
        <button
          onClick={() => navigate('/analysis')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition-colors"
        >
          Return to Job Openings
        </button>
      </div>
    );
  }

  return (
    <div className="job-candidates-page-view">
      <JobCandidatesView
        job={job}
        initialOpenUpload={initialOpenUpload}
        onBack={() => navigate('/analysis')}
        onSelectCandidate={(candidate) => navigate(`/candidate/${candidate.id}`)}
      />
      <RecruiterChatbot candidates={initialCandidates} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CANDIDATE DETAILS ROUTE WRAPPER
// ---------------------------------------------------------------------------
function CandidateDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchCand = async () => {
      if (!id) return;
      let stored: Candidate | null = null;
      try {
        stored = await getBackendCandidate(id);
      } catch (err) {
        stored = store.getCandidate(id) || null;
      }
      if (isMounted) {
        if (stored) {
          setCandidate(stored);
        } else {
          const fallback = initialCandidates.find((c) => c.id === id) || initialCandidates[0];
          setCandidate(fallback);
        }
        setLoading(false);
      }
    };
    fetchCand();
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading || !candidate) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading candidate profile...</p>
      </div>
    );
  }

  return (
    <div className="candidate-details-route-view">
      <CandidateDetailView candidate={candidate} onBack={() => navigate(-1)} />
      <RecruiterChatbot candidates={initialCandidates} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SETTINGS PAGE
// ---------------------------------------------------------------------------
function SettingsPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="settings-view">
      <div className="settings-header">
        <span className="eyebrow">WORKSPACE PREFERENCES</span>
        <h1>Settings & Configuration</h1>
        <p>Manage your recruiter profile, theme preferences, and system versioning.</p>
      </div>

      <div className="settings-card-stack">
        <div className="settings-panel-card">
          <div className="panel-avatar">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AR'}
          </div>
          <div className="panel-info">
            <h3>{user?.name || 'Alex Recruiter'}</h3>
            <p>{user?.email || 'alex@nexora.app'} · Enterprise Recruiter Workspace</p>
          </div>
          <button type="button" className="btn btn-secondary">
            Manage Profile
          </button>
        </div>

        <div className="settings-panel-card">
          <div>
            <h3>Design Theme</h3>
            <p>
              NEXORA uses an enterprise dark/light theme built for readable, high-contrast recruiter workflows.
            </p>
          </div>
          <span className="status-badge-inline status-strong">
            <Check size={13} /> Theme Active
          </span>
        </div>

        <div className="settings-panel-card">
          <div>
            <h3>Application Information</h3>
            <p>NEXORA Candidate Intelligence · v1.2.0 · Resume Fraud & Timeline Verification Active</p>
          </div>
          <button type="button" className="btn btn-danger" onClick={signOut}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROOT APPLICATION & ROUTER
// ---------------------------------------------------------------------------
function App() {
  const [user, setUser] = useState<User | null>({
    name: 'Alex Recruiter',
    email: 'alex@nexora.app',
  });

  // Observe Firebase Auth state if configured
  useEffect(() => {
    if (!firebaseEnabled) return;
    const unsubscribe = firebaseAuth.observe((firebaseUser) => {
      if (firebaseUser) {
        setUser({
          name: firebaseUser.displayName || 'Alex Recruiter',
          email: firebaseUser.email || 'alex@nexora.app',
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const authValue = useMemo<AuthContextType>(
    () => ({
      user,
      signIn: async () => {
        try {
          if (firebaseEnabled) {
            const firebaseUser = await firebaseAuth.signIn();
            if (firebaseUser) {
              setUser({
                name: firebaseUser.displayName || 'Alex Recruiter',
                email: firebaseUser.email || 'alex@nexora.app',
              });
              toast.success('Signed in via Google');
              return;
            }
          }
        } catch (err) {
          console.warn('Firebase sign in failed, fallback to demo', err);
        }
        // Fallback demo sign-in
        setUser({ name: 'Alex Recruiter', email: 'alex@nexora.app' });
        toast.success('Signed in to Nexora Workspace');
      },
      signInDemo: () => {
        setUser({ name: 'Alex Recruiter', email: 'alex@nexora.app' });
        toast.success('Entered Nexora Recruiter Workspace');
      },
      signOut: async () => {
        if (firebaseEnabled) {
          await firebaseAuth.signOut();
        }
        setUser(null);
        toast.info('Signed out successfully');
      },
    }),
    [user]
  );

  return (
    <AuthContext.Provider value={authValue}>
      <BrowserRouter>
        <Routes>
          {/* Candidate Assessment Portal (Accessible directly via invite link) */}
          <Route path="/assessment/:id" element={<CandidateAssessmentPortal />} />
          <Route path="/assessment/:id/take" element={<CandidateAssessmentPortal />} />

          {user ? (
            <Route
              path="*"
              element={
                <AppShell>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/analysis" element={<AnalysisJobOpeningsPage />} />
                    <Route path="/analysis/:jobId/candidates" element={<JobCandidatesRoutePage />} />
                    <Route path="/analysis/new" element={<NewAnalysisPage />} />
                    <Route path="/analysis/:id/loading" element={<LoadingPage />} />
                    <Route path="/analysis/:id/results" element={<AnalysisResultsPage />} />
                    <Route path="/candidates" element={<AnalysisJobOpeningsPage />} />
                    <Route path="/candidate/:id" element={<CandidateDetailsPage />} />
                    <Route path="/analytics" element={<DashboardPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<DashboardPage />} />
                  </Routes>
                </AppShell>
              }
            />
          ) : (
            <Route path="*" element={<LoginPage />} />
          )}
        </Routes>
      </BrowserRouter>
      <Toaster theme="light" position="top-right" richColors />
    </AuthContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
