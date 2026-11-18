import { useEffect, useRef, useState } from 'react';
import { Compass, Pause, Play, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { classifyCpcbAqi, INDIAN_CITIES } from '../lib/aqi.ts';
import type { AqiCategory } from '../lib/types.ts';

interface EarthSceneProps {
  city: string;
  lat: number;
  lng: number;
  aqi: number | null;
  category: AqiCategory;
}

const LAND_MASSES: Array<{
  coords: [number, number][];
}> = [
  // North America + Central America
  {
    coords: [
      [70, -162], [71, -125], [68, -95], [60, -76], [52, -56], [44, -66],
      [35, -75], [25, -81], [29, -90], [25, -97], [18, -93], [14, -84],
      [8, -78], [12, -87], [19, -104], [24, -108], [32, -117], [42, -124],
      [50, -128], [58, -138], [61, -152],
    ],
  },
  // Greenland
  {
    coords: [
      [82, -32], [76, -18], [68, -30], [60, -44], [66, -53], [76, -68], [81, -55],
    ],
  },
  // South America
  {
    coords: [
      [11, -74], [10, -62], [5, -52], [-1, -48], [-6, -35], [-15, -39],
      [-23, -42], [-34, -53], [-42, -64], [-54, -68], [-53, -74], [-42, -74],
      [-24, -71], [-14, -76], [-5, -81], [3, -78],
    ],
  },
  // Europe
  {
    coords: [
      [71, 26], [69, 44], [62, 58], [50, 44], [44, 38], [41, 29], [37, 23],
      [40, 18], [44, 12], [43, 4], [36, -6], [39, -9], [44, -8], [48, -4],
      [51, 2], [55, 8], [60, 5], [65, 12],
    ],
  },
  // Africa
  {
    coords: [
      [36, -6], [37, 10], [32, 16], [31, 32], [22, 37], [12, 44], [11, 51],
      [2, 45], [-6, 39], [-16, 40], [-26, 33], [-34, 24], [-34, 18], [-22, 14],
      [-12, 13], [0, 9], [5, 2], [5, -8], [13, -17], [22, -17], [31, -10],
    ],
  },
  // Asia + Arabian Peninsula + Indian Subcontinent + SE Asia (continuous natural coastline)
  {
    coords: [
      [68, 58], [73, 85], [75, 115], [71, 145], [66, 172], [58, 162], [52, 142],
      [42, 132], [38, 127], [34, 121], [25, 119], [21, 108], [14, 109], [9, 105],
      [13, 100], [3, 103], [6, 99], [16, 97], [21, 92], [22, 88], [18, 84],
      [13, 80], [8, 77], [14, 74], [21, 72], [23, 68], [25, 62], [26, 56],
      [23, 59], [16, 53], [13, 45], [22, 39], [30, 34], [36, 36], [41, 41],
      [45, 48], [52, 54],
    ],
  },
  // Japan
  {
    coords: [
      [45, 142], [41, 141], [36, 140], [33, 132], [35, 135], [40, 140],
    ],
  },
  // Indonesia / Borneo / Sumatra hints
  {
    coords: [
      [5, 96], [-4, 104], [-7, 112], [-5, 105], [1, 100],
    ],
  },
  {
    coords: [
      [6, 116], [1, 118], [-3, 114], [-1, 109], [3, 112],
    ],
  },
  // Australia
  {
    coords: [
      [-12, 131], [-13, 136], [-12, 142], [-20, 149], [-28, 153], [-37, 150],
      [-38, 142], [-34, 136], [-32, 126], [-34, 115], [-22, 114], [-16, 124],
    ],
  },
];

function createProceduralEarthMaps(): {
  albedoMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  cloudMap: THREE.CanvasTexture;
} {
  const W = 1024;
  const H = 512;
  const px = (lngDeg: number) => ((lngDeg + 180) / 360) * W;
  const py = (latDeg: number) => ((90 - latDeg) / 180) * H;

  // 1. Albedo Texture (SRGB)
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = W;
  albedoCanvas.height = H;
  const aCtx = albedoCanvas.getContext('2d');
  if (aCtx) {
    const oceanGrad = aCtx.createLinearGradient(0, 0, 0, H);
    oceanGrad.addColorStop(0, '#040B1A');
    oceanGrad.addColorStop(0.5, '#071730');
    oceanGrad.addColorStop(1, '#040A17');
    aCtx.fillStyle = oceanGrad;
    aCtx.fillRect(0, 0, W, H);

    // Subtle geospatial graticule
    aCtx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    aCtx.lineWidth = 1;
    for (let x = 0; x <= W; x += 64) {
      aCtx.beginPath();
      aCtx.moveTo(x, 0);
      aCtx.lineTo(x, H);
      aCtx.stroke();
    }
    for (let y = 0; y <= H; y += 64) {
      aCtx.beginPath();
      aCtx.moveTo(0, y);
      aCtx.lineTo(W, y);
      aCtx.stroke();
    }

    const landGrad = aCtx.createLinearGradient(0, 0, 0, H);
    landGrad.addColorStop(0, '#0F2540');
    landGrad.addColorStop(0.5, '#12314F');
    landGrad.addColorStop(1, '#0E223A');

    for (const mass of LAND_MASSES) {
      aCtx.beginPath();
      mass.coords.forEach(([la, ln], i) => {
        if (i === 0) aCtx.moveTo(px(ln), py(la));
        else aCtx.lineTo(px(ln), py(la));
      });
      aCtx.closePath();
      aCtx.fillStyle = landGrad;
      aCtx.fill();
      aCtx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
      aCtx.lineWidth = 1.25;
      aCtx.stroke();
    }
  }
  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;

  // 2. Emissive City Lights Texture (SRGB)
  const emCanvas = document.createElement('canvas');
  emCanvas.width = W;
  emCanvas.height = H;
  const eCtx = emCanvas.getContext('2d');
  if (eCtx) {
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, W, H);

    const drawGlowSpot = (
      latDeg: number,
      lngDeg: number,
      radiusPx: number,
      color: string
    ) => {
      const cx = px(lngDeg);
      const cy = py(latDeg);
      const g = eCtx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      eCtx.fillStyle = g;
      eCtx.beginPath();
      eCtx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      eCtx.fill();
    };

    for (const c of INDIAN_CITIES) {
      drawGlowSpot(c.lat, c.lng, 5, 'rgba(52, 211, 153, 0.55)');
      drawGlowSpot(c.lat, c.lng, 2.2, 'rgba(165, 243, 252, 0.9)');
    }
    // Global urban light hints
    const globalHubs: [number, number][] = [
      [51.5, -0.1], [48.8, 2.3], [40.7, -74.0], [34.0, -118.2], [35.6, 139.7],
      [31.2, 121.4], [1.3, 103.8], [25.2, 55.3], [-23.5, -46.6], [-33.8, 151.2],
      [30.0, 31.2], [41.0, 28.9], [37.5, 127.0],
    ];
    for (const [la, ln] of globalHubs) {
      drawGlowSpot(la, ln, 4, 'rgba(125, 211, 252, 0.4)');
    }
  }
  const emissiveMap = new THREE.CanvasTexture(emCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;

  // 3. Linear Roughness Map (NoColorSpace: oceans glossy ~0.42, land matte ~0.85)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = W;
  roughCanvas.height = H;
  const rCtx = roughCanvas.getContext('2d');
  if (rCtx) {
    rCtx.fillStyle = '#6c6c6c';
    rCtx.fillRect(0, 0, W, H);
    for (const mass of LAND_MASSES) {
      rCtx.beginPath();
      mass.coords.forEach(([la, ln], i) => {
        if (i === 0) rCtx.moveTo(px(ln), py(la));
        else rCtx.lineTo(px(ln), py(la));
      });
      rCtx.closePath();
      rCtx.fillStyle = '#d8d8d8';
      rCtx.fill();
    }
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;

  // 4. Subtle Tropospheric Cloud / Haze Texture (SRGB)
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 512;
  cloudCanvas.height = 256;
  const cCtx = cloudCanvas.getContext('2d');
  if (cCtx) {
    cCtx.clearRect(0, 0, 512, 256);
    for (let i = 0; i < 65; i++) {
      const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 512;
      const y = (Math.cos(i * 78.233) * 0.5 + 0.5) * 256;
      const rw = 26 + (i % 5) * 14;
      const rh = 7 + (i % 3) * 4;
      const g = cCtx.createRadialGradient(x, y, 0, x, y, rw);
      g.addColorStop(0, 'rgba(186, 230, 253, 0.28)');
      g.addColorStop(1, 'rgba(186, 230, 253, 0)');
      cCtx.fillStyle = g;
      cCtx.beginPath();
      cCtx.ellipse(x, y, rw, rh, 0.15, 0, Math.PI * 2);
      cCtx.fill();
    }
  }
  const cloudMap = new THREE.CanvasTexture(cloudCanvas);
  cloudMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.wrapS = THREE.RepeatWrapping;

  return { albedoMap, emissiveMap, roughnessMap, cloudMap };
}

function latLngToVec3(lat: number, lng: number, radius: number, out: THREE.Vector3) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
  return out;
}

function getFocusRotationForLng(lng: number): number {
  return -Math.PI * 0.5 - THREE.MathUtils.degToRad(lng);
}

export function EarthScene({ city, lat, lng, aqi, category }: EarthSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ lat, lng, aqi, category, paused: false });
  const resetTriggerRef = useRef<(() => void) | null>(null);

  const [paused, setPaused] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  stateRef.current.lat = lat;
  stateRef.current.lng = lng;
  stateRef.current.aqi = aqi;
  stateRef.current.category = category;
  stateRef.current.paused = paused;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75)
    );
    renderer.shadowMap.enabled = false;

    const initW = container.clientWidth || 480;
    const initH = container.clientHeight || 360;
    renderer.setSize(initW, initH);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, initW / initH, 0.1, 100);
    camera.position.set(0, 0.14, 3.62);
    camera.lookAt(0, -0.05, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-point lighting rig with cool/warm contrast
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x050814, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfef3c7, 1.9);
    keyLight.position.set(4.5, 3.2, 4.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 1.35);
    rimLight.position.set(-4.2, -1.2, -3.4);
    scene.add(rimLight);

    // Subtle deep-space starfield background
    const STAR_COUNT = 140;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 6 + (i % 5) * 1.4;
      const theta = i * 2.39996;
      const y = ((i / STAR_COUNT) * 2 - 1) * r * 0.7;
      const radial = Math.sqrt(Math.max(0.1, r * r - y * y));
      starPositions[i * 3] = Math.cos(theta) * radial;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = Math.sin(theta) * radial - 2;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.04,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Composite Earth Assembly
    const earthGroup = new THREE.Group();
    scene.add(earthGroup);

    const { albedoMap, emissiveMap, roughnessMap, cloudMap } =
      createProceduralEarthMaps();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    albedoMap.anisotropy = maxAniso;
    emissiveMap.anisotropy = maxAniso;
    roughnessMap.anisotropy = maxAniso;

    const globeGeo = new THREE.SphereGeometry(1.0, 48, 36);
    const globeMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.78,
      roughnessMap,
      roughness: 1.0,
      metalness: 0.16,
    });
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    earthGroup.add(globeMesh);

    // Tropospheric wispy cloud / haze layer
    const cloudGeo = new THREE.SphereGeometry(1.022, 40, 28);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: cloudMap,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0.0,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    earthGroup.add(cloudMesh);

    // Custom GLSL Fresnel Atmospheric Limb Shader
    const atmoGeo = new THREE.SphereGeometry(1.11, 40, 32);
    const atmoShaderMat = new THREE.ShaderMaterial({
      uniforms: {
        uGlowColor: { value: new THREE.Color(0x22d3ee) },
        uIntensity: { value: 1.15 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPos = mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uGlowColor;
        uniform float uIntensity;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vec3 viewDir = normalize(-vViewPos);
          float horizon = clamp(-dot(vNormal, viewDir), 0.0, 1.0);
          float glow = pow(smoothstep(0.0, 0.54, horizon), 1.85) * 0.62 * uIntensity;
          gl_FragColor = vec4(uGlowColor, glow);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoShaderMat);
    earthGroup.add(atmoMesh);

    // Dual inclined orbital telemetry rings + micro-satellite beacon
    const ringGeo = new THREE.TorusGeometry(1.24, 0.004, 8, 96);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.88,
      transparent: true,
      opacity: 0.52,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI * 0.42;
    ringMesh.rotation.y = Math.PI * 0.14;
    earthGroup.add(ringMesh);

    const satGroup = new THREE.Group();
    const satCoreGeo = new THREE.BoxGeometry(0.024, 0.024, 0.024);
    const satCoreMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.9,
      metalness: 0.9,
      roughness: 0.2,
    });
    const satCore = new THREE.Mesh(satCoreGeo, satCoreMat);
    const satWingGeo = new THREE.BoxGeometry(0.075, 0.004, 0.018);
    const satWingMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.3,
    });
    const satWing = new THREE.Mesh(satWingGeo, satWingMat);
    satGroup.add(satCore, satWing);
    satGroup.position.set(1.24, 0, 0);
    ringMesh.add(satGroup);

    const ring2Geo = new THREE.TorusGeometry(1.32, 0.0025, 8, 96);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.4,
      roughness: 0.35,
      metalness: 0.85,
      transparent: true,
      opacity: 0.28,
    });
    const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2Mesh.rotation.x = -Math.PI * 0.34;
    ring2Mesh.rotation.y = Math.PI * 0.25;
    earthGroup.add(ring2Mesh);

    // Instanced illuminated Indian city network beacons (all 10 supported cities)
    const cityNodeGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.036, 10);
    const cityNodeMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.4,
    });
    const cityNodes = new THREE.InstancedMesh(
      cityNodeGeo,
      cityNodeMat,
      INDIAN_CITIES.length
    );
    const _instPos = new THREE.Vector3();
    const _instUp = new THREE.Vector3(0, 1, 0);
    const _instNormal = new THREE.Vector3();
    const _instQuat = new THREE.Quaternion();
    const _instScale = new THREE.Vector3(1, 1, 1);
    const _instMat = new THREE.Matrix4();
    INDIAN_CITIES.forEach((c, idx) => {
      latLngToVec3(c.lat, c.lng, 1.015, _instPos);
      _instNormal.copy(_instPos).normalize();
      _instQuat.setFromUnitVectors(_instUp, _instNormal);
      _instMat.compose(_instPos, _instQuat, _instScale);
      cityNodes.setMatrixAt(idx, _instMat);
    });
    cityNodes.instanceMatrix.needsUpdate = true;
    cityNodes.computeBoundingSphere();
    earthGroup.add(cityNodes);

    // Active Selected City Composite Target Beacon (Ring Halo + Surface Orb + Telemetry Spire)
    const pinGroup = new THREE.Group();
    const pinBaseGeo = new THREE.RingGeometry(0.03, 0.05, 28);
    const pinBaseMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const pinBase = new THREE.Mesh(pinBaseGeo, pinBaseMat);
    const pinCoreGeo = new THREE.SphereGeometry(0.022, 14, 14);
    const pinCoreMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const pinCore = new THREE.Mesh(pinCoreGeo, pinCoreMat);
    const pinSpireGeo = new THREE.CylinderGeometry(0.004, 0.01, 0.085, 8);
    pinSpireGeo.rotateX(Math.PI / 2);
    pinSpireGeo.translate(0, 0, 0.042);
    const pinSpireMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.85,
    });
    const pinSpire = new THREE.Mesh(pinSpireGeo, pinSpireMat);
    pinGroup.add(pinBase, pinCore, pinSpire);
    earthGroup.add(pinGroup);

    // Moving urban aerosol / smog particle field
    const PARTICLE_COUNT = 260;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const angles = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const latitudes = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const isSouthAsiaBand = i < PARTICLE_COUNT * 0.65;
      const latRad = isSouthAsiaBand
        ? THREE.MathUtils.degToRad(6 + Math.random() * 36)
        : THREE.MathUtils.degToRad(-60 + Math.random() * 120);
      const lonRad = isSouthAsiaBand
        ? THREE.MathUtils.degToRad(58 + Math.random() * 52)
        : Math.random() * Math.PI * 2;
      const r = 1.055 + Math.random() * 0.14;

      latitudes[i] = latRad;
      angles[i] = lonRad;
      radii[i] = r;
      speeds[i] = 0.07 + Math.random() * 0.14;

      positions[i * 3] = r * Math.cos(latRad) * Math.cos(lonRad);
      positions[i * 3 + 1] = r * Math.sin(latRad);
      positions[i * 3 + 2] = r * Math.cos(latRad) * Math.sin(lonRad);
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.025,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    earthGroup.add(particles);

    // Focus initially on India / selected city
    const targetRotY = { value: getFocusRotationForLng(stateRef.current.lng) };
    const targetRotX = {
      value: THREE.MathUtils.clamp(
        THREE.MathUtils.degToRad(stateRef.current.lat) * 0.85,
        -0.55,
        0.75
      ),
    };
    earthGroup.rotation.y = targetRotY.value;
    earthGroup.rotation.x = targetRotX.value;

    resetTriggerRef.current = () => {
      targetRotY.value = getFocusRotationForLng(stateRef.current.lng);
      targetRotX.value = THREE.MathUtils.clamp(
        THREE.MathUtils.degToRad(stateRef.current.lat) * 0.85,
        -0.55,
        0.75
      );
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      targetRotY.value += dx * 0.008;
      targetRotX.value = THREE.MathUtils.clamp(
        targetRotX.value + dy * 0.006,
        -0.75,
        0.9
      );
    };
    const onPointerUp = () => {
      dragging = false;
    };

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    let resizeRafId = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => {
        if (!container || disposed) return;
        const w = container.clientWidth || 480;
        const h = container.clientHeight || 360;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      });
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Pre-allocated scratch helpers (zero GC inside render loop)
    const _pinPos = new THREE.Vector3();
    const _pinNormal = new THREE.Vector3();
    const _pinWorldTarget = new THREE.Vector3();
    const _targetColor = new THREE.Color();
    const _cyanColor = new THREE.Color(0x22d3ee);
    const _atmoMix = new THREE.Color();
    let lastTickMs = performance.now();
    let rafId = 0;
    let timerId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 80);
        }
      };
      timerId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const nowTickMs = performance.now();
      const dt = Math.min((nowTickMs - lastTickMs) / 1000, 0.1);
      lastTickMs = nowTickMs;
      const {
        lat: curLat,
        lng: curLng,
        aqi: curAqi,
        paused: isPaused,
      } = stateRef.current;

      // Update focused city composite beacon position & outward orientation
      latLngToVec3(curLat, curLng, 1.016, _pinPos);
      pinGroup.position.copy(_pinPos);
      _pinNormal.copy(_pinPos).normalize();
      _pinWorldTarget.copy(_pinNormal).multiplyScalar(2);
      pinGroup.localToWorld(_pinWorldTarget);
      pinGroup.lookAt(_pinWorldTarget);

      // Tint particles, pin & atmospheric rim softly with AQI category color
      const meta = classifyCpcbAqi(curAqi);
      _targetColor.set(meta.accentHex);
      particleMat.color.lerp(_targetColor, 0.12);
      pinBaseMat.color.lerp(_targetColor, 0.16);
      pinCoreMat.color.lerp(_targetColor, 0.16);
      pinSpireMat.color.lerp(_targetColor, 0.12);
      _atmoMix.copy(_cyanColor).lerp(_targetColor, 0.24);
      atmoShaderMat.uniforms.uGlowColor.value.lerp(_atmoMix, 0.08);

      if (!prefersReducedMotion && !isPaused) {
        if (!dragging) {
          targetRotY.value += dt * 0.065;
        }
        cloudMesh.rotation.y += dt * 0.032;
        ringMesh.rotation.z += dt * 0.14;
        ring2Mesh.rotation.z -= dt * 0.08;

        const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const speedMultiplier = curAqi && curAqi > 200 ? 1.3 : 0.9;
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          angles[i] += speeds[i] * speedMultiplier * dt;
          const r = radii[i];
          const la = latitudes[i];
          const a = angles[i];
          arr[i * 3] = r * Math.cos(la) * Math.cos(a);
          arr[i * 3 + 1] = r * Math.sin(la);
          arr[i * 3 + 2] = r * Math.cos(la) * Math.sin(a);
        }
        posAttr.needsUpdate = true;
      }

      earthGroup.rotation.y = THREE.MathUtils.damp(
        earthGroup.rotation.y,
        targetRotY.value,
        6,
        dt
      );
      earthGroup.rotation.x = THREE.MathUtils.damp(
        earthGroup.rotation.x,
        targetRotX.value,
        6,
        dt
      );

      renderer.render(scene, camera);

      if (prefersReducedMotion) return;
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
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(resizeRafId);
      clearTimeout(timerId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      starGeo.dispose();
      starMat.dispose();
      globeGeo.dispose();
      globeMat.dispose();
      albedoMap.dispose();
      emissiveMap.dispose();
      roughnessMap.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      cloudMap.dispose();
      atmoGeo.dispose();
      atmoShaderMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      satCoreGeo.dispose();
      satCoreMat.dispose();
      satWingGeo.dispose();
      satWingMat.dispose();
      ring2Geo.dispose();
      ring2Mat.dispose();
      cityNodeGeo.dispose();
      cityNodeMat.dispose();
      pinBaseGeo.dispose();
      pinBaseMat.dispose();
      pinCoreGeo.dispose();
      pinCoreMat.dispose();
      pinSpireGeo.dispose();
      pinSpireMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  // Smoothly recenter globe when active city coordinates change
  useEffect(() => {
    resetTriggerRef.current?.();
  }, [lat, lng]);

  if (webglFailed) {
    return (
      <div
        data-testid="earth-canvas"
        data-city={city}
        data-aqi={aqi ?? 'unavailable'}
        className="w-full h-full flex flex-col items-center justify-center rounded-xl border border-slate-800/80 bg-[#070E1E] p-6 text-center"
      >
        <div className="w-28 h-28 rounded-full border border-cyan-500/40 bg-gradient-to-br from-cyan-950/60 via-slate-900 to-emerald-950/50 flex items-center justify-center mb-3">
          <span className="font-mono text-xs text-cyan-300 tabular-nums">
            {lat.toFixed(2)}°N, {lng.toFixed(2)}°E
          </span>
        </div>
        <p className="text-sm font-medium text-slate-200">
          {city} Atmospheric View
        </p>
        <p className="text-xs text-slate-400 mt-1">
          2D fallback active (WebGL context unavailable)
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full min-h-[300px] lg:min-h-[340px] rounded-xl overflow-hidden border border-cyan-500/20 bg-[#050A17] shadow-[inset_0_1px_0_rgba(103,232,249,0.08)]"
      data-testid="earth-canvas"
      data-city={city}
      data-aqi={aqi ?? 'unavailable'}
    >
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Minimal Top-Left Coordinate Readout (solid translucent backing, never backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-[#060C1A]/90 border border-cyan-500/25 text-xs text-slate-300 flex items-center gap-2">
        <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="font-medium text-slate-100">{city}</span>
        <span aria-hidden="true" className="text-slate-600">
          ·
        </span>
        <span className="font-mono tabular-nums text-cyan-300">
          {lat.toFixed(2)}°N {lng.toFixed(2)}°E
        </span>
      </div>

      {/* Compact Bottom Dock Controls (zero center occlusion, solid translucent backing) */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#060C1A]/92 border border-slate-800/90 text-[11px] text-slate-300">
        <span className="truncate">
          Drag globe · CPCB Tier:{' '}
          <strong className="text-slate-100 font-medium">{category}</strong>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Resume globe rotation' : 'Pause globe rotation'}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-700/90 bg-slate-900/90 text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors"
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
            onClick={() => resetTriggerRef.current?.()}
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
