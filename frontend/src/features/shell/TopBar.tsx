import { useState } from 'react';
import {
  Check,
  ChevronDown,
  LayoutDashboard,
  Hammer,
  Smartphone,
  Save,
  Share2,
  Upload,
  FileText,
  Play,
  PanelLeft,
  PanelRight,
  LogIn,
} from 'lucide-react';
import { useArchitectureStore, type AppView } from '@/store/architectureStore';
import { useAuthStore } from '@/store/authStore';
import { buildShareLink, downloadArchitecture } from '@/lib/share';
import { ProfileMenu } from '@/features/auth/ProfileMenu';

const environments: { name: string; multiplier: number }[] = [
  { name: 'Staging', multiplier: 0.5 },
  { name: 'Production', multiplier: 1.0 },
  { name: 'Peak', multiplier: 1.5 },
];

const tabs: { id: AppView; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'builder', label: 'Builder', icon: <Hammer className="h-4 w-4" /> },
  { id: 'mobile', label: 'Mobile', icon: <Smartphone className="h-4 w-4" /> },
];

interface TopBarProps {
  onRun: () => void;
  isRunning: boolean;
  onSave: () => void;
  isSaving: boolean;
}

export function TopBar({ onRun, isRunning, onSave, isSaving }: TopBarProps) {
  const {
    view,
    setView,
    environment,
    setEnvironment,
    setTraffic,
    dirty,
    name,
    toGraph,
    traffic,
    setReportOpen,
    libraryOpen,
    setLibraryOpen,
    inspectorOpen,
    setInspectorOpen,
  } = useArchitectureStore();
  const { user, openAuthPrompt, guestRunsLeft } = useAuthStore();
  const isGuest = user == null;
  const [envOpen, setEnvOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1800);
  };

  /** Run `action` if signed in, otherwise open the auth prompt with `reason`. */
  const requireAuth = (reason: string, action: () => void) => () => {
    if (isGuest) openAuthPrompt(reason);
    else action();
  };

  const handleSave = requireAuth('Sign in to save this architecture to your workspace.', onSave);

  const handleExport = requireAuth('Sign in to export your architecture as JSON.', () => {
    downloadArchitecture({ name, graph: toGraph(), traffic });
    showFlash('Exported');
  });

  const handleShare = requireAuth('Sign in to create a shareable link.', async () => {
    const link = buildShareLink({ name, graph: toGraph(), traffic });
    try {
      await navigator.clipboard.writeText(link);
      showFlash('Link copied');
    } catch {
      window.prompt('Copy this shareable link:', link);
    }
  });

  const activeMultiplier =
    environments.find((e) => e.name === environment)?.multiplier ?? 1;

  return (
    <header className="relative z-[45] flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-surface/80 px-3 backdrop-blur">
      {/* Library toggle (small screens) */}
      <button
        type="button"
        aria-label="Toggle component library"
        onClick={() => setLibraryOpen(!libraryOpen)}
        className="btn-ghost !px-2 lg:hidden"
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <LogoMark />
        <span className="text-[15px] font-bold tracking-tight">ScaleForge</span>
        <span className="chip bg-accent/15 text-accent">Beta</span>
      </div>

      {/* Nav tabs */}
      <nav className="ml-2 hidden items-center gap-1 md:flex">
        {tabs.map((t) => (
          <Tab
            key={t.id}
            icon={t.icon}
            label={t.label}
            active={view === t.id}
            onClick={() => setView(t.id)}
          />
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs lg:block">
          {flash ? (
            <span className="text-accent">{flash}</span>
          ) : (
            <span className="text-ink-faint">{dirty ? 'unsaved changes' : 'all changes saved'}</span>
          )}
        </span>

        {/* Environment selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setEnvOpen((o) => !o)}
            onBlur={() => setTimeout(() => setEnvOpen(false), 120)}
            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-panel/60 px-2.5 py-1.5 text-sm hover:bg-surface-hover"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
            <span className="font-medium">{environment}</span>
            <span className="font-mono text-xs text-ink-faint">{activeMultiplier.toFixed(1)}×</span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
          </button>
          {envOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-xl border border-white/[0.06] bg-surface-panel shadow-panel">
              {environments.map((env) => (
                <button
                  key={env.name}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setEnvironment(env.name);
                    setTraffic({ peakTrafficMultiplier: env.multiplier });
                    setEnvOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-surface-hover"
                >
                  <span>{env.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-faint">{env.multiplier.toFixed(1)}×</span>
                    {env.name === environment && <Check className="h-3.5 w-3.5 text-accent" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden items-center gap-1 sm:flex">
          <IconButton label={isSaving ? 'Saving…' : 'Save'} shortcut="⌘S" onClick={handleSave}>
            <Save className={`h-4 w-4 ${isSaving ? 'animate-pulse text-accent' : ''}`} />
          </IconButton>
          <IconButton label="Export" onClick={handleExport}><Upload className="h-4 w-4" /></IconButton>
          <IconButton label="Share" onClick={handleShare}><Share2 className="h-4 w-4" /></IconButton>
        </div>

        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="btn-ghost hidden xl:inline-flex"
        >
          <FileText className="h-4 w-4" /> Report
        </button>

        <button type="button" onClick={onRun} disabled={isRunning} className="btn-primary">
          <Play className="h-4 w-4" fill="currentColor" />
          <span className="hidden sm:inline">{isRunning ? 'Running…' : 'Run Simulation'}</span>
          <span className="ml-0.5 hidden rounded bg-black/20 px-1 font-mono text-[10px] lg:inline">⌘⏎</span>
        </button>

        {/* Account cluster */}
        <span className="mx-0.5 hidden h-6 w-px bg-white/[0.08] sm:block" />
        {isGuest ? (
          <button
            type="button"
            onClick={() => openAuthPrompt('Sign in to save and sync your architectures.', 'login')}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-panel/60 px-2.5 py-1.5 text-sm text-ink-muted transition hover:bg-surface-hover hover:text-ink"
            title={`${guestRunsLeft()} free guest simulations left · sign in for unlimited`}
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Sign in</span>
          </button>
        ) : (
          <ProfileMenu />
        )}

        {/* Inspector toggle (small screens) */}
        <button
          type="button"
          aria-label="Toggle inspector"
          onClick={() => setInspectorOpen(!inspectorOpen)}
          className="btn-ghost !px-2 xl:hidden"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function Tab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? 'bg-surface-panel text-ink shadow-sm ring-1 ring-white/[0.06]'
          : 'text-ink-faint hover:text-ink-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({
  children,
  label,
  shortcut,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-hover hover:text-ink"
    >
      {children}
    </button>
  );
}

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z"
        fill="url(#sf-grad)"
        opacity="0.18"
      />
      <path
        d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z"
        stroke="url(#sf-grad)"
        strokeWidth="1.5"
      />
      <path d="M16 9 L16 23 M11 13 L21 19 M21 13 L11 19" stroke="#2fd39e" strokeWidth="1.6" strokeLinecap="round" />
      <defs>
        <linearGradient id="sf-grad" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#45e3b0" />
          <stop offset="1" stopColor="#4aa3ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
