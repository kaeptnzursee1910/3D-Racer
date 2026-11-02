// Umgebung: Himmel, Licht, Nebel, Terrain, Wasser, Landschaft, Wetter
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, smoothstep, Noise2D, rng, mergeGeometries, mat4, softParticleTexture, canvasTexture, makeCanvas } from './utils.js';
import * as TX from './textures.js';
import { buildTrackside } from './trackside.js';

export const THEMES = {
  coast: {
    skyTop: '#3d6db5', skyHorizon: '#ffb98e', skyBottom: '#d9a07c',
    sunDir: [0.35, 0.17, 1], sunColor: '#ffd2a1', sunIntensity: 2.7,
    hemiSky: '#a9c8ff', hemiGround: '#a07a56', hemiIntensity: 1.0,
    fog: '#f4bf9a', fogNear: 160, fogFar: 1500,
    asphalt: '#4b4b52', ground: '#7a9a45', groundVar: 36, shoulder: '#6f8f3c',
    terrainColors: ['#6f8f3c', '#93a552', '#d8c48a'],
    wall: 'stripes', curbA: '#d8262b', curbB: '#f2f2f2',
    clouds: 0.55, stars: 0, exposure: 1.0, night: false, bloom: [0.4, 0.92, 0.5],
  },
  canyon: {
    skyTop: '#2d78d6', skyHorizon: '#eccaa4', skyBottom: '#c98a5c',
    sunDir: [0.45, 0.78, -0.35], sunColor: '#fff0d4', sunIntensity: 3.0,
    hemiSky: '#bcd7ff', hemiGround: '#b8693c', hemiIntensity: 1.05,
    fog: '#e9cbaa', fogNear: 220, fogFar: 1700,
    asphalt: '#57534f', ground: '#c2774a', groundVar: 30, shoulder: '#c98d5c',
    terrainColors: ['#b8683b', '#cf8a55', '#8f4a2b'],
    wall: 'concrete', curbA: '#e2a12a', curbB: '#f2f2f2',
    clouds: 0.25, stars: 0, exposure: 0.95, night: false, bloom: [0.3, 0.95, 0.5],
  },
  city: {
    skyTop: '#04050d', skyHorizon: '#3a1f5c', skyBottom: '#0a0a12',
    sunDir: [-0.3, 0.65, 0.45], sunColor: '#9fb3ff', sunIntensity: 0.55,
    hemiSky: '#6a78c0', hemiGround: '#2a2240', hemiIntensity: 1.5,
    fog: '#22163a', fogNear: 120, fogFar: 950,
    asphalt: '#303038', ground: '#26272d', groundVar: 16, shoulder: '#3a3b42',
    terrainColors: ['#26272d', '#2c2d34', '#202127'],
    wall: 'neon', curbA: '#18d6ff', curbB: '#f2f2f2',
    clouds: 0.0, stars: 1, exposure: 1.25, night: true, bloom: [0.85, 0.55, 0.6],
  },
  alps: {
    skyTop: '#4f93e6', skyHorizon: '#dce9f6', skyBottom: '#c9d8e8',
    sunDir: [-0.5, 0.42, -0.6], sunColor: '#fff3e2', sunIntensity: 2.6,
    hemiSky: '#cfe2ff', hemiGround: '#e8eef5', hemiIntensity: 1.0,
    fog: '#e2ecf6', fogNear: 160, fogFar: 1400,
    asphalt: '#3f4248', ground: '#e9eff6', groundVar: 14, shoulder: '#e4ebf3',
    terrainColors: ['#eef3f9', '#dfe7f0', '#6f6a66'],
    wall: 'bluewhite', curbA: '#1f58b8', curbB: '#f2f2f2',
    clouds: 0.45, stars: 0, exposure: 0.9, night: false, bloom: [0.3, 0.95, 0.5],
  },
};

const SKY_VS = `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FS = `
uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor;
uniform vec3 sunColor; uniform vec3 sunDir; uniform float time; uniform float clouds; uniform float stars;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.07; a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizonColor, topColor, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizonColor, bottomColor, pow(clamp(-h,0.0,1.0), 0.35));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 60.0) * 0.35 + pow(sd, 6.0) * 0.18);
  if (clouds > 0.0 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv);
    float c = smoothstep(0.52 - clouds * 0.25, 0.85, n) * smoothstep(0.0, 0.18, h);
    vec3 cc = mix(horizonColor * 1.05, vec3(1.0), 0.55) + sunColor * pow(sd, 4.0) * 0.5;
    col = mix(col, cc, c * 0.85);
  }
  if (stars > 0.0 && h > 0.0) {
    vec2 sp = d.xz / (h + 0.35) * 140.0;
    float s = step(0.9965, hash(floor(sp)));
    float tw = 0.6 + 0.4 * sin(time * 2.0 + hash(floor(sp) + 3.0) * 30.0);
    col += vec3(s * tw * stars) * smoothstep(0.02, 0.3, h);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const WATER_VS = `
#include <fog_pars_vertex>
uniform float time;
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += sin(wp.x * 0.05 + time * 1.1) * 0.22 + sin(wp.z * 0.07 + time * 0.8) * 0.18;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = `
#include <fog_pars_fragment>
uniform vec3 deepColor; uniform vec3 skyColor; uniform vec3 sunColor; uniform vec3 sunDir; uniform float time;
varying vec3 vWorld;
void main(){
  vec2 p = vWorld.xz; float t = time;
  float dx = cos(p.x * 0.05 + t * 1.1) * 0.011 + sin(p.x * 0.6 + p.y * 0.3 + t * 2.1) * 0.05 + sin(p.x * 1.7 - t * 3.1) * 0.02;
  float dz = cos(p.y * 0.07 + t * 0.8) * 0.0126 + cos(p.y * 0.5 - p.x * 0.2 + t * 1.7) * 0.05 + cos(p.y * 1.9 + t * 2.7) * 0.02;
  vec3 n = normalize(vec3(-dx, 1.0, -dz));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 col = mix(deepColor, skyColor, clamp(fres * 0.9 + 0.08, 0.0, 1.0));
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(sunDir)), 0.0), 140.0) * 3.0 + pow(max(dot(r, normalize(sunDir)), 0.0), 12.0) * 0.15;
  col += sunColor * spec;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Environment {
  constructor(renderer, scene, track, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.track = track;
    this.q = quality;
    this.theme = THEMES[track.def.theme] || THEMES.coast;
    this.themeId = track.def.theme;
    this.noise = new Noise2D(1234 + track.N);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.time = 0;
    this.aniso = Math.min(quality.level >= 2 ? 8 : 4, renderer.capabilities.getMaxAnisotropy());
    this.updatables = [];
    this.blockers = [];
  }

  build() {
    const th = this.theme;
    this.renderer.toneMappingExposure = th.exposure;
    this.sunDir = new THREE.Vector3(...th.sunDir).normalize();
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar * (this.q.level === 0 ? 0.8 : 1));
    this.scene.background = new THREE.Color(th.fog);
    this.buildSky();
    this.buildLights();
    this.buildTrackMeshes();
    this.buildTerrain();
    this.buildEnvMap();
    this.buildCommonScenery();
    this.trackside = buildTrackside(this);
    this.registerBlockers();
    const fn = {
      coast: () => this.buildCoast(),
      canyon: () => this.buildCanyon(),
      city: () => this.buildCity(),
      alps: () => this.buildAlps(),
    }[this.themeId];
    if (fn) fn();
  }

  // ---------------------------------------------------------------------
  buildSky() {
    const th = this.theme;
    this.skyUniforms = {
      topColor: { value: new THREE.Color(th.skyTop) },
      horizonColor: { value: new THREE.Color(th.skyHorizon) },
      bottomColor: { value: new THREE.Color(th.skyBottom) },
      sunColor: { value: new THREE.Color(th.sunColor) },
      sunDir: { value: this.sunDir.clone() },
      time: { value: 0 },
      clouds: { value: th.clouds },
      stars: { value: th.stars },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.root.add(this.sky);
  }

  buildLights() {
    const th = this.theme;
    this.hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity);
    this.root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(th.sunColor, th.sunIntensity);
    this.sun.position.copy(this.sunDir).multiplyScalar(200);
    if (this.q.shadows) {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(this.q.shadowSize, this.q.shadowSize);
      const r = this.q.shadowRange;
      s.camera.left = -r;
      s.camera.right = r;
      s.camera.top = r;
      s.camera.bottom = -r;
      s.camera.near = 10;
      s.camera.far = 500;
      s.bias = -0.0004;
      s.normalBias = 0.04;
    }
    this.root.add(this.sun);
    this.root.add(this.sun.target);
    if (!this.theme.night) this.buildFlare();
  }

  buildEnvMap() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const sc = new THREE.Scene();
    const sky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    sc.add(sky);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1500, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(this.theme.terrainColors[0]).multiplyScalar(this.theme.night ? 0.3 : 0.6) })
    );
    ground.position.y = -20;
    sc.add(ground);
    if (this.theme.night) {
      // Leuchtende "Fenster" für Spiegelungen in der Stadt
      const r = rng(4);
      const cols = [0xff2bd6, 0x29e3ff, 0xffc36b, 0x8f7bff];
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 20 + r() * 50), new THREE.MeshBasicMaterial({ color: cols[i % 4], side: THREE.DoubleSide }));
        const a = r() * Math.PI * 2;
        m.position.set(Math.cos(a) * 300, 10 + r() * 60, Math.sin(a) * 300);
        m.lookAt(0, m.position.y, 0);
        sc.add(m);
      }
    }
    const rt = pm.fromScene(sc, 0.02, 1, 5000);
    this.envMap = rt.texture;
    this.envRT = rt;
    this.scene.environment = this.envMap;
    ground.geometry.dispose();
    ground.material.dispose();
    pm.dispose();
  }

  // ---------------------------------------------------------------------
  buildTrackMeshes() {
    const th = this.theme;
    const roadTex = TX.roadTexture({ asphalt: th.asphalt, centerLine: this.themeId === 'city' ? '#ffd34d' : '#efefef' }, this.aniso, this.q.level >= 2);
    const shoulderTex = TX.groundTexture({ ground: th.shoulder, groundVar: th.groundVar }, this.aniso, 21);
    const wallTex = TX.wallTexture(th.wall, this.aniso);
    const StdMat = this.q.level === 0 ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    const roadMat = new StdMat({ map: roadTex });
    if (roadMat.isMeshStandardMaterial) {
      const { normal, rough } = TX.asphaltMaps(this.aniso);
      roadMat.normalMap = normal;
      roadMat.normalScale.set(th.night ? 0.18 : 0.35, th.night ? 0.18 : 0.35);
      roadMat.roughnessMap = rough;
      roadMat.roughness = th.night ? 0.72 : 1.0;
      roadMat.metalness = 0.0;
      roadMat.envMapIntensity = th.night ? 0.9 : 0.35;
    }
    const mats = {
      road: roadMat,
      shoulder: new THREE.MeshLambertMaterial({ map: shoulderTex }),
      curb: new THREE.MeshLambertMaterial({ vertexColors: true }),
      wall: new THREE.MeshLambertMaterial({ map: wallTex }),
      wallTop: new THREE.MeshLambertMaterial({ color: th.wall === 'neon' ? '#22232b' : '#cfcfcf' }),
      startLine: new THREE.MeshLambertMaterial({ map: TX.checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      gridMark: new THREE.MeshBasicMaterial({ color: '#e8e8e8', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
    mats.curb.userData.colorA = th.curbA;
    mats.curb.userData.colorB = th.curbB;
    if (th.wall === 'neon') {
      mats.neon = new THREE.MeshBasicMaterial({ map: TX.neonStripTexture(), fog: true });
    }
    this.trackGroup = this.track.buildMeshes(mats);
    this.root.add(this.trackGroup);
    this.buildGantry();
  }

  buildGantry() {
    const tr = this.track;
    const p = tr.pointAt(0, 0);
    const g = new THREE.Group();
    const span = tr.wallDist + 1.2;
    const metal = new THREE.MeshStandardMaterial({ color: '#2b2f38', metalness: 0.7, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), metal);
      pil.position.set(s * span, 4.5, 0);
      pil.castShadow = true;
      g.add(pil);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1, 1.6, 1.1), metal);
    beam.position.y = 8.4;
    beam.castShadow = true;
    g.add(beam);
    const bannerMat = new THREE.MeshBasicMaterial({ map: TX.bannerTexture('VELOX ✦ START · ZIEL'), fog: true });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 2, 1.4), bannerMat);
      b.position.set(0, 8.4, s * 0.56);
      if (s < 0) b.rotation.y = Math.PI;
      g.add(b);
    }
    // Startampel
    this.startLights = [];
    const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 1.3, 0.5), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 }));
    panel.position.set(0, 6.8, -0.4);
    g.add(panel);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshStandardMaterial({ color: '#220000', emissive: '#ff1a1a', emissiveIntensity: 0 });
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), m);
      l.position.set(-2.6 + i * 1.3, 6.8, -0.66);
      l.rotation.y = Math.PI;
      g.add(l);
      this.startLights.push(m);
    }
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.heading;
    this.root.add(g);
  }

  setStartLights(n, go = false) {
    if (!this.startLights) return;
    this.startLights.forEach((m, i) => {
      if (go) {
        m.emissive.set('#22ff44');
        m.emissiveIntensity = 2.2;
      } else {
        m.emissive.set('#ff1a1a');
        m.emissiveIntensity = i < n ? 2.6 : 0;
      }
    });
  }

  // ---------------------------------------------------------------------
  baseHeight(x, z) {
    const n = this.noise;
    const b = this.bounds;
    switch (this.themeId) {
      case 'coast': {
        let h = 4 + n.fbm(x / 170, z / 170, 4) * 34 - 12;
        h += smoothstep(0, 500, b.minZ - z) * 90; // Hügel im Landesinneren
        const sea = smoothstep(b.maxZ + 25, b.maxZ + 140, z);
        h = lerp(h, -9, sea);
        return h;
      }
      case 'canyon': {
        let v = n.fbm(x / 230, z / 230, 5);
        let h = Math.pow(v, 1.5) * 190;
        const terr = Math.floor(h / 14) * 14;
        h = lerp(h, terr, 0.65);
        const r = Math.hypot(x - b.cx, z - b.cz);
        h += smoothstep(350, 900, r) * 120;
        return h - 10;
      }
      case 'alps': {
        const v = n.fbm(x / 260, z / 260, 5);
        const ridge = 1 - Math.abs(2 * n.fbm(x / 420 + 7, z / 420 + 3, 4) - 1);
        let h = v * 70 + ridge * ridge * 140;
        const r = Math.hypot(x - b.cx, z - b.cz);
        h += smoothstep(300, 1000, r) * 260;
        return h - 30;
      }
      default:
        return -0.3;
    }
  }

  buildTerrain() {
    const tr = this.track;
    const b = (this.bounds = tr.bounds());
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 1500;
    const seg = this.q.terrainSeg;
    const cs = size / seg;
    const x0 = b.cx - size / 2, z0 = b.cz - size / 2;
    const n1 = seg + 1;
    const minD = new Float32Array(n1 * n1).fill(1e9);
    const nearY = new Float32Array(n1 * n1);
    // Abstandsfeld durch "Stempeln" der Streckenpunkte
    const R = 110;
    const rc = Math.ceil(R / cs);
    for (let i = 0; i < tr.N; i += 1) {
      const px = tr.cx[i], pz = tr.cz[i];
      const ix = Math.round((px - x0) / cs), iz = Math.round((pz - z0) / cs);
      for (let a = -rc; a <= rc; a++) {
        const gx = ix + a;
        if (gx < 0 || gx > seg) continue;
        for (let c = -rc; c <= rc; c++) {
          const gz = iz + c;
          if (gz < 0 || gz > seg) continue;
          const vx = x0 + gx * cs, vz = z0 + gz * cs;
          const dx = vx - px, dz = vz - pz;
          const d = Math.sqrt(dx * dx + dz * dz);
          const k = gz * n1 + gx;
          if (d < minD[k]) {
            minD[k] = d;
            const lat = clamp(dx * tr.rx[i] + dz * tr.rz[i], -tr.wallDist, tr.wallDist);
            nearY[k] = tr.cy[i] + lat * tr.bank[i] - Math.abs(tr.bank[i]) * tr.halfWidth;
          }
        }
      }
    }
    // flache Zone neben der Strecke mindestens eine Gitterzelle breit, damit kein Dreieck über die Mauer ragt
    const inner = tr.wallDist + 2 + cs * 1.25;
    const blend = this.themeId === 'city' ? 5 : this.themeId === 'canyon' ? 80 : 110;
    const heights = new Float32Array(n1 * n1);
    const pos = new Float32Array(n1 * n1 * 3);
    const col = new Float32Array(n1 * n1 * 3);
    const uv = new Float32Array(n1 * n1 * 2);
    const tc = this.theme.terrainColors.map((c) => new THREE.Color(c));
    const tmp = new THREE.Color();
    for (let gz = 0; gz <= seg; gz++)
      for (let gx = 0; gx <= seg; gx++) {
        const k = gz * n1 + gx;
        const x = x0 + gx * cs, z = z0 + gz * cs;
        const base = this.baseHeight(x, z);
        let h = base;
        const d = minD[k];
        if (d < inner + blend) {
          const t = smoothstep(inner, inner + blend, d);
          const near = nearY[k] - 0.9;
          h = lerp(near, Math.max(base, this.themeId === 'coast' ? -9 : near - 40), t);
          if (d < inner) h = near;
        }
        heights[k] = h;
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        uv[k * 2] = x / 14;
        uv[k * 2 + 1] = z / 14;
        // Färbung
        const nv = this.noise.noise(x / 40, z / 40);
        if (this.themeId === 'coast') {
          const beach = smoothstep(4, 0.5, h);
          tmp.copy(tc[0]).lerp(tc[1], nv).lerp(tc[2], beach);
        } else if (this.themeId === 'canyon') {
          const strata = 0.5 + 0.5 * Math.sin(h * 0.35 + nv * 2);
          tmp.copy(tc[0]).lerp(tc[1], strata * 0.7).lerp(tc[2], smoothstep(30, 120, h) * 0.5);
        } else if (this.themeId === 'alps') {
          tmp.copy(tc[0]).lerp(tc[1], nv);
        } else {
          tmp.copy(tc[0]).lerp(tc[1], nv);
        }
        col[k * 3] = tmp.r;
        col[k * 3 + 1] = tmp.g;
        col[k * 3 + 2] = tmp.b;
      }
    // Felsfarbe an steilen Hängen (Alpen)
    if (this.themeId === 'alps' || this.themeId === 'canyon') {
      const rock = this.themeId === 'alps' ? tc[2] : new THREE.Color('#7d3f24');
      for (let gz = 1; gz < seg; gz++)
        for (let gx = 1; gx < seg; gx++) {
          const k = gz * n1 + gx;
          const sx = (heights[k + 1] - heights[k - 1]) / (2 * cs);
          const sz = (heights[k + n1] - heights[k - n1]) / (2 * cs);
          const steep = smoothstep(0.55, 1.1, Math.hypot(sx, sz));
          if (steep > 0) {
            tmp.setRGB(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]).lerp(rock, steep * 0.85);
            col[k * 3] = tmp.r;
            col[k * 3 + 1] = tmp.g;
            col[k * 3 + 2] = tmp.b;
          }
        }
    }
    const idx = new Uint32Array(seg * seg * 6);
    let o = 0;
    for (let gz = 0; gz < seg; gz++)
      for (let gx = 0; gx < seg; gx++) {
        const a = gz * n1 + gx, bb = a + 1, c = a + n1, d = c + 1;
        idx[o++] = a; idx[o++] = c; idx[o++] = bb;
        idx[o++] = bb; idx[o++] = c; idx[o++] = d;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const tex = TX.groundTexture({ ground: '#d0d0d0', groundVar: 40 }, this.aniso, 31);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }));
    m.receiveShadow = this.q.level >= 2;
    this.root.add(m);
    this.terrain = { heights, x0, z0, cs, seg, n1 };
  }

  heightAt(x, z) {
    const t = this.terrain;
    const fx = (x - t.x0) / t.cs, fz = (z - t.z0) / t.cs;
    const ix = clamp(Math.floor(fx), 0, t.seg - 1), iz = clamp(Math.floor(fz), 0, t.seg - 1);
    const u = clamp(fx - ix, 0, 1), v = clamp(fz - iz, 0, 1);
    const k = iz * t.n1 + ix;
    const h = t.heights;
    return lerp(lerp(h[k], h[k + 1], u), lerp(h[k + t.n1], h[k + t.n1 + 1], u), v);
  }

  // Zufällige Platzierung abseits der Strecke
  scatter(count, minD, maxD, seed, cb, area = 0) {
    if (!area) area = Math.max(this.bounds.maxX - this.bounds.minX, this.bounds.maxZ - this.bounds.minZ) + 500;
    const r = rng(seed);
    const b = this.bounds;
    const tr = this.track;
    let placed = 0;
    const tmp = {};
    for (let a = 0; a < count * 8 && placed < count; a++) {
      const x = b.cx + (r() - 0.5) * area, z = b.cz + (r() - 0.5) * area;
      const nn = tr.nearest(x, z, Math.min(maxD, 90), tmp);
      const d = nn.d;
      if (d < minD) continue;
      if (maxD < 90 && d > maxD) continue;
      if (this.isBlocked(x, z)) continue;
      const y = this.heightAt(x, z);
      if (cb(x, y, z, d, r) !== false) placed++;
    }
    return placed;
  }

  instanced(geo, mat, list, { shadow = true, receive = false } = {}) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const col = new THREE.Color();
    list.forEach((it, i) => {
      m.setMatrixAt(i, mat4(it.x, it.y, it.z, it.rx || 0, it.ry || 0, it.rz || 0, it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1));
      col.set(it.color || '#ffffff');
      m.setColorAt(i, col);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = shadow && this.q.shadows;
    m.receiveShadow = receive;
    m.computeBoundingSphere();
    this.root.add(m);
    return m;
  }

  // ---------------------------------------------------------------------
  buildCommonScenery() {
    const tr = this.track;
    // Tribüne am Start
    const gs = this.buildGrandstand();
    const p = tr.pointAt(-6, -(tr.wallDist + 9));
    gs.position.set(p.x, p.y - 0.6, p.z);
    gs.rotation.y = p.heading - Math.PI / 2;
    this.root.add(gs);

    // Werbebanden an Geraden
    const ads = [];
    for (let i = 0; i < TX.AD_COUNT; i++) ads.push(new THREE.MeshLambertMaterial({ map: TX.adTexture(i) }));
    const post = new THREE.MeshLambertMaterial({ color: '#555a63' });
    const boardGeo = new THREE.PlaneGeometry(11, 2.6);
    const postGeo = new THREE.BoxGeometry(0.25, 3.4, 0.25);
    let ai = 0;
    const count = 22;
    for (let i = 0; i < count; i++) {
      const along = (tr.length * (i + 0.5)) / count;
      if (along > tr.length - 200 || along < 70) continue;
      const idx = tr.idxAt(along);
      const side = Math.abs(tr.k[idx]) > 1 / 300 ? -Math.sign(tr.k[idx]) : i % 2 ? 1 : -1;
      const q = tr.pointAt(along, side * (tr.wallDist + 2.2));
      const g = new THREE.Group();
      const board = new THREE.Mesh(boardGeo, ads[ai++ % ads.length]);
      board.position.y = 3.2;
      g.add(board);
      for (const sx of [-4.5, 4.5]) {
        const pp = new THREE.Mesh(postGeo, post);
        pp.position.set(sx, 1.4, -0.15);
        g.add(pp);
      }
      g.position.set(q.x, q.y - 0.3, q.z);
      g.rotation.y = q.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.traverse((o) => { if (o.isMesh) o.castShadow = this.q.shadows; });
      this.root.add(g);
    }
  }

  buildGrandstand(len = 56) {
    const g = new THREE.Group();
    const crowd = new THREE.MeshLambertMaterial({ map: TX.crowdTexture() });
    crowd.map.repeat.set(6, 1);
    const conc = new THREE.MeshLambertMaterial({ color: '#9aa0a8' });
    const L = len;
    for (let i = 0; i < 6; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(L, 1.1, 2), [conc, conc, conc, conc, crowd, conc]);
      step.position.set(0, 0.55 + i * 1.1, -i * 2);
      g.add(step);
    }
    const roofMat = new THREE.MeshStandardMaterial({ color: '#e8e8ec', metalness: 0.3, roughness: 0.6, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 2, 0.3, 14), roofMat);
    roof.position.set(0, 10.5, -5.5);
    roof.rotation.x = -0.12;
    g.add(roof);
    for (let i = -2; i <= 2; i++) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10.5, 0.4), conc);
      pil.position.set((i * L) / 4.4, 5.2, -11.5);
      g.add(pil);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(L, 8, 0.4), conc);
    back.position.set(0, 4, -12);
    g.add(back);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = this.q.shadows;
        o.receiveShadow = this.q.shadows;
      }
    });
    return g;
  }

  // ---------------------------------------------------------------------
  palmGeometry() {
    const parts = [];
    const trunkC = '#8a6a48';
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.CylinderGeometry(0.22 - i * 0.02, 0.26 - i * 0.02, 1.9, 6);
      parts.push({ geo: seg, matrix: mat4(i * i * 0.06, 0.95 + i * 1.8, 0, 0, 0, -0.04 * i), color: i % 2 ? trunkC : '#7a5c3c' });
    }
    const top = new THREE.Vector3(16 * 0.06, 9.4, 0);
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.ConeGeometry(0.7, 4.6, 4, 1);
      leaf.scale(1, 1, 0.18);
      leaf.translate(0, 2.3, 0);
      const a = (i / 8) * Math.PI * 2;
      parts.push({ geo: leaf, matrix: mat4(top.x, top.y, top.z, 1.9 + (i % 2) * 0.25, a, 0), color: i % 2 ? '#3f7a2c' : '#4f8c34' });
    }
    return mergeGeometries(parts);
  }

  pineGeometry(snow) {
    const parts = [{ geo: new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), matrix: mat4(0, 1.2, 0), color: '#5a3d25' }];
    const tiers = [[3.2, 4.2, 2.2], [2.5, 3.6, 4.4], [1.8, 3.0, 6.3], [1.1, 2.4, 8.0]];
    tiers.forEach(([r, h, y], i) => {
      parts.push({ geo: new THREE.ConeGeometry(r, h, 7), matrix: mat4(0, y + h / 2 - 0.6, 0), color: '#24452c' });
      if (snow) parts.push({ geo: new THREE.ConeGeometry(r * 0.55, h * 0.45, 7), matrix: mat4(0, y + h - 0.95, 0), color: '#f4f8fc' });
    });
    return mergeGeometries(parts);
  }

  rockGeometry(seed = 1, detail = 0) {
    const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
    const p = g.attributes.position;
    const r = rng(seed);
    const map = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!map.has(key)) map.set(key, 0.7 + r() * 0.6);
      const s = map.get(key);
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.75, p.getZ(i) * s);
    }
    g.computeVertexNormals();
    return g;
  }

  cactusGeometry() {
    const c = '#4f7d3a';
    const parts = [
      { geo: new THREE.CylinderGeometry(0.42, 0.48, 5, 8), matrix: mat4(0, 2.5, 0), color: c },
      { geo: new THREE.SphereGeometry(0.42, 8, 6), matrix: mat4(0, 5, 0), color: c },
      { geo: new THREE.CylinderGeometry(0.28, 0.28, 1.4, 7), matrix: mat4(0.8, 2.2, 0, 0, 0, Math.PI / 2), color: c },
      { geo: new THREE.CylinderGeometry(0.28, 0.28, 1.8, 7), matrix: mat4(1.4, 3.0, 0), color: c },
      { geo: new THREE.SphereGeometry(0.28, 7, 5), matrix: mat4(1.4, 3.9, 0), color: c },
      { geo: new THREE.CylinderGeometry(0.25, 0.25, 1.1, 7), matrix: mat4(-0.65, 2.9, 0, 0, 0, Math.PI / 2), color: c },
      { geo: new THREE.CylinderGeometry(0.25, 0.25, 1.3, 7), matrix: mat4(-1.1, 3.5, 0), color: c },
      { geo: new THREE.SphereGeometry(0.25, 7, 5), matrix: mat4(-1.1, 4.15, 0), color: c },
    ];
    return mergeGeometries(parts);
  }

  houseGeometry(wallC, roofC) {
    const roof = new THREE.CylinderGeometry(0.75, 0.75, 1, 3);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, 0.55, 1.1);
    return mergeGeometries([
      { geo: new THREE.BoxGeometry(1, 1, 1), matrix: mat4(0, 0.5, 0), color: wallC },
      { geo: roof, matrix: mat4(0, 1.22, 0, 0, Math.PI / 2, 0, 1.08, 1, 1), color: roofC },
    ]);
  }

  // ---------------------------------------------------------------------
  buildCoast() {
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
    const palms = [];
    this.scatter(this.q.sceneryMul * 170, 13, 75, 11, (x, y, z, d, r) => {
      if (y < 0.8) return false;
      palms.push({ x, y: y - 0.2, z, ry: r() * 6.28, s: 0.8 + r() * 0.5, color: '#ffffff' });
    });
    this.instanced(this.palmGeometry(), vc, palms);

    const bushes = [];
    this.scatter(this.q.sceneryMul * 240, 11, 200, 12, (x, y, z, d, r) => {
      if (y < 1) return false;
      const g = 0.7 + r() * 0.4;
      bushes.push({ x, y: y + 0.2, z, ry: r() * 6, s: 1 + r() * 2.2, color: new THREE.Color(0.35 * g, 0.55 * g, 0.22 * g) });
    });
    this.instanced(this.rockGeometry(3), new THREE.MeshLambertMaterial({ flatShading: true }), bushes, { shadow: false });

    const rocks = [];
    this.scatter(this.q.sceneryMul * 80, 14, 400, 13, (x, y, z, d, r) => {
      rocks.push({ x, y, z, ry: r() * 6, s: 1 + r() * 4, color: '#9a8f86' });
    });
    this.instanced(this.rockGeometry(7), new THREE.MeshLambertMaterial({ flatShading: true }), rocks);

    // Häuser im Landesinneren
    const houses = [];
    this.scatter(this.q.sceneryMul * 45, 30, 400, 14, (x, y, z, d, r) => {
      if (y < 2 || z > this.bounds.maxZ) return false;
      houses.push({ x, y: y - 0.3, z, ry: r() * 6, sx: 8 + r() * 6, sy: 5 + r() * 4, sz: 8 + r() * 5, color: '#ffffff' });
    });
    this.instanced(this.houseGeometry('#f3ead9', '#c4562f'), vc, houses);

    // Meer
    const b = this.bounds;
    this.waterUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deepColor: { value: new THREE.Color('#13506e') },
        skyColor: { value: new THREE.Color('#f2b08a') },
        sunColor: { value: new THREE.Color(this.theme.sunColor) },
        sunDir: { value: this.sunDir.clone() },
      },
    ]);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 2000, 80, 40).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.waterUniforms, vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: true })
    );
    water.position.set(b.cx, -0.4, b.maxZ + 1000);
    this.root.add(water);

    // Leuchtturm
    const lh = new THREE.Group();
    const stripe = new THREE.MeshLambertMaterial({ map: TX.stripeTexture('#f4f4f4', '#cc2a2a', 8) });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 28, 16), stripe);
    tower.position.y = 14;
    lh.add(tower);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3, 12), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
    lamp.position.y = 29.5;
    lh.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.6, 12), new THREE.MeshLambertMaterial({ color: '#2b2b2b' }));
    cap.position.y = 32.3;
    lh.add(cap);
    const lx = b.maxX + 60, lz = b.maxZ + 50;
    lh.position.set(lx, Math.max(0, this.heightAt(lx, lz)), lz);
    lh.traverse((o) => { if (o.isMesh) o.castShadow = this.q.shadows; });
    this.root.add(lh);

    // Segelboote
    const sail = mergeGeometries([
      { geo: new THREE.BoxGeometry(2, 0.8, 6), matrix: mat4(0, 0.4, 0), color: '#f5f5f5' },
      { geo: new THREE.CylinderGeometry(0.08, 0.08, 9, 4), matrix: mat4(0, 5, 0.5), color: '#777' },
      { geo: new THREE.ConeGeometry(2.4, 8, 3), matrix: mat4(0, 5.2, -0.7, 0, 0, 0, 0.02, 1, 0.8), color: '#ffffff' },
    ]);
    const boats = [];
    const rb = rng(9);
    for (let i = 0; i < 9; i++) boats.push({ x: b.minX + rb() * (b.maxX - b.minX + 400) - 200, y: -0.3, z: b.maxZ + 180 + rb() * 600, ry: rb() * 6, s: 1 + rb() * 0.6 });
    this.boats = this.instanced(sail, new THREE.MeshLambertMaterial({ vertexColors: true }), boats, { shadow: false });
  }

  buildCanyon() {
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
    const flat = new THREE.MeshLambertMaterial({ flatShading: true });
    const mesas = [];
    this.scatter(this.q.sceneryMul * 45, 45, 1e9, 21, (x, y, z, d, r) => {
      const h = 25 + r() * 70;
      mesas.push({ x, y: y - 4, z, ry: r() * 6, sx: 14 + r() * 24, sy: h, sz: 14 + r() * 24, color: r() > 0.5 ? '#b5653a' : '#a3552f' });
    });
    const mesaGeo = new THREE.CylinderGeometry(0.85, 1, 1, 7, 3);
    mesaGeo.translate(0, 0.5, 0);
    const mp = mesaGeo.attributes.position;
    const rr = rng(5);
    for (let i = 0; i < mp.count; i++) {
      if (mp.getY(i) > 0.01 && mp.getY(i) < 0.99) {
        const s = 0.85 + rr() * 0.3;
        mp.setX(i, mp.getX(i) * s);
        mp.setZ(i, mp.getZ(i) * s);
      }
    }
    mesaGeo.computeVertexNormals();
    this.instanced(mesaGeo, flat, mesas);

    const cacti = [];
    this.scatter(this.q.sceneryMul * 140, 11, 110, 22, (x, y, z, d, r) => {
      cacti.push({ x, y: y - 0.2, z, ry: r() * 6, s: 0.7 + r() * 0.6 });
    });
    this.instanced(this.cactusGeometry(), vc, cacti);

    const rocks = [];
    this.scatter(this.q.sceneryMul * 200, 11, 300, 23, (x, y, z, d, r) => {
      const c = 0.75 + r() * 0.3;
      rocks.push({ x, y, z, ry: r() * 6, s: 0.6 + r() * 3.5, color: new THREE.Color(0.66 * c, 0.38 * c, 0.24 * c) });
    });
    this.instanced(this.rockGeometry(11), flat, rocks);

    const bushes = [];
    this.scatter(this.q.sceneryMul * 160, 10, 140, 24, (x, y, z, d, r) => {
      bushes.push({ x, y: y + 0.1, z, ry: r() * 6, s: 0.6 + r() * 0.9, color: '#8a7a45' });
    });
    this.instanced(this.rockGeometry(4), flat, bushes, { shadow: false });

    this.buildWeather('dust');
  }

  buildAlps() {
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
    const flat = new THREE.MeshLambertMaterial({ flatShading: true });
    const pines = [];
    this.scatter(this.q.sceneryMul * 480, 12, 260, 31, (x, y, z, d, r) => {
      const t = 0.85 + r() * 0.25;
      pines.push({ x, y: y - 0.3, z, ry: r() * 6, s: 0.8 + r() * 0.8, color: new THREE.Color(t, t, t) });
    }, 1500);
    this.instanced(this.pineGeometry(true), vc, pines);

    const rocks = [];
    this.scatter(this.q.sceneryMul * 90, 12, 400, 32, (x, y, z, d, r) => {
      rocks.push({ x, y, z, ry: r() * 6, s: 1 + r() * 4, color: '#7a7570' });
    });
    this.instanced(this.rockGeometry(9), flat, rocks);

    const cabins = [];
    this.scatter(this.q.sceneryMul * 22, 25, 220, 33, (x, y, z, d, r) => {
      cabins.push({ x, y: y - 0.4, z, ry: r() * 6, sx: 7 + r() * 4, sy: 4 + r() * 2, sz: 9 + r() * 4 });
    });
    this.instanced(this.houseGeometry('#8a5a35', '#f2f6fa'), vc, cabins);

    this.buildWeather('snow');
  }

  buildCity() {
    const tr = this.track;
    const r = rng(41);
    const boxes = [];
    const tmp = {};
    const fits = (x, z, hw, hd, rot) => {
      const c = Math.cos(rot), s = Math.sin(rot);
      for (const [a, bq] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const lx = a * hw, lz = bq * hd;
        const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
        const nn = tr.nearest(wx, wz, 48, tmp);
        if (nn.d < tr.wallDist + 5 || this.isBlocked(wx, wz)) return false;
      }
      for (const o of boxes) {
        if (Math.abs(o.x - x) < (o.hw + hw) * 1.05 && Math.abs(o.z - z) < (o.hd + hd) * 1.05) return false;
      }
      return true;
    };
    // entlang der Strecke
    const step = 24;
    for (let along = 0; along < tr.length; along += step) {
      for (const side of [-1, 1]) {
        const w = 10 + r() * 14, d = 10 + r() * 12;
        const p = tr.pointAt(along, side * (tr.wallDist + 8 + d / 2 + r() * 6));
        if (fits(p.x, p.z, w / 2, d / 2, p.heading)) {
          boxes.push({ x: p.x, z: p.z, hw: w / 2, hd: d / 2, h: 18 + Math.pow(r(), 1.6) * 110, rot: p.heading });
        }
      }
    }
    // Füllung
    const b = this.bounds;
    for (let i = 0; i < this.q.sceneryMul * 260; i++) {
      const ar = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 300;
      const x = b.cx + (r() - 0.5) * ar, z = b.cz + (r() - 0.5) * ar;
      const w = 14 + r() * 20, d = 14 + r() * 20;
      if (fits(x, z, w / 2, d / 2, 0)) boxes.push({ x, z, hw: w / 2, hd: d / 2, h: 15 + Math.pow(r(), 1.4) * 140, rot: 0 });
    }
    // Gebäude als ein Mesh mit Fenster-UVs
    const pos = [], nor = [], uv = [];
    const addQuad = (p0, p1, p2, p3, n, u0, v0, u1, v1) => {
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      for (let i = 0; i < 6; i++) nor.push(...n);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    };
    for (const o of boxes) {
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      const W = (lx, lz, y) => [o.x + lx * c + lz * s, y, o.z - lx * s + lz * c];
      const N = (nx, nz) => [nx * c + nz * s, 0, -nx * s + nz * c];
      const y0 = -1, y1 = o.h;
      const uOff = Math.floor(r() * 8) / 8;
      const vR = o.h / 28, uRx = (o.hw * 2) / 24, uRz = (o.hd * 2) / 24;
      // vier Seiten (CCW von außen)
      addQuad(W(-o.hw, o.hd, y0), W(o.hw, o.hd, y0), W(o.hw, o.hd, y1), W(-o.hw, o.hd, y1), N(0, 1), uOff, 0, uOff + uRx, vR);
      addQuad(W(o.hw, -o.hd, y0), W(-o.hw, -o.hd, y0), W(-o.hw, -o.hd, y1), W(o.hw, -o.hd, y1), N(0, -1), uOff, 0, uOff + uRx, vR);
      addQuad(W(o.hw, o.hd, y0), W(o.hw, -o.hd, y0), W(o.hw, -o.hd, y1), W(o.hw, o.hd, y1), N(1, 0), uOff, 0, uOff + uRz, vR);
      addQuad(W(-o.hw, -o.hd, y0), W(-o.hw, o.hd, y0), W(-o.hw, o.hd, y1), W(-o.hw, -o.hd, y1), N(-1, 0), uOff, 0, uOff + uRz, vR);
      // Dach (dunkle Ecke der Textur)
      addQuad(W(-o.hw, o.hd, y1), W(o.hw, o.hd, y1), W(o.hw, -o.hd, y1), W(-o.hw, -o.hd, y1), [0, 1, 0], 0.01, 0.01, 0.1, 0.1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const wt = TX.windowTexture(5);
    const bmat = new THREE.MeshLambertMaterial({ map: wt, color: '#5a6070', emissive: '#ffffff', emissiveMap: wt, emissiveIntensity: 0.95 });
    const bm = new THREE.Mesh(g, bmat);
    this.root.add(bm);

    // Neon-Schilder auf Dächern
    const neonCols = ['#ff2bd6', '#29e3ff', '#ffe14a', '#7dff6a', '#ff6a3d', '#8f7bff'];
    const signs = [];
    for (const o of boxes) {
      if (r() < 0.35) {
        signs.push({ x: o.x, y: o.h + 2.5, z: o.z, ry: o.rot, sx: o.hw * 1.4, sy: 3 + r() * 2, sz: 0.4, color: neonCols[Math.floor(r() * neonCols.length)] });
      }
    }
    this.instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: true }), signs, { shadow: false });

    // Straßenlaternen + Lichtkegel auf der Fahrbahn
    const lamps = [], glows = [], pools = [];
    for (let along = 5; along < tr.length; along += 34) {
      for (const side of [-1, 1]) {
        if ((Math.floor(along / 34) + (side > 0 ? 1 : 0)) % 2) continue;
        const p = tr.pointAt(along, side * (tr.wallDist + 1.3));
        lamps.push({ x: p.x, y: p.y, z: p.z, ry: p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) });
        const h = tr.pointAt(along, side * (tr.wallDist - 1.8));
        glows.push(h.x, h.y + 8.6, h.z);
        const q = tr.pointAt(along, side * (tr.halfWidth * 0.35));
        pools.push(q);
      }
    }
    const lampGeo = mergeGeometries([
      { geo: new THREE.CylinderGeometry(0.15, 0.2, 9, 6), matrix: mat4(0, 4.5, 0), color: '#3a3d46' },
      { geo: new THREE.BoxGeometry(0.15, 0.15, 3.2), matrix: mat4(0, 8.9, 1.5), color: '#3a3d46' },
      { geo: new THREE.BoxGeometry(0.6, 0.2, 1.0), matrix: mat4(0, 8.75, 3.0), color: '#fff2c8' },
    ]);
    this.instanced(lampGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#000' }), lamps.map((l) => ({ ...l })), { shadow: false });
    this.addGlowPoints(glows, '#ffcf8a', 14);
    // Lichtflecken
    const pg = [];
    const tex = this.poolTexture();
    for (const q of pools) {
      const geo = new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2);
      pg.push({ geo, matrix: mat4(q.x, q.y + 0.05, q.z) });
    }
    if (pg.length) {
      const pm = new THREE.Mesh(
        mergeGeometries(pg),
        new THREE.MeshBasicMaterial({ map: tex, color: '#ffb36b', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true })
      );
      this.root.add(pm);
    }
  }

  poolTexture() {
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return canvasTexture(c, { repeat: false });
  }

  // ----- Blendenflecke der Sonne ---------------------------------------------
  buildFlare() {
    const tex = softParticleTexture();
    const ring = (() => {
      const c = makeCanvas(128, 128);
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 40, 64, 64, 62);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      return canvasTexture(c, { repeat: false });
    })();
    const sc = new THREE.Color(this.theme.sunColor);
    const defs = [
      [0, 3.2, tex, sc, 0.9], [0.25, 0.5, tex, new THREE.Color('#ffd2a0'), 0.25], [0.45, 0.9, ring, new THREE.Color('#9fd0ff'), 0.35],
      [0.62, 0.35, tex, new THREE.Color('#a0ffb8'), 0.3], [0.8, 0.6, tex, new THREE.Color('#ffa0d8'), 0.22], [1.1, 1.4, ring, new THREE.Color('#ffe0a0'), 0.2],
      [1.35, 0.4, tex, new THREE.Color('#8fb8ff'), 0.25],
    ];
    this.flares = defs.map(([t, size, map, color, alpha]) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false }));
      s.userData = { t, size, alpha };
      s.renderOrder = 50;
      s.frustumCulled = false;
      this.root.add(s);
      return s;
    });
    this._fv = new THREE.Vector3();
    this._fv2 = new THREE.Vector3();
    this.flareVis = 0;
  }

  updateFlare(camera, focus) {
    if (!this.flares) return;
    const cp = camera.position;
    const sp = this._fv.copy(this.sunDir).multiplyScalar(1000).add(cp).project(camera);
    let vis = sp.z < 1 && Math.abs(sp.x) < 1.25 && Math.abs(sp.y) < 1.25 ? 1 : 0;
    // Verdeckung durch Gelände entlang des Strahls zur Sonne
    if (vis) {
      for (const d of [30, 80, 160, 320, 640]) {
        const x = cp.x + this.sunDir.x * d, z = cp.z + this.sunDir.z * d, y = cp.y + this.sunDir.y * d;
        if (this.heightAt(x, z) > y) { vis = 0; break; }
      }
    }
    // überdachte Abschnitte (Tunnel, Galerie)
    if (vis && focus && this.coveredAt && this.coveredAt(focus.proj && focus.proj.idx)) vis = 0;
    this.flareVis += (vis * (1 - Math.min(1, Math.hypot(sp.x, sp.y) * 0.45)) - this.flareVis) * 0.15;
    const fv = this.flareVis;
    for (const s of this.flares) {
      const { t, size, alpha } = s.userData;
      s.visible = fv > 0.01;
      if (!s.visible) continue;
      // Position auf der Linie Sonne → Bildmitte → gegenüber, 10 m vor der Kamera
      const nx = sp.x * (1 - 2 * t), ny = sp.y * (1 - 2 * t);
      const dir = this._fv2.set(nx, ny, 0.5).unproject(camera).sub(cp).normalize();
      s.position.copy(cp).addScaledVector(dir, 10);
      s.scale.setScalar(size);
      s.material.opacity = alpha * fv;
    }
  }

  softTex() {
    return softParticleTexture();
  }

  // Sperrzonen (Boxengasse, Tunnel …) für Bäume/Häuser
  registerBlockers() {
    const tr = this.track;
    const p = {};
    for (let a = -180; a <= 60; a += 15) {
      tr.pointAt(a, tr.wallDist + 18, p);
      this.blockers.push({ x: p.x, z: p.z, r: 20 });
    }
    this.covered = [];
    for (const [name, i0, cnt] of (this.trackside && this.trackside.covers) || []) this.covered.push([i0 - 3, i0 + cnt + 3]);
    const t = this.trackside && this.trackside.tunnel;
    if (t) {
      for (let j = -10; j <= t.count + 10; j += 6) {
        tr.pointAt(tr.dist[(t.i0 + j + tr.N) % tr.N], 0, p);
        this.blockers.push({ x: p.x, z: p.z, r: tr.wallDist + 34 });
      }
    }
  }
  coveredAt(idx) {
    if (idx == null) return false;
    for (const [a, b] of this.covered || []) if (idx >= a && idx <= b) return true;
    return false;
  }
  isBlocked(x, z) {
    for (const b of this.blockers) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return true;
    return false;
  }

  addGlowPoints(arr, color, size) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({ color, size, map: softParticleTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: true });
    const p = new THREE.Points(g, m);
    this.root.add(p);
    return p;
  }

  // ---------------------------------------------------------------------
  buildWeather(type) {
    const n = type === 'snow' ? Math.round(1600 * this.q.sceneryMul) : Math.round(350 * this.q.sceneryMul);
    const pos = new Float32Array(n * 3);
    const r = rng(3);
    this.weatherBox = type === 'snow' ? [90, 45, 90] : [140, 20, 140];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * this.weatherBox[0];
      pos[i * 3 + 1] = r() * this.weatherBox[1];
      pos[i * 3 + 2] = (r() - 0.5) * this.weatherBox[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: type === 'snow' ? '#ffffff' : '#d9a878',
      size: type === 'snow' ? 0.35 : 1.4,
      map: softParticleTexture(),
      transparent: true,
      opacity: type === 'snow' ? 0.95 : 0.25,
      depthWrite: false,
      sizeAttenuation: true,
      fog: true,
    });
    this.weather = new THREE.Points(g, m);
    this.weather.frustumCulled = false;
    this.weatherType = type;
    this.weatherSeed = new Float32Array(n);
    for (let i = 0; i < n; i++) this.weatherSeed[i] = r() * 10;
    this.root.add(this.weather);
  }

  update(dt, camera, focus) {
    this.time += dt;
    for (const f of this.updatables) f(dt);
    this.skyUniforms.time.value = this.time;
    this.sky.position.copy(camera.position);
    if (this.waterUniforms) this.waterUniforms.time.value = this.time;
    if (focus) {
      // Schattenausschnitt etwas vor das Auto legen (Blickrichtung)
      const ahead = (this.q.shadowRange || 45) * 0.4;
      const f = new THREE.Vector3(focus.x + Math.sin(focus.heading || 0) * ahead, focus.y, focus.z + Math.cos(focus.heading || 0) * ahead);
      this.sun.target.position.copy(f);
      this.sun.position.copy(f).addScaledVector(this.sunDir, 220);
      this.sun.target.updateMatrixWorld();
    }
    this.updateFlare(camera, focus);
    if (this.weather) {
      const p = this.weather.geometry.attributes.position;
      const a = p.array;
      const [bx, by, bz] = this.weatherBox;
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const snow = this.weatherType === 'snow';
      const t = this.time;
      for (let i = 0, n = p.count; i < n; i++) {
        const s = this.weatherSeed[i];
        if (snow) {
          a[i * 3 + 1] -= dt * (2.2 + (s % 1.5));
          a[i * 3] += Math.sin(t * 0.8 + s) * dt * 0.8;
        } else {
          a[i * 3] += dt * (4 + s * 0.5);
          a[i * 3 + 1] += Math.sin(t + s) * dt * 0.3;
        }
        // relativ zur Kamera umbrechen
        let x = a[i * 3] - cx, y = a[i * 3 + 1] - (cy - by * 0.4), z = a[i * 3 + 2] - cz;
        x = ((x % bx) + bx * 1.5) % bx - bx / 2;
        y = ((y % by) + by) % by;
        z = ((z % bz) + bz * 1.5) % bz - bz / 2;
        a[i * 3] = x + cx;
        a[i * 3 + 1] = y + (cy - by * 0.4);
        a[i * 3 + 2] = z + cz;
      }
      p.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          for (const k of ['map', 'emissiveMap']) if (m[k] && !m[k].userData.shared) m[k].dispose();
          m.dispose();
        }
      }
    });
    if (this.envRT) this.envRT.dispose();
    this.scene.environment = null;
  }
}
