import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import {
  AlertTriangle,
  Compass,
  Crosshair,
  Database,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { formatFreshnessLabel, INDIAN_CITIES } from '../lib/aqi.ts';
import {
  SIMULATION_BADGE_TEXT,
  SIMULATION_DATA_SOURCE,
  SIMULATION_DATA_TYPE,
} from '../lib/indiaSimulation.ts';
import {
  computeStationsBounds,
  getWorstCategory,
  INDIA_DEFAULT_CENTER,
  INDIA_DEFAULT_ZOOM,
  INDIA_MAX_BOUNDS,
  MAP_CPCB_MARKER_SPECS,
} from '../lib/mapUtils.ts';
import type {
  AqiCategory,
  PollutantReading,
  StationReading,
} from '../lib/types.ts';

export type MapBasemapMode = 'dark' | 'satellite';

export interface IndiaStationMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  focusCity: (cityName: string, cityStations: StationReading[]) => void;
  fitStations: (stations: StationReading[]) => void;
  focusStation: (station: StationReading) => void;
}

interface IndiaStationMapProps {
  stations: StationReading[];
  selectedStation: StationReading | null;
  onSelectStation: (station: StationReading | null) => void;
  onSetActiveCity: (city: string) => void;
  activeCity: string;
  basemap: MapBasemapMode;
  onBasemapChange: (mode: MapBasemapMode) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  hasAnyStations: boolean;
  onResetFilters?: () => void;
}

const ORDERED_LEGEND_CATEGORIES: AqiCategory[] = [
  'Good',
  'Satisfactory',
  'Moderate',
  'Poor',
  'Very Poor',
  'Severe',
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createStationDivIcon(
  station: StationReading,
  isSelected: boolean
): L.DivIcon {
  const spec =
    MAP_CPCB_MARKER_SPECS[station.category] ??
    MAP_CPCB_MARKER_SPECS.Unavailable;
  const size = isSelected ? 34 : 28;
  const aqiText =
    station.officialAqi !== null
      ? String(Math.round(station.officialAqi))
      : '—';
  const ringStyle = isSelected
    ? `0 0 0 3px rgba(34, 211, 238, 0.85), 0 6px 16px rgba(2, 6, 23, 0.85)`
    : `0 0 0 1.5px ${spec.ringHex}55, 0 4px 12px rgba(2, 6, 23, 0.78)`;
  const pulseHtml = isSelected
    ? `<span class="aeris-marker-pulse" style="border: 2px solid #22D3EE; background: ${spec.fillHex}22;"></span>`
    : '';

  return L.divIcon({
    className: 'aeris-marker-wrapper',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div class="aeris-marker-root" aria-label="${escapeHtml(station.station)}">
        ${pulseHtml}
        <span style="
          width:${size}px;
          height:${size}px;
          border-radius:9999px;
          background:${spec.fillHex};
          color:${spec.textHex};
          border:2px solid #050914;
          box-shadow:${ringStyle};
          display:flex;
          align-items:center;
          justify-content:center;
          font-family:var(--font-mono);
          font-variant-numeric:tabular-nums;
          font-size:${isSelected ? 11 : 10}px;
          font-weight:700;
          line-height:1;
        ">${escapeHtml(aqiText)}</span>
      </div>
    `,
  });
}

function buildTooltipHtml(station: StationReading): string {
  const locationParts = [station.city, station.state].filter(Boolean).join(', ');
  const badgeText = `Simulated AQI ${station.officialAqi ?? 'N/A'} · ${station.category}`;

  return `
    <div style="min-width:170px;">
      <div style="font-weight:600;color:#f8fafc;margin-bottom:2px;">${escapeHtml(station.station)}</div>
      <div style="font-size:11px;color:#94a3b8;">${escapeHtml(locationParts)}${
        station.stateCode ? ` (${escapeHtml(station.stateCode)})` : ''
      }</div>
      <div style="margin-top:4px;font-family:var(--font-mono);font-size:11px;color:#e2e8f0;">${escapeHtml(badgeText)}</div>
    </div>
  `;
}

interface StationClusterLayerProps {
  stations: StationReading[];
  selectedStationId: string | null;
  onSelectStation: (station: StationReading) => void;
}

const StationClusterLayer = memo(function StationClusterLayer({
  stations,
  selectedStationId,
  onSelectStation,
}: StationClusterLayerProps) {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelectStation);
  onSelectRef.current = onSelectStation;

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 42,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 11,
      animate: true,
      iconCreateFunction: (cluster) => {
        const children = cluster.getAllChildMarkers();
        const categories: AqiCategory[] = [];

        for (const child of children) {
          const opts = child.options as L.MarkerOptions & {
            aerisCategory?: AqiCategory;
          };
          if (opts.aerisCategory) {
            categories.push(opts.aerisCategory);
          }
        }

        const worst = getWorstCategory(categories);
        const spec = MAP_CPCB_MARKER_SPECS[worst];
        const count = cluster.getChildCount();
        const diameter = count >= 25 ? 42 : count >= 10 ? 38 : 34;

        return L.divIcon({
          className: 'aeris-cluster-icon',
          iconSize: [diameter, diameter],
          iconAnchor: [diameter / 2, diameter / 2],
          html: `
            <div class="aeris-cluster-badge" style="
              width:${diameter}px;
              height:${diameter}px;
              border:2.5px solid ${spec.fillHex};
              box-shadow:0 0 0 3px ${spec.fillHex}28, 0 6px 18px rgba(2,6,23,0.78);
            ">${count}</div>
          `,
        });
      },
    });

    const markerMap = new Map<string, L.Marker>();
    const markersToAdd: L.Marker[] = [];

    for (const station of stations) {
      const isSelected = station.id === selectedStationId;
      const marker = L.marker([station.lat, station.lng], {
        icon: createStationDivIcon(station, isSelected),
        keyboard: true,
        title: `${station.station}, ${station.city}, ${station.state}`,
        zIndexOffset: isSelected ? 800 : 0,
      } as L.MarkerOptions);

      const extOpts = marker.options as L.MarkerOptions & {
        aerisCategory?: AqiCategory;
      };
      extOpts.aerisCategory = station.category;

      marker.bindTooltip(buildTooltipHtml(station), {
        direction: 'top',
        offset: [0, -14],
        opacity: 0.98,
        className: 'aeris-leaflet-tooltip',
      });

      marker.on('click', () => {
        onSelectRef.current(station);
      });

      markerMap.set(station.id, marker);
      markersToAdd.push(marker);
    }

    clusterGroup.addLayers(markersToAdd);
    map.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;
    markersByIdRef.current = markerMap;

    return () => {
      map.removeLayer(clusterGroup);
      clusterGroup.clearLayers();
      clusterGroupRef.current = null;
      markersByIdRef.current.clear();
    };
  }, [map, stations]);

  useEffect(() => {
    const markerMap = markersByIdRef.current;
    for (const station of stations) {
      const marker = markerMap.get(station.id);
      if (!marker) continue;
      const isSelected = station.id === selectedStationId;
      marker.setIcon(createStationDivIcon(station, isSelected));
      marker.setZIndexOffset(isSelected ? 800 : 0);
    }
  }, [selectedStationId, stations]);

  return null;
});

interface MapBridgeProps {
  mapRef: React.MutableRefObject<L.Map | null>;
  isFullscreen: boolean;
}

function MapInstanceBridge({ mapRef, isFullscreen }: MapBridgeProps) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [map, isFullscreen]);

  return null;
}

function findPollutant(
  pollutants: PollutantReading[],
  id: PollutantReading['id']
): PollutantReading | undefined {
  return pollutants.find((p) => p.id === id);
}

function formatReadableTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'Unavailable';
  return new Date(parsed).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export const IndiaStationMap = forwardRef<
  IndiaStationMapHandle,
  IndiaStationMapProps
>(function IndiaStationMap(
  {
    stations,
    selectedStation,
    onSelectStation,
    onSetActiveCity,
    activeCity,
    basemap,
    onBasemapChange,
    isFullscreen,
    onToggleFullscreen,
    hasAnyStations,
    onResetFilters,
  },
  ref
) {
  const mapRef = useRef<L.Map | null>(null);
  const [legendOpen, setLegendOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        mapRef.current?.zoomIn();
      },
      zoomOut: () => {
        mapRef.current?.zoomOut();
      },
      resetView: () => {
        mapRef.current?.flyTo(INDIA_DEFAULT_CENTER, INDIA_DEFAULT_ZOOM, {
          duration: 0.75,
        });
      },
      focusCity: (cityName: string, cityStations: StationReading[]) => {
        const map = mapRef.current;
        if (!map) return;
        const bounds = computeStationsBounds(cityStations);
        if (bounds && cityStations.length > 1) {
          map.flyToBounds(bounds, {
            padding: [56, 56],
            maxZoom: 12,
            duration: 0.85,
          });
          return;
        }
        if (cityStations.length === 1) {
          map.flyTo([cityStations[0].lat, cityStations[0].lng], 11, {
            duration: 0.85,
          });
          return;
        }
        const catalogCity = INDIAN_CITIES.find(
          (c) => c.name.toLowerCase() === cityName.toLowerCase()
        );
        if (catalogCity) {
          map.flyTo([catalogCity.lat, catalogCity.lng], 10, {
            duration: 0.85,
          });
        } else {
          map.flyTo(INDIA_DEFAULT_CENTER, INDIA_DEFAULT_ZOOM, {
            duration: 0.75,
          });
        }
      },
      fitStations: (list: StationReading[]) => {
        const map = mapRef.current;
        if (!map) return;
        const bounds = computeStationsBounds(list);
        if (bounds && list.length > 1) {
          map.flyToBounds(bounds, {
            padding: [48, 48],
            maxZoom: 10,
            duration: 0.85,
          });
        } else if (list.length === 1) {
          map.flyTo([list[0].lat, list[0].lng], 11, { duration: 0.8 });
        } else {
          map.flyTo(INDIA_DEFAULT_CENTER, INDIA_DEFAULT_ZOOM, {
            duration: 0.75,
          });
        }
      },
      focusStation: (station: StationReading) => {
        const map = mapRef.current;
        if (!map) return;
        const nextZoom = Math.max(map.getZoom(), 11);
        map.flyTo([station.lat, station.lng], nextZoom, {
          duration: 0.75,
        });
      },
    }),
    []
  );

  const selectedSpec = useMemo(() => {
    if (!selectedStation) return null;
    return (
      MAP_CPCB_MARKER_SPECS[selectedStation.category] ??
      MAP_CPCB_MARKER_SPECS.Unavailable
    );
  }, [selectedStation]);

  const pm25 = selectedStation
    ? findPollutant(selectedStation.pollutants, 'PM2.5')
    : undefined;
  const pm10 = selectedStation
    ? findPollutant(selectedStation.pollutants, 'PM10')
    : undefined;
  const secondaryPollutants = useMemo(() => {
    if (!selectedStation) return [];
    const order: { id: PollutantReading['id']; label: string }[] = [
      { id: 'NO2', label: 'NO2' },
      { id: 'SO2', label: 'SO2' },
      { id: 'CO', label: 'CO' },
      { id: 'OZONE', label: 'O3' },
    ];
    return order.map((item) => {
      const found = findPollutant(selectedStation.pollutants, item.id);
      return {
        id: item.id,
        label: item.label,
        value: found?.value ?? null,
        unit: found?.unit ?? (item.id === 'CO' ? 'mg/m³' : 'µg/m³'),
      };
    });
  }, [selectedStation]);

  return (
    <div
      className={`overflow-hidden bg-[#050914] border border-slate-700/70 ${
        isFullscreen
          ? 'fixed inset-0 z-[1000] w-screen h-screen rounded-none'
          : 'relative w-full rounded-xl h-[500px] sm:h-[580px] lg:h-[640px]'
      }`}
    >
      <MapContainer
        center={INDIA_DEFAULT_CENTER}
        zoom={INDIA_DEFAULT_ZOOM}
        minZoom={4}
        maxZoom={18}
        maxBounds={INDIA_MAX_BOUNDS}
        maxBoundsViscosity={0.85}
        zoomControl={false}
        preferCanvas={true}
        scrollWheelZoom={true}
        className="w-full h-full aeris-leaflet-container z-0"
      >
        <MapInstanceBridge mapRef={mapRef} isFullscreen={isFullscreen} />

        {basemap === 'dark' ? (
          <>
            <TileLayer
              key="esri-dark-base"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={16}
              maxZoom={18}
              attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
            />
            <TileLayer
              key="esri-dark-ref"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={16}
              maxZoom={18}
              attribution="&copy; Esri Reference"
            />
          </>
        ) : (
          <>
            <TileLayer
              key="esri-satellite"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={17}
              maxZoom={18}
              attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            />
            <TileLayer
              key="esri-boundaries"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={16}
              maxZoom={18}
              opacity={0.9}
              attribution="&copy; Esri Boundaries &amp; Places"
            />
          </>
        )}

        <StationClusterLayer
          stations={stations}
          selectedStationId={selectedStation?.id ?? null}
          onSelectStation={onSelectStation}
        />
      </MapContainer>

      {/* Top-Left Map Overlay Bar */}
      <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center p-1 rounded-lg bg-[#070D1D]/90 backdrop-blur-md border border-slate-700/70 shadow-lg">
          <button
            type="button"
            onClick={() => onBasemapChange('dark')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap min-h-[32px] ${
              basemap === 'dark'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-300 hover:text-slate-100 border border-transparent'
            }`}
          >
            Dark Map
          </button>
          <button
            type="button"
            onClick={() => onBasemapChange('satellite')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap min-h-[32px] ${
              basemap === 'satellite'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                : 'text-slate-300 hover:text-slate-100 border border-transparent'
            }`}
          >
            Satellite
          </button>
        </div>

        <div className="pointer-events-auto px-3 py-1.5 rounded-lg bg-[#070D1D]/88 backdrop-blur-md border border-slate-700/70 text-xs text-slate-200 font-mono tabular-nums shadow-lg">
          {stations.length} simulated {stations.length === 1 ? 'station' : 'stations'}
        </div>
      </div>

      {/* Top-Right Map Navigation & Fullscreen Controls */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
        <div className="flex flex-col rounded-lg overflow-hidden bg-[#070D1D]/90 backdrop-blur-md border border-slate-700/70 shadow-lg divide-y divide-slate-800/90">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in"
            title="Zoom in"
            className="w-10 h-10 flex items-center justify-center text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out"
            title="Zoom out"
            className="w-10 h-10 flex items-center justify-center text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              mapRef.current?.flyTo(INDIA_DEFAULT_CENTER, INDIA_DEFAULT_ZOOM, {
                duration: 0.75,
              })
            }
            aria-label="Reset map view to India"
            title="Reset India map view"
            className="w-10 h-10 flex items-center justify-center text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? 'Exit full-screen map' : 'Full-screen map mode'}
            title={isFullscreen ? 'Exit full-screen (Esc)' : 'Full-screen map'}
            className="w-10 h-10 flex items-center justify-center text-slate-200 hover:bg-slate-800/80 hover:text-cyan-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-cyan-300" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Empty Filter Overlay */}
      {stations.length === 0 && (
        <div className="absolute inset-0 z-[390] flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto max-w-md w-full rounded-xl bg-[#070D1D]/92 backdrop-blur-md border border-slate-700/80 p-5 text-center space-y-3 shadow-2xl">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/35 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5 text-amber-300" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">
              {hasAnyStations
                ? 'No simulated stations match this filter'
                : 'Simulated station dataset unavailable'}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {hasAnyStations
                ? 'Clear your search query, state filter, or AQI category filter to display all stations across India.'
                : 'Unable to load stations from /api/india/aqi right now.'}
            </p>
            {hasAnyStations && onResetFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition-colors"
              >
                Show All India Stations
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom-Left Compact CPCB AQI Scale Legend */}
      <div className="absolute bottom-7 left-3 z-[400]">
        {legendOpen ? (
          <div className="w-[304px] max-w-[calc(100vw-2rem)] rounded-lg bg-[#070D1D]/92 backdrop-blur-md border border-slate-700/75 p-3 shadow-xl space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] font-semibold text-slate-200">
                CPCB AQI Scale (Demo)
              </span>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                aria-label="Hide map legend"
                className="text-slate-400 hover:text-slate-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-[11px]">
              {ORDERED_LEGEND_CATEGORIES.map((cat) => {
                const spec = MAP_CPCB_MARKER_SPECS[cat];
                return (
                  <div
                    key={cat}
                    className="flex items-center gap-1.5 text-slate-300 whitespace-nowrap"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-950/80"
                      style={{ backgroundColor: spec.fillHex }}
                      aria-hidden="true"
                    />
                    <span>{cat}</span>
                    <span className="font-mono text-[10px] text-slate-400 tabular-nums ml-auto">
                      {spec.rangeLabel}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="pt-1.5 border-t border-slate-800/90 flex items-center gap-1.5 text-[10px] text-amber-300/90 whitespace-nowrap">
              <Database className="w-3 h-3 shrink-0" />
              <span>{SIMULATION_BADGE_TEXT}</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            aria-label="Show CPCB AQI legend"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#070D1D]/90 backdrop-blur-md border border-slate-700/70 text-xs font-medium text-slate-200 hover:border-cyan-500/45 shadow-lg min-h-[36px]"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>AQI Legend</span>
          </button>
        )}
      </div>

      {/* Floating Glass Station Details Card */}
      {selectedStation && selectedSpec && (
        <aside
          aria-label="Selected monitoring station telemetry"
          data-testid="map-station-detail-card"
          className="absolute z-[410] bottom-3 left-3 right-3 md:left-auto md:top-16 md:bottom-auto md:right-16 md:w-[360px] max-h-[68%] md:max-h-[calc(100%-5.5rem)] overflow-y-auto rounded-xl bg-[#070D1D]/94 backdrop-blur-xl border border-slate-700/80 shadow-[0_24px_54px_-18px_rgba(2,6,23,0.95)] p-4 space-y-3.5"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-amber-300">
                {SIMULATION_BADGE_TEXT}
              </p>
              <h3 className="text-sm sm:text-base font-semibold text-slate-50 leading-snug mt-0.5">
                {selectedStation.station}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                {selectedStation.city}
                {selectedStation.district &&
                selectedStation.district !== selectedStation.city
                  ? ` · ${selectedStation.district}`
                  : ''}
                {selectedStation.state ? `, ${selectedStation.state}` : ''}
                {selectedStation.stateCode ? ` (${selectedStation.stateCode})` : ''}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                {selectedStation.lat.toFixed(4)}°N, {selectedStation.lng.toFixed(4)}°E
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectStation(null)}
              aria-label="Close station panel"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Simulated AQI Headline & Timestamp */}
          <div className="flex items-center justify-between gap-3 py-2.5 border-y border-slate-800/90">
            <div>
              <p className="text-[11px] text-slate-400">
                Simulated AQI (CPCB Scale)
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-50">
                  {selectedStation.officialAqi ?? 'N/A'}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: selectedSpec.fillHex }}
                    aria-hidden="true"
                  />
                  {selectedStation.category} ({selectedSpec.rangeLabel})
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-amber-300">
                {selectedStation.dataType ?? SIMULATION_DATA_TYPE}
              </span>
              <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                {formatFreshnessLabel(selectedStation.lastUpdatedIso)}
              </p>
            </div>
          </div>

          {/* Featured PM2.5 & PM10 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg bg-[#050A17]/90 border border-slate-800/90 p-2.5">
              <p className="text-[11px] text-slate-400">PM2.5</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-50 mt-0.5">
                {pm25?.value !== null && pm25?.value !== undefined
                  ? pm25.value
                  : 'N/A'}
                <span className="text-[11px] font-normal text-slate-400 ml-1">
                  {pm25?.unit ?? 'µg/m³'}
                </span>
              </p>
            </div>
            <div className="rounded-lg bg-[#050A17]/90 border border-slate-800/90 p-2.5">
              <p className="text-[11px] text-slate-400">PM10</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-50 mt-0.5">
                {pm10?.value !== null && pm10?.value !== undefined
                  ? pm10.value
                  : 'N/A'}
                <span className="text-[11px] font-normal text-slate-400 ml-1">
                  {pm10?.unit ?? 'µg/m³'}
                </span>
              </p>
            </div>
          </div>

          {/* Trace Gases: NO2, SO2, CO, O3 */}
          <div className="grid grid-cols-4 gap-2">
            {secondaryPollutants.map((pol) => (
              <div
                key={pol.id}
                className="rounded-lg bg-[#050A17]/75 border border-slate-800/80 px-2 py-2"
              >
                <p className="text-[10px] text-slate-400">{pol.label}</p>
                <p className="text-xs font-semibold font-mono tabular-nums text-slate-100 mt-0.5 truncate">
                  {pol.value !== null ? pol.value : 'N/A'}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {pol.value !== null ? pol.unit : '—'}
                </p>
              </div>
            ))}
          </div>

          {/* Provenance Metadata */}
          <div className="space-y-1 text-[11px] text-slate-400 pt-0.5">
            <p>
              <span className="text-slate-500">Data Source:</span>{' '}
              <span className="text-slate-200">{SIMULATION_DATA_SOURCE}</span>
            </p>
            <p className="font-mono tabular-nums">
              <span className="font-sans text-slate-500">Timestamp:</span>{' '}
              {formatReadableTimestamp(selectedStation.lastUpdatedIso)} ·{' '}
              <span className="text-amber-300">{SIMULATION_DATA_TYPE}</span>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                const map = mapRef.current;
                if (map) {
                  map.flyTo(
                    [selectedStation.lat, selectedStation.lng],
                    Math.max(map.getZoom(), 11),
                    { duration: 0.7 }
                  );
                }
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#081022] text-xs font-medium text-slate-200 hover:border-cyan-500/45 hover:text-cyan-200 transition-colors min-h-[38px] whitespace-nowrap"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Zoom to Station</span>
            </button>

            {selectedStation.city && (
              <button
                type="button"
                onClick={() => onSetActiveCity(selectedStation.city)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors min-h-[38px] whitespace-nowrap"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>
                  {selectedStation.city.toLowerCase() === activeCity.toLowerCase()
                    ? 'Open City Dashboard'
                    : `Track ${selectedStation.city}`}
                </span>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Active city indicator when fullscreen */}
      {isFullscreen && (
        <div className="hidden sm:flex items-center gap-2 absolute bottom-7 right-3 z-[400] px-3 py-1.5 rounded-lg bg-[#070D1D]/88 backdrop-blur-md border border-slate-700/70 text-xs text-slate-300">
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span>Active city: {activeCity}</span>
        </div>
      )}
    </div>
  );
});

export default IndiaStationMap;
