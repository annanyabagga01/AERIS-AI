import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Compass,
  MapPin,
  Pause,
  Play,
  Radio,
  RotateCcw,
} from 'lucide-react';
import * as THREE from 'three';
import { formatFreshnessLabel, INDIAN_CITIES } from '../lib/aqi.ts';
import {
  extractStationPm25,
  layoutOrbitalStationMarkers,
  resolvePollutionVisualProfile,
  type OrbitalStationMarker,
  type PollutionVisualProfile,
} from '../lib/earthPollution.ts';
import type { AqiCategory, StationReading } from '../lib/types.ts';

export interface EarthSceneProps {
  city: string;
  state?: string;
  lat: number;
  lng: number;
  aqi: number | null;
  category: AqiCategory;
  pm25?: number | null;
  pm25Unit?: string;
  lastUpdatedIso?: string | null;
  hasOfficialData?: boolean;
  dataMode?: 'demo' | 'simulated';
  stations?: StationReading[];
  selectedStationId?: string | null;
  onSelectStation?: (stationId: string) => void;
  onSelectCity?: (city: string) => void;
}

const EARTH_RADIUS = 1.0;
const POLLUTION_HALO_RADIUS = 1.0075;
const CLOUD_RADIUS = 1.012;
const INNER_ATMO_RADIUS = 1.017;
const OUTER_ATMO_RADIUS = 1.064;

const TEXTURE_PATHS = {
  day: '/textures/earth/earth_atmos_2048.jpg',
  normal: '/textures/earth/earth_normal_2048.jpg',
  specular: '/textures/earth/earth_specular_2048.jpg',
  clouds: '/textures/earth/earth_clouds_1024.png',
  night: '/textures/earth/earth_lights_2048.png',
} as const;

/**
 * Converts geographic latitude/longitude (degrees) to a 3D point matching
 * Three.js SphereGeometry equirectangular UV projection (north-up, -180..+180).
 */
function latLngToVector3(
  lat: number,
  lng: number,
  radius: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
  return out;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createSolidFallbackTexture(
  r: number,
  g: number,
  b: number,
  colorSpace: THREE.ColorSpace,
): THREE.DataTexture {
  const data = new Uint8Array([r, g, b, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

function shortenStationName(name: string): string {
  const trimmed = name.split(',')[0].split('–')[0].split('-')[0].trim();
  return trimmed.length > 16 ? `${trimmed.slice(0, 15)}…` : trimmed;
}

function formatClockTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface PlumeAnchor {
  lat: number;
  lng: number;
  weight: number;
  spreadDeg: number;
}

/**
 * Generates particle buffers anchored ONLY around actual monitored urban areas
 * with valid AQI telemetry. Never places decorative plumes over unmonitored cities.
 */
function buildDataDrivenPlumeBuffers(
  anchors: PlumeAnchor[],
  totalCount: number,
  seed: number,
): {
  positions: Float32Array;
  tangentU: Float32Array;
  tangentV: Float32Array;
  phases: Float32Array;
  sizes: Float32Array;
  weights: Float32Array;
  ranks: Float32Array;
} {
  const positions = new Float32Array(totalCount * 3);
  const tangentU = new Float32Array(totalCount * 3);
  const tangentV = new Float32Array(totalCount * 3);
  const phases = new Float32Array(totalCount);
  const sizes = new Float32Array(totalCount);
  const weights = new Float32Array(totalCount);
  const ranks = new Float32Array(totalCount);

  if (anchors.length === 0) {
    return { positions, tangentU, tangentV, phases, sizes, weights, ranks };
  }

  const rand = createSeededRandom(seed);
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tU = new THREE.Vector3();
  const tV = new THREE.Vector3();

  const totalWeight = anchors.reduce((sum, a) => sum + Math.max(a.weight, 0.1), 0);

  for (let i = 0; i < totalCount; i++) {
    // Weighted deterministic selection across active stations
    let pick = rand() * totalWeight;
    let chosen = anchors[0];
    for (const anchor of anchors) {
      pick -= Math.max(anchor.weight, 0.1);
      if (pick <= 0) {
        chosen = anchor;
        break;
      }
    }

    const u1 = Math.max(0.0001, rand());
    const u2 = rand();
    const mag = Math.sqrt(-2.0 * Math.log(u1)) * 0.42;
    const angle = u2 * Math.PI * 2;
    const dLat = Math.cos(angle) * mag * chosen.spreadDeg;
    const dLng = Math.sin(angle) * mag * chosen.spreadDeg * 1.15;

    const pLat = THREE.MathUtils.clamp(chosen.lat + dLat, -82, 82);
    const pLng = chosen.lng + dLng;
    const alt = EARTH_RADIUS + 0.015 + rand() * 0.022;

    latLngToVector3(pLat, pLng, alt, p);
    n.copy(p).normalize();

    tU.crossVectors(up, n);
    if (tU.lengthSq() < 0.0001) {
      tU.set(1, 0, 0);
    } else {
      tU.normalize();
    }
    tV.crossVectors(n, tU).normalize();

    const i3 = i * 3;
    positions[i3] = p.x;
    positions[i3 + 1] = p.y;
    positions[i3 + 2] = p.z;

    tangentU[i3] = tU.x;
    tangentU[i3 + 1] = tU.y;
    tangentU[i3 + 2] = tU.z;

    tangentV[i3] = tV.x;
    tangentV[i3 + 1] = tV.y;
    tangentV[i3 + 2] = tV.z;

    phases[i] = rand() * Math.PI * 2;
    sizes[i] = 2.8 + rand() * 4.4;
    const distAtten = Math.exp(-(mag * mag) * 0.72);
    weights[i] = chosen.weight * (0.45 + 0.55 * distAtten);
    ranks[i] = i / Math.max(totalCount - 1, 1);
  }

  return { positions, tangentU, tangentV, phases, sizes, weights, ranks };
}

interface InternalGlobeState {
  city: string;
  lat: number;
  lng: number;
  profile: PollutionVisualProfile;
  stationMarkers: OrbitalStationMarker[];
  inspectedStationId: string | null;
}

export function EarthScene({
  city,
  lat,
  lng,
  aqi,
  category,
  pm25 = null,
  pm25Unit = 'µg/m³',
  lastUpdatedIso = null,
  hasOfficialData = false,
  stations = [],
  selectedStationId = null,
  onSelectStation,
  onSelectCity,
}: EarthSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [localInspectedStationId, setLocalInspectedStationId] = useState<
    string | null
  >(selectedStationId);

  // Sync external monitoring station selector (e.g. dashboard dropdown) into globe inspection
  useEffect(() => {
    setLocalInspectedStationId(selectedStationId);
  }, [selectedStationId, city]);

  const stationMarkers = useMemo(
    () => layoutOrbitalStationMarkers(stations, lat, lng),
    [stations, lat, lng],
  );

  const inspectedMarker = useMemo(
    () =>
      localInspectedStationId
        ? stationMarkers.find((m) => m.station.id === localInspectedStationId) ??
          null
        : null,
    [localInspectedStationId, stationMarkers],
  );

  const cityProfile = useMemo(
    () => resolvePollutionVisualProfile(aqi, category),
    [aqi, category],
  );

  // Active telemetry displayed in the floating intelligence panel & reflected on the globe
  const activeDisplay = useMemo(() => {
    if (inspectedMarker) {
      const st = inspectedMarker.station;
      return {
        isStationView: true,
        stationId: st.id,
        stationName: st.station,
        lat: st.lat,
        lng: st.lng,
        displayLat: inspectedMarker.displayLat,
        displayLng: inspectedMarker.displayLng,
        aqi: st.officialAqi,
        category: st.category,
        pm25: inspectedMarker.pm25Value,
        pm25Unit: inspectedMarker.pm25Unit,
        predominantPollutant: st.predominantPollutant,
        lastUpdatedIso: st.lastUpdatedIso,
        isStale: st.isStale,
        isOfficial: st.isOfficialNationalAqi && !st.isDemo,
        profile: inspectedMarker.profile,
      };
    }

    const fallbackPm25 =
      pm25 !== null ? { value: pm25, unit: pm25Unit } : extractStationPm25(stations[0]);

    return {
      isStationView: false,
      stationId: null,
      stationName: null,
      lat,
      lng,
      displayLat: lat,
      displayLng: lng,
      aqi,
      category,
      pm25: fallbackPm25.value,
      pm25Unit: fallbackPm25.unit,
      predominantPollutant: stations[0]?.predominantPollutant ?? null,
      lastUpdatedIso: lastUpdatedIso ?? stations[0]?.lastUpdatedIso ?? null,
      isStale: false,
      isOfficial: hasOfficialData,
      profile: cityProfile,
    };
  }, [
    inspectedMarker,
    pm25,
    pm25Unit,
    stations,
    lat,
    lng,
    aqi,
    category,
    lastUpdatedIso,
    hasOfficialData,
    cityProfile,
  ]);

  const pausedRef = useRef(paused);
  const onSelectStationRef = useRef(onSelectStation);
  const onSelectCityRef = useRef(onSelectCity);
  const globeStateRef = useRef<InternalGlobeState>({
    city,
    lat: activeDisplay.displayLat,
    lng: activeDisplay.displayLng,
    profile: activeDisplay.profile,
    stationMarkers,
    inspectedStationId: localInspectedStationId,
  });

  const resetTriggerRef = useRef<((withZoomArc?: boolean) => void) | null>(null);
  const syncTelemetryRef = useRef<((relocatePlume?: boolean) => void) | null>(
    null,
  );
  const prevCityKeyRef = useRef(`${city}:${lat.toFixed(3)}:${lng.toFixed(3)}`);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onSelectStationRef.current = onSelectStation;
    onSelectCityRef.current = onSelectCity;
  }, [onSelectStation, onSelectCity]);

  useEffect(() => {
    const nextCityKey = `${city}:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    const cityChanged = prevCityKeyRef.current !== nextCityKey;
    prevCityKeyRef.current = nextCityKey;

    globeStateRef.current = {
      city,
      lat: activeDisplay.displayLat,
      lng: activeDisplay.displayLng,
      profile: activeDisplay.profile,
      stationMarkers,
      inspectedStationId: localInspectedStationId,
    };

    syncTelemetryRef.current?.(cityChanged);
    if (cityChanged) {
      resetTriggerRef.current?.(true);
    }
  }, [
    city,
    lat,
    lng,
    activeDisplay.displayLat,
    activeDisplay.displayLng,
    activeDisplay.profile,
    stationMarkers,
    localInspectedStationId,
  ]);

  const handleSelectStationChip = (stationId: string | null) => {
    setLocalInspectedStationId(stationId);
    onSelectStation?.(stationId ?? 'all');
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const gl = renderer.getContext();
    const rendererInfo =
      typeof gl?.getParameter === 'function'
        ? String(gl.getParameter(gl.RENDERER) ?? '')
        : '';
    const isSoftwareGl = /swiftshader|llvmpipe|software|angle.+swiftshader/i.test(
      rendererInfo,
    );
    const isMobileLike =
      typeof window !== 'undefined' &&
      (window.innerWidth < 768 ||
        window.matchMedia?.('(pointer: coarse)').matches);

    // Mid-range mobile GPU friendly pixel ratio cap
    const maxDpr = isSoftwareGl ? 1 : isMobileLike ? 1.5 : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setClearColor(0x02040a, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    container.innerHTML = '';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);

    const initWidth = Math.max(container.clientWidth || 420, 1);
    const initHeight = Math.max(container.clientHeight || 340, 1);
    renderer.setSize(initWidth, initHeight, false);

    const computeCameraZ = (w: number, h: number) => {
      const aspect = w / Math.max(h, 1);
      return aspect < 1.05 ? 4.05 / Math.max(aspect, 0.76) : 3.92;
    };

    let baseCameraZ = computeCameraZ(initWidth, initHeight);
    const camera = new THREE.PerspectiveCamera(
      36,
      initWidth / initHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0.06, baseCameraZ);
    camera.lookAt(0, 0.08, 0);

    // Physically based solar directional lighting (preserved from photorealistic Earth)
    const sunDirection = new THREE.Vector3(4.65, 1.55, 2.6).normalize();
    const sunLight = new THREE.DirectionalLight(0xfff9f2, 3.6);
    sunLight.position.copy(sunDirection).multiplyScalar(12);
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x4b79c9, 0x02040a, 0.08);
    scene.add(hemiLight);

    // -------------------------------------------------------------------------
    // 1. Deep Midnight Starfield
    // -------------------------------------------------------------------------
    const starCount = isSoftwareGl ? 320 : isMobileLike ? 480 : 720;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    const starRand = createSeededRandom(9137);

    const starPalette = [
      new THREE.Color(0xcbdcff),
      new THREE.Color(0xeef4ff),
      new THREE.Color(0xf8fafc),
      new THREE.Color(0xfff1dc),
    ];

    for (let i = 0; i < starCount; i++) {
      const u = starRand();
      const v = starRand();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = 18 + starRand() * 18;

      const i3 = i * 3;
      starPos[i3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i3 + 1] = r * Math.cos(phi);
      starPos[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const mag = Math.pow(starRand(), 2.8);
      const brightness = 0.36 + mag * 0.64;
      const tint = starPalette[Math.floor(starRand() * starPalette.length)];
      starCol[i3] = tint.r * brightness;
      starCol[i3 + 1] = tint.g * brightness;
      starCol[i3 + 2] = tint.b * brightness;

      starSize[i] = 1.3 + mag * 2.4;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));

    const starMat = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, maxDpr) },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d2 = dot(c, c);
          if (d2 > 0.25) discard;
          float core = exp(-d2 * 22.0);
          gl_FragColor = vec4(vColor, core);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });

    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // -------------------------------------------------------------------------
    // 2. NASA Satellite Textures
    // -------------------------------------------------------------------------
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const fallbackSpec = createSolidFallbackTexture(255, 255, 255, THREE.NoColorSpace);
    const fallbackClouds = createSolidFallbackTexture(0, 0, 0, THREE.NoColorSpace);
    const fallbackNight = createSolidFallbackTexture(0, 0, 0, THREE.SRGBColorSpace);

    const earthUniforms = {
      uSpecularMap: { value: fallbackSpec as THREE.Texture },
      uNightMap: { value: fallbackNight as THREE.Texture },
      uCloudMap: { value: fallbackClouds as THREE.Texture },
      uSunDir: { value: sunDirection.clone() },
      uCloudOffset: { value: 0.0 },
    };

    const textureLoader = new THREE.TextureLoader();
    const loadedTextures: THREE.Texture[] = [];

    const configureTexture = (
      tex: THREE.Texture,
      colorSpace: THREE.ColorSpace,
    ) => {
      tex.colorSpace = colorSpace;
      tex.anisotropy = maxAniso;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      loadedTextures.push(tex);
      return tex;
    };

    let needsImmediateRender = false;
    const onTextureReady = () => {
      needsImmediateRender = true;
    };

    const dayTex = configureTexture(
      textureLoader.load(TEXTURE_PATHS.day, onTextureReady),
      THREE.SRGBColorSpace,
    );
    const normalTex = configureTexture(
      textureLoader.load(TEXTURE_PATHS.normal, onTextureReady),
      THREE.NoColorSpace,
    );
    const specTex = configureTexture(
      textureLoader.load(TEXTURE_PATHS.specular, onTextureReady),
      THREE.NoColorSpace,
    );
    const cloudTex = configureTexture(
      textureLoader.load(TEXTURE_PATHS.clouds, onTextureReady),
      THREE.SRGBColorSpace,
    );
    const nightTex = configureTexture(
      textureLoader.load(TEXTURE_PATHS.night, onTextureReady),
      THREE.SRGBColorSpace,
    );

    earthUniforms.uSpecularMap.value = specTex;
    earthUniforms.uNightMap.value = nightTex;
    earthUniforms.uCloudMap.value = cloudTex;

    // -------------------------------------------------------------------------
    // 3. Earth Group (Surface, Urban Pollution Halo, Clouds, Particles, Markers)
    // -------------------------------------------------------------------------
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const unitSphereGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 48);

    const earthMat = new THREE.MeshPhysicalMaterial({
      map: dayTex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.90,
      metalness: 0.02,
      reflectivity: 0.36,
      clearcoat: 0.0,
    });

    earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSpecularMap = earthUniforms.uSpecularMap;
      shader.uniforms.uNightMap = earthUniforms.uNightMap;
      shader.uniforms.uCloudMap = earthUniforms.uCloudMap;
      shader.uniforms.uSunDir = earthUniforms.uSunDir;
      shader.uniforms.uCloudOffset = earthUniforms.uCloudOffset;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          varying vec3 vEarthWorldPos;
          varying vec3 vEarthWorldNormal;
        `,
        )
        .replace(
          '#include <worldpos_vertex>',
          /* glsl */ `
          #include <worldpos_vertex>
          vec4 earthWp = modelMatrix * vec4(transformed, 1.0);
          vEarthWorldPos = earthWp.xyz;
          vEarthWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform sampler2D uSpecularMap;
          uniform sampler2D uNightMap;
          uniform sampler2D uCloudMap;
          uniform vec3 uSunDir;
          uniform float uCloudOffset;
          varying vec3 vEarthWorldPos;
          varying vec3 vEarthWorldNormal;
        `,
        )
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          #include <map_fragment>
          #ifdef USE_MAP
            vec3 earthN_map = normalize(vEarthWorldNormal);
            float sunNdotL = dot(earthN_map, normalize(uSunDir));
            vec2 shadowUv = vec2(
              fract(vMapUv.x - uCloudOffset - 0.0024),
              clamp(vMapUv.y + 0.0012, 0.001, 0.999)
            );
            float cloudOcc = texture2D(uCloudMap, shadowUv).a;
            float dayShade = smoothstep(-0.08, 0.28, sunNdotL);
            diffuseColor.rgb *= (1.0 - cloudOcc * 0.36 * dayShade);
          #endif
        `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          float roughnessFactor = roughness;
          #ifdef USE_MAP
            float waterMask = texture2D(uSpecularMap, vMapUv).r;
            roughnessFactor = mix(0.92, 0.42, waterMask);
          #endif
        `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `
          #include <emissivemap_fragment>
          #ifdef USE_MAP
            vec3 earthN = normalize(vEarthWorldNormal);
            vec3 sunD = normalize(uSunDir);
            vec3 viewD = normalize(cameraPosition - vEarthWorldPos);
            float earthNdotL = dot(earthN, sunD);

            float nightMask = 1.0 - smoothstep(-0.16, 0.06, earthNdotL);
            vec3 nightSample = texture2D(uNightMap, vMapUv).rgb;
            float nightLuma = dot(nightSample, vec3(0.299, 0.587, 0.114));
            vec3 cityGlow = pow(nightSample, vec3(1.1)) * vec3(1.22, 0.90, 0.54)
              * nightMask * 1.25 * smoothstep(0.05, 0.28, nightLuma);
            totalEmissiveRadiance += cityGlow;

            float terminator = exp(-pow((earthNdotL + 0.01) * 14.0, 2.0));
            totalEmissiveRadiance += vec3(0.16, 0.07, 0.03) * terminator * 0.045;

            float horizonFresnel = pow(1.0 - clamp(dot(earthN, viewD), 0.0, 1.0), 3.8);
            float dayAtmoMask = smoothstep(-0.20, 0.45, earthNdotL);
            totalEmissiveRadiance += vec3(0.14, 0.44, 0.92) * horizonFresnel * dayAtmoMask * 0.42;
          #endif
        `,
        );
    };

    const earthMesh = new THREE.Mesh(unitSphereGeo, earthMat);
    earthGroup.add(earthMesh);

    // -------------------------------------------------------------------------
    // 4. Curved Atmospheric Urban Pollution Halo (CPCB Data-Driven Shader)
    // -------------------------------------------------------------------------
    const initState = globeStateRef.current;
    const initHaloCenter = latLngToVector3(initState.lat, initState.lng, 1.0).normalize();
    const targetHaloCenter = initHaloCenter.clone();
    const currentHaloCenter = initHaloCenter.clone();

    const currentHaloCore = new THREE.Color(initState.profile.coreHex);
    const targetHaloCore = new THREE.Color(initState.profile.coreHex);
    const currentHaloOuter = new THREE.Color(initState.profile.outerHex);
    const targetHaloOuter = new THREE.Color(initState.profile.outerHex);
    let currentHaloIntensity = initState.profile.glowIntensity;
    let targetHaloIntensity = initState.profile.glowIntensity;
    let currentHaloRadius = initState.profile.haloAngularRadius;
    let targetHaloRadius = initState.profile.haloAngularRadius;

    const pollutionHaloMat = new THREE.ShaderMaterial({
      uniforms: {
        uHaloCenter: { value: currentHaloCenter.clone() },
        uHaloColorCore: { value: currentHaloCore.clone() },
        uHaloColorOuter: { value: currentHaloOuter.clone() },
        uHaloIntensity: { value: currentHaloIntensity },
        uHaloRadius: { value: currentHaloRadius },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocalDir;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          vLocalDir = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uHaloCenter;
        uniform vec3 uHaloColorCore;
        uniform vec3 uHaloColorOuter;
        uniform float uHaloIntensity;
        uniform float uHaloRadius;
        uniform float uTime;

        varying vec3 vLocalDir;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        void main() {
          if (uHaloIntensity <= 0.003) discard;

          vec3 pDir = normalize(vLocalDir);
          float cosAng = clamp(dot(pDir, normalize(uHaloCenter)), -1.0, 1.0);
          float angDist = acos(cosAng);
          float normR = angDist / max(uHaloRadius, 0.012);
          if (normR > 2.25) discard;

          // Subtle layered red/orange atmospheric pollution plume hugging Earth's curvature
          float core = exp(-normR * normR * 3.1);
          float corona = exp(-normR * normR * 0.85) * 0.62;
          float subtlePulse = 0.91 + 0.09 * sin(uTime * 1.35 - normR * 2.0);

          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          float viewFade = smoothstep(-0.08, 0.24, dot(N, V));

          vec3 col = mix(uHaloColorOuter, uHaloColorCore, clamp(core * 1.25, 0.0, 1.0));
          float alpha = clamp((core * 0.62 + corona * 0.44) * uHaloIntensity * subtlePulse * viewFade, 0.0, 0.72);
          if (alpha <= 0.002) discard;

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.FrontSide,
    });

    const pollutionHaloMesh = new THREE.Mesh(unitSphereGeo, pollutionHaloMat);
    pollutionHaloMesh.scale.setScalar(POLLUTION_HALO_RADIUS);
    earthGroup.add(pollutionHaloMesh);

    // -------------------------------------------------------------------------
    // 5. Realistic White Satellite Clouds
    // -------------------------------------------------------------------------
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.90,
      roughness: 0.94,
      metalness: 0.0,
      depthWrite: false,
    });
    const cloudMesh = new THREE.Mesh(unitSphereGeo, cloudMat);
    cloudMesh.scale.setScalar(CLOUD_RADIUS);
    earthGroup.add(cloudMesh);

    // -------------------------------------------------------------------------
    // 6. Thin Blue Rayleigh Atmospheric Limb Shaders
    // -------------------------------------------------------------------------
    const innerAtmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDirection.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 L = normalize(uSunDir);

          float ndotv = clamp(dot(N, V), 0.0, 1.0);
          float fresnel = pow(1.0 - ndotv, 4.8);
          float ndotl = dot(N, L);
          float daySide = smoothstep(-0.24, 0.45, ndotl);
          float twilight = exp(-pow((ndotl + 0.04) * 5.2, 2.0)) * 0.25;

          vec3 skyBlue = vec3(0.28, 0.62, 1.0);
          vec3 warmEdge = vec3(0.85, 0.42, 0.22);
          vec3 col = skyBlue * daySide + warmEdge * twilight;
          float alpha = fresnel * (daySide * 0.44 + twilight * 0.28);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });

    const innerAtmoMesh = new THREE.Mesh(unitSphereGeo, innerAtmoMat);
    innerAtmoMesh.scale.setScalar(INNER_ATMO_RADIUS);
    scene.add(innerAtmoMesh);

    const outerAtmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDirection.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 L = normalize(uSunDir);

          float backFacing = clamp(dot(-N, V), 0.0, 1.0);
          float rimFalloff = smoothstep(0.0, 0.342, backFacing);
          float thinHalo = pow(rimFalloff, 3.6);

          float ndotl = dot(N, L);
          float sunMask = smoothstep(-0.30, 0.42, ndotl);
          float nightWhisper = 0.035;

          vec3 zenithBlue = vec3(0.24, 0.58, 1.0);
          vec3 horizonCyan = vec3(0.48, 0.78, 1.0);
          vec3 atmoColor = mix(zenithBlue, horizonCyan, rimFalloff * 0.55);

          float intensity = thinHalo * (sunMask * 0.92 + nightWhisper);
          gl_FragColor = vec4(atmoColor * intensity, intensity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });

    const outerAtmoMesh = new THREE.Mesh(unitSphereGeo, outerAtmoMat);
    outerAtmoMesh.scale.setScalar(OUTER_ATMO_RADIUS);
    scene.add(outerAtmoMesh);

    // -------------------------------------------------------------------------
    // 7. Data-Driven Animated Urban Pollution Particles (No Decorative Plumes)
    // -------------------------------------------------------------------------
    const plumeParticleCount = isSoftwareGl ? 64 : isMobileLike ? 84 : 112;

    const getPlumeAnchorsFromState = (st: InternalGlobeState): PlumeAnchor[] => {
      if (!st.profile.available) return [];

      const validStations = st.stationMarkers.filter((m) => m.profile.available);
      if (st.inspectedStationId) {
        const picked = validStations.find(
          (m) => m.station.id === st.inspectedStationId,
        );
        if (picked) {
          return [
            {
              lat: picked.displayLat,
              lng: picked.displayLng,
              weight: 1.0,
              spreadDeg: 1.9,
            },
          ];
        }
      }

      if (validStations.length > 0) {
        return validStations.map((m) => ({
          lat: m.displayLat,
          lng: m.displayLng,
          weight: Math.max(0.35, m.profile.particleIntensity),
          spreadDeg: 1.65,
        }));
      }

      return [
        {
          lat: st.lat,
          lng: st.lng,
          weight: 1.0,
          spreadDeg: 2.2,
        },
      ];
    };

    const initialPlume = buildDataDrivenPlumeBuffers(
      getPlumeAnchorsFromState(initState),
      plumeParticleCount,
      48271,
    );

    const plumeGeo = new THREE.BufferGeometry();
    const plumePosAttr = new THREE.BufferAttribute(initialPlume.positions, 3);
    const plumeTuAttr = new THREE.BufferAttribute(initialPlume.tangentU, 3);
    const plumeTvAttr = new THREE.BufferAttribute(initialPlume.tangentV, 3);
    const plumePhaseAttr = new THREE.BufferAttribute(initialPlume.phases, 1);
    const plumeSizeAttr = new THREE.BufferAttribute(initialPlume.sizes, 1);
    const plumeWeightAttr = new THREE.BufferAttribute(initialPlume.weights, 1);
    const plumeRankAttr = new THREE.BufferAttribute(initialPlume.ranks, 1);

    plumeGeo.setAttribute('position', plumePosAttr);
    plumeGeo.setAttribute('aTangentU', plumeTuAttr);
    plumeGeo.setAttribute('aTangentV', plumeTvAttr);
    plumeGeo.setAttribute('aPhase', plumePhaseAttr);
    plumeGeo.setAttribute('aSize', plumeSizeAttr);
    plumeGeo.setAttribute('aWeight', plumeWeightAttr);
    plumeGeo.setAttribute('aRank', plumeRankAttr);

    const currentParticleCore = new THREE.Color(initState.profile.particleCoreHex);
    const targetParticleCore = new THREE.Color(initState.profile.particleCoreHex);
    const currentParticleOuter = new THREE.Color(initState.profile.particleOuterHex);
    const targetParticleOuter = new THREE.Color(initState.profile.particleOuterHex);
    let currentParticleIntensity = initState.profile.particleIntensity;
    let targetParticleIntensity = initState.profile.particleIntensity;
    let currentDensityFactor = initState.profile.particleDensityFactor;
    let targetDensityFactor = initState.profile.particleDensityFactor;
    let plumeTransitionEnvelope = 1.0;

    const plumeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: currentParticleIntensity },
        uDensityFactor: { value: currentDensityFactor },
        uColorCore: { value: currentParticleCore.clone() },
        uColorOuter: { value: currentParticleOuter.clone() },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, maxDpr) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aTangentU;
        attribute vec3 aTangentV;
        attribute float aPhase;
        attribute float aSize;
        attribute float aWeight;
        attribute float aRank;

        uniform float uTime;
        uniform float uIntensity;
        uniform float uDensityFactor;
        uniform float uPixelRatio;

        varying float vAlpha;
        varying float vWarmth;

        void main() {
          float activeMask = 1.0 - smoothstep(
            max(uDensityFactor - 0.08, 0.0),
            uDensityFactor + 0.02,
            aRank
          );

          if (uIntensity <= 0.003 || activeMask <= 0.005) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vAlpha = 0.0;
            vWarmth = 0.0;
            return;
          }

          float driftA = sin(uTime * 0.42 + aPhase) * 0.011;
          float driftB = cos(uTime * 0.31 + aPhase * 1.37) * 0.008;
          vec3 displaced = position + aTangentU * driftA + aTangentV * driftB;
          float alt = max(length(position), 1.015);
          vec3 localPos = normalize(displaced) * alt;

          vec4 wp = modelMatrix * vec4(localPos, 1.0);
          vec3 worldNormal = normalize(mat3(modelMatrix) * normalize(localPos));
          vec3 viewDir = normalize(cameraPosition - wp.xyz);

          float facing = smoothstep(-0.06, 0.28, dot(worldNormal, viewDir));
          float pulse = 0.80 + 0.20 * sin(uTime * 0.9 + aPhase * 2.0);
          vAlpha = facing * aWeight * uIntensity * activeMask * pulse * 0.42;
          vWarmth = fract(aPhase * 1.73);

          vec4 mvPos = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = aSize * uPixelRatio * (3.6 / max(-mvPos.z, 1.2));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorCore;
        uniform vec3 uColorOuter;
        varying float vAlpha;
        varying float vWarmth;
        void main() {
          if (vAlpha <= 0.004) discard;
          vec2 c = gl_PointCoord - 0.5;
          float d2 = dot(c, c);
          if (d2 > 0.25) discard;
          float radial = exp(-d2 * 13.5);
          vec3 col = mix(uColorCore, uColorOuter, vWarmth);
          gl_FragColor = vec4(col, radial * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const plumePoints = new THREE.Points(plumeGeo, plumeMat);
    earthGroup.add(plumePoints);

    // -------------------------------------------------------------------------
    // 8. Clickable Reference City Markers & Monitoring Station Markers
    // -------------------------------------------------------------------------
    const sharedHitSphereGeo = new THREE.SphereGeometry(0.036, 10, 8);
    const sharedHitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });

    const cityDotGeo = new THREE.SphereGeometry(0.0068, 12, 10);
    const cityDotMat = new THREE.MeshBasicMaterial({ color: 0xdbeafe });

    const cityMarkersGroup = new THREE.Group();
    earthGroup.add(cityMarkersGroup);

    const interactivePickTargets: THREE.Object3D[] = [];
    const cityDotMeshes: Array<{ cityName: string; mesh: THREE.Mesh; hit: THREE.Mesh }> = [];
    const tmpPos = new THREE.Vector3();

    INDIAN_CITIES.forEach((c) => {
      latLngToVector3(c.lat, c.lng, EARTH_RADIUS + 0.0045, tmpPos);
      const dot = new THREE.Mesh(cityDotGeo, cityDotMat);
      dot.position.copy(tmpPos);
      cityMarkersGroup.add(dot);

      const hit = new THREE.Mesh(sharedHitSphereGeo, sharedHitMat);
      hit.position.copy(tmpPos);
      hit.userData = { pickType: 'city', cityName: c.name };
      cityMarkersGroup.add(hit);

      cityDotMeshes.push({ cityName: c.name, mesh: dot, hit });
    });

    // Dynamic monitoring station markers group (rebuilt cleanly per city)
    const stationMarkersGroup = new THREE.Group();
    earthGroup.add(stationMarkersGroup);

    const stationHeadGeo = new THREE.SphereGeometry(0.0125, 14, 12);
    const stationCenterGeo = new THREE.SphereGeometry(0.0052, 10, 8);
    const stationCenterMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stationStemGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 0.04, 8);
    const stationStemMat = new THREE.MeshBasicMaterial({
      color: 0xf1f5f9,
      transparent: true,
      opacity: 0.82,
    });
    const stationRingGeo = new THREE.RingGeometry(0.0185, 0.0245, 32);
    stationRingGeo.rotateX(-Math.PI / 2);

    const disposableStationMats: THREE.Material[] = [];
    const animatedRings: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }> = [];

    const upVec = new THREE.Vector3(0, 1, 0);
    const markerNormal = new THREE.Vector3();
    const markerQuat = new THREE.Quaternion();

    const clearStationMarkers = () => {
      while (stationMarkersGroup.children.length > 0) {
        stationMarkersGroup.remove(stationMarkersGroup.children[0]);
      }
      disposableStationMats.forEach((m) => m.dispose());
      disposableStationMats.length = 0;
      animatedRings.length = 0;
    };

    const rebuildInteractiveMarkers = () => {
      clearStationMarkers();
      interactivePickTargets.length = 0;

      const st = globeStateRef.current;

      // Hide the generic city dot for the currently active city so station beacons shine cleanly
      cityDotMeshes.forEach(({ cityName, mesh, hit }) => {
        const isCurrentCity = cityName.toLowerCase() === st.city.toLowerCase();
        mesh.visible = !isCurrentCity;
        hit.visible = !isCurrentCity;
        if (!isCurrentCity) {
          interactivePickTargets.push(hit);
        }
      });

      // Build clickable 3D markers for every monitoring station of the active city
      if (st.stationMarkers.length > 0) {
        st.stationMarkers.forEach((marker) => {
          const isSelected =
            st.inspectedStationId === marker.station.id ||
            (st.inspectedStationId === null &&
              marker.station.id === st.stationMarkers[0]?.station.id);

          const group = new THREE.Group();
          latLngToVector3(
            marker.displayLat,
            marker.displayLng,
            EARTH_RADIUS + 0.005,
            tmpPos,
          );
          group.position.copy(tmpPos);
          markerNormal.copy(tmpPos).normalize();
          markerQuat.setFromUnitVectors(upVec, markerNormal);
          group.quaternion.copy(markerQuat);

          const headMat = new THREE.MeshBasicMaterial({
            color: marker.profile.coreHex,
          });
          disposableStationMats.push(headMat);

          const head = new THREE.Mesh(stationHeadGeo, headMat);
          head.scale.setScalar(isSelected ? 1.18 : 0.88);
          head.position.set(0, 0.042, 0);
          group.add(head);

          const innerDot = new THREE.Mesh(stationCenterGeo, stationCenterMat);
          innerDot.position.set(0, 0.049, 0);
          group.add(innerDot);

          const stem = new THREE.Mesh(stationStemGeo, stationStemMat);
          stem.position.set(0, 0.02, 0);
          group.add(stem);

          const ringMat = new THREE.MeshBasicMaterial({
            color: marker.profile.coreHex,
            transparent: true,
            opacity: isSelected ? 0.85 : 0.42,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          });
          disposableStationMats.push(ringMat);

          const ring = new THREE.Mesh(stationRingGeo, ringMat);
          ring.position.set(0, 0.004, 0);
          ring.scale.setScalar(isSelected ? 1.15 : 0.78);
          group.add(ring);
          if (isSelected) {
            animatedRings.push({ mesh: ring, mat: ringMat });
          }

          // Invisible generous hit target for crisp desktop & touch picking
          const hit = new THREE.Mesh(sharedHitSphereGeo, sharedHitMat);
          hit.scale.setScalar(1.25);
          hit.position.set(0, 0.025, 0);
          hit.userData = {
            pickType: 'station',
            stationId: marker.station.id,
          };
          group.add(hit);
          interactivePickTargets.push(hit);

          stationMarkersGroup.add(group);
        });
      } else {
        // Fallback single city beacon when no individual station records exist
        const group = new THREE.Group();
        latLngToVector3(st.lat, st.lng, EARTH_RADIUS + 0.005, tmpPos);
        group.position.copy(tmpPos);
        markerNormal.copy(tmpPos).normalize();
        markerQuat.setFromUnitVectors(upVec, markerNormal);
        group.quaternion.copy(markerQuat);

        const headMat = new THREE.MeshBasicMaterial({
          color: st.profile.coreHex,
        });
        disposableStationMats.push(headMat);

        const head = new THREE.Mesh(stationHeadGeo, headMat);
        head.position.set(0, 0.042, 0);
        group.add(head);

        const stem = new THREE.Mesh(stationStemGeo, stationStemMat);
        stem.position.set(0, 0.02, 0);
        group.add(stem);

        const ringMat = new THREE.MeshBasicMaterial({
          color: st.profile.coreHex,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
        disposableStationMats.push(ringMat);
        const ring = new THREE.Mesh(stationRingGeo, ringMat);
        ring.position.set(0, 0.004, 0);
        group.add(ring);
        animatedRings.push({ mesh: ring, mat: ringMat });

        stationMarkersGroup.add(group);
      }
    };

    const syncTelemetryVisuals = (relocatePlume = false) => {
      const st = globeStateRef.current;

      // Update smooth target values for halo & particles
      latLngToVector3(st.lat, st.lng, 1.0, targetHaloCenter).normalize();
      targetHaloCore.setHex(st.profile.coreHex);
      targetHaloOuter.setHex(st.profile.outerHex);
      targetHaloIntensity = st.profile.glowIntensity;
      targetHaloRadius = st.profile.haloAngularRadius;

      targetParticleCore.setHex(st.profile.particleCoreHex);
      targetParticleOuter.setHex(st.profile.particleOuterHex);
      targetParticleIntensity = st.profile.particleIntensity;
      targetDensityFactor = st.profile.particleDensityFactor;

      const anchors = getPlumeAnchorsFromState(st);
      const rebuilt = buildDataDrivenPlumeBuffers(
        anchors,
        plumeParticleCount,
        48271 + Math.round((st.lat + 90) * 100 + (st.lng + 180) * 10),
      );
      plumePosAttr.array.set(rebuilt.positions);
      plumeTuAttr.array.set(rebuilt.tangentU);
      plumeTvAttr.array.set(rebuilt.tangentV);
      plumePhaseAttr.array.set(rebuilt.phases);
      plumeSizeAttr.array.set(rebuilt.sizes);
      plumeWeightAttr.array.set(rebuilt.weights);
      plumeRankAttr.array.set(rebuilt.ranks);
      plumePosAttr.needsUpdate = true;
      plumeTuAttr.needsUpdate = true;
      plumeTvAttr.needsUpdate = true;
      plumePhaseAttr.needsUpdate = true;
      plumeSizeAttr.needsUpdate = true;
      plumeWeightAttr.needsUpdate = true;
      plumeRankAttr.needsUpdate = true;

      if (relocatePlume) {
        plumeTransitionEnvelope = 0.0;
      }

      rebuildInteractiveMarkers();
      needsImmediateRender = true;
    };

    syncTelemetryRef.current = syncTelemetryVisuals;
    rebuildInteractiveMarkers();

    // -------------------------------------------------------------------------
    // 9. Smooth City Transitions, Raycasting Station Clicks & Drag Interaction
    // -------------------------------------------------------------------------
    const computeFocusRotation = (targetLat: number, targetLng: number) => ({
      rotY: -Math.PI * 0.5 - THREE.MathUtils.degToRad(targetLng),
      rotX: THREE.MathUtils.clamp(
        THREE.MathUtils.degToRad(targetLat) * 0.78,
        -0.58,
        0.72,
      ),
    });

    const initialRot = computeFocusRotation(initState.lat, initState.lng);
    let currentRotX = initialRot.rotX;
    let currentRotY = initialRot.rotY;
    let targetRotX = initialRot.rotX;
    let targetRotY = initialRot.rotY;
    let isFocusing = false;
    let transitionArcProgress = 1.0; // 0..1 smooth orbital slew zoom arc

    earthGroup.rotation.set(currentRotX, currentRotY, 0);

    const triggerFocus = (withZoomArc = false) => {
      const st = globeStateRef.current;
      const next = computeFocusRotation(st.lat, st.lng);
      const deltaY = Math.atan2(
        Math.sin(next.rotY - currentRotY),
        Math.cos(next.rotY - currentRotY),
      );
      targetRotY = currentRotY + deltaY;
      targetRotX = next.rotX;
      isFocusing = true;
      if (withZoomArc) {
        transitionArcProgress = 0.0;
      }
      needsImmediateRender = true;
    };

    resetTriggerRef.current = triggerFocus;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const hitWorldPos = new THREE.Vector3();
    const hitNormal = new THREE.Vector3();
    const hitViewDir = new THREE.Vector3();

    const pickInteractiveMarker = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const hits = raycaster.intersectObjects(interactivePickTargets, false);
      for (const hit of hits) {
        // Ignore markers on the far back side of Earth
        hit.object.getWorldPosition(hitWorldPos);
        hitNormal.copy(hitWorldPos).normalize();
        hitViewDir.copy(camera.position).sub(hitWorldPos).normalize();
        if (hitNormal.dot(hitViewDir) > 0.02) {
          return hit.object.userData as {
            pickType: 'station' | 'city';
            stationId?: string;
            cityName?: string;
          };
        }
      }
      return null;
    };

    let isDragging = false;
    let activePointerId: number | null = null;
    let downClientX = 0;
    let downClientY = 0;
    let prevPointerX = 0;
    let prevPointerY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      isDragging = true;
      isFocusing = false;
      activePointerId = e.pointerId;
      downClientX = e.clientX;
      downClientY = e.clientY;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore unsupported pointer capture
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isDragging) {
        if (activePointerId !== null && e.pointerId !== activePointerId) return;
        const dx = e.clientX - prevPointerX;
        const dy = e.clientY - prevPointerY;
        prevPointerX = e.clientX;
        prevPointerY = e.clientY;

        targetRotY += dx * 0.0058;
        targetRotX = THREE.MathUtils.clamp(targetRotX + dy * 0.0048, -0.92, 0.92);
        return;
      }

      // Desktop hover pointer cursor over clickable markers
      if (e.pointerType === 'mouse') {
        const hovered = pickInteractiveMarker(e.clientX, e.clientY);
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      const movedDist = Math.hypot(
        e.clientX - downClientX,
        e.clientY - downClientY,
      );
      isDragging = false;
      activePointerId = null;

      if (movedDist < 6) {
        const picked = pickInteractiveMarker(e.clientX, e.clientY);
        if (picked?.pickType === 'station' && picked.stationId) {
          setLocalInspectedStationId(picked.stationId);
          onSelectStationRef.current?.(picked.stationId);
          setPanelCollapsed(false);
        } else if (picked?.pickType === 'city' && picked.cityName) {
          onSelectCityRef.current?.(picked.cityName);
          setPanelCollapsed(false);
        }
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('webglcontextlost', onContextLost);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    let resizeRafId = 0;
    const handleResize = () => {
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      baseCameraZ = computeCameraZ(w, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      const pr = Math.min(window.devicePixelRatio || 1, maxDpr);
      renderer.setPixelRatio(pr);
      starMat.uniforms.uPixelRatio.value = pr;
      plumeMat.uniforms.uPixelRatio.value = pr;
      needsImmediateRender = true;
    };

    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(container);

    // -------------------------------------------------------------------------
    // 10. Render Loop (Zero Per-Frame Allocations, Smooth City Transitions)
    // -------------------------------------------------------------------------
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let disposed = false;
    let rafId = 0;
    let timerId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let cloudAngle = 0;

    function afterDraw(cb: () => void) {
      if (disposed) return;
      timerId = window.setTimeout(cb, 80);
    }

    function tick() {
      if (disposed) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const isPaused = pausedRef.current;

      if (!reducedMotion) {
        elapsed += dt;
        if (!isPaused) {
          cloudAngle += dt * 0.0055;
          cloudMesh.rotation.y = cloudAngle;
          earthUniforms.uCloudOffset.value = (cloudAngle / (Math.PI * 2)) % 1.0;

          if (!isDragging && !isFocusing) {
            targetRotY += dt * 0.022;
          }
        }
      }

      // Smooth damped rotation (gentle flight when city changes)
      const rotSpeed = isFocusing ? 5.2 : 8.5;
      const damp = 1 - Math.exp(-rotSpeed * dt);
      currentRotX += (targetRotX - currentRotX) * damp;
      currentRotY += (targetRotY - currentRotY) * damp;

      if (
        isFocusing &&
        Math.abs(targetRotX - currentRotX) < 0.002 &&
        Math.abs(targetRotY - currentRotY) < 0.002
      ) {
        isFocusing = false;
      }

      earthGroup.rotation.set(currentRotX, currentRotY, 0);

      // Smooth orbital slew zoom-arc on city change
      let slewZoomOffset = 0;
      if (transitionArcProgress < 1.0) {
        transitionArcProgress = Math.min(1.0, transitionArcProgress + dt * 1.15);
        slewZoomOffset = Math.sin(transitionArcProgress * Math.PI) * 0.22;
      }

      if (!reducedMotion && !isPaused) {
        camera.position.x = Math.sin(elapsed * 0.14) * 0.045;
        camera.position.y = 0.06 + Math.cos(elapsed * 0.11) * 0.025;
        camera.position.z =
          baseCameraZ + slewZoomOffset + Math.sin(elapsed * 0.09) * 0.032;
      } else {
        const desiredZ = baseCameraZ + slewZoomOffset;
        camera.position.z += (desiredZ - camera.position.z) * damp;
      }
      camera.lookAt(0, 0.08, 0);

      if (!reducedMotion && !isPaused) {
        starField.rotation.y = elapsed * 0.003;
      }

      // Smoothly interpolate pollution halo & particle telemetry transitions
      const telemetryDamp = reducedMotion ? 1.0 : 1 - Math.exp(-4.5 * dt);
      currentHaloCenter.lerp(targetHaloCenter, telemetryDamp).normalize();
      currentHaloCore.lerp(targetHaloCore, telemetryDamp);
      currentHaloOuter.lerp(targetHaloOuter, telemetryDamp);
      currentHaloIntensity +=
        (targetHaloIntensity - currentHaloIntensity) * telemetryDamp;
      currentHaloRadius +=
        (targetHaloRadius - currentHaloRadius) * telemetryDamp;

      pollutionHaloMat.uniforms.uHaloCenter.value.copy(currentHaloCenter);
      pollutionHaloMat.uniforms.uHaloColorCore.value.copy(currentHaloCore);
      pollutionHaloMat.uniforms.uHaloColorOuter.value.copy(currentHaloOuter);
      pollutionHaloMat.uniforms.uHaloIntensity.value = currentHaloIntensity;
      pollutionHaloMat.uniforms.uHaloRadius.value = currentHaloRadius;
      pollutionHaloMat.uniforms.uTime.value = elapsed;

      plumeTransitionEnvelope = Math.min(1.0, plumeTransitionEnvelope + dt * 2.4);
      currentParticleCore.lerp(targetParticleCore, telemetryDamp);
      currentParticleOuter.lerp(targetParticleOuter, telemetryDamp);
      currentParticleIntensity +=
        (targetParticleIntensity - currentParticleIntensity) * telemetryDamp;
      currentDensityFactor +=
        (targetDensityFactor - currentDensityFactor) * telemetryDamp;

      plumeMat.uniforms.uTime.value = elapsed;
      plumeMat.uniforms.uColorCore.value.copy(currentParticleCore);
      plumeMat.uniforms.uColorOuter.value.copy(currentParticleOuter);
      plumeMat.uniforms.uIntensity.value =
        currentParticleIntensity * plumeTransitionEnvelope;
      plumeMat.uniforms.uDensityFactor.value = currentDensityFactor;

      // Subtle breathing ring on active station beacon
      const ringPulse = 1.05 + Math.sin(elapsed * 2.2) * 0.16;
      const ringOpacity = 0.56 + (1 - Math.sin(elapsed * 2.2) * 0.5) * 0.24;
      for (let i = 0; i < animatedRings.length; i++) {
        animatedRings[i].mesh.scale.setScalar(ringPulse);
        animatedRings[i].mat.opacity = ringOpacity;
      }

      if (needsImmediateRender) {
        needsImmediateRender = false;
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      resetTriggerRef.current = null;
      syncTelemetryRef.current = null;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(resizeRafId);
      window.clearTimeout(timerId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      clearStationMarkers();
      starGeo.dispose();
      starMat.dispose();
      unitSphereGeo.dispose();
      earthMat.dispose();
      pollutionHaloMat.dispose();
      cloudMat.dispose();
      innerAtmoMat.dispose();
      outerAtmoMat.dispose();
      plumeGeo.dispose();
      plumeMat.dispose();
      sharedHitSphereGeo.dispose();
      sharedHitMat.dispose();
      cityDotGeo.dispose();
      cityDotMat.dispose();
      stationHeadGeo.dispose();
      stationCenterGeo.dispose();
      stationCenterMat.dispose();
      stationStemGeo.dispose();
      stationStemMat.dispose();
      stationRingGeo.dispose();

      fallbackSpec.dispose();
      fallbackClouds.dispose();
      fallbackNight.dispose();
      loadedTextures.forEach((tex) => tex.dispose());

      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  const freshnessLabel = activeDisplay.lastUpdatedIso
    ? formatFreshnessLabel(activeDisplay.lastUpdatedIso)
    : 'Unavailable';
  const clockTime = formatClockTime(activeDisplay.lastUpdatedIso);

  if (webglFailed) {
    return (
      <div
        data-testid="earth-canvas"
        data-city={city}
        data-aqi={activeDisplay.aqi ?? 'unavailable'}
        data-pollution-available={String(activeDisplay.profile.available)}
        className="w-full h-full flex flex-col items-center justify-center rounded-xl border border-slate-800/80 bg-[#02040a] p-6 text-center"
      >
        <div className="w-28 h-28 rounded-full border border-sky-400/40 bg-gradient-to-br from-sky-950/70 via-slate-900 to-blue-950/60 flex items-center justify-center mb-3">
          <span className="font-mono text-xs text-sky-300 tabular-nums">
            {lat.toFixed(2)}°N, {lng.toFixed(2)}°E
          </span>
        </div>
        <p className="text-sm font-medium text-slate-200">
          {city} Urban Pollution Intelligence
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {activeDisplay.profile.available
            ? `AQI ${activeDisplay.aqi} (${activeDisplay.category}) · PM2.5 ${activeDisplay.pm25 ?? 'N/A'} ${activeDisplay.pm25Unit}`
            : 'CPCB data unavailable'}
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full min-h-[380px] lg:min-h-[410px] rounded-xl overflow-hidden border border-slate-800/90 bg-[#02040a] shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]"
      data-testid="earth-canvas"
      data-city={city}
      data-aqi={activeDisplay.aqi ?? 'unavailable'}
      data-pollution-available={String(activeDisplay.profile.available)}
      data-inspected-station={activeDisplay.stationId ?? 'city'}
    >
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Compact Top Floating Urban Pollution Intelligence Bar (leaves Earth & Delhi NCR 100% unobstructed) */}
      <div
        data-testid="earth-floating-panel"
        className={`absolute top-2.5 left-2.5 right-2.5 z-10 rounded-lg bg-[#02040a]/92 border ${activeDisplay.profile.tierBorderClass} shadow-lg transition-colors`}
      >
        <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-100 truncate">
              {city}
            </span>
            {activeDisplay.isStationView && activeDisplay.stationName ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-200 truncate">
                <MapPin className="w-2.5 h-2.5 text-amber-300 shrink-0" />
                <span className="truncate max-w-[130px] sm:max-w-[170px]">
                  {shortenStationName(activeDisplay.stationName)}
                </span>
              </span>
            ) : (
              <span className="hidden sm:inline font-mono text-[10px] tabular-nums text-slate-400 shrink-0">
                {activeDisplay.lat.toFixed(2)}°N {activeDisplay.lng.toFixed(2)}°E
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeDisplay.profile.available ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-300">
                <Radio
                  className={`w-2.5 h-2.5 shrink-0 ${
                    activeDisplay.isOfficial
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                />
                <span className="hidden sm:inline text-amber-300 font-mono">
                  Simulated · Demo
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>Unavailable</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setPanelCollapsed((c) => !c)}
              aria-label={
                panelCollapsed
                  ? 'Expand pollution telemetry panel'
                  : 'Collapse pollution telemetry panel'
              }
              className="p-0.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-colors"
            >
              {panelCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {!panelCollapsed && (
          <div className="px-2.5 pb-2 pt-1.5 border-t border-slate-800/85 space-y-1.5">
            {activeDisplay.profile.available ? (
              <div className="grid grid-cols-3 gap-1.5 items-center text-[10px]">
                {/* AQI + Category */}
                <div className="rounded bg-slate-900/90 border border-slate-800/90 px-2 py-1">
                  <div className="flex items-baseline gap-1">
                    <span
                      data-testid="earth-panel-aqi"
                      className="font-mono text-sm font-bold tabular-nums text-slate-50 leading-none"
                    >
                      {activeDisplay.aqi}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      AQI
                    </span>
                  </div>
                  <span
                    data-testid="earth-panel-category"
                    className={`block truncate text-[10px] font-semibold mt-0.5 ${activeDisplay.profile.tierBadgeTextClass}`}
                  >
                    {activeDisplay.category}
                  </span>
                </div>

                {/* PM2.5 */}
                <div className="rounded bg-slate-900/90 border border-slate-800/90 px-2 py-1">
                  <span className="block text-[9px] text-slate-400">PM2.5</span>
                  <span
                    data-testid="earth-panel-pm25"
                    className="block font-mono font-medium tabular-nums text-slate-100 truncate mt-0.5"
                  >
                    {activeDisplay.pm25 !== null
                      ? `${activeDisplay.pm25} ${activeDisplay.pm25Unit}`
                      : 'Unavailable'}
                  </span>
                </div>

                {/* Last Updated */}
                <div className="rounded bg-slate-900/90 border border-slate-800/90 px-2 py-1">
                  <span className="block text-[9px] text-slate-400">
                    Updated
                  </span>
                  <span
                    data-testid="earth-panel-updated"
                    className="block font-mono font-medium tabular-nums text-slate-100 truncate mt-0.5"
                    title={
                      clockTime
                        ? `${freshnessLabel} (${clockTime})`
                        : freshnessLabel
                    }
                  >
                    {freshnessLabel}
                  </span>
                </div>
              </div>
            ) : (
              /* Explicit Unavailable Indicator — zero invented pollution glow */
              <div
                data-testid="earth-unavailable-indicator"
                className="rounded bg-slate-900/95 border border-slate-700/80 px-2 py-1.5 flex items-center justify-between gap-2 text-[10px]"
              >
                <div className="min-w-0">
                  <span className="font-medium text-slate-200 block">
                    Simulated AQI Data Unavailable
                  </span>
                  <span className="text-slate-400 block truncate">
                    Pollution halo &amp; particles disabled until AQI data is available.
                  </span>
                </div>
                <span className="font-mono text-slate-400 shrink-0">
                  PM2.5 N/A
                </span>
              </div>
            )}

            {/* Slim Single-Row Interactive Monitoring Station Strip (synced with 3D clickable markers) */}
            {stationMarkers.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {activeDisplay.isStationView && (
                  <button
                    type="button"
                    onClick={() => handleSelectStationChip(null)}
                    className="px-1.5 py-0.5 rounded text-[10px] border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 transition-colors shrink-0"
                  >
                    All
                  </button>
                )}
                {stationMarkers.slice(0, 6).map((m) => {
                  const isPicked = activeDisplay.stationId === m.station.id;
                  return (
                    <button
                      key={m.station.id}
                      type="button"
                      data-testid={`earth-station-chip-${m.station.id}`}
                      onClick={() => handleSelectStationChip(m.station.id)}
                      className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors shrink-0 ${
                        isPicked
                          ? 'bg-sky-500/20 border-sky-400/70 text-sky-100 font-medium'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-slate-100'
                      }`}
                      title={`${m.station.station} — AQI ${m.station.officialAqi ?? 'N/A'}`}
                    >
                      {shortenStationName(m.station.station)}{' '}
                      <span className="font-mono text-slate-400">
                        {m.station.officialAqi ?? '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compact Bottom Dock Controls (preserved Pause/Rotate & Focus) */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#02040a]/90 border border-slate-800/90 text-[11px] text-slate-300">
        <span className="truncate">
          Drag globe · Tap stations ·{' '}
          <strong className="text-slate-100 font-medium">
            {activeDisplay.category}
          </strong>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Resume globe rotation' : 'Pause globe rotation'}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700/90 bg-slate-900/90 text-slate-200 hover:border-sky-400/50 hover:text-sky-200 transition-colors"
          >
            {paused ? (
              <Play className="w-3 h-3" />
            ) : (
              <Pause className="w-3 h-3" />
            )}
            <span>{paused ? 'Rotate' : 'Pause'}</span>
          </button>
          <button
            type="button"
            onClick={() => resetTriggerRef.current?.(false)}
            aria-label={`Recenter globe on ${city}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700/90 bg-slate-900/90 text-slate-200 hover:border-emerald-500/40 hover:text-emerald-200 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Focus</span>
          </button>
        </div>
      </div>
    </div>
  );
}
