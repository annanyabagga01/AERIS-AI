import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  CalendarClock,
  Home,
  Leaf,
  MapPin,
  Menu,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { classifyCpcbAqi } from './lib/aqi.ts';
import {
  loadImpactLog,
  loadPreferences,
  saveImpactLog,
  savePreferences,
} from './lib/storage.ts';
import type {
  CityAqiResponse,
  FamilyPreferences,
  ImpactLogEntry,
} from './lib/types.ts';
import { AiAssistantPage } from './pages/AiAssistantPage.tsx';
import { CommunityHubPage } from './pages/CommunityHubPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { EcoAlternativesPage } from './pages/EcoAlternativesPage.tsx';
import { ImpactTrackerPage } from './pages/ImpactTrackerPage.tsx';
import { IndoorOptimizerPage } from './pages/IndoorOptimizerPage.tsx';
import { PollutionMapPage } from './pages/PollutionMapPage.tsx';
import { RoutinePlannerPage } from './pages/RoutinePlannerPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

type NavId =
  | 'dashboard'
  | 'map'
  | 'ai'
  | 'indoor'
  | 'routines'
  | 'eco'
  | 'impact'
  | 'community'
  | 'settings';

type NavGroup = 'Atmospheric Monitoring' | 'Family Protection' | 'Sustainability & Setup';

const NAV_ITEMS: {
  id: NavId;
  label: string;
  shortLabel: string;
  icon: typeof Activity;
  subtitle: string;
  group: NavGroup;
}[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    icon: Activity,
    subtitle: 'India-wide simulated AQI & 3D atmospheric telemetry (Demo Mode)',
    group: 'Atmospheric Monitoring',
  },
  {
    id: 'map',
    label: 'Pollution Map',
    shortLabel: 'Map',
    icon: MapPin,
    subtitle: 'Indian monitoring station network',
    group: 'Atmospheric Monitoring',
  },
  {
    id: 'ai',
    label: 'AI Advisor',
    shortLabel: 'AI',
    icon: Bot,
    subtitle: 'Gemini smog & daily planning assistant',
    group: 'Family Protection',
  },
  {
    id: 'indoor',
    label: 'Indoor Air',
    shortLabel: 'Indoor',
    icon: Home,
    subtitle: 'Ventilation timing, HEPA sizing & hygiene',
    group: 'Family Protection',
  },
  {
    id: 'routines',
    label: 'Daily Routine',
    shortLabel: 'Routine',
    icon: CalendarClock,
    subtitle: 'Adaptive morning, afternoon & evening schedule',
    group: 'Family Protection',
  },
  {
    id: 'eco',
    label: 'Eco Transport',
    shortLabel: 'Eco',
    icon: Leaf,
    subtitle: 'Alternatives & sourced CO2e calculator',
    group: 'Sustainability & Setup',
  },
  {
    id: 'impact',
    label: 'Impact Tracker',
    shortLabel: 'Impact',
    icon: TrendingUp,
    subtitle: 'Personal CO2e avoided & habit streaks',
    group: 'Sustainability & Setup',
  },
  {
    id: 'community',
    label: 'Community Hub',
    shortLabel: 'Hub',
    icon: Users,
    subtitle: 'Opt-in anonymous actions & challenges',
    group: 'Sustainability & Setup',
  },
  {
    id: 'settings',
    label: 'Preferences',
    shortLabel: 'Prefs',
    icon: Settings,
    subtitle: 'City, household & server configuration health',
    group: 'Sustainability & Setup',
  },
];

const NAV_GROUPS: NavGroup[] = [
  'Atmospheric Monitoring',
  'Family Protection',
  'Sustainability & Setup',
];

const MOBILE_DOCK_IDS: NavId[] = ['dashboard', 'map', 'ai', 'routines'];

function AerisMark() {
  const uid = useId();
  const ringGradId = `${uid}-ring`;
  const coreGradId = `${uid}-core`;

  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle
        cx="14"
        cy="14"
        r="11.5"
        stroke={`url(#${ringGradId})`}
        strokeWidth="1.5"
        strokeOpacity="0.9"
      />
      <ellipse
        cx="14"
        cy="14"
        rx="11.5"
        ry="4.8"
        transform="rotate(-24 14 14)"
        stroke="#22D3EE"
        strokeWidth="1.25"
        strokeOpacity="0.72"
      />
      <circle cx="14" cy="14" r="3.5" fill={`url(#${coreGradId})`} />
      <defs>
        <linearGradient id={ringGradId} x1="2" y1="2" x2="26" y2="26">
          <stop stopColor="#22D3EE" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id={coreGradId} x1="10" y1="10" x2="18" y2="18">
          <stop stopColor="#67E8F9" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function AerisShell() {
  const [activeNav, setActiveNav] = useState<NavId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [preferences, setPreferences] = useState<FamilyPreferences>(() =>
    loadPreferences()
  );
  const [impactEntries, setImpactEntries] = useState<ImpactLogEntry[]>(() =>
    loadImpactLog()
  );

  const [selectedStation, setSelectedStation] = useState<string>('all');
  const [aqiData, setAqiData] = useState<CityAqiResponse | null>(null);
  const [aqiLoading, setAqiLoading] = useState<boolean>(true);
  const [aqiError, setAqiError] = useState<string | null>(null);
  const aqiAbortRef = useRef<AbortController | null>(null);
  const aqiSeqRef = useRef(0);

  const fetchCityAqi = useCallback(
    async (
      cityName: string,
      stationId: string = 'all',
      forceRefresh: boolean = false
    ) => {
      aqiAbortRef.current?.abort();
      const controller = new AbortController();
      aqiAbortRef.current = controller;
      const seq = ++aqiSeqRef.current;

      setAqiLoading(true);
      setAqiError(null);
      setAqiData((prev) =>
        prev && prev.city.toLowerCase() !== cityName.toLowerCase() ? null : prev
      );
      try {
        const params = new URLSearchParams({ city: cityName });
        if (stationId && stationId !== 'all') {
          params.set('station', stationId);
        }
        if (forceRefresh) {
          params.set('refresh', '1');
        }
        const res = await fetch(`/api/aqi?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          let detail = `Air quality service returned HTTP ${res.status}`;
          try {
            const errJson = (await res.json()) as { error?: string };
            if (errJson.error) detail = errJson.error;
          } catch {
            // Keep HTTP status fallback
          }
          throw new Error(detail);
        }
        const json = (await res.json()) as CityAqiResponse;
        if (seq === aqiSeqRef.current) {
          setAqiData(json);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (seq === aqiSeqRef.current) {
          setAqiError(
            err instanceof Error
              ? err.message
              : 'Unable to reach air quality backend.'
          );
        }
      } finally {
        if (seq === aqiSeqRef.current) {
          setAqiLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void fetchCityAqi(preferences.city, selectedStation, false);
    return () => {
      aqiAbortRef.current?.abort();
    };
  }, [preferences.city, selectedStation, fetchCityAqi]);

  const handleUpdatePreferences = (next: FamilyPreferences) => {
    if (next.city !== preferences.city) {
      setSelectedStation('all');
    }
    setPreferences(next);
    savePreferences(next);
  };

  const handleCityChange = (nextCity: string) => {
    setSelectedStation('all');
    const updated = { ...preferences, city: nextCity };
    setPreferences(updated);
    savePreferences(updated);
  };

  const handleAddImpact = (entry: ImpactLogEntry) => {
    setImpactEntries((prev) => {
      const next = [entry, ...prev];
      saveImpactLog(next);
      return next;
    });
  };

  const handleDeleteImpact = (id: string) => {
    setImpactEntries((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveImpactLog(next);
      return next;
    });
  };

  const activeMeta =
    NAV_ITEMS.find((n) => n.id === activeNav) ?? NAV_ITEMS[0];
  const aqiMeta = classifyCpcbAqi(aqiData?.primaryAqi ?? null);

  const selectNav = (id: NavId) => {
    setActiveNav(id);
    setMobileMenuOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  return (
    <div className="min-h-screen aeris-grid-bg text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-68 lg:shrink-0 border-r border-slate-800/80 bg-[#050916]/95 sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-slate-800/80 flex items-center gap-3">
          <AerisMark />
          <div className="min-w-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                selectNav('dashboard');
              }}
              className="block text-base font-bold tracking-tight text-slate-50 whitespace-nowrap"
            >
              AERIS AI
            </a>
            <p className="text-[11px] text-slate-400 truncate">
              Breathe Smarter. Live Better.
            </p>
          </div>
        </div>

        <nav
          aria-label="Primary Workspace Navigation"
          className="flex-1 px-3 py-4 space-y-5 overflow-y-auto"
        >
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((i) => i.group === group);
            return (
              <div key={group} className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-medium text-slate-500">
                  {group}
                </p>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => selectNav(item.id)}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        isActive
                          ? 'text-cyan-200'
                          : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="aeris-sidebar-active"
                          transition={{
                            type: 'spring',
                            stiffness: 420,
                            damping: 36,
                          }}
                          className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-500/18 to-emerald-500/10 border border-cyan-500/35 shadow-[inset_0_1px_0_rgba(103,232,249,0.14)]"
                        />
                      )}
                      <Icon
                        className={`relative z-10 w-4 h-4 shrink-0 ${
                          isActive ? 'text-cyan-300' : 'text-slate-400'
                        }`}
                      />
                      <span className="relative z-10 truncate">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => selectNav('dashboard')}
            className="w-full text-left p-3 rounded-lg bg-[#080F20] border border-slate-800/90 hover:border-cyan-500/35 transition-colors space-y-1"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-200 truncate">
                {preferences.city}
              </span>
              <span className="font-mono text-[11px] text-amber-300 shrink-0">
                Simulated · Demo
              </span>
            </div>
            <p className="font-mono tabular-nums text-xs text-slate-300 flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: aqiMeta.accentHex }}
                aria-hidden="true"
              />
              <span>
                AQI {aqiData?.primaryAqi ?? 'N/A'} ·{' '}
                {aqiData?.category ?? 'Loading'}
              </span>
            </p>
          </button>
        </div>
      </aside>

      {/* Animated Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-0 bg-black/75"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-72 max-w-[85vw] bg-[#060B18] border-r border-slate-800 flex flex-col shadow-2xl"
            >
              <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AerisMark />
                  <div>
                    <span className="text-base font-bold text-slate-50">
                      AERIS AI
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Breathe Smarter. Live Better.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav
                aria-label="Mobile Navigation"
                className="flex-1 p-3 space-y-1 overflow-y-auto"
              >
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => selectNav(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium transition-colors min-h-[44px] whitespace-nowrap ${
                        isActive
                          ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/35'
                          : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (56px mobile, 64px desktop — fits well inside mobile sticky budget) */}
        <header className="sticky top-0 z-30 bg-[#050814]/95 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 h-14 lg:h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-1.5 rounded-lg text-slate-200 hover:bg-slate-800 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-100 truncate">
                {activeMeta.label}
              </h1>
              <p className="hidden sm:block text-xs text-slate-400 truncate">
                {activeMeta.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => selectNav('settings')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/25 bg-[#091022] text-xs font-medium text-slate-100 hover:border-cyan-400/50 transition-colors whitespace-nowrap min-h-[40px]"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>{preferences.city}</span>
            </button>
          </div>
        </header>

        {/* Active Page Canvas */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-20 lg:pb-8 max-w-[1340px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNav}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeNav === 'dashboard' && (
                <DashboardPage
                  city={preferences.city}
                  selectedStation={selectedStation}
                  preferences={preferences}
                  onCityChange={handleCityChange}
                  onStationChange={setSelectedStation}
                  data={aqiData}
                  loading={aqiLoading}
                  error={aqiError}
                  onRetry={() =>
                    void fetchCityAqi(preferences.city, selectedStation, true)
                  }
                  onOpenAi={() => selectNav('ai')}
                  onOpenRoutines={() => selectNav('routines')}
                />
              )}
              {activeNav === 'map' && (
                <PollutionMapPage
                  activeCity={preferences.city}
                  onSelectCity={(c) => {
                    handleCityChange(c);
                    selectNav('dashboard');
                  }}
                />
              )}
              {activeNav === 'ai' && (
                <AiAssistantPage
                  aqiData={aqiData}
                  stationId={selectedStation}
                  preferences={preferences}
                />
              )}
              {activeNav === 'indoor' && (
                <IndoorOptimizerPage
                  city={preferences.city}
                  aqi={aqiData?.primaryAqi ?? null}
                  category={aqiData?.category ?? 'Unavailable'}
                  pollutionSensitiveHousehold={
                    preferences.pollutionSensitiveHousehold
                  }
                />
              )}
              {activeNav === 'routines' && (
                <RoutinePlannerPage
                  aqi={aqiData?.primaryAqi ?? null}
                  aqiData={aqiData}
                  preferences={preferences}
                  onUpdatePreferences={handleUpdatePreferences}
                />
              )}
              {activeNav === 'eco' && (
                <EcoAlternativesPage
                  city={preferences.city}
                  aqi={aqiData?.primaryAqi ?? null}
                  pollutionSensitiveHousehold={
                    preferences.pollutionSensitiveHousehold
                  }
                />
              )}
              {activeNav === 'impact' && (
                <ImpactTrackerPage
                  city={preferences.city}
                  aqi={aqiData?.primaryAqi ?? null}
                  pollutionSensitiveHousehold={
                    preferences.pollutionSensitiveHousehold
                  }
                  entries={impactEntries}
                  onAddEntry={handleAddImpact}
                  onDeleteEntry={handleDeleteImpact}
                />
              )}
              {activeNav === 'community' && (
                <CommunityHubPage
                  preferences={preferences}
                  onUpdatePreferences={handleUpdatePreferences}
                />
              )}
              {activeNav === 'settings' && (
                <SettingsPage
                  preferences={preferences}
                  onSavePreferences={handleUpdatePreferences}
                  aqiData={aqiData}
                  aqiLoading={aqiLoading}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Compact Mobile Thumb Quick-Nav Bar (56px tall; combined top+bottom <= 112px = 13.2% of 844px) */}
        <nav
          aria-label="Mobile Quick Navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-[#050915]/95 backdrop-blur-md border-t border-slate-800/85 grid grid-cols-5 px-1"
        >
          {MOBILE_DOCK_IDS.map((id) => {
            const item = NAV_ITEMS.find((n) => n.id === id)!;
            const Icon = item.icon;
            const isActive = activeNav === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => selectNav(id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium min-h-[44px] transition-colors ${
                  isActive ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-[64px]">{item.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="More pages menu"
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium min-h-[44px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Menu className="w-4 h-4" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AerisShell />
    </ErrorBoundary>
  );
}
