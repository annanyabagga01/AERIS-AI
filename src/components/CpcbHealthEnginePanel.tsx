import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wind,
} from 'lucide-react';
import {
  buildCpcbHealthRecommendation,
  CPCB_HEALTH_BANDS,
  OFFICIAL_SIX_CPCB_CATEGORIES,
} from '../lib/cpcbHealth.ts';
import type { CityAqiResponse, FamilyPreferences } from '../lib/types.ts';

interface CpcbHealthEnginePanelProps {
  aqiData: CityAqiResponse | null;
  preferences: FamilyPreferences;
  onOpenAi: () => void;
  onOpenRoutines: () => void;
}

export function CpcbHealthEnginePanel({
  aqiData,
  preferences,
  onOpenAi,
  onOpenRoutines,
}: CpcbHealthEnginePanelProps) {
  const [showAllBands, setShowAllBands] = useState(false);

  const rec = useMemo(
    () => buildCpcbHealthRecommendation({ aqiData, preferences }),
    [aqiData, preferences]
  );

  const bandMeta = CPCB_HEALTH_BANDS[rec.category];

  return (
    <section
      aria-label="India CPCB Health Recommendation Engine"
      data-testid="cpcb-health-engine"
      className="aeris-panel rounded-xl p-6 space-y-5"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-cyan-400 tracking-wide uppercase">
              India CPCB Health Recommendation Engine
            </span>
            <span aria-hidden="true" className="hidden sm:inline text-slate-600">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{rec.observedTimestampDisplay}</span>
              <span className="text-slate-500">({rec.freshnessLabel})</span>
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold text-slate-100">
              CPCB Category:{' '}
              <span className={bandMeta.textClass}>
                {rec.category} ({rec.rangeLabel})
              </span>
            </h3>
            <span className="text-xs text-slate-400">
              {rec.city} · {rec.stationName}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenAi}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 transition-colors whitespace-nowrap"
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Ask AI About Limits</span>
          </button>
          <button
            type="button"
            onClick={onOpenRoutines}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition-colors whitespace-nowrap"
          >
            <span>Open Full Daily Schedule</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Official CPCB Health Implication & Outdoor Activity Verdict */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div
          className={`lg:col-span-7 rounded-xl p-4 border ${bandMeta.borderClass} ${bandMeta.surfaceClass} space-y-1.5`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
            Official CPCB Health Implication ({rec.category})
          </p>
          <p
            data-testid="cpcb-official-implication"
            className="text-sm text-slate-100 leading-relaxed font-medium"
          >
            {rec.officialHealthImplication}
          </p>
          <p className="text-xs text-slate-300/90 leading-relaxed pt-1">
            {rec.explanation}
          </p>
        </div>

        <div
          data-testid="cpcb-outdoor-activity-verdict"
          className={`lg:col-span-5 rounded-xl p-4 border space-y-1.5 ${
            rec.avoidOutdoorPhysicalActivity
              ? 'border-rose-500/45 bg-rose-500/12'
              : rec.category === 'Poor' || rec.category === 'Unavailable'
              ? 'border-amber-500/40 bg-amber-500/10'
              : 'border-emerald-500/35 bg-emerald-500/10'
          }`}
        >
          <p
            className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
              rec.avoidOutdoorPhysicalActivity
                ? 'text-rose-300'
                : rec.category === 'Poor' || rec.category === 'Unavailable'
                ? 'text-amber-300'
                : 'text-emerald-300'
            }`}
          >
            {rec.avoidOutdoorPhysicalActivity ? (
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {rec.avoidOutdoorPhysicalActivity
                ? 'Outdoor Physical Activity Restriction'
                : 'Outdoor Physical Activity Guidance'}
            </span>
          </p>
          <p className="text-sm font-semibold text-slate-100 leading-snug">
            {rec.outdoorActivityHeadline}
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            {rec.avoidOutdoorPhysicalActivity
              ? 'Under Very Poor (301–400) and Severe (401–500) air quality, avoid outdoor physical activity and relocate exercise indoors.'
              : 'Match intensity and duration to your active household sensitivity profile below.'}
          </p>
        </div>
      </div>

      {/* Differentiated Guidance: General Population vs Pollution-Sensitive Households */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div
          data-testid="cpcb-general-guidance"
          className={`rounded-xl p-4 border space-y-2.5 ${
            rec.activeAudience === 'general'
              ? 'bg-[#081022] border-cyan-500/40 shadow-[inset_0_1px_0_rgba(34,211,238,0.12)]'
              : 'aeris-subcard'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-cyan-300 flex items-center gap-1.5 text-sm">
              <Users className="w-4 h-4 shrink-0" />
              <span>General Population Guidance</span>
            </p>
            <span className="text-[11px] font-mono text-slate-400">
              {rec.activeAudience === 'general' ? 'Your Active Focus' : 'Standard Tier'}
            </span>
          </div>
          <ul className="list-disc pl-4 space-y-1.5 text-slate-300 leading-relaxed">
            {rec.generalPopulationGuidance.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        <div
          data-testid="cpcb-sensitive-guidance"
          className={`rounded-xl p-4 border space-y-2.5 ${
            rec.activeAudience === 'sensitive'
              ? 'bg-[#120D1A] border-amber-500/45 shadow-[inset_0_1px_0_rgba(245,158,11,0.14)]'
              : 'aeris-subcard'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-amber-300 flex items-center gap-1.5 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Pollution-Sensitive Households</span>
            </p>
            <span className="text-[11px] font-mono text-amber-300/90">
              {rec.activeAudience === 'sensitive'
                ? 'Priority Household Mode'
                : 'Children / Older Adults / Sensitive'}
            </span>
          </div>
          <ul className="list-disc pl-4 space-y-1.5 text-slate-300 leading-relaxed">
            {rec.sensitiveHouseholdGuidance.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
          {rec.householdTailoredNotes.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1">
              {rec.householdTailoredNotes.map((note, idx) => (
                <p key={idx} className="text-[11px] text-amber-200/90 leading-relaxed">
                  • {note}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monitoring Data Limitations, Safety Caveats & Source Citations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
        <div
          data-testid="cpcb-data-limitations"
          className="lg:col-span-6 aeris-subcard rounded-lg p-4 space-y-2"
        >
          <p className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Monitoring Data Limitations</span>
          </p>
          <ul className="list-disc pl-4 space-y-1 text-slate-400 leading-relaxed">
            {rec.dataLimitations.map((lim, idx) => (
              <li key={idx}>{lim}</li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-6 aeris-subcard rounded-lg p-4 space-y-3">
          <div data-testid="cpcb-medical-caveat" className="space-y-1">
            <p className="font-semibold text-slate-200">
              Non-Medical & Protective Equipment Caveat
            </p>
            <p className="text-slate-400 leading-relaxed">
              {rec.medicalDisclaimer}
            </p>
            <p className="text-slate-300/90 leading-relaxed">
              {rec.protectiveEquipmentCaveat}
            </p>
          </div>

          <div
            data-testid="cpcb-source-citations"
            className="pt-2 border-t border-slate-800/80 space-y-1"
          >
            <p className="font-semibold text-slate-200 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Source Citations & Timestamp</span>
            </p>
            {rec.sourceCitations.map((cite, idx) => (
              <p key={idx} className="text-slate-400 leading-relaxed">
                <strong className="text-slate-300 font-medium">{cite.title}:</strong>{' '}
                {cite.detail}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Expandable Reference Table of All 6 Official CPCB Categories */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAllBands((prev) => !prev)}
          aria-expanded={showAllBands}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-700/80 bg-[#070D1D] text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors"
        >
          <span>
            {showAllBands
              ? 'Hide All 6 Official CPCB AQI Categories'
              : 'View All 6 Official CPCB AQI Categories & Health Implications'}
          </span>
          {showAllBands ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {showAllBands && (
          <div
            data-testid="cpcb-all-six-categories"
            className="mt-3 overflow-x-auto rounded-lg border border-slate-800/90 bg-[#060C1A]"
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">
                    CPCB Category
                  </th>
                  <th className="py-2.5 px-3 font-medium whitespace-nowrap">
                    AQI Range
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    Official CPCB Likely Health Impact
                  </th>
                  <th className="py-2.5 px-3 font-medium">
                    Outdoor Physical Activity Rule
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {OFFICIAL_SIX_CPCB_CATEGORIES.map((band) => {
                  const isCurrent = band.category === rec.category;
                  return (
                    <tr
                      key={band.category}
                      className={isCurrent ? 'bg-cyan-500/8' : undefined}
                    >
                      <td className={`py-2.5 px-3 font-semibold whitespace-nowrap ${band.textClass}`}>
                        {band.category}
                        {isCurrent ? ' (Active)' : ''}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {band.rangeLabel}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 leading-relaxed">
                        {band.officialHealthImplication}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 leading-relaxed">
                        {band.avoidOutdoorPhysicalActivity ? (
                          <span className="text-rose-300 font-medium">
                            {band.outdoorActivityHeadline}
                          </span>
                        ) : (
                          band.outdoorActivityHeadline
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
