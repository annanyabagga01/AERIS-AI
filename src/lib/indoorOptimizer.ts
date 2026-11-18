import type { AqiCategory } from './types.ts';

export type RoomType =
  | 'bedroom'
  | 'living_room'
  | 'kitchen'
  | 'home_office'
  | 'nursery'
  | 'older_adult_room';

export type VentilationAvailability =
  | 'cross_ventilation'
  | 'single_window'
  | 'exhaust_only'
  | 'sealed_ac';

export type PurifierAvailability = 'true_hepa' | 'diy_box_fan' | 'none';

export type RecommendationDomain =
  | 'dust_reduction'
  | 'damp_mopping'
  | 'kitchen_exhaust'
  | 'filtration'
  | 'ventilation';

export type CostTier = 'low_cost' | 'advanced';

export interface IndoorOptimizerProfile {
  roomType: RoomType;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  ventilation: VentilationAvailability;
  purifier: PurifierAvailability;
}

export interface RoomPreset {
  id: string;
  label: string;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  summary: string;
}

export interface IndoorTimeWindow {
  period: string;
  label: string;
  status: string;
  tone: 'emerald' | 'cyan' | 'amber' | 'rose';
  instruction: string;
}

export interface IndoorRecommendation {
  id: string;
  domain: RecommendationDomain;
  domainLabel: string;
  tier: CostTier;
  tierLabel: 'Zero Cost' | 'Low Cost' | 'Advanced';
  costEstimate: string;
  title: string;
  actionStep: string;
  reasoning: string;
  priority: 'Essential' | 'High' | 'Recommended';
}

export interface IndoorOptimizationPlan {
  areaSqFt: number;
  volumeM3: number;
  targetAch: number;
  recommendedCadrM3Hr: number;
  recommendedCadrCfm: number;
  aqiModeLabel: string;
  ventilationSummary: string;
  ventilationWindows: IndoorTimeWindow[];
  purifierStrategyTitle: string;
  purifierStrategyDetail: string;
  purifierOperatingCostNote: string;
  recommendations: IndoorRecommendation[];
  plantScienceNote: string;
}

export const ROOM_TYPE_OPTIONS: {
  id: RoomType;
  label: string;
  hint: string;
  defaultDimensions: { lengthFt: number; widthFt: number; heightFt: number };
}[] = [
  {
    id: 'bedroom',
    label: 'Bedroom',
    hint: '8+ hrs overnight occupancy · quiet filtration & low-dust bedding',
    defaultDimensions: { lengthFt: 14, widthFt: 12, heightFt: 10 },
  },
  {
    id: 'living_room',
    label: 'Living Room',
    hint: 'Balcony doors, guest foot traffic & larger air volume',
    defaultDimensions: { lengthFt: 18, widthFt: 14, heightFt: 10 },
  },
  {
    id: 'kitchen',
    label: 'Kitchen / Open Dining',
    hint: 'High PM2.5/NO2 cooking spikes · exhaust & make-up air',
    defaultDimensions: { lengthFt: 12, widthFt: 10, heightFt: 10 },
  },
  {
    id: 'home_office',
    label: 'Home Office / Study',
    hint: 'Closed doors & CO2 buildup during long work sessions',
    defaultDimensions: { lengthFt: 11, widthFt: 10, heightFt: 10 },
  },
  {
    id: 'nursery',
    label: "Children's Room / Nursery",
    hint: 'Higher breathing rate per kg · zero-combustion & wet-clean priority',
    defaultDimensions: { lengthFt: 12, widthFt: 11, heightFt: 10 },
  },
  {
    id: 'older_adult_room',
    label: 'Older Adult Room',
    hint: 'Steady cleaner-air zone · draft sealing & gentle airflow',
    defaultDimensions: { lengthFt: 13, widthFt: 11, heightFt: 10 },
  },
];

export const ROOM_SIZE_PRESETS: RoomPreset[] = [
  {
    id: 'compact',
    label: 'Compact (10×10 ft)',
    lengthFt: 10,
    widthFt: 10,
    heightFt: 10,
    summary: '100 sq ft',
  },
  {
    id: 'standard',
    label: 'Standard (14×12 ft)',
    lengthFt: 14,
    widthFt: 12,
    heightFt: 10,
    summary: '168 sq ft',
  },
  {
    id: 'large',
    label: 'Large (18×14 ft)',
    lengthFt: 18,
    widthFt: 14,
    heightFt: 10,
    summary: '252 sq ft',
  },
  {
    id: 'open_hall',
    label: 'Open Hall (24×16 ft)',
    lengthFt: 24,
    widthFt: 16,
    heightFt: 10,
    summary: '384 sq ft',
  },
];

export const VENTILATION_OPTIONS: {
  id: VentilationAvailability;
  label: string;
  detail: string;
}[] = [
  {
    id: 'cross_ventilation',
    label: 'Cross-Ventilation (2+ sides)',
    detail: 'Windows or doors on opposite/adjacent walls enable rapid air flushing.',
  },
  {
    id: 'single_window',
    label: 'Single Window / Balcony',
    detail: 'One exterior opening; slower dilution without a fan.',
  },
  {
    id: 'exhaust_only',
    label: 'Exhaust / Chimney Only',
    detail: 'Mechanical exhaust fan or kitchen chimney vents air directly outdoors.',
  },
  {
    id: 'sealed_ac',
    label: 'Sealed / AC-Only Room',
    detail: 'Minimal exterior window opening; relies on closed loop and AC air.',
  },
];

export const PURIFIER_OPTIONS: {
  id: PurifierAvailability;
  label: string;
  detail: string;
}[] = [
  {
    id: 'true_hepa',
    label: 'True HEPA Purifier (H13/H14)',
    detail: 'Dedicated mechanical HEPA + carbon unit sized for the room.',
  },
  {
    id: 'diy_box_fan',
    label: 'DIY Box Fan + MERV-13 / HEPA',
    detail: 'Standard box or pedestal fan paired with sealed pleated filter.',
  },
  {
    id: 'none',
    label: 'No Purifier Available',
    detail: 'Focuses on sealing, damp mopping, exhaust & clean-zone habits.',
  },
];

export const DEFAULT_INDOOR_PROFILE: IndoorOptimizerProfile = {
  roomType: 'bedroom',
  lengthFt: 14,
  widthFt: 12,
  heightFt: 10,
  ventilation: 'cross_ventilation',
  purifier: 'true_hepa',
};

export const PLANT_SCIENCE_NOTE =
  'Building-science note on houseplants: Controlled chamber and indoor-air reviews (such as Cummings & Waring, Journal of Exposure Science & Environmental Epidemiology) show potted houseplants do not meaningfully remove PM2.5 or gaseous urban smog at real-world home air-exchange rates—you would need hundreds of plants per square meter to rival basic ventilation. Do not rely on houseplants to purify indoor rooms; use source control, damp mopping, kitchen exhaust, and mechanical HEPA filtration.';

export function getRoomTypeLabel(roomType: RoomType): string {
  return (
    ROOM_TYPE_OPTIONS.find((r) => r.id === roomType)?.label ?? 'Bedroom'
  );
}

export function buildIndoorOptimizationPlan(
  profile: IndoorOptimizerProfile,
  city: string,
  aqi: number | null,
  category: AqiCategory,
  pollutionSensitiveHousehold: boolean = false
): IndoorOptimizationPlan {
  const safeL = Math.max(5, Math.min(60, Number(profile.lengthFt) || 14));
  const safeW = Math.max(5, Math.min(60, Number(profile.widthFt) || 12));
  const safeH = Math.max(7, Math.min(20, Number(profile.heightFt) || 10));

  const areaSqFt = Math.round(safeL * safeW);
  const volumeM3 = Math.max(10, Number((safeL * safeW * safeH * 0.0283168).toFixed(1)));

  const severeSmog = category === 'Very Poor' || category === 'Severe';
  const poorSmog = category === 'Poor';
  const highSmog = severeSmog || poorSmog;
  const moderateSmog = category === 'Moderate';
  const cleanOutside = category === 'Good' || category === 'Satisfactory';
  const unavailableAqi = category === 'Unavailable' || aqi === null;

  // Higher ACH (5.0) during Poor/Very Poor/Severe episodes or sensitive occupancy; 4.0 ACH otherwise
  const targetAch = highSmog || pollutionSensitiveHousehold ? 5.0 : 4.0;
  const recommendedCadrM3Hr = Math.round(volumeM3 * targetAch);
  const recommendedCadrCfm = Math.round(recommendedCadrM3Hr * 0.58858);

  const roomLabel = getRoomTypeLabel(profile.roomType);
  const aqiText = aqi !== null ? `${aqi} (${category})` : `Unavailable`;
  const aqiModeLabel = severeSmog
    ? 'High-Infiltration Defense'
    : poorSmog
    ? 'Smog Containment Mode'
    : moderateSmog
    ? 'Balanced Ventilation Mode'
    : unavailableAqi
    ? 'Precautionary Mode (Unverified AQI)'
    : 'Fresh-Air Exchange Mode';

  // Build dynamic ventilation summary & 4-block daily timing table
  let ventilationSummary = '';
  let ventilationWindows: IndoorTimeWindow[] = [];

  if (profile.ventilation === 'sealed_ac') {
    ventilationSummary = highSmog
      ? `Outdoor ${city} AQI is ${aqiText}. Keep this ${roomLabel.toLowerCase()} sealed and set split/central AC fan to recirculation (never fresh-air intake) so winter smog is not pulled indoors. Briefly crack an interior door to a cleaner hallway during afternoon hours to avoid stale CO2 buildup.`
      : unavailableAqi
      ? `Official ${city} AQI is unavailable. Run your sealed AC loop on recirculation if haze or traffic odor is noticeable outdoors, and open an interior door periodically so CO2 stays comfortable.`
      : `Outdoor ${city} AQI is ${aqiText}. Since this ${roomLabel.toLowerCase()} has no direct cross-breeze, open an adjacent ventilated room door for 20–30 minutes around 13:00–15:30 to refresh indoor oxygen and clear CO2.`;

    ventilationWindows = [
      {
        period: '06:00 – 10:30',
        label: 'Morning Inversion',
        status: 'Keep Sealed · AC Recirculate',
        tone: highSmog ? 'rose' : 'amber',
        instruction:
          'Prevent cold morning street particulates and diesel fumes from leaking indoors.',
      },
      {
        period: '13:00 – 15:30',
        label: 'Midday Mixing',
        status: highSmog ? 'Interior Door Exchange Only' : 'Refresh Via Adjacent Room',
        tone: highSmog ? 'amber' : 'emerald',
        instruction: highSmog
          ? 'Avoid pulling hazy outdoor air directly inside; exchange air with a pre-filtered interior room.'
          : 'Crack interior door to dilute CO2 when exterior haze disperses.',
      },
      {
        period: '17:30 – 23:00',
        label: 'Evening Peak',
        status: 'Sealed + Filtration',
        tone: highSmog ? 'rose' : 'amber',
        instruction:
          'Maintain door sweep seal against evening traffic and biomass smoke spikes.',
      },
      {
        period: '23:00 – 06:00',
        label: 'Overnight Sleep',
        status: 'Quiet Closed Loop',
        tone: 'cyan',
        instruction:
          'Leave a 1–2 cm undercut or run quiet filtration to prevent excessive CO2 buildup in tiny closed rooms.',
      },
    ];
  } else if (profile.ventilation === 'exhaust_only') {
    ventilationSummary = highSmog
      ? `Outdoor ${city} AQI is ${aqiText}. Run mechanical exhaust only while cooking or removing moisture—running an exhaust fan creates negative pressure that pulls unfiltered outdoor smog through window cracks if left on unnecessarily.`
      : `Outdoor ${city} AQI is ${aqiText}. Use the exhaust fan after showers or during cooking, and pair with a cracked interior door so cleaner indoor make-up air flows through.`;

    ventilationWindows = [
      {
        period: '06:00 – 10:30',
        label: 'Morning Tea / Prep',
        status: 'Exhaust On Only While Cooking',
        tone: highSmog ? 'amber' : 'cyan',
        instruction:
          'Switch exhaust off 10–15 min after stove stops so negative pressure stops drawing smog through gaps.',
      },
      {
        period: '13:00 – 15:30',
        label: 'Midday Purge',
        status: cleanOutside ? '30m Full Exhaust Purge' : 'Brief 10m Purge Only',
        tone: cleanOutside ? 'emerald' : 'amber',
        instruction:
          'If midday visibility clears, pull warm midday air briefly to clear indoor CO2 and cooking humidity.',
      },
      {
        period: '17:30 – 23:00',
        label: 'Dinner & Evening',
        status: 'Active Chimney + Tight Door',
        tone: highSmog ? 'rose' : 'amber',
        instruction:
          'Keep exhaust on high during tadka/frying; keep dining-to-bedroom doors shut to isolate plumes.',
      },
      {
        period: '23:00 – 06:00',
        label: 'Overnight',
        status: 'Exhaust Off · Damper Closed',
        tone: 'cyan',
        instruction:
          'Close chimney backdraft flaps or switch off exhaust so cold outdoor smog cannot backflow indoors.',
      },
    ];
  } else if (profile.ventilation === 'single_window') {
    ventilationSummary = highSmog
      ? `Outdoor ${city} AQI is ${aqiText}. Keep your single window/balcony door sealed during morning and evening inversions. Between 13:00 and 15:30—only if outdoor haze visibly clears—you may open it for 10 minutes with a pedestal fan facing outward briefly, then re-seal and run filtration.`
      : unavailableAqi
      ? `Official ${city} AQI is unavailable. Use sensory checks (visible haze or smoke smell) before opening your single window; favor midday hours.`
      : `Outdoor ${city} AQI is ${aqiText}. Place a standard fan near the single window facing slightly inward or outward for 25–35 minutes during 13:00–15:30 to accelerate stale-air dilution.`;

    ventilationWindows = [
      {
        period: '06:00 – 10:30',
        label: 'Morning Inversion',
        status: highSmog ? 'Keep Window Latched' : 'Crack 10m Mid-Morning',
        tone: highSmog ? 'rose' : 'cyan',
        instruction: highSmog
          ? 'Ground-level fog traps PM2.5 near street level; keep latches tight.'
          : 'Brief airing after early traffic eases.',
      },
      {
        period: '13:00 – 15:30',
        label: 'Solar Mixing Window',
        status: highSmog ? '10m Check Only' : '30m Fan-Assisted Vent',
        tone: highSmog ? 'amber' : 'emerald',
        instruction:
          'Warmest boundary layer dilutes outdoor particulates; ideal window to refresh stale room air.',
      },
      {
        period: '17:30 – 23:00',
        label: 'Evening Peak',
        status: highSmog ? 'Seal + Draft Tape' : 'Close Before Dusk',
        tone: highSmog ? 'rose' : 'amber',
        instruction:
          'Cooling air compresses evening traffic and road dust close to residential floors.',
      },
      {
        period: '23:00 – 06:00',
        label: 'Overnight',
        status: highSmog ? 'Sealed + Filtration' : 'Night Filter / Screen',
        tone: 'cyan',
        instruction:
          'Keep exterior sash closed whenever night biomass burning or winter fog builds.',
      },
    ];
  } else {
    // cross_ventilation
    ventilationSummary = highSmog
      ? `Outdoor ${city} AQI is ${aqiText}. Keep cross-ventilation windows closed during morning (06:00–10:30) and evening (17:30–23:00) temperature inversions. Only flush this ${roomLabel.toLowerCase()} for 10–15 minutes between 13:00 and 15:30 if outdoor visibility improves, then re-seal immediately and restart filtration.`
      : unavailableAqi
      ? `Official ${city} AQI is unavailable. Hold off wide cross-ventilation during foggy mornings or rush-hour peaks; favor brief midday airing when visibility looks clear.`
      : `Outdoor ${city} AQI is ${aqiText}. Open opposite windows for 30–45 minutes between 13:00 and 15:30 to flush indoor CO2, VOCs, and cooking moisture cleanly at zero electricity cost.`;

    ventilationWindows = [
      {
        period: '06:00 – 10:30',
        label: 'Morning Inversion',
        status: highSmog ? 'Keep Sealed' : 'Brief 15m Flush OK',
        tone: highSmog ? 'rose' : 'cyan',
        instruction: highSmog
          ? 'Cold air pins overnight traffic & heating particulates near ground level.'
          : 'Quick flush once sunrise warmth lifts shallow mist.',
      },
      {
        period: '13:00 – 15:30',
        label: 'Best Daily Window',
        status: highSmog ? 'Max 15m If Haze Clears' : '30–45m Cross-Ventilate',
        tone: highSmog ? 'amber' : 'emerald',
        instruction:
          'Thermal mixing raises the atmospheric boundary layer—lowest ambient PM2.5 window of the day.',
      },
      {
        period: '17:30 – 23:00',
        label: 'Evening Traffic & Smog',
        status: highSmog ? 'Seal + Start Purifier' : 'Latch Exterior Windows',
        tone: highSmog ? 'rose' : 'amber',
        instruction:
          'Close upwind windows before sunset chill traps evening commute plumes.',
      },
      {
        period: '23:00 – 06:00',
        label: 'Overnight Rest',
        status: highSmog ? 'Closed + Continuous HEPA' : 'Closed / Filtered',
        tone: 'cyan',
        instruction:
          'Protects sleeping breathing zones from 01:00–05:00 winter smog accumulation.',
      },
    ];
  }

  // Purifier strategy summary tailored to user purifier availability & CADR
  let purifierStrategyTitle = '';
  let purifierStrategyDetail = '';
  let purifierOperatingCostNote = '';

  if (profile.purifier === 'true_hepa') {
    purifierStrategyTitle = `True HEPA Strategy · Target ${recommendedCadrM3Hr} m³/hr (${recommendedCadrCfm} CFM)`;
    purifierStrategyDetail = `Position the True HEPA unit at least 30–50 cm clear of walls and curtains inside this ${areaSqFt} sq ft ${roomLabel.toLowerCase()}. ${
      highSmog
        ? 'Run on Medium/High for 45 minutes after sealing windows, then hold on Auto/Sleep overnight (keep ionizers/UV off).'
        : 'Run on Auto or Low during occupied evenings and vacuum the mesh pre-filter weekly so airflow stays unrestricted.'
    }`;
    purifierOperatingCostNote =
      'Running cost: ~₹120–₹280/month electricity (25–45W DC motor) · Annual H13 replacement filter: ~₹1,500–₹3,500.';
  } else if (profile.purifier === 'diy_box_fan') {
    purifierStrategyTitle = `DIY Box-Fan Filtration · Aim for ~${recommendedCadrM3Hr} m³/hr Circulation`;
    purifierStrategyDetail = `Mount a MERV-13 pleated panel or cylindrical HEPA cartridge tightly onto the intake face of your fan with painter's/duct tape so zero air leaks around the edges. Run on Medium speed inside the closed ${roomLabel.toLowerCase()} rather than a hallway to clean your immediate breathing zone faster.`;
    purifierOperatingCostNote =
      'Setup cost: ~₹1,800–₹3,200 (if buying fan + MERV-13/HEPA filter) · Filter swap every 3–6 months (~₹700–₹1,400).';
  } else {
    purifierStrategyTitle = `Zero-Purifier Clean-Zone Protocol (${areaSqFt} sq ft ${roomLabel})`;
    purifierStrategyDetail = `Without a mechanical filter, particle removal depends on slowing outdoor infiltration and stopping indoor generation. Concentrate cleaning in one tight inner room (seal window gaps with foam tape, isolate kitchen/incense smoke, and switch 100% from dry sweeping to damp microfiber mopping).`;
    purifierOperatingCostNote =
      'Current cost: ₹0 · Lowest-cost filtration upgrade: DIY box fan + MERV-13/H13 filter (~₹1,800–₹3,200) or dedicated True HEPA (~₹8,000+ for ' +
      recommendedCadrM3Hr +
      ' m³/hr).';
  }

  // Build comprehensive recommendations covering ALL 5 required domains + both Low-Cost and Advanced tiers
  const recommendations: IndoorRecommendation[] = [];

  // 1. DUST REDUCTION (Low-Cost & Room-Specific)
  recommendations.push({
    id: 'dust-gap-sealing',
    domain: 'dust_reduction',
    domainLabel: 'Dust Reduction',
    tier: 'low_cost',
    tierLabel: 'Low Cost',
    costEstimate: '₹150 – ₹400 (weather-strip tape & door sweep)',
    title:
      profile.roomType === 'living_room'
        ? 'Seal balcony sliding tracks & main entrance door sweep'
        : `Weather-strip window sashes & under-door gap in ${roomLabel}`,
    actionStep:
      'Apply EPDM D-profile self-adhesive foam tape around rattling window frames and fit a brush/rubber door sweep at the bottom threshold.',
    reasoning:
      'Unsealed 2–4 mm gaps around Indian aluminium/wooden frames let outdoor PM2.5 and coarse road dust leak in continuously during windy afternoons and cold nocturnal inversions, doubling purifier workload.',
    priority: highSmog ? 'Essential' : 'High',
  });

  recommendations.push({
    id: 'dust-entry-textiles',
    domain: 'dust_reduction',
    domainLabel: 'Dust Reduction',
    tier: 'low_cost',
    tierLabel: 'Zero Cost',
    costEstimate: '₹0 (Household habit)',
    title:
      profile.roomType === 'nursery' || profile.roomType === 'bedroom'
        ? 'Enforce shoe-free zone, remove heavy plush rugs & wash pillow covers weekly'
        : 'Keep outdoor footwear at entry & damp-wipe flat surfaces instead of feather-dusting',
    actionStep:
      'Leave street shoes outside the room on a washable doormat, damp-wipe shelves/fan blades weekly with a wrung microfiber cloth, and wash high-contact linens in hot water every 7 days.',
    reasoning:
      'Dry feather dusters and street shoes re-aerosolize coarse road dust (PM10), tyre debris, and pollen into the 1–1.5 m breathing zone; damp wiping binds particles permanently to the cloth.',
    priority: 'High',
  });

  // 2. DAMP MOPPING (Zero/Low Cost — Critical Alternative to Dry Broom Sweeping)
  recommendations.push({
    id: 'damp-mopping-protocol',
    domain: 'damp_mopping',
    domainLabel: 'Damp Mopping',
    tier: 'low_cost',
    tierLabel: 'Low Cost',
    costEstimate: '₹0 – ₹500 (existing cloth or microfiber mop)',
    title: highSmog
      ? `Replace dry broom (jhadoo) sweeping 100% with daily damp microfiber mopping in ${roomLabel}`
      : `Use damp microfiber mopping every 1–2 days instead of dry sweeping`,
    actionStep:
      'Skip dry broom sweeping altogether—pick up visible crumbs with a slightly damp cloth or vacuum first, then mop floors with clean water and a microfiber pad.',
    reasoning:
      'Dry sweeping mechanically flicks settled PM10, construction dust, and allergen fragments back into suspension for 1–3 hours at child and seated breathing height. Damp mopping captures particles cleanly into water.',
    priority: 'Essential',
  });

  recommendations.push({
    id: 'advanced-hepa-vacuum',
    domain: 'dust_reduction',
    domainLabel: 'Dust Reduction',
    tier: 'advanced',
    tierLabel: 'Advanced',
    costEstimate: '₹5,500 – ₹14,000 (one-time appliance)',
    title: 'Use a sealed HEPA-filtered canister/stick vacuum on mattresses & upholstery',
    actionStep:
      'Vacuum sofas, curtains, carpets, and mattresses weekly using a vacuum equipped with an exhaust HEPA filter before damp mopping.',
    reasoning:
      'Non-HEPA vacuums blow micron-sized dust right back out of their exhaust port into room air. A sealed HEPA vacuum traps fabric dust without re-polluting the room.',
    priority: 'Recommended',
  });

  // 3. KITCHEN EXHAUST & INDOOR COMBUSTION CONTROL
  recommendations.push({
    id: 'kitchen-exhaust-tadka',
    domain: 'kitchen_exhaust',
    domainLabel: 'Kitchen Exhaust',
    tier: 'low_cost',
    tierLabel: 'Zero Cost',
    costEstimate: '₹0 (Using existing exhaust/chimney)',
    title:
      profile.roomType === 'kitchen'
        ? 'Run chimney/exhaust 5 min before & 15 min after frying, tadka, or roasting'
        : 'Isolate cooking fumes from this room & always run kitchen exhaust outdoors',
    actionStep:
      'Turn on the kitchen chimney or exhaust fan before heating oil, cook on back burners under the hood with lids partially on, and keep internal bedroom doors shut while cooking.',
    reasoning:
      'High-heat Indian frying and tadka spike local indoor PM2.5 to 300–900 µg/m³ within minutes—often exceeding outdoor smog. Leaving the exhaust running 15 minutes post-cooking clears lingering aerosol oil droplets.',
    priority: 'Essential',
  });

  recommendations.push({
    id: 'indoor-smoke-elimination',
    domain: 'kitchen_exhaust',
    domainLabel: 'Kitchen Exhaust',
    tier: 'low_cost',
    tierLabel: 'Zero Cost',
    costEstimate: '₹0 (Switch to non-combustion alternatives)',
    title: 'Eliminate indoor incense (agarbatti), dhoop, scented candles & mosquito coils',
    actionStep:
      'During closed-window smog days, avoid all indoor smoldering or open flames; use window mosquito mesh or electric liquid vaporizers instead of burning coils.',
    reasoning:
      'One burning mosquito coil or incense stick inside a closed 150 sq ft room emits fine particulate mass comparable to dozens of cigarettes in trapped winter air, bypassing outdoor sealing efforts completely.',
    priority: 'Essential',
  });

  recommendations.push({
    id: 'advanced-ducted-chimney',
    domain: 'kitchen_exhaust',
    domainLabel: 'Kitchen Exhaust',
    tier: 'advanced',
    tierLabel: 'Advanced',
    costEstimate: '₹6,000 – ₹18,000 (ducted chimney upgrade)',
    title: 'Upgrade to an externally ducted kitchen chimney (1,000+ m³/hr suction) over recirculating charcoal hoods',
    actionStep:
      'Ensure your kitchen hood vents straight outdoors through a rigid/semi-rigid duct with a backdraft damper rather than blowing filtered air back into the kitchen.',
    reasoning:
      'Ductless/recirculating hoods cannot remove ultrafine cooking VOCs, NO2 from gas flames, or excess steam; outdoor ducting physically ejects combustion byproducts outside the home envelope.',
    priority: profile.roomType === 'kitchen' ? 'High' : 'Recommended',
  });

  // 4. FILTRATION RECOMMENDATIONS (Tailored by Purifier Availability + Low-Cost vs Advanced)
  if (profile.purifier === 'true_hepa') {
    recommendations.push({
      id: 'hepa-optimal-operation',
      domain: 'filtration',
      domainLabel: 'Filtration',
      tier: 'low_cost',
      tierLabel: 'Zero Cost',
      costEstimate: '₹120 – ₹280/mo electricity',
      title: `Size & run True HEPA to ≥ ${recommendedCadrM3Hr} m³/hr (${targetAch} ACH) with ionizer OFF`,
      actionStep: `Check your purifier's rated CADR matches at least ${recommendedCadrM3Hr} m³/hr for this ${volumeM3} m³ room. Keep doors/windows shut while running, turn off optional ionizer/plasma toggles, and vacuum the outer mesh pre-filter weekly.`,
      reasoning: `At ${targetAch} Air Changes per Hour in a ${volumeM3} m³ volume, a ${recommendedCadrM3Hr} m³/hr CADR unit cycles room air every ~${Math.round(
        60 / targetAch
      )} minutes—dropping indoor PM2.5 by 70–85% inside a sealed room. Disabling ionizers prevents trace indoor ozone formation.`,
      priority: 'Essential',
    });
  } else if (profile.purifier === 'diy_box_fan') {
    recommendations.push({
      id: 'diy-boxfan-seal',
      domain: 'filtration',
      domainLabel: 'Filtration',
      tier: 'low_cost',
      tierLabel: 'Low Cost',
      costEstimate: '₹700 – ₹3,200 (MERV-13/HEPA cartridge + tape)',
      title: 'Seal DIY box-fan filter edges tightly & position 0.5 m from walls',
      actionStep:
        'Verify no gap exists between the pleated MERV-13 / replacement H13 drum filter and the fan shroud using painter’s tape, and run on Medium speed in your occupied room.',
      reasoning:
        'Air takes the path of least resistance—even a 1 cm unsealed gap lets polluted air bypass the filter media. Proper shroud sealing gives genuine sub-micron PM2.5 capture at a fraction of commercial purifier cost.',
      priority: 'Essential',
    });
  } else {
    recommendations.push({
      id: 'no-purifier-diy-upgrade',
      domain: 'filtration',
      domainLabel: 'Filtration',
      tier: 'low_cost',
      tierLabel: 'Low Cost',
      costEstimate: '₹1,800 – ₹3,200 (DIY MERV-13 / H13 fan filter)',
      title: 'Build a budget DIY box-fan + MERV-13 / H13 replacement filter when smog persists',
      actionStep:
        'Tape a certified pleated MERV-13 panel or cylindrical H13 replacement filter snugly onto the intake side of an existing square box fan for night-time bedroom use.',
      reasoning:
        'When commercial air purifiers are unaffordable or out of stock, pulling room air through a high-MERV pleated filter delivers real mechanical PM2.5 capture (~150–250 m³/hr equivalent CADR) without ozone emission.',
      priority: 'High',
    });
  }

  recommendations.push({
    id: 'advanced-hepa-equipment',
    domain: 'filtration',
    domainLabel: 'Filtration',
    tier: 'advanced',
    tierLabel: 'Advanced',
    costEstimate:
      volumeM3 > 55
        ? '₹14,000 – ₹28,000 (high-CADR dual/large-room HEPA)'
        : '₹8,000 – ₹16,000 (True HEPA H13 unit + carbon)',
    title:
      profile.purifier === 'true_hepa'
        ? 'Upgrade to an activated-carbon + H13 combo cartridge & replace annually before November'
        : `Add a dedicated True HEPA H13 purifier rated ≥ ${recommendedCadrM3Hr} m³/hr (${recommendedCadrCfm} CFM)`,
    actionStep: `Choose a mechanical True HEPA H13 unit with a washable pre-filter and pelletized activated carbon layer rated ≥ ${recommendedCadrM3Hr} m³/hr (avoiding proprietary overpriced filters or ozone ionizers).`,
    reasoning: `For a ${volumeM3} m³ ${roomLabel.toLowerCase()}, dedicated True HEPA delivers quieter continuous overnight operation (<32 dB sleep mode) than DIY fans while capturing both fine particulates and traffic VOCs.`,
    priority: profile.purifier === 'none' ? 'High' : 'Recommended',
  });

  // 5. VENTILATION TIMING & ADVANCED MONITOR / ERV
  recommendations.push({
    id: 'ventilation-timing-rule',
    domain: 'ventilation',
    domainLabel: 'Ventilation Timing',
    tier: 'low_cost',
    tierLabel: 'Zero Cost',
    costEstimate: '₹0 (Schedule change)',
    title: highSmog
      ? `Avoid morning (06:00–10:30) & evening (17:30–23:00) window opening while AQI is ${category}`
      : 'Time natural cross-ventilation to 13:00–15:30 midday solar mixing',
    actionStep: highSmog
      ? 'Keep exterior windows latched during morning and evening inversions; only open briefly for 10–15 minutes midday if local haze lifts, then re-seal.'
      : 'Open windows during midday (13:00–15:30) to dilute indoor CO2 and moisture, and close before evening traffic rush.',
    reasoning:
      'Thermal inversions trap vehicle exhaust, construction dust, and biomass smoke close to ground level overnight and early morning. Midday sunlight drives vertical mixing that raises the boundary layer and lowers street-level PM2.5.',
    priority: 'Essential',
  });

  recommendations.push({
    id: 'advanced-pm25-co2-monitor',
    domain: 'ventilation',
    domainLabel: 'Ventilation Timing',
    tier: 'advanced',
    tierLabel: 'Advanced',
    costEstimate: '₹3,500 – ₹9,500 (laser PM2.5 / CO2 sensor)',
    title:
      profile.ventilation === 'sealed_ac'
        ? 'Install an indoor PM2.5 + CO2 NDIR monitor (or fresh-air HEPA ERV intake) for sealed AC rooms'
        : 'Add a laser-scattering indoor PM2.5 + CO2 meter to verify filtration & prevent stuffiness',
    actionStep:
      'Track indoor CO2 (aim <1,000 ppm) alongside indoor PM2.5 so you know precisely when a brief midday vent or door-crack is needed without guessing.',
    reasoning:
      'Sealing a bedroom all day and night stops outdoor smog but gradually traps exhaled CO2 (often >1,500 ppm overnight, causing morning grogginess). A dual sensor balances fresh air vs. smog intrusion accurately.',
    priority: 'Recommended',
  });

  return {
    areaSqFt,
    volumeM3,
    targetAch,
    recommendedCadrM3Hr,
    recommendedCadrCfm,
    aqiModeLabel,
    ventilationSummary,
    ventilationWindows,
    purifierStrategyTitle,
    purifierStrategyDetail,
    purifierOperatingCostNote,
    recommendations,
    plantScienceNote: PLANT_SCIENCE_NOTE,
  };
}
