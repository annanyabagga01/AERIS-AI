import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  LocateFixed,
  RefreshCw,
  Server,
} from 'lucide-react';
import { findNearestSupportedCity, INDIAN_CITIES } from '../lib/aqi.ts';
import {
  containsSensitivePiiOrLocation,
  sanitizeAnonymousHandle,
} from '../lib/community.ts';
import type {
  CommuteMode,
  FamilyPreferences,
  SourceHealthReport,
} from '../lib/types.ts';

interface SettingsPageProps {
  preferences: FamilyPreferences;
  onSavePreferences: (next: FamilyPreferences) => void;
}

interface HealthStatus {
  status: string;
  integrations: {
    geminiConfigured: boolean;
    cpcbConfigured: boolean;
    openAqConfigured: boolean;
    firebaseConfigured: boolean;
  };
  sources?: SourceHealthReport;
}

export function SettingsPage({
  preferences,
  onSavePreferences,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<FamilyPreferences>(preferences);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHealth((await res.json()) as HealthStatus);
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : 'Unable to check server health.'
      );
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSavedNotice(false);

    const piiWarning = containsSensitivePiiOrLocation(draft.anonymousHandle);
    if (piiWarning) {
      setSaveError(piiWarning);
      return;
    }

    const sanitized: FamilyPreferences = {
      ...draft,
      workStartHour: draft.workStartHour || '09:00',
      workEndHour: draft.workEndHour || '18:00',
      anonymousHandle: sanitizeAnonymousHandle(draft.anonymousHandle),
    };
    setDraft(sanitized);
    onSavePreferences(sanitized);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleLocateNearestCity = () => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('Browser geolocation is unavailable in this environment.');
      return;
    }
    setGeoStatus('Requesting one-time browser location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearestSupportedCity(
          pos.coords.latitude,
          pos.coords.longitude
        );
        const updated = { ...draft, city: nearest.name };
        setDraft(updated);
        onSavePreferences(updated);
        setGeoStatus(
          `Matched nearest supported city: ${nearest.name}, ${nearest.state}. Exact coordinates were NOT stored.`
        );
      },
      (err) => {
        setGeoStatus(`Geolocation skipped or denied (${err.message}).`);
      },
      { timeout: 8000 }
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Household & Preferences Form */}
        <section className="lg:col-span-7 aeris-panel rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Household & Air Quality Preferences
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Stored locally in your browser. AERIS AI never stores precise GPS
              coordinates or medical diagnoses.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pref-city"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Primary City
                </label>
                <select
                  id="pref-city"
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
                >
                  {INDIAN_CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.state})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={handleLocateNearestCity}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-cyan-300 hover:bg-slate-800/80 transition-colors"
                >
                  <LocateFixed className="w-4 h-4" />
                  <span>Detect Nearest City (No GPS Stored)</span>
                </button>
              </div>
            </div>

            {geoStatus && (
              <p className="text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 rounded-lg px-3 py-2">
                {geoStatus}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="pref-household"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Household Size
                </label>
                <input
                  id="pref-household"
                  type="number"
                  min={1}
                  max={15}
                  value={draft.householdSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      householdSize: Math.max(
                        1,
                        Math.min(15, Number(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="pref-work-start"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Work / School Start
                </label>
                <input
                  id="pref-work-start"
                  type="time"
                  value={draft.workStartHour}
                  onChange={(e) =>
                    setDraft({ ...draft, workStartHour: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="pref-work-end"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Return Commute
                </label>
                <input
                  id="pref-work-end"
                  type="time"
                  value={draft.workEndHour}
                  onChange={(e) =>
                    setDraft({ ...draft, workEndHour: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pref-commute"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Default Commute Mode
                </label>
                <select
                  id="pref-commute"
                  value={draft.commuteMode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      commuteMode: e.target.value as CommuteMode,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
                >
                  <option value="metro">Metro Rail</option>
                  <option value="bus">City Bus</option>
                  <option value="carpool">Shared Carpool</option>
                  <option value="ev_cab">EV Cab / Auto</option>
                  <option value="solo_car">Private Car</option>
                  <option value="two_wheeler">Two-Wheeler</option>
                  <option value="walk_cycle">Walk / Cycle</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="pref-handle"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Anonymous Community Handle
                </label>
                <input
                  id="pref-handle"
                  type="text"
                  maxLength={36}
                  value={draft.anonymousHandle}
                  onChange={(e) =>
                    setDraft({ ...draft, anonymousHandle: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-800/80 text-xs">
              <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.hasChildren}
                  onChange={(e) =>
                    setDraft({ ...draft, hasChildren: e.target.checked })
                  }
                  className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
                />
                <span>Include school & children outdoor schedule adaptations</span>
              </label>

              <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.hasOlderAdults}
                  onChange={(e) =>
                    setDraft({ ...draft, hasOlderAdults: e.target.checked })
                  }
                  className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
                />
                <span>Include older adult indoor-first adjustments</span>
              </label>

              <label className="flex items-center gap-2.5 text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.pollutionSensitiveHousehold}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      pollutionSensitiveHousehold: e.target.checked,
                    })
                  }
                  className="rounded border-slate-600 bg-[#080E1C] text-cyan-500"
                />
                <span>
                  Pollution-sensitive household (stricter Moderate AQI thresholds, no medical info stored)
                </span>
              </label>
            </div>

            {saveError && (
              <p
                role="alert"
                className="text-xs text-rose-200 bg-rose-500/10 border border-rose-500/35 rounded-lg px-3 py-2 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{saveError}</span>
              </p>
            )}

            <div className="flex items-center justify-between gap-4 pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
              >
                Save Preferences
              </button>
              {savedNotice && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Preferences saved locally</span>
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Server Integration Health Panel */}
        <section className="lg:col-span-5 aeris-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-semibold text-slate-100">
                Server Integration Health
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void loadHealth()}
              disabled={healthLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`}
              />
              <span>Check</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            All API keys are read exclusively on the Node.js server from environment
            secrets. No secrets are exposed to the browser.
          </p>

          {healthError && (
            <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              Health check failed ({healthError}).
            </p>
          )}

          <div className="divide-y divide-slate-800/80 text-xs">
            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-200">
                  CPCB data.gov.in Feed
                </p>
                <p className="text-slate-400">
                  {health?.sources?.cpcb?.message ??
                    'Requires DATA_GOV_IN_API_KEY & DATA_GOV_IN_RESOURCE_ID'}
                </p>
              </div>
              <span
                className={
                  health?.integrations.cpcbConfigured
                    ? health?.sources?.cpcb?.status === 'error'
                      ? 'text-rose-300 font-medium shrink-0'
                      : 'text-emerald-300 font-medium shrink-0'
                    : 'text-amber-300 font-medium shrink-0'
                }
              >
                {health?.integrations.cpcbConfigured
                  ? health?.sources?.cpcb?.status === 'error'
                    ? 'Error'
                    : 'Configured'
                  : 'Demo Fallback'}
              </span>
            </div>

            <div className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-200">
                  OpenAQ v3 Sensor Feed
                </p>
                <p className="text-slate-400">
                  {health?.sources?.openAq?.message ??
                    'Optional sensor readings via OPENAQ_API_KEY'}
                </p>
              </div>
              <span
                className={
                  health?.integrations.openAqConfigured
                    ? health?.sources?.openAq?.status === 'error'
                      ? 'text-rose-300 font-medium shrink-0'
                      : 'text-emerald-300 font-medium shrink-0'
                    : 'text-slate-400 shrink-0'
                }
              >
                {health?.integrations.openAqConfigured
                  ? health?.sources?.openAq?.status === 'error'
                    ? 'Error'
                    : 'Configured'
                  : 'Optional / Off'}
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-200">
                  Gemini AI Server Proxy
                </p>
                <p className="text-slate-400">
                  Server-side @google/genai via GEMINI_API_KEY
                </p>
              </div>
              <span
                className={
                  health?.integrations.geminiConfigured
                    ? 'text-emerald-300 font-medium'
                    : 'text-amber-300 font-medium'
                }
              >
                {health?.integrations.geminiConfigured
                  ? 'Configured'
                  : 'Key Not Set'}
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-200">
                  Firebase Auth & Firestore
                </p>
                <p className="text-slate-400">
                  Opt-in anonymous community hub storage
                </p>
              </div>
              <span
                className={
                  health?.integrations.firebaseConfigured
                    ? 'text-emerald-300 font-medium'
                    : 'text-slate-400'
                }
              >
                {health?.integrations.firebaseConfigured
                  ? 'Configured'
                  : 'Demo Only'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
