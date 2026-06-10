import { useState } from 'react';
import {
  Check,
  ChevronDown,
  LayoutDashboard,
  Hammer,
  GitCompareArrows,
  Smartphone,
  Save,
  Share2,
  Upload,
  FileText,
  Play,
  PanelLeft,
  PanelRight,
  LogIn,
  MoreHorizontal,
} from 'lucide-react';
import { useArchitectureStore, type AppView } from '@/store/architectureStore';
import { useAuthStore } from '@/store/authStore';
import { useSnackbar } from '@/store/snackbarStore';
import { buildShareLink, downloadArchitecture } from '@/lib/share';
import { ProfileMenu } from '@/features/auth/ProfileMenu';
import { ProviderSelector } from '@/features/shell/ProviderSelector';
import { Tooltip } from '@/components/Tooltip';
import { Spinner } from '@/components/Spinner';

const environments: { name: string; multiplier: number }[] = [
  { name: 'Staging', multiplier: 0.5 },
  { name: 'Production', multiplier: 1.0 },
  { name: 'Peak', multiplier: 1.5 },
];

const tabs: { id: AppView; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'builder', label: 'Builder', icon: <Hammer className="h-4 w-4" /> },
  { id: 'compare', label: 'Compare', icon: <GitCompareArrows className="h-4 w-4" /> },
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
  const pushSnack = useSnackbar((s) => s.push);
  const isGuest = user == null;
  const [envOpen, setEnvOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  /** Run `action` if signed in, otherwise open the auth prompt with `reason`. */
  const requireAuth = (reason: string, action: () => void) => () => {
    if (isGuest) openAuthPrompt(reason);
    else action();
  };

  const handleSave = requireAuth('Sign in to save this architecture to your workspace.', onSave);

  const handleExport = requireAuth('Sign in to export your architecture as JSON.', () => {
    downloadArchitecture({ name, graph: toGraph(), traffic });
    pushSnack('Architecture exported as JSON', 'success');
  });

  const handleShare = requireAuth('Sign in to create a shareable link.', async () => {
    const link = buildShareLink({ name, graph: toGraph(), traffic });
    try {
      await navigator.clipboard.writeText(link);
      pushSnack('Shareable link copied to clipboard', 'success');
    } catch {
      window.prompt('Copy this shareable link:', link);
    }
  });

  const runAction = (fn: () => void) => () => {
    setActionsOpen(false);
    fn();
  };

  const activeMultiplier =
    environments.find((e) => e.name === environment)?.multiplier ?? 1;

  return (
    <header className="relative z-[45] flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-surface/80 px-3 backdrop-blur">
      {/* Library toggle (small screens) */}
      <Tooltip label="Toggle component library" className="lg:hidden">
        <button
          type="button"
          aria-label="Toggle component library"
          onClick={() => setLibraryOpen(!libraryOpen)}
          className="btn-ghost !px-2"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </Tooltip>

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
          <span className="text-ink-faint">{dirty ? 'unsaved changes' : 'all changes saved'}</span>
        </span>

        {/* Cloud pricing provider */}
        <div className="hidden sm:block">
          <ProviderSelector />
        </div>

        {/* Environment selector */}
        <div className="relative hidden sm:block">
          <Tooltip label="Traffic environment (peak multiplier)">
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
          </Tooltip>
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

        {/* Actions popover: Save / Export / Share / Report */}
        <div className="relative">
          <Tooltip label="Actions">
            <button
              type="button"
              onClick={() => setActionsOpen((o) => !o)}
              onBlur={() => setTimeout(() => setActionsOpen(false), 150)}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-surface-panel/60 px-2.5 py-1.5 text-sm hover:bg-surface-hover"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
            >
              {isSaving ? <Spinner className="h-4 w-4 text-accent" /> : <MoreHorizontal className="h-4 w-4" />}
              <span className="hidden md:inline">Actions</span>
            </button>
          </Tooltip>
          {actionsOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-xl border border-white/[0.06] bg-surface-panel py-1 shadow-panel">
              <ActionItem
                icon={isSaving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                label={isSaving ? 'Saving…' : 'Save'}
                shortcut="⌘S"
                onSelect={runAction(handleSave)}
              />
              <ActionItem
                icon={<Upload className="h-4 w-4" />}
                label="Export JSON"
                onSelect={runAction(handleExport)}
              />
              <ActionItem
                icon={<Share2 className="h-4 w-4" />}
                label="Share link"
                onSelect={runAction(handleShare)}
              />
              <div className="my-1 border-t border-white/[0.06]" />
              <ActionItem
                icon={<FileText className="h-4 w-4" />}
                label="Report"
                onSelect={runAction(() => setReportOpen(true))}
              />
            </div>
          )}
        </div>

        <Tooltip label="Run load simulation (⌘⏎)">
          <button type="button" onClick={onRun} disabled={isRunning} className="btn-primary">
            {isRunning ? <Spinner className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
            <span className="hidden sm:inline">{isRunning ? 'Running…' : 'Run Simulation'}</span>
            <span className="ml-0.5 hidden rounded bg-black/20 px-1 font-mono text-[10px] lg:inline">⌘⏎</span>
          </button>
        </Tooltip>

        {/* Account cluster */}
        <span className="mx-0.5 hidden h-6 w-px bg-white/[0.08] sm:block" />
        {isGuest ? (
          <Tooltip label={`${guestRunsLeft()} free guest simulations left · sign in for unlimited`}>
            <button
              type="button"
              onClick={() => openAuthPrompt('Sign in to save and sync your architectures.', 'login')}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-panel/60 px-2.5 py-1.5 text-sm text-ink-muted transition hover:bg-surface-hover hover:text-ink"
            >
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          </Tooltip>
        ) : (
          <ProfileMenu />
        )}

        {/* Inspector toggle (small screens) */}
        <Tooltip label="Toggle inspector" side="bottom" className="xl:hidden">
          <button
            type="button"
            aria-label="Toggle inspector"
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className="btn-ghost !px-2"
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </Tooltip>
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

function ActionItem({
  icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      // onMouseDown so the parent button's onBlur (which closes the menu) doesn't
      // beat the click and swallow the selection.
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-ink-muted transition hover:bg-surface-hover hover:text-ink"
    >
      <span className="flex h-4 w-4 items-center justify-center text-ink-faint">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="font-mono text-[10px] text-ink-ghost">{shortcut}</span>}
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
