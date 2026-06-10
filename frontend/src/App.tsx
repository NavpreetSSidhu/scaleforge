import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, setAuthTokenProvider, UnauthorizedError } from '@/lib/api';
import { readShareLink } from '@/lib/share';
import { useArchitectureStore } from '@/store/architectureStore';
import { GUEST_SIM_LIMIT, useAuthStore } from '@/store/authStore';
import { useAchievementToastStore } from '@/store/achievementToastStore';
import { TopBar } from '@/features/shell/TopBar';
import { BuilderView } from '@/features/builder/BuilderView';
import { DashboardView } from '@/features/dashboard/DashboardView';
import { MobileView } from '@/features/mobile/MobileView';
import { ReportDrawer } from '@/features/report/ReportDrawer';
import { AuthModal } from '@/features/auth/AuthModal';
import { AchievementToaster } from '@/features/achievements/AchievementToast';

// api.ts reads the token through this provider so it stays decoupled from the store.
setAuthTokenProvider(() => useAuthStore.getState().token);

export default function App() {
  const queryClient = useQueryClient();
  const {
    id,
    name,
    traffic,
    toGraph,
    view,
    setSimulationResult,
    setNodes,
    setEdges,
    setName,
    setView,
    setTraffic,
    markSaved,
  } = useArchitectureStore();

  const simulate = useMutation({
    mutationFn: () => api.simulate({ architectureId: id ?? undefined, name, graph: toGraph(), traffic }),
    onSuccess: (result) => {
      setSimulationResult(result);
      useAuthStore.getState().registerGuestRun();
      if (result.newAchievements?.length) {
        useAchievementToastStore.getState().push(result.newAchievements);
        // Refresh the dashboard grid for signed-in users.
        if (useAuthStore.getState().user) {
          queryClient.invalidateQueries({ queryKey: ['achievements'] });
        }
      }
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name, graph: toGraph(), traffic };
      return id ? api.updateArchitecture(id, payload) : api.createArchitecture(payload);
    },
    onSuccess: (arch) => {
      markSaved(arch.id);
      queryClient.invalidateQueries({ queryKey: ['architectures'] });
    },
    onError: (err) => {
      if (err instanceof UnauthorizedError) {
        useAuthStore.getState().openAuthPrompt('Sign in to save this architecture to your workspace.');
      }
    },
  });

  /** Guests get a limited number of runs; past the cap we prompt for login. */
  const runSimulation = () => {
    const auth = useAuthStore.getState();
    if (!auth.user && auth.guestRunsLeft() <= 0) {
      auth.openAuthPrompt(
        `You've used all ${GUEST_SIM_LIMIT} free simulations. Sign in to keep simulating.`,
      );
      return;
    }
    simulate.mutate();
  };

  const requestSave = () => {
    const auth = useAuthStore.getState();
    if (!auth.user) {
      auth.openAuthPrompt('Sign in to save this architecture to your workspace.');
      return;
    }
    save.mutate();
  };

  // Once a simulation exists, re-run it (debounced) whenever traffic changes so
  // the load dial, metrics, bottleneck and recommendations stay live as you
  // scale traffic up or down. Skipped until the first explicit run, and capped
  // for guests so dragging the dial doesn't burn unlimited runs.
  const trafficKey = `${traffic.concurrentUsers}|${traffic.requestsPerUserMin}|${traffic.peakTrafficMultiplier}`;
  useEffect(() => {
    if (!useArchitectureStore.getState().simulationResult) return;
    const auth = useAuthStore.getState();
    if (!auth.user && auth.guestRunsLeft() <= 0) return;
    const handle = window.setTimeout(() => simulate.mutate(), 450);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trafficKey]);

  // Hydrate the session from a persisted token on first mount.
  useEffect(() => {
    const { token, setUser, setReady, logout } = useAuthStore.getState();
    if (!token) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => logout())
      .finally(() => setReady(true));
  }, []);

  // Load a shared architecture from the URL hash (if any) on first mount.
  useEffect(() => {
    const shared = readShareLink();
    if (shared) {
      setName(shared.name);
      setNodes(shared.graph.nodes);
      setEdges(shared.graph.edges);
      setTraffic(shared.traffic);
      setView('builder');
      history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: ⌘⏎ run, ⌘S save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runSimulation();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        requestSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, name]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base text-ink">
      <TopBar
        onRun={runSimulation}
        isRunning={simulate.isPending}
        onSave={() => save.mutate()}
        isSaving={save.isPending}
      />

      {view === 'builder' && <BuilderView />}
      {view === 'dashboard' && <DashboardView />}
      {view === 'mobile' && <MobileView onRun={runSimulation} isRunning={simulate.isPending} />}

      <ReportDrawer />
      <AuthModal />
      <AchievementToaster />
    </div>
  );
}
