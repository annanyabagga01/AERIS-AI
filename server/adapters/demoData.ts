import type {
  CommunityChallenge,
  CommunityContribution,
} from '../../src/lib/types.ts';

export const DEMO_CHALLENGES: CommunityChallenge[] = [
  {
    id: 'ncr-metro-week',
    title: '7-Day Metro & Bus Swap',
    description:
      'Replace at least 5 solo car or two-wheeler commutes this week with Metro rail or city bus.',
    cityScope: 'Delhi NCR',
    targetActions: 250,
    isDemo: true,
  },
  {
    id: 'smoke-free-indoors',
    title: 'Smoke-Free Winter Indoors',
    description:
      'Keep indoor living rooms free from incense sticks, candles, and mosquito coils during high-smog evenings.',
    cityScope: 'All Indian Cities',
    targetActions: 400,
    isDemo: true,
  },
  {
    id: 'zero-leaf-burning',
    title: 'Neighbourhood Zero-Burning Watch',
    description:
      'Compost dry winter leaves locally and encourage RWA staff to avoid open biomass burning.',
    cityScope: 'Northern Plains',
    targetActions: 150,
    isDemo: true,
  },
];

export const DEMO_CONTRIBUTIONS: CommunityContribution[] = [
  {
    id: 'demo-c1',
    anonymousHandle: 'RohiniCommuter_14',
    city: 'Delhi',
    actionType: 'metro_commute',
    co2AvoidedKg: 3.1,
    note: 'Switched morning Sector 18 to Connaught Place drive to Yellow/Red Line Metro.',
    challengeId: 'ncr-metro-week',
    createdAtIso: new Date(Date.now() - 42 * 60000).toISOString(),
    isDemo: true,
  },
  {
    id: 'demo-c2',
    anonymousHandle: 'BandraHousehold_08',
    city: 'Mumbai',
    actionType: 'energy_saving',
    co2AvoidedKg: 1.9,
    note: 'Shifted geyser and washing machine loads outside evening peak demand.',
    challengeId: 'smoke-free-indoors',
    createdAtIso: new Date(Date.now() - 115 * 60000).toISOString(),
    isDemo: true,
  },
  {
    id: 'demo-c3',
    anonymousHandle: 'IndiranagarCyclist',
    city: 'Bengaluru',
    actionType: 'carpool',
    co2AvoidedKg: 2.4,
    note: 'Shared Bellandur office commute with 2 colleagues.',
    challengeId: 'ncr-metro-week',
    createdAtIso: new Date(Date.now() - 210 * 60000).toISOString(),
    isDemo: true,
  },
];
