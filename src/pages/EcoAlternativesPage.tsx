import { useEffect, useState } from 'react';
import { Calculator, ShieldCheck, ShieldAlert } from 'lucide-react';
import { buildApiUrl } from '../lib/apiClient.ts';
import {
  calculateCommuteImpact,
  EMISSION_FACTORS_KG_PER_KM,
} from '../lib/emissions.ts';
import type { EmissionsInput, EmissionsResult } from '../lib/types.ts';

interface EcoAlternativesPageProps {
  city: string;
  aqi: number | null;
  pollutionSensitiveHousehold: boolean;
}

export function EcoAlternativesPage({
  city,
  aqi,
  pollutionSensitiveHousehold,
}: EcoAlternativesPageProps) {
  const [input, setInput] = useState<EmissionsInput>({
    baselineMode: 'solo_car',
    alternativeMode: 'metro',
    oneWayDistanceKm: 14,
    tripsPerWeek: 10,
    aqi,
    pollutionSensitiveHousehold,
  });

  const [result, setResult] = useState<EmissionsResult>(() =>
    calculateCommuteImpact({
      ...input,
      aqi,
      pollutionSensitiveHousehold,
    })
  );
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    setInput((prev) => ({ ...prev, aqi, pollutionSensitiveHousehold }));
  }, [aqi, pollutionSensitiveHousehold]);

  const handleCalculate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCalculating(true);
    try {
      const res = await fetch(buildApiUrl('/api/impact/calculate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          aqi,
          pollutionSensitiveHousehold,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as EmissionsResult;
        setResult(json);
      } else {
        setResult(
          calculateCommuteImpact({
            ...input,
            aqi,
            pollutionSensitiveHousehold,
          })
        );
      }
    } catch {
      setResult(
        calculateCommuteImpact({
          ...input,
          aqi,
          pollutionSensitiveHousehold,
        })
      );
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Calculator Input Panel */}
        <section className="lg:col-span-5 aeris-panel rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <Calculator className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              Commute Emissions Calculator
            </h2>
          </div>

          <form onSubmit={handleCalculate} className="space-y-4 text-sm">
            <div>
              <label
                htmlFor="eco-baseline"
                className="block text-xs text-slate-400 mb-1.5"
              >
                Current / Baseline Mode
              </label>
              <select
                id="eco-baseline"
                value={input.baselineMode}
                onChange={(e) =>
                  setInput({
                    ...input,
                    baselineMode: e.target.value as 'solo_car' | 'two_wheeler',
                  })
                }
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
              >
                <option value="solo_car">Solo Petrol/Diesel Car (0.171 kg CO2e/km)</option>
                <option value="two_wheeler">Petrol Two-Wheeler (0.049 kg CO2e/km)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="eco-alternative"
                className="block text-xs text-slate-400 mb-1.5"
              >
                Eco Alternative Mode
              </label>
              <select
                id="eco-alternative"
                value={input.alternativeMode}
                onChange={(e) =>
                  setInput({
                    ...input,
                    alternativeMode: e.target.value as EmissionsInput['alternativeMode'],
                  })
                }
                className="w-full px-3 py-2 rounded-lg aeris-input text-slate-100"
              >
                <option value="metro">Urban Metro Rail (0.014 kg CO2e/km)</option>
                <option value="bus">City / Electric Bus (0.029 kg CO2e/km)</option>
                <option value="carpool">2-Person Carpool (0.0855 kg CO2e/km)</option>
                <option value="ev_cab">Electric Cab / Auto (0.072 kg CO2e/km)</option>
                <option value="walk_cycle">Walking / Cycling (0.000 kg CO2e/km — AQI Gated)</option>
                <option value="shared_e_rickshaw">
                  Shared E-Rickshaw / Variable Feeder (Qualitative Only)
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="eco-distance"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  One-Way Distance (km)
                </label>
                <input
                  id="eco-distance"
                  type="number"
                  min={1}
                  max={200}
                  value={input.oneWayDistanceKm}
                  onChange={(e) =>
                    setInput({
                      ...input,
                      oneWayDistanceKm: Math.max(
                        1,
                        Math.min(200, Number(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="eco-trips"
                  className="block text-xs text-slate-400 mb-1.5"
                >
                  Trips / Week
                </label>
                <input
                  id="eco-trips"
                  type="number"
                  min={1}
                  max={28}
                  value={input.tripsPerWeek}
                  onChange={(e) =>
                    setInput({
                      ...input,
                      tripsPerWeek: Math.max(
                        1,
                        Math.min(28, Number(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg aeris-input font-mono text-slate-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={calculating}
              className="w-full px-4 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-sm hover:bg-cyan-400 transition-colors"
            >
              {calculating ? 'Calculating...' : 'Calculate Estimated CO2e Avoided'}
            </button>
          </form>
        </section>

        {/* Results & Active Mobility AQI Safety Gate */}
        <section className="lg:col-span-7 aeris-panel rounded-xl p-6 space-y-5">
          <div>
            <p className="text-xs text-cyan-400 font-medium">
              {result.isQualitativeOnly
                ? 'Qualitative Mode-Shift Comparison (Standardized Factor Unavailable)'
                : 'Estimated Mode-Shift Impact (CO2e Avoided — Not Measured AQI Change)'}
            </p>
            {result.isQualitativeOnly ? (
              <div className="mt-3 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30 space-y-2">
                <p
                  data-testid="eco-weekly-avoided"
                  className="text-base font-semibold text-cyan-200"
                >
                  Qualitative Comparison Only
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {result.qualitativeComparison}
                </p>
                {result.baselineWeeklyKg !== null && (
                  <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                    Current baseline estimate: {result.baselineWeeklyKg} kg CO2e/wk
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg aeris-subcard">
                  <p className="text-xs text-slate-400">Baseline Emissions</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-200 mt-1">
                    {result.baselineWeeklyKg}{' '}
                    <span className="text-xs font-normal text-slate-400">kg/wk</span>
                  </p>
                </div>
                <div className="p-4 rounded-lg aeris-subcard">
                  <p className="text-xs text-slate-400">Alternative Emissions</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-cyan-300 mt-1">
                    {result.alternativeWeeklyKg}{' '}
                    <span className="text-xs font-normal text-slate-400">kg/wk</span>
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/35">
                  <p className="text-xs text-emerald-200">Estimated CO2e Avoided</p>
                  <p
                    data-testid="eco-weekly-avoided"
                    className="text-2xl font-bold font-mono tabular-nums text-emerald-300 mt-1"
                  >
                    {result.estimatedWeeklyCo2eAvoidedKg}{' '}
                    <span className="text-xs font-normal">kg/wk</span>
                  </p>
                  <p className="text-[11px] font-mono text-emerald-200/80 mt-0.5 tabular-nums">
                    ~{result.estimatedAnnualCo2eAvoidedKg} kg/yr (50 wks)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Walking/Cycling Air Quality Safety Gate */}
          <div
            className={`p-4 rounded-lg border flex items-start gap-3 text-xs ${
              result.activeMobilitySafe
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
            }`}
          >
            {result.activeMobilitySafe ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">
                Walking & Cycling Gate for {city} (Current AQI: {aqi ?? 'Unavailable'})
              </p>
              <p className="mt-1 leading-relaxed">{result.activeMobilityAdvisory}</p>
            </div>
          </div>

          {/* Transparent Assumptions & Sourced Factors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80 text-xs">
            <div className="space-y-1.5">
              <h3 className="font-semibold text-slate-200">
                Calculation Assumptions
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-slate-400">
                {result.assumptions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-semibold text-slate-200">
                Emission Factor Sources & Disclaimer
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-slate-400">
                {result.sources.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
              <p className="text-amber-300/90 pt-1">{result.disclaimer}</p>
            </div>
          </div>
        </section>
      </div>

      {/* Reference Table of Sourced Emission Factors */}
      <section className="aeris-panel rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-100 mb-3">
          India Transport & Household Sustainability Reference Factors
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Mode</th>
                <th className="py-2.5 pr-4 font-medium text-right">
                  Factor (kg CO2e/pkm)
                </th>
                <th className="py-2.5 pr-4 font-medium">Published</th>
                <th className="py-2.5 font-medium">Source & Assumptions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {Object.entries(EMISSION_FACTORS_KG_PER_KM).map(([key, item]) => (
                <tr key={key} className="hover:bg-slate-800/35 transition-colors">
                  <td className="py-2.5 pr-4 font-medium text-slate-200 whitespace-nowrap">
                    {item.label}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-cyan-300 whitespace-nowrap">
                    {item.hasReliableFactor && item.factor !== null
                      ? item.factor.toFixed(4)
                      : 'Qualitative'}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-slate-400 whitespace-nowrap">
                    {item.publicationDate}
                  </td>
                  <td className="py-2.5 text-slate-400">
                    {item.source} — {item.assumption}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
