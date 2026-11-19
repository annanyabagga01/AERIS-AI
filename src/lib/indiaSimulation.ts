import type {
  AqiTrendPoint,
  CategoryDistributionItem,
  CityAqiResponse,
  CpcbCategoryMeta,
  IndiaAqiApiResponse,
  IndiaAqiSummary,
  PollutantReading,
  SimulatedIndiaStation,
  StateAqiComparison,
  StationReading,
  ValidAqiCategory,
} from './types.ts';

export const SIMULATION_DATA_SOURCE = 'AERIS AI Simulation Engine' as const;
export const SIMULATION_DATA_TYPE = 'SIMULATED' as const;
export const SIMULATION_BADGE_TEXT = 'SIMULATED DATA · DEMO MODE' as const;
export const SIMULATION_DISCLAIMER_TEXT =
  'These readings are generated for demonstration and are not actual environmental measurements.';

export const DEFAULT_SIMULATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export type IndiaRegion =
  | 'North'
  | 'South'
  | 'East'
  | 'West'
  | 'Central'
  | 'Northeast'
  | 'Islands';

export interface IndiaStateOrUt {
  name: string;
  code: string;
  isUnionTerritory: boolean;
  region: IndiaRegion;
}

/**
 * Authoritative catalog of all 28 Indian States and 8 Union Territories (36 total).
 */
export const INDIA_STATES_AND_UTS: IndiaStateOrUt[] = [
  // 28 States
  { name: 'Andhra Pradesh', code: 'AP', isUnionTerritory: false, region: 'South' },
  { name: 'Arunachal Pradesh', code: 'AR', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Assam', code: 'AS', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Bihar', code: 'BR', isUnionTerritory: false, region: 'East' },
  { name: 'Chhattisgarh', code: 'CG', isUnionTerritory: false, region: 'Central' },
  { name: 'Goa', code: 'GA', isUnionTerritory: false, region: 'West' },
  { name: 'Gujarat', code: 'GJ', isUnionTerritory: false, region: 'West' },
  { name: 'Haryana', code: 'HR', isUnionTerritory: false, region: 'North' },
  { name: 'Himachal Pradesh', code: 'HP', isUnionTerritory: false, region: 'North' },
  { name: 'Jharkhand', code: 'JH', isUnionTerritory: false, region: 'East' },
  { name: 'Karnataka', code: 'KA', isUnionTerritory: false, region: 'South' },
  { name: 'Kerala', code: 'KL', isUnionTerritory: false, region: 'South' },
  { name: 'Madhya Pradesh', code: 'MP', isUnionTerritory: false, region: 'Central' },
  { name: 'Maharashtra', code: 'MH', isUnionTerritory: false, region: 'West' },
  { name: 'Manipur', code: 'MN', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Meghalaya', code: 'ML', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Mizoram', code: 'MZ', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Nagaland', code: 'NL', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Odisha', code: 'OD', isUnionTerritory: false, region: 'East' },
  { name: 'Punjab', code: 'PB', isUnionTerritory: false, region: 'North' },
  { name: 'Rajasthan', code: 'RJ', isUnionTerritory: false, region: 'North' },
  { name: 'Sikkim', code: 'SK', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Tamil Nadu', code: 'TN', isUnionTerritory: false, region: 'South' },
  { name: 'Telangana', code: 'TS', isUnionTerritory: false, region: 'South' },
  { name: 'Tripura', code: 'TR', isUnionTerritory: false, region: 'Northeast' },
  { name: 'Uttar Pradesh', code: 'UP', isUnionTerritory: false, region: 'North' },
  { name: 'Uttarakhand', code: 'UK', isUnionTerritory: false, region: 'North' },
  { name: 'West Bengal', code: 'WB', isUnionTerritory: false, region: 'East' },

  // 8 Union Territories
  { name: 'Andaman and Nicobar Islands', code: 'AN', isUnionTerritory: true, region: 'Islands' },
  { name: 'Chandigarh', code: 'CH', isUnionTerritory: true, region: 'North' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: 'DN', isUnionTerritory: true, region: 'West' },
  { name: 'Delhi', code: 'DL', isUnionTerritory: true, region: 'North' },
  { name: 'Jammu and Kashmir', code: 'JK', isUnionTerritory: true, region: 'North' },
  { name: 'Ladakh', code: 'LA', isUnionTerritory: true, region: 'North' },
  { name: 'Lakshadweep', code: 'LD', isUnionTerritory: true, region: 'Islands' },
  { name: 'Puducherry', code: 'PY', isUnionTerritory: true, region: 'South' },
];

const STATE_BY_CODE = new Map<string, IndiaStateOrUt>(
  INDIA_STATES_AND_UTS.map((entry) => [entry.code, entry])
);

interface StationTemplate {
  id: string;
  station_name: string;
  city: string;
  district: string;
  state_code: string;
  latitude: number;
  longitude: number;
  baseAqi: number;
  volatility: number;
  profile: 'urban_heavy' | 'urban_metro' | 'industrial' | 'coastal' | 'hill_clean' | 'island_clean';
}

/**
 * 105 geographically accurate simulated monitoring stations spanning all 28 Indian
 * states and 8 Union Territories (metros, state capitals, district headquarters,
 * and representative smaller cities).
 */
export const INDIA_STATION_TEMPLATES: StationTemplate[] = [
  // ===================== DELHI (UT - DL) =====================
  { id: 'in-dl-anand-vihar', station_name: 'Anand Vihar Transit Hub', city: 'Delhi', district: 'East Delhi', state_code: 'DL', latitude: 28.6469, longitude: 77.316, baseAqi: 418, volatility: 22, profile: 'urban_heavy' },
  { id: 'in-dl-rk-puram', station_name: 'R K Puram Institutional Area', city: 'Delhi', district: 'New Delhi', state_code: 'DL', latitude: 28.5633, longitude: 77.1869, baseAqi: 332, volatility: 20, profile: 'urban_heavy' },
  { id: 'in-dl-dwarka-sec8', station_name: 'Dwarka Sector 8 Urban Station', city: 'Delhi', district: 'South West Delhi', state_code: 'DL', latitude: 28.571, longitude: 77.0719, baseAqi: 348, volatility: 22, profile: 'urban_heavy' },
  { id: 'in-dl-rohini', station_name: 'Rohini Sector 16 Station', city: 'Delhi', district: 'North West Delhi', state_code: 'DL', latitude: 28.7325, longitude: 77.1199, baseAqi: 364, volatility: 24, profile: 'urban_heavy' },

  // ===================== HARYANA (HR) =====================
  { id: 'in-hr-gurugram-vikas', station_name: 'Vikas Sadan Civil Lines', city: 'Gurugram', district: 'Gurugram', state_code: 'HR', latitude: 28.4501, longitude: 77.0263, baseAqi: 298, volatility: 20, profile: 'urban_heavy' },
  { id: 'in-hr-gurugram-teri', station_name: 'TERI Gram Aravalli Corridor', city: 'Gurugram', district: 'Gurugram', state_code: 'HR', latitude: 28.4275, longitude: 77.1465, baseAqi: 246, volatility: 18, profile: 'urban_metro' },
  { id: 'in-hr-faridabad', station_name: 'Sector 16A Industrial Belt', city: 'Faridabad', district: 'Faridabad', state_code: 'HR', latitude: 28.4088, longitude: 77.3099, baseAqi: 312, volatility: 20, profile: 'industrial' },
  { id: 'in-hr-panipat', station_name: 'Sector 18 District Monitor', city: 'Panipat', district: 'Panipat', state_code: 'HR', latitude: 29.3909, longitude: 76.9635, baseAqi: 238, volatility: 18, profile: 'industrial' },

  // ===================== UTTAR PRADESH (UP) =====================
  { id: 'in-up-noida-sec62', station_name: 'Sector 62 Institutional Park', city: 'Noida', district: 'Gautam Buddha Nagar', state_code: 'UP', latitude: 28.6245, longitude: 77.3577, baseAqi: 318, volatility: 22, profile: 'urban_heavy' },
  { id: 'in-up-noida-sec125', station_name: 'Sector 125 Expressway Monitor', city: 'Noida', district: 'Gautam Buddha Nagar', state_code: 'UP', latitude: 28.5448, longitude: 77.3231, baseAqi: 342, volatility: 20, profile: 'urban_heavy' },
  { id: 'in-up-lucknow-lalbagh', station_name: 'Lalbagh Central Station', city: 'Lucknow', district: 'Lucknow', state_code: 'UP', latitude: 26.8459, longitude: 80.9365, baseAqi: 248, volatility: 18, profile: 'urban_heavy' },
  { id: 'in-up-lucknow-gomti', station_name: 'Gomti Nagar Civic Center', city: 'Lucknow', district: 'Lucknow', state_code: 'UP', latitude: 26.8565, longitude: 81.0052, baseAqi: 212, volatility: 16, profile: 'urban_metro' },
  { id: 'in-up-kanpur', station_name: 'Nehru Nagar Urban Monitor', city: 'Kanpur', district: 'Kanpur Nagar', state_code: 'UP', latitude: 26.4703, longitude: 80.3229, baseAqi: 268, volatility: 18, profile: 'industrial' },
  { id: 'in-up-varanasi', station_name: 'Ardhali Bazar Cantonment', city: 'Varanasi', district: 'Varanasi', state_code: 'UP', latitude: 25.3506, longitude: 82.9789, baseAqi: 224, volatility: 16, profile: 'urban_metro' },
  { id: 'in-up-agra', station_name: 'Sanjay Palace Corridor', city: 'Agra', district: 'Agra', state_code: 'UP', latitude: 27.1986, longitude: 78.0059, baseAqi: 206, volatility: 16, profile: 'urban_metro' },
  { id: 'in-up-prayagraj', station_name: 'Civil Lines Sangam Monitor', city: 'Prayagraj', district: 'Prayagraj', state_code: 'UP', latitude: 25.4484, longitude: 81.8351, baseAqi: 192, volatility: 15, profile: 'urban_metro' },

  // ===================== CHANDIGARH (UT - CH) =====================
  { id: 'in-ch-sec22', station_name: 'Sector 22 Civic Station', city: 'Chandigarh', district: 'Chandigarh', state_code: 'CH', latitude: 30.7333, longitude: 76.7747, baseAqi: 148, volatility: 15, profile: 'urban_metro' },
  { id: 'in-ch-sec53', station_name: 'Sector 53 Southern Belt', city: 'Chandigarh', district: 'Chandigarh', state_code: 'CH', latitude: 30.7224, longitude: 76.7429, baseAqi: 132, volatility: 14, profile: 'urban_metro' },

  // ===================== PUNJAB (PB) =====================
  { id: 'in-pb-amritsar', station_name: 'Golden Temple Corridor Monitor', city: 'Amritsar', district: 'Amritsar', state_code: 'PB', latitude: 31.62, longitude: 74.8765, baseAqi: 194, volatility: 18, profile: 'urban_metro' },
  { id: 'in-pb-ludhiana', station_name: 'Punjab Agricultural University Station', city: 'Ludhiana', district: 'Ludhiana', state_code: 'PB', latitude: 30.9028, longitude: 75.8086, baseAqi: 218, volatility: 18, profile: 'industrial' },
  { id: 'in-pb-jalandhar', station_name: 'Civil Line District Monitor', city: 'Jalandhar', district: 'Jalandhar', state_code: 'PB', latitude: 31.3219, longitude: 75.5789, baseAqi: 176, volatility: 16, profile: 'urban_metro' },

  // ===================== RAJASTHAN (RJ) =====================
  { id: 'in-rj-jaipur-shastri', station_name: 'Shastri Nagar Urban Monitor', city: 'Jaipur', district: 'Jaipur', state_code: 'RJ', latitude: 26.9502, longitude: 75.7985, baseAqi: 196, volatility: 18, profile: 'urban_metro' },
  { id: 'in-rj-jaipur-malviya', station_name: 'Malviya Nagar Industrial Park', city: 'Jaipur', district: 'Jaipur', state_code: 'RJ', latitude: 26.8549, longitude: 75.8243, baseAqi: 182, volatility: 16, profile: 'urban_metro' },
  { id: 'in-rj-jodhpur', station_name: 'Collectorate Circle Station', city: 'Jodhpur', district: 'Jodhpur', state_code: 'RJ', latitude: 26.2921, longitude: 73.0379, baseAqi: 174, volatility: 16, profile: 'urban_metro' },
  { id: 'in-rj-udaipur', station_name: 'Ashok Nagar Lake Zone', city: 'Udaipur', district: 'Udaipur', state_code: 'RJ', latitude: 24.5889, longitude: 73.7024, baseAqi: 118, volatility: 14, profile: 'urban_metro' },
  { id: 'in-rj-kota', station_name: 'Nayapura Thermal Corridor', city: 'Kota', district: 'Kota', state_code: 'RJ', latitude: 25.1825, longitude: 75.8573, baseAqi: 164, volatility: 16, profile: 'industrial' },

  // ===================== UTTARAKHAND (UK) =====================
  { id: 'in-uk-dehradun-clock', station_name: 'Clock Tower Valley Station', city: 'Dehradun', district: 'Dehradun', state_code: 'UK', latitude: 30.3244, longitude: 78.0419, baseAqi: 126, volatility: 14, profile: 'urban_metro' },
  { id: 'in-uk-dehradun-rajpur', station_name: 'Rajpur Foothills Monitor', city: 'Dehradun', district: 'Dehradun', state_code: 'UK', latitude: 30.3887, longitude: 78.0954, baseAqi: 84, volatility: 12, profile: 'hill_clean' },
  { id: 'in-uk-haldwani', station_name: 'Nainital Road District Station', city: 'Haldwani', district: 'Nainital', state_code: 'UK', latitude: 29.2183, longitude: 79.513, baseAqi: 108, volatility: 12, profile: 'urban_metro' },

  // ===================== HIMACHAL PRADESH (HP) =====================
  { id: 'in-hp-shimla', station_name: 'The Ridge Ridge-Line Monitor', city: 'Shimla', district: 'Shimla', state_code: 'HP', latitude: 31.1048, longitude: 77.1734, baseAqi: 44, volatility: 10, profile: 'hill_clean' },
  { id: 'in-hp-dharamshala', station_name: 'McLeod Ganj Dhauladhar Monitor', city: 'Dharamshala', district: 'Kangra', state_code: 'HP', latitude: 32.219, longitude: 76.3234, baseAqi: 38, volatility: 9, profile: 'hill_clean' },

  // ===================== JAMMU AND KASHMIR (UT - JK) =====================
  { id: 'in-jk-srinagar', station_name: 'Rajbagh Jhelum Valley Monitor', city: 'Srinagar', district: 'Srinagar', state_code: 'JK', latitude: 34.0695, longitude: 74.8286, baseAqi: 78, volatility: 14, profile: 'hill_clean' },
  { id: 'in-jk-jammu', station_name: 'Gandhi Nagar Tawi Monitor', city: 'Jammu', district: 'Jammu', state_code: 'JK', latitude: 32.7073, longitude: 74.859, baseAqi: 134, volatility: 15, profile: 'urban_metro' },

  // ===================== LADAKH (UT - LA) =====================
  { id: 'in-la-leh', station_name: 'Leh Main Bazaar High-Altitude Station', city: 'Leh', district: 'Leh', state_code: 'LA', latitude: 34.1526, longitude: 77.5771, baseAqi: 32, volatility: 8, profile: 'hill_clean' },
  { id: 'in-la-kargil', station_name: 'Suru Valley District Monitor', city: 'Kargil', district: 'Kargil', state_code: 'LA', latitude: 34.5539, longitude: 76.1349, baseAqi: 36, volatility: 8, profile: 'hill_clean' },

  // ===================== MAHARASHTRA (MH) =====================
  { id: 'in-mh-mumbai-bkc', station_name: 'Bandra Kurla Complex Station', city: 'Mumbai', district: 'Mumbai Suburban', state_code: 'MH', latitude: 19.0658, longitude: 72.8644, baseAqi: 156, volatility: 16, profile: 'coastal' },
  { id: 'in-mh-mumbai-worli', station_name: 'Worli Seaface Coastal Monitor', city: 'Mumbai', district: 'Mumbai City', state_code: 'MH', latitude: 19.0096, longitude: 72.8157, baseAqi: 118, volatility: 14, profile: 'coastal' },
  { id: 'in-mh-mumbai-colaba', station_name: 'Colaba Observatory Station', city: 'Mumbai', district: 'Mumbai City', state_code: 'MH', latitude: 18.9067, longitude: 72.8147, baseAqi: 104, volatility: 12, profile: 'coastal' },
  { id: 'in-mh-mumbai-powai', station_name: 'Powai Lake Institutional Monitor', city: 'Mumbai', district: 'Mumbai Suburban', state_code: 'MH', latitude: 19.1246, longitude: 72.9052, baseAqi: 132, volatility: 14, profile: 'urban_metro' },
  { id: 'in-mh-pune-shivaji', station_name: 'Shivajinagar Central Monitor', city: 'Pune', district: 'Pune', state_code: 'MH', latitude: 18.5308, longitude: 73.8475, baseAqi: 134, volatility: 14, profile: 'urban_metro' },
  { id: 'in-mh-pune-lohegaon', station_name: 'Lohegaon Eastern Corridor', city: 'Pune', district: 'Pune', state_code: 'MH', latitude: 18.5821, longitude: 73.9197, baseAqi: 118, volatility: 14, profile: 'urban_metro' },
  { id: 'in-mh-nagpur-civil', station_name: 'Civil Lines Zero-Mile Station', city: 'Nagpur', district: 'Nagpur', state_code: 'MH', latitude: 21.1498, longitude: 79.0806, baseAqi: 142, volatility: 15, profile: 'urban_metro' },
  { id: 'in-mh-nagpur-hingna', station_name: 'Hingna MIDC Industrial Station', city: 'Nagpur', district: 'Nagpur', state_code: 'MH', latitude: 21.1021, longitude: 78.9952, baseAqi: 166, volatility: 16, profile: 'industrial' },
  { id: 'in-mh-nashik', station_name: 'Gangapur Road Urban Monitor', city: 'Nashik', district: 'Nashik', state_code: 'MH', latitude: 20.0059, longitude: 73.7611, baseAqi: 112, volatility: 13, profile: 'urban_metro' },

  // ===================== GUJARAT (GJ) =====================
  { id: 'in-gj-ahmedabad-maninagar', station_name: 'Maninagar Urban Station', city: 'Ahmedabad', district: 'Ahmedabad', state_code: 'GJ', latitude: 22.9962, longitude: 72.6033, baseAqi: 188, volatility: 17, profile: 'urban_metro' },
  { id: 'in-gj-ahmedabad-navrang', station_name: 'Navrangpura Sabarmati Monitor', city: 'Ahmedabad', district: 'Ahmedabad', state_code: 'GJ', latitude: 23.0365, longitude: 72.5611, baseAqi: 162, volatility: 15, profile: 'urban_metro' },
  { id: 'in-gj-surat-athwa', station_name: 'Athwa Lines Tapi Station', city: 'Surat', district: 'Surat', state_code: 'GJ', latitude: 21.1862, longitude: 72.8081, baseAqi: 146, volatility: 15, profile: 'coastal' },
  { id: 'in-gj-surat-sachin', station_name: 'Sachin GIDC Industrial Monitor', city: 'Surat', district: 'Surat', state_code: 'GJ', latitude: 21.0938, longitude: 72.8781, baseAqi: 184, volatility: 16, profile: 'industrial' },
  { id: 'in-gj-vadodara', station_name: 'Alkapuri District Monitor', city: 'Vadodara', district: 'Vadodara', state_code: 'GJ', latitude: 22.3072, longitude: 73.1712, baseAqi: 144, volatility: 14, profile: 'industrial' },
  { id: 'in-gj-rajkot', station_name: 'Race Course Saurashtra Station', city: 'Rajkot', district: 'Rajkot', state_code: 'GJ', latitude: 22.3039, longitude: 70.7931, baseAqi: 128, volatility: 14, profile: 'urban_metro' },

  // ===================== DADRA & NAGAR HAVELI AND DAMAN & DIU (UT - DN) =====================
  { id: 'in-dn-silvassa', station_name: 'Silvassa Secretariat Monitor', city: 'Silvassa', district: 'Dadra and Nagar Haveli', state_code: 'DN', latitude: 20.2763, longitude: 73.0083, baseAqi: 92, volatility: 12, profile: 'coastal' },
  { id: 'in-dn-daman', station_name: 'Nani Daman Coastal Station', city: 'Daman', district: 'Daman', state_code: 'DN', latitude: 20.4143, longitude: 72.8324, baseAqi: 78, volatility: 11, profile: 'coastal' },

  // ===================== GOA (GA) =====================
  { id: 'in-ga-panaji', station_name: 'Altinho Mandovi Monitor', city: 'Panaji', district: 'North Goa', state_code: 'GA', latitude: 15.4909, longitude: 73.8278, baseAqi: 54, volatility: 10, profile: 'coastal' },
  { id: 'in-ga-margao', station_name: 'Margao South Goa Station', city: 'Margao', district: 'South Goa', state_code: 'GA', latitude: 15.2832, longitude: 73.9862, baseAqi: 62, volatility: 10, profile: 'coastal' },

  // ===================== MADHYA PRADESH (MP) =====================
  { id: 'in-mp-bhopal-ttnagar', station_name: 'T T Nagar Lakefront Monitor', city: 'Bhopal', district: 'Bhopal', state_code: 'MP', latitude: 23.2335, longitude: 77.4006, baseAqi: 148, volatility: 15, profile: 'urban_metro' },
  { id: 'in-mp-bhopal-arera', station_name: 'Arera Colony Civic Monitor', city: 'Bhopal', district: 'Bhopal', state_code: 'MP', latitude: 23.2156, longitude: 77.4304, baseAqi: 126, volatility: 14, profile: 'urban_metro' },
  { id: 'in-mp-indore-chhoti', station_name: 'Chhoti Gwaltoli Central Station', city: 'Indore', district: 'Indore', state_code: 'MP', latitude: 22.7196, longitude: 75.8648, baseAqi: 142, volatility: 15, profile: 'urban_metro' },
  { id: 'in-mp-indore-vijay', station_name: 'Vijay Nagar Ring Road Monitor', city: 'Indore', district: 'Indore', state_code: 'MP', latitude: 22.7533, longitude: 75.8937, baseAqi: 128, volatility: 14, profile: 'urban_metro' },
  { id: 'in-mp-jabalpur', station_name: 'Marhatal Narmada Zone', city: 'Jabalpur', district: 'Jabalpur', state_code: 'MP', latitude: 23.1686, longitude: 79.9339, baseAqi: 136, volatility: 14, profile: 'urban_metro' },
  { id: 'in-mp-gwalior', station_name: 'City Centre Chambal Station', city: 'Gwalior', district: 'Gwalior', state_code: 'MP', latitude: 26.2124, longitude: 78.1772, baseAqi: 214, volatility: 17, profile: 'urban_heavy' },

  // ===================== CHHATTISGARH (CG) =====================
  { id: 'in-cg-raipur-civil', station_name: 'Civil Lines Secretariat Monitor', city: 'Raipur', district: 'Raipur', state_code: 'CG', latitude: 21.2422, longitude: 81.6512, baseAqi: 162, volatility: 15, profile: 'urban_metro' },
  { id: 'in-cg-raipur-siltara', station_name: 'Siltara Industrial Corridor', city: 'Raipur', district: 'Raipur', state_code: 'CG', latitude: 21.3728, longitude: 81.6552, baseAqi: 218, volatility: 18, profile: 'industrial' },
  { id: 'in-cg-bilaspur', station_name: 'Vyapar Vihar District Monitor', city: 'Bilaspur', district: 'Bilaspur', state_code: 'CG', latitude: 22.0797, longitude: 82.1391, baseAqi: 138, volatility: 14, profile: 'industrial' },

  // ===================== WEST BENGAL (WB) =====================
  { id: 'in-wb-kolkata-bally', station_name: 'Ballygunge Urban Station', city: 'Kolkata', district: 'Kolkata', state_code: 'WB', latitude: 22.5311, longitude: 88.3638, baseAqi: 228, volatility: 18, profile: 'urban_heavy' },
  { id: 'in-wb-kolkata-victoria', station_name: 'Victoria Maidan Heritage Monitor', city: 'Kolkata', district: 'Kolkata', state_code: 'WB', latitude: 22.5448, longitude: 88.3426, baseAqi: 196, volatility: 16, profile: 'urban_metro' },
  { id: 'in-wb-kolkata-saltlake', station_name: 'Salt Lake Bidhannagar Station', city: 'Kolkata', district: 'North 24 Parganas', state_code: 'WB', latitude: 22.5867, longitude: 88.4171, baseAqi: 182, volatility: 16, profile: 'urban_metro' },
  { id: 'in-wb-siliguri', station_name: 'Sevoke Road Foothills Station', city: 'Siliguri', district: 'Darjeeling', state_code: 'WB', latitude: 26.7271, longitude: 88.4293, baseAqi: 132, volatility: 14, profile: 'urban_metro' },
  { id: 'in-wb-durgapur', station_name: 'City Centre Steel Belt Monitor', city: 'Durgapur', district: 'Paschim Bardhaman', state_code: 'WB', latitude: 23.5204, longitude: 87.3119, baseAqi: 214, volatility: 17, profile: 'industrial' },

  // ===================== BIHAR (BR) =====================
  { id: 'in-br-patna-igsc', station_name: 'IGSC Planetarium Station', city: 'Patna', district: 'Patna', state_code: 'BR', latitude: 25.6119, longitude: 85.1306, baseAqi: 288, volatility: 20, profile: 'urban_heavy' },
  { id: 'in-br-patna-danapur', station_name: 'Danapur Cantonment Monitor', city: 'Patna', district: 'Patna', state_code: 'BR', latitude: 25.6327, longitude: 85.0445, baseAqi: 264, volatility: 18, profile: 'urban_heavy' },
  { id: 'in-br-gaya', station_name: 'Collectorate District Monitor', city: 'Gaya', district: 'Gaya', state_code: 'BR', latitude: 24.7914, longitude: 85.0002, baseAqi: 222, volatility: 18, profile: 'urban_metro' },
  { id: 'in-br-muzaffarpur', station_name: 'Mithanpura Tirhut Station', city: 'Muzaffarpur', district: 'Muzaffarpur', state_code: 'BR', latitude: 26.1197, longitude: 85.391, baseAqi: 252, volatility: 18, profile: 'urban_heavy' },

  // ===================== JHARKHAND (JH) =====================
  { id: 'in-jh-ranchi-albert', station_name: 'Albert Ekka Chowk Monitor', city: 'Ranchi', district: 'Ranchi', state_code: 'JH', latitude: 23.3688, longitude: 85.325, baseAqi: 154, volatility: 15, profile: 'urban_metro' },
  { id: 'in-jh-ranchi-doranda', station_name: 'Doranda Secretariat Station', city: 'Ranchi', district: 'Ranchi', state_code: 'JH', latitude: 23.3322, longitude: 85.3208, baseAqi: 138, volatility: 14, profile: 'urban_metro' },
  { id: 'in-jh-jamshedpur', station_name: 'Bistupur Industrial Monitor', city: 'Jamshedpur', district: 'East Singhbhum', state_code: 'JH', latitude: 22.7925, longitude: 86.1842, baseAqi: 188, volatility: 16, profile: 'industrial' },
  { id: 'in-jh-dhanbad', station_name: 'Jharia Coalfield Belt Monitor', city: 'Dhanbad', district: 'Dhanbad', state_code: 'JH', latitude: 23.7957, longitude: 86.4304, baseAqi: 244, volatility: 18, profile: 'industrial' },

  // ===================== ODISHA (OD) =====================
  { id: 'in-od-bhubaneswar-saheed', station_name: 'Saheed Nagar Civic Monitor', city: 'Bhubaneswar', district: 'Khordha', state_code: 'OD', latitude: 20.2906, longitude: 85.8436, baseAqi: 128, volatility: 14, profile: 'coastal' },
  { id: 'in-od-bhubaneswar-patia', station_name: 'Patia Technology Corridor', city: 'Bhubaneswar', district: 'Khordha', state_code: 'OD', latitude: 20.3533, longitude: 85.8266, baseAqi: 112, volatility: 13, profile: 'urban_metro' },
  { id: 'in-od-cuttack', station_name: 'Badambadi Mahanadi Monitor', city: 'Cuttack', district: 'Cuttack', state_code: 'OD', latitude: 20.4625, longitude: 85.883, baseAqi: 142, volatility: 14, profile: 'urban_metro' },
  { id: 'in-od-rourkela', station_name: 'Sector 19 Steel City Station', city: 'Rourkela', district: 'Sundargarh', state_code: 'OD', latitude: 22.2604, longitude: 84.8536, baseAqi: 178, volatility: 16, profile: 'industrial' },

  // ===================== ASSAM (AS) =====================
  { id: 'in-as-guwahati-panbazar', station_name: 'Pan Bazar Brahmaputra Monitor', city: 'Guwahati', district: 'Kamrup Metropolitan', state_code: 'AS', latitude: 26.1844, longitude: 91.7458, baseAqi: 138, volatility: 15, profile: 'urban_metro' },
  { id: 'in-as-guwahati-dispur', station_name: 'Dispur Capital Complex Station', city: 'Guwahati', district: 'Kamrup Metropolitan', state_code: 'AS', latitude: 26.1433, longitude: 91.7898, baseAqi: 124, volatility: 14, profile: 'urban_metro' },
  { id: 'in-as-dibrugarh', station_name: 'Upper Assam District Monitor', city: 'Dibrugarh', district: 'Dibrugarh', state_code: 'AS', latitude: 27.4728, longitude: 94.912, baseAqi: 76, volatility: 12, profile: 'hill_clean' },

  // ===================== MEGHALAYA (ML) =====================
  { id: 'in-ml-shillong', station_name: 'Lumpyngngad Highland Monitor', city: 'Shillong', district: 'East Khasi Hills', state_code: 'ML', latitude: 25.5788, longitude: 91.8933, baseAqi: 42, volatility: 9, profile: 'hill_clean' },
  { id: 'in-ml-tura', station_name: 'Tura Garo Hills Station', city: 'Tura', district: 'West Garo Hills', state_code: 'ML', latitude: 25.5141, longitude: 90.2032, baseAqi: 48, volatility: 9, profile: 'hill_clean' },

  // ===================== MANIPUR (MN) =====================
  { id: 'in-mn-imphal', station_name: 'Lamphelpat Valley Monitor', city: 'Imphal', district: 'Imphal West', state_code: 'MN', latitude: 24.817, longitude: 93.9368, baseAqi: 66, volatility: 11, profile: 'hill_clean' },

  // ===================== MIZORAM (MZ) =====================
  { id: 'in-mz-aizawl', station_name: 'Sikulpuikawn Ridge Station', city: 'Aizawl', district: 'Aizawl', state_code: 'MZ', latitude: 23.7271, longitude: 92.7176, baseAqi: 39, volatility: 9, profile: 'hill_clean' },

  // ===================== TRIPURA (TR) =====================
  { id: 'in-tr-agartala', station_name: 'Kunjaban Civic Monitor', city: 'Agartala', district: 'West Tripura', state_code: 'TR', latitude: 23.8315, longitude: 91.2868, baseAqi: 108, volatility: 13, profile: 'urban_metro' },

  // ===================== NAGALAND (NL) =====================
  { id: 'in-nl-kohima', station_name: 'PWD Junction Highland Station', city: 'Kohima', district: 'Kohima', state_code: 'NL', latitude: 25.6751, longitude: 94.1086, baseAqi: 46, volatility: 10, profile: 'hill_clean' },
  { id: 'in-nl-dimapur', station_name: 'Clock Tower Commercial Monitor', city: 'Dimapur', district: 'Dimapur', state_code: 'NL', latitude: 25.9091, longitude: 93.7266, baseAqi: 96, volatility: 12, profile: 'urban_metro' },

  // ===================== ARUNACHAL PRADESH (AR) =====================
  { id: 'in-ar-itanagar', station_name: 'Naharlagun Foothill Monitor', city: 'Itanagar', district: 'Papum Pare', state_code: 'AR', latitude: 27.0844, longitude: 93.6053, baseAqi: 41, volatility: 9, profile: 'hill_clean' },

  // ===================== SIKKIM (SK) =====================
  { id: 'in-sk-gangtok', station_name: 'Zero Point Himalayan Monitor', city: 'Gangtok', district: 'Gangtok', state_code: 'SK', latitude: 27.3389, longitude: 88.6065, baseAqi: 34, volatility: 8, profile: 'hill_clean' },

  // ===================== KARNATAKA (KA) =====================
  { id: 'in-ka-bengaluru-btm', station_name: 'BTM Layout Urban Monitor', city: 'Bengaluru', district: 'Bengaluru Urban', state_code: 'KA', latitude: 12.9166, longitude: 77.6101, baseAqi: 84, volatility: 12, profile: 'urban_metro' },
  { id: 'in-ka-bengaluru-hebbal', station_name: 'Hebbal Outer Ring Station', city: 'Bengaluru', district: 'Bengaluru Urban', state_code: 'KA', latitude: 13.0358, longitude: 77.597, baseAqi: 74, volatility: 11, profile: 'urban_metro' },
  { id: 'in-ka-bengaluru-silk', station_name: 'Silk Board Junction Corridor', city: 'Bengaluru', district: 'Bengaluru Urban', state_code: 'KA', latitude: 12.9177, longitude: 77.6238, baseAqi: 108, volatility: 13, profile: 'urban_metro' },
  { id: 'in-ka-bengaluru-jayanagar', station_name: 'Jayanagar 5th Block Park', city: 'Bengaluru', district: 'Bengaluru Urban', state_code: 'KA', latitude: 12.9209, longitude: 77.5848, baseAqi: 68, volatility: 10, profile: 'urban_metro' },
  { id: 'in-ka-mysuru', station_name: 'Hebbal Heritage City Monitor', city: 'Mysuru', district: 'Mysuru', state_code: 'KA', latitude: 12.2958, longitude: 76.6394, baseAqi: 52, volatility: 10, profile: 'hill_clean' },
  { id: 'in-ka-hubballi', station_name: 'Deshpande Nagar District Station', city: 'Hubballi', district: 'Dharwad', state_code: 'KA', latitude: 15.3647, longitude: 75.124, baseAqi: 78, volatility: 11, profile: 'urban_metro' },

  // ===================== TAMIL NADU (TN) =====================
  { id: 'in-tn-chennai-alandur', station_name: 'Alandur Bus Depot Monitor', city: 'Chennai', district: 'Chennai', state_code: 'TN', latitude: 13.0012, longitude: 80.2015, baseAqi: 96, volatility: 13, profile: 'coastal' },
  { id: 'in-tn-chennai-velachery', station_name: 'Velachery Residential Station', city: 'Chennai', district: 'Chennai', state_code: 'TN', latitude: 12.9815, longitude: 80.218, baseAqi: 84, volatility: 12, profile: 'coastal' },
  { id: 'in-tn-chennai-manali', station_name: 'Manali Industrial Corridor', city: 'Chennai', district: 'Tiruvallur', state_code: 'TN', latitude: 13.1645, longitude: 80.2628, baseAqi: 134, volatility: 15, profile: 'industrial' },
  { id: 'in-tn-coimbatore', station_name: 'SIDCO Kurichi Urban Monitor', city: 'Coimbatore', district: 'Coimbatore', state_code: 'TN', latitude: 11.0168, longitude: 76.9558, baseAqi: 68, volatility: 11, profile: 'urban_metro' },
  { id: 'in-tn-madurai', station_name: 'Tallakulam Vaigai Station', city: 'Madurai', district: 'Madurai', state_code: 'TN', latitude: 9.9252, longitude: 78.1198, baseAqi: 74, volatility: 11, profile: 'urban_metro' },

  // ===================== TELANGANA (TS) =====================
  { id: 'in-ts-hyderabad-jubilee', station_name: 'Jubilee Hills Central Monitor', city: 'Hyderabad', district: 'Hyderabad', state_code: 'TS', latitude: 17.4319, longitude: 78.4071, baseAqi: 108, volatility: 13, profile: 'urban_metro' },
  { id: 'in-ts-hyderabad-zoopark', station_name: 'Zoo Park Bahadurpura Station', city: 'Hyderabad', district: 'Hyderabad', state_code: 'TS', latitude: 17.3497, longitude: 78.4514, baseAqi: 126, volatility: 14, profile: 'urban_metro' },
  { id: 'in-ts-hyderabad-patancheru', station_name: 'ICRISAT Patancheru Station', city: 'Hyderabad', district: 'Sangareddy', state_code: 'TS', latitude: 17.5111, longitude: 78.2752, baseAqi: 142, volatility: 15, profile: 'industrial' },
  { id: 'in-ts-warangal', station_name: 'Hanamkonda District Monitor', city: 'Warangal', district: 'Hanumakonda', state_code: 'TS', latitude: 17.9689, longitude: 79.5941, baseAqi: 94, volatility: 12, profile: 'urban_metro' },

  // ===================== KERALA (KL) =====================
  { id: 'in-kl-kochi-vyttila', station_name: 'Vyttila Mobility Hub Monitor', city: 'Kochi', district: 'Ernakulam', state_code: 'KL', latitude: 9.9675, longitude: 76.3183, baseAqi: 66, volatility: 10, profile: 'coastal' },
  { id: 'in-kl-kochi-eloor', station_name: 'Eloor Periyar Belt Station', city: 'Kochi', district: 'Ernakulam', state_code: 'KL', latitude: 10.0736, longitude: 76.2981, baseAqi: 82, volatility: 11, profile: 'coastal' },
  { id: 'in-kl-thiruvananthapuram', station_name: 'Plammoodu Coastal Station', city: 'Thiruvananthapuram', district: 'Thiruvananthapuram', state_code: 'KL', latitude: 8.5149, longitude: 76.9436, baseAqi: 46, volatility: 9, profile: 'coastal' },
  { id: 'in-kl-kozhikode', station_name: 'Palayam Malabar Monitor', city: 'Kozhikode', district: 'Kozhikode', state_code: 'KL', latitude: 11.2588, longitude: 75.7804, baseAqi: 54, volatility: 10, profile: 'coastal' },

  // ===================== ANDHRA PRADESH (AP) =====================
  { id: 'in-ap-vizag-gvmc', station_name: 'GVM Corporation Coastal Monitor', city: 'Visakhapatnam', district: 'Visakhapatnam', state_code: 'AP', latitude: 17.7231, longitude: 83.3012, baseAqi: 104, volatility: 13, profile: 'coastal' },
  { id: 'in-ap-vizag-gajuwaka', station_name: 'Gajuwaka Port Industrial Station', city: 'Visakhapatnam', district: 'Visakhapatnam', state_code: 'AP', latitude: 17.6905, longitude: 83.2099, baseAqi: 132, volatility: 14, profile: 'industrial' },
  { id: 'in-ap-vijayawada', station_name: 'PWD Grounds Krishna Monitor', city: 'Vijayawada', district: 'NTR', state_code: 'AP', latitude: 16.5062, longitude: 80.648, baseAqi: 96, volatility: 12, profile: 'urban_metro' },
  { id: 'in-ap-tirupati', station_name: 'Tirumala Foothills Station', city: 'Tirupati', district: 'Tirupati', state_code: 'AP', latitude: 13.6288, longitude: 79.4192, baseAqi: 58, volatility: 10, profile: 'hill_clean' },

  // ===================== PUDUCHERRY (UT - PY) =====================
  { id: 'in-py-puducherry', station_name: 'White Town Promenade Monitor', city: 'Puducherry', district: 'Puducherry', state_code: 'PY', latitude: 11.9416, longitude: 79.8083, baseAqi: 56, volatility: 10, profile: 'coastal' },

  // ===================== ANDAMAN AND NICOBAR ISLANDS (UT - AN) =====================
  { id: 'in-an-port-blair', station_name: 'Aberdeen Bay Island Monitor', city: 'Port Blair', district: 'South Andaman', state_code: 'AN', latitude: 11.6234, longitude: 92.7265, baseAqi: 28, volatility: 7, profile: 'island_clean' },

  // ===================== LAKSHADWEEP (UT - LD) =====================
  { id: 'in-ld-kavaratti', station_name: 'Kavaratti Lagoon Marine Monitor', city: 'Kavaratti', district: 'Lakshadweep', state_code: 'LD', latitude: 10.5667, longitude: 72.6417, baseAqi: 24, volatility: 6, profile: 'island_clean' },
];

export const ORDERED_VALID_CATEGORIES: ValidAqiCategory[] = [
  'Good',
  'Satisfactory',
  'Moderate',
  'Poor',
  'Very Poor',
  'Severe',
];

export function classifySimulatedCpcbCategory(aqi: number): ValidAqiCategory {
  const clamped = Math.max(0, Math.min(500, Math.round(aqi)));
  if (clamped <= 50) return 'Good';
  if (clamped <= 100) return 'Satisfactory';
  if (clamped <= 200) return 'Moderate';
  if (clamped <= 300) return 'Poor';
  if (clamped <= 400) return 'Very Poor';
  return 'Severe';
}

/**
 * Deterministic 32-bit hash (FNV-1a + avalanche) so station values are 100%
 * reproducible within each simulation interval and never jump on refresh.
 */
function deterministicUnitFloat(seedInput: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedInput.length; i++) {
    h ^= seedInput.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Computes a realistic diurnal multiplier based on IST hour of day.
 * Early morning / late evening inversion slightly elevates particulates;
 * mid-afternoon boundary layer mixing slightly lowers particulates.
 */
function istDiurnalMultiplier(timestampMs: number): number {
  const istMs = timestampMs + 5.5 * 3600 * 1000;
  const istHour = new Date(istMs).getUTCHours() + new Date(istMs).getUTCMinutes() / 60;
  const morningPeak = Math.exp(-Math.pow((istHour - 8.5) / 3.2, 2)) * 0.08;
  const eveningPeak = Math.exp(-Math.pow((istHour - 21.5) / 3.4, 2)) * 0.09;
  const afternoonDip = -Math.exp(-Math.pow((istHour - 14.5) / 2.8, 2)) * 0.1;
  return 1 + morningPeak + eveningPeak + afternoonDip;
}

function derivePollutantsForStation(
  tpl: StationTemplate,
  aqi: number,
  bucketIndex: number
): {
  pm25: number;
  pm10: number;
  no2: number;
  so2: number;
  co: number;
  o3: number;
} {
  const j = (salt: string, span: number) =>
    (deterministicUnitFloat(`${tpl.id}:${bucketIndex}:${salt}`) * 2 - 1) * span;

  // Realistic pollutant scaling tied to simulated AQI (CPCB concentration units)
  const pm25Ratio =
    tpl.profile === 'urban_heavy'
      ? 0.56
      : tpl.profile === 'industrial'
      ? 0.52
      : tpl.profile === 'coastal'
      ? 0.44
      : tpl.profile === 'island_clean' || tpl.profile === 'hill_clean'
      ? 0.42
      : 0.49;

  const pm10Ratio =
    tpl.profile === 'industrial'
      ? 1.04
      : tpl.profile === 'urban_heavy'
      ? 0.94
      : tpl.profile === 'coastal'
      ? 0.86
      : 0.88;

  const pm25 = Math.max(4, round1(aqi * pm25Ratio + j('pm25', 4.5)));
  const pm10 = Math.max(pm25 + 6, round1(aqi * pm10Ratio + j('pm10', 8)));
  const no2 = Math.max(
    4,
    round1(
      aqi * (tpl.profile === 'urban_heavy' || tpl.profile === 'urban_metro' ? 0.22 : 0.16) +
        6 +
        j('no2', 5)
    )
  );
  const so2 = Math.max(
    2,
    round1(
      aqi * (tpl.profile === 'industrial' ? 0.12 : 0.065) + 3 + j('so2', 2.5)
    )
  );
  const co = Math.max(
    0.15,
    round2(0.28 + (aqi / 500) * 2.4 + j('co', 0.18))
  );
  const o3 = Math.max(
    12,
    round1(28 + (tpl.profile === 'coastal' ? 14 : 9) + (aqi / 500) * 34 + j('o3', 7))
  );

  return { pm25, pm10, no2, so2, co, o3 };
}

export interface IndiaSimulationSnapshot {
  bucketIndex: number;
  intervalMs: number;
  generatedAt: string;
  nextUpdateAt: string;
  stations: SimulatedIndiaStation[];
  summary: IndiaAqiSummary;
  states: { name: string; code: string; isUnionTerritory: boolean }[];
}

const snapshotCache = new Map<string, IndiaSimulationSnapshot>();
const MAX_CACHE_ENTRIES = 6;

export function resolveSimulationIntervalMs(rawEnv?: string): number {
  const parsed = Number(rawEnv);
  if (Number.isFinite(parsed) && parsed >= 60_000 && parsed <= 24 * 60 * 60 * 1000) {
    return Math.round(parsed);
  }
  return DEFAULT_SIMULATION_INTERVAL_MS;
}

export function computeSummaryFromStations(
  stations: SimulatedIndiaStation[],
  meta: { generatedAt: string; nextUpdateAt: string; intervalMs: number }
): IndiaAqiSummary {
  const totalStations = stations.length;
  const averageAqi =
    totalStations > 0
      ? Math.round(
          stations.reduce((sum, st) => sum + st.aqi, 0) / totalStations
        )
      : 0;

  let highestStation: SimulatedIndiaStation | null = null;
  let lowestStation: SimulatedIndiaStation | null = null;

  const categoryCounts = new Map<ValidAqiCategory, number>(
    ORDERED_VALID_CATEGORIES.map((c) => [c, 0])
  );
  const byStateCode = new Map<string, SimulatedIndiaStation[]>();

  for (const st of stations) {
    if (!highestStation || st.aqi > highestStation.aqi) highestStation = st;
    if (!lowestStation || st.aqi < lowestStation.aqi) lowestStation = st;

    categoryCounts.set(
      st.aqi_category,
      (categoryCounts.get(st.aqi_category) ?? 0) + 1
    );

    const list = byStateCode.get(st.state_code) ?? [];
    list.push(st);
    byStateCode.set(st.state_code, list);
  }

  let statesCovered = 0;
  let unionTerritoriesCovered = 0;
  const stateComparison: StateAqiComparison[] = [];

  for (const [code, list] of byStateCode.entries()) {
    const info = STATE_BY_CODE.get(code);
    if (!info) continue;
    if (info.isUnionTerritory) {
      unionTerritoriesCovered += 1;
    } else {
      statesCovered += 1;
    }
    const avg = Math.round(
      list.reduce((acc, s) => acc + s.aqi, 0) / list.length
    );
    const maxAqi = Math.max(...list.map((s) => s.aqi));
    const minAqi = Math.min(...list.map((s) => s.aqi));
    stateComparison.push({
      state: info.name,
      state_code: info.code,
      isUnionTerritory: info.isUnionTerritory,
      region: info.region,
      stationCount: list.length,
      averageAqi: avg,
      maxAqi,
      minAqi,
      category: classifySimulatedCpcbCategory(avg),
      representativeCity: list[0].city,
    });
  }

  stateComparison.sort((a, b) => b.averageAqi - a.averageAqi);

  const categoryDistribution: CategoryDistributionItem[] =
    ORDERED_VALID_CATEGORIES.map((category) => {
      const count = categoryCounts.get(category) ?? 0;
      const percentage =
        totalStations > 0 ? Math.round((count / totalStations) * 1000) / 10 : 0;
      return { category, count, percentage };
    });

  return {
    totalStations,
    statesCovered,
    unionTerritoriesCovered,
    averageAqi,
    highestStation,
    lowestStation,
    categoryDistribution,
    stateComparison,
    generatedAt: meta.generatedAt,
    nextUpdateAt: meta.nextUpdateAt,
    intervalMs: meta.intervalMs,
    data_source: SIMULATION_DATA_SOURCE,
    data_type: SIMULATION_DATA_TYPE,
    disclaimer: SIMULATION_DISCLAIMER_TEXT,
  };
}

/**
 * Returns the cached deterministic India-wide simulated snapshot for the active
 * time bucket. Repeated calls within the same interval return identical data.
 */
export function getIndiaSimulatedSnapshot(
  nowMs: number = Date.now(),
  intervalMs: number = DEFAULT_SIMULATION_INTERVAL_MS
): IndiaSimulationSnapshot {
  const safeInterval = Math.max(60_000, Math.round(intervalMs));
  const bucketIndex = Math.floor(nowMs / safeInterval);
  const cacheKey = `${safeInterval}:${bucketIndex}`;

  const existing = snapshotCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const bucketStartMs = bucketIndex * safeInterval;
  const generatedAt = new Date(bucketStartMs).toISOString();
  const nextUpdateAt = new Date(bucketStartMs + safeInterval).toISOString();
  const diurnal = istDiurnalMultiplier(bucketStartMs);

  const stations: SimulatedIndiaStation[] = INDIA_STATION_TEMPLATES.map((tpl) => {
    const stateInfo = STATE_BY_CODE.get(tpl.state_code);
    const stateName = stateInfo?.name ?? tpl.state_code;

    // Smooth wave across intervals + deterministic per-station drift
    const rand = deterministicUnitFloat(`${tpl.id}:${bucketIndex}:aqi`);
    const slowTrend = Math.sin(bucketIndex * 0.37 + tpl.latitude * 0.4) * (tpl.volatility * 0.45);
    const stepDrift = (rand * 2 - 1) * (tpl.volatility * 0.55);

    const rawAqi = tpl.baseAqi * diurnal + slowTrend + stepDrift;
    const aqi = Math.max(8, Math.min(495, Math.round(rawAqi)));
    const aqi_category = classifySimulatedCpcbCategory(aqi);
    const pollutants = derivePollutantsForStation(tpl, aqi, bucketIndex);

    return {
      id: tpl.id,
      station_name: tpl.station_name,
      city: tpl.city,
      district: tpl.district,
      state: stateName,
      state_code: tpl.state_code,
      latitude: tpl.latitude,
      longitude: tpl.longitude,
      aqi,
      aqi_category,
      pm25: pollutants.pm25,
      pm10: pollutants.pm10,
      no2: pollutants.no2,
      so2: pollutants.so2,
      co: pollutants.co,
      o3: pollutants.o3,
      timestamp: generatedAt,
      data_source: SIMULATION_DATA_SOURCE,
      data_type: SIMULATION_DATA_TYPE,
    };
  });

  const summary = computeSummaryFromStations(stations, {
    generatedAt,
    nextUpdateAt,
    intervalMs: safeInterval,
  });

  const snapshot: IndiaSimulationSnapshot = {
    bucketIndex,
    intervalMs: safeInterval,
    generatedAt,
    nextUpdateAt,
    stations,
    summary,
    states: INDIA_STATES_AND_UTS.map((s) => ({
      name: s.name,
      code: s.code,
      isUnionTerritory: s.isUnionTerritory,
    })),
  };

  if (snapshotCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = snapshotCache.keys().next().value;
    if (oldestKey) snapshotCache.delete(oldestKey);
  }
  snapshotCache.set(cacheKey, snapshot);

  return snapshot;
}

export function clearIndiaSimulationCache(): void {
  snapshotCache.clear();
}

export function queryIndiaSimulatedApi(options?: {
  state?: string;
  city?: string;
  category?: string;
  search?: string;
  nowMs?: number;
  intervalMs?: number;
}): IndiaAqiApiResponse {
  const snapshot = getIndiaSimulatedSnapshot(
    options?.nowMs ?? Date.now(),
    options?.intervalMs ?? DEFAULT_SIMULATION_INTERVAL_MS
  );

  const stateQ = options?.state?.trim().toLowerCase() ?? '';
  const cityQ = options?.city?.trim().toLowerCase() ?? '';
  const categoryQ = options?.category?.trim().toLowerCase() ?? '';
  const searchQ = options?.search?.trim().toLowerCase() ?? '';

  const filtered = snapshot.stations.filter((st) => {
    if (stateQ && stateQ !== 'all') {
      const matchesState =
        st.state.toLowerCase() === stateQ ||
        st.state_code.toLowerCase() === stateQ;
      if (!matchesState) return false;
    }
    if (cityQ) {
      if (st.city.toLowerCase() !== cityQ && !st.city.toLowerCase().includes(cityQ)) {
        return false;
      }
    }
    if (categoryQ && categoryQ !== 'all') {
      if (st.aqi_category.toLowerCase() !== categoryQ) return false;
    }
    if (searchQ) {
      const hay = `${st.station_name} ${st.city} ${st.district} ${st.state} ${st.state_code}`.toLowerCase();
      if (!hay.includes(searchQ)) return false;
    }
    return true;
  });

  const summary =
    filtered.length === snapshot.stations.length
      ? snapshot.summary
      : computeSummaryFromStations(filtered, {
          generatedAt: snapshot.generatedAt,
          nextUpdateAt: snapshot.nextUpdateAt,
          intervalMs: snapshot.intervalMs,
        });

  return {
    stations: filtered,
    summary,
    states: snapshot.states,
    metadata: {
      data_source: SIMULATION_DATA_SOURCE,
      data_type: SIMULATION_DATA_TYPE,
      badge: SIMULATION_BADGE_TEXT,
      disclaimer: SIMULATION_DISCLAIMER_TEXT,
      generatedAt: snapshot.generatedAt,
      nextUpdateAt: snapshot.nextUpdateAt,
      intervalMs: snapshot.intervalMs,
      totalUnfilteredStations: snapshot.stations.length,
    },
  };
}

function makeSimulatedPollutants(st: SimulatedIndiaStation): PollutantReading[] {
  const mk = (
    id: PollutantReading['id'],
    label: string,
    val: number,
    unit: string,
    spreadFactor: number
  ): PollutantReading => ({
    id,
    label,
    value: val,
    min: Math.max(0, round1(val * (1 - spreadFactor))),
    max: round1(val * (1 + spreadFactor)),
    unit,
    unitCompatibleWithCpcb: true,
    source: 'AERIS_SIMULATION_ENGINE',
  });

  return [
    mk('PM2.5', 'PM2.5', st.pm25, 'µg/m³', 0.22),
    mk('PM10', 'PM10', st.pm10, 'µg/m³', 0.2),
    mk('NO2', 'NO2', st.no2, 'µg/m³', 0.24),
    mk('SO2', 'SO2', st.so2, 'µg/m³', 0.25),
    mk('CO', 'CO', st.co, 'mg/m³', 0.22),
    mk('OZONE', 'Ozone (O3)', st.o3, 'µg/m³', 0.25),
  ];
}

export function determinePredominantPollutant(st: SimulatedIndiaStation): string {
  const ratios: Array<{ id: string; score: number }> = [
    { id: 'PM2.5', score: st.pm25 / 60 },
    { id: 'PM10', score: st.pm10 / 100 },
    { id: 'NO2', score: st.no2 / 80 },
    { id: 'O3', score: st.o3 / 100 },
    { id: 'SO2', score: st.so2 / 80 },
    { id: 'CO', score: st.co / 2 },
  ];
  ratios.sort((a, b) => b.score - a.score);
  return ratios[0]?.id ?? 'PM2.5';
}

export function toStationReading(st: SimulatedIndiaStation): StationReading {
  return {
    id: st.id,
    station: st.station_name,
    city: st.city,
    district: st.district,
    state: st.state,
    stateCode: st.state_code,
    lat: st.latitude,
    lng: st.longitude,
    officialAqi: st.aqi,
    category: st.aqi_category,
    predominantPollutant: determinePredominantPollutant(st),
    pollutants: makeSimulatedPollutants(st),
    lastUpdatedIso: st.timestamp,
    source: 'AERIS_SIMULATION_ENGINE',
    sourceLabel: `${SIMULATION_DATA_SOURCE} (${SIMULATION_DATA_TYPE})`,
    dataType: SIMULATION_DATA_TYPE,
    isOfficialNationalAqi: false,
    isDemo: true,
    isStale: false,
    staleNote: 'Simulated interval snapshot (Demo Mode)',
  };
}

export function buildSimulated24hTrend(
  baseAqi: number,
  basePm25: number,
  basePm10: number,
  nowMs: number,
  seedId: string
): AqiTrendPoint[] {
  const points: AqiTrendPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const tMs = nowMs - i * 3 * 3600 * 1000;
    const d = new Date(tMs);
    const label = `${String(d.getHours()).padStart(2, '0')}:00`;
    const mult = istDiurnalMultiplier(tMs);
    const jitter = (deterministicUnitFloat(`${seedId}:trend:${i}`) * 2 - 1) * 0.05;
    const factor = Math.max(0.65, Math.min(1.35, mult + jitter));
    points.push({
      label,
      timestampIso: d.toISOString(),
      aqi: Math.max(8, Math.min(495, Math.round(baseAqi * factor))),
      pm25: Math.max(4, Math.round(basePm25 * factor)),
      pm10: Math.max(10, Math.round(basePm10 * factor)),
      isObservedHistory: false,
    });
  }
  return points;
}

export interface SimulatedCityCatalogEntry {
  name: string;
  state: string;
  stateCode: string;
  district: string;
  lat: number;
  lng: number;
}

/**
 * Unique list of all cities across the 28 states & 8 Union Territories, sorted
 * with major Indian metros first, then alphabetically.
 */
export const INDIA_SIMULATED_CITIES: SimulatedCityCatalogEntry[] = (() => {
  const seen = new Map<string, SimulatedCityCatalogEntry>();
  for (const tpl of INDIA_STATION_TEMPLATES) {
    const key = tpl.city.toLowerCase();
    if (!seen.has(key)) {
      const stateInfo = STATE_BY_CODE.get(tpl.state_code);
      seen.set(key, {
        name: tpl.city,
        state: stateInfo?.name ?? tpl.state_code,
        stateCode: tpl.state_code,
        district: tpl.district,
        lat: tpl.latitude,
        lng: tpl.longitude,
      });
    }
  }
  const priority = [
    'Delhi',
    'Mumbai',
    'Bengaluru',
    'Kolkata',
    'Chennai',
    'Hyderabad',
    'Pune',
    'Ahmedabad',
    'Gurugram',
    'Noida',
    'Jaipur',
    'Lucknow',
    'Patna',
    'Chandigarh',
    'Kochi',
    'Guwahati',
    'Bhopal',
    'Indore',
    'Bhubaneswar',
    'Srinagar',
    'Shimla',
    'Dehradun',
    'Panaji',
    'Port Blair',
  ];
  const entries = Array.from(seen.values());
  entries.sort((a, b) => {
    const ia = priority.indexOf(a.name);
    const ib = priority.indexOf(b.name);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
})();

const CITY_CANONICAL_ALIASES: Record<string, string> = {
  gurgaon: 'Gurugram',
  bangalore: 'Bengaluru',
  calcutta: 'Kolkata',
  'new delhi': 'Delhi',
  trivandrum: 'Thiruvananthapuram',
  cochin: 'Kochi',
  vizag: 'Visakhapatnam',
  mysore: 'Mysuru',
  pondicherry: 'Puducherry',
  hubli: 'Hubballi',
  banaras: 'Varanasi',
  allahabad: 'Prayagraj',
};

export function resolveSimulatedCityName(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return 'Delhi';
  const lower = trimmed.toLowerCase();
  const aliased = CITY_CANONICAL_ALIASES[lower];
  const target = (aliased ?? trimmed).toLowerCase();
  const match = INDIA_SIMULATED_CITIES.find(
    (c) => c.name.toLowerCase() === target
  );
  return match?.name ?? null;
}

export function buildSimulatedCityAqiResponse(
  cityQuery: string,
  classifyCategoryMeta: (aqi: number | null) => CpcbCategoryMeta,
  options?: {
    station?: string;
    nowMs?: number;
    intervalMs?: number;
  }
): CityAqiResponse | null {
  const resolvedCity = resolveSimulatedCityName(cityQuery);
  if (!resolvedCity) return null;

  const nowMs = options?.nowMs ?? Date.now();
  const intervalMs = options?.intervalMs ?? DEFAULT_SIMULATION_INTERVAL_MS;
  const snapshot = getIndiaSimulatedSnapshot(nowMs, intervalMs);

  const citySimStations = snapshot.stations.filter(
    (s) => s.city.toLowerCase() === resolvedCity.toLowerCase()
  );
  if (citySimStations.length === 0) return null;

  const stationReadings = citySimStations.map(toStationReading);
  const stationQuery = (options?.station ?? '').trim();
  const wantsSpecific =
    stationQuery.length > 0 && stationQuery.toLowerCase() !== 'all';

  let selectedStation: StationReading | null = null;
  if (wantsSpecific) {
    const qLower = stationQuery.toLowerCase();
    selectedStation =
      stationReadings.find((s) => s.id.toLowerCase() === qLower) ??
      stationReadings.find((s) => s.station.toLowerCase() === qLower) ??
      stationReadings.find((s) => s.station.toLowerCase().includes(qLower)) ??
      null;
  }

  const primaryAqi = selectedStation
    ? selectedStation.officialAqi
    : Math.round(
        citySimStations.reduce((sum, s) => sum + s.aqi, 0) /
          citySimStations.length
      );
  const categoryMeta = classifyCategoryMeta(primaryAqi);
  const focusSim =
    (selectedStation
      ? citySimStations.find((s) => s.id === selectedStation!.id)
      : undefined) ?? citySimStations[0];

  const trend24h = buildSimulated24hTrend(
    primaryAqi ?? focusSim.aqi,
    focusSim.pm25,
    focusSim.pm10,
    Date.parse(snapshot.generatedAt),
    `${focusSim.id}:${snapshot.bucketIndex}`
  );

  return {
    city: focusSim.city,
    district: focusSim.district,
    state: focusSim.state,
    stateCode: focusSim.state_code,
    lat: focusSim.latitude,
    lng: focusSim.longitude,
    primaryAqi,
    category: categoryMeta.category,
    categoryMeta,
    predominantPollutant:
      selectedStation?.predominantPollutant ??
      determinePredominantPollutant(focusSim),
    selectedStationId: selectedStation?.id ?? null,
    selectedStationName: selectedStation?.station ?? null,
    stations: stationReadings,
    openAqSensors: [],
    trend24h,
    lastUpdatedIso: snapshot.generatedAt,
    dataMode: 'demo',
    dataSource: SIMULATION_DATA_SOURCE,
    dataType: SIMULATION_DATA_TYPE,
    sourceDisclaimer: `${SIMULATION_BADGE_TEXT} — ${SIMULATION_DISCLAIMER_TEXT}`,
    hasOfficialData: false,
    hasOpenAqData: false,
    staleStationsCount: 0,
    sourceHealth: {
      simulation: {
        sourceId: 'simulation',
        name: SIMULATION_DATA_SOURCE,
        configured: true,
        status: 'simulated',
        message: `Active deterministic India-wide simulation across ${snapshot.summary.totalStations} stations (${snapshot.summary.statesCovered} states & ${snapshot.summary.unionTerritoriesCovered} UTs).`,
        lastCheckedIso: snapshot.generatedAt,
        recordsCount: snapshot.summary.totalStations,
        intervalMs: snapshot.intervalMs,
      },
    },
  };
}
