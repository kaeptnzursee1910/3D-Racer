// Partikel (Rauch, Funken, Nitro-Flammen) und Reifenspuren
import * as THREE from '../vendor/three.module.min.js';
import { softParticleTexture } from './utils.js';

const PVS = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
uniform float scale;
varying float vA; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(size * scale / max(-mv.z, 0.1), 400.0);
  gl_Position = projectionMatrix * mv;
  vA = alpha; vC = pcolor;
}`;
const PFS = `
uniform sampler2D map;
varying float vA; varying vec3 vC;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC, t.a * vA);
  #include <colorspace_fragment>
}`;

export class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('size', this.sizeAttr);
    g.setAttribute('alpha', this.alphaAttr);
    g.setAttribute('pcolor', this.colAttr);
    this.uniforms = { map: { value: softParticleTexture() }, scale: { value: 500 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PVS,
      fragmentShader: PFS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
    this.active = 0;
    this._c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, a0, color, grav = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.grav[i] = grav; this.drag[i] = drag;
    const c = this._c.set(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.size[i] = s0;
    this.alpha[i] = a0;
  }

  update(dt, camera, height) {
    this.uniforms.scale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; }
        continue;
      }
      any = true;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
    }
    if (any) {
      this.posAttr.needsUpdate = true;
      this.sizeAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
  }
}

export class SkidMarks {
  constructor(scene, max = 1600) {
    this.max = max;
    this.pos = new Float32Array(max * 6 * 3);
    this.alpha = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    this.alphaAttr = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('alpha', this.alphaAttr);
    const m = new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.03,0.03,0.035, vA); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.cursor = 0;
    this.last = new Map();
  }

  // key identifiziert ein Rad; null-Punkt bricht die Spur ab
  add(key, x, y, z, rx, rz, strength) {
    const prev = this.last.get(key);
    if (!prev || strength <= 0) {
      this.last.set(key, strength > 0 ? { x, y, z, rx, rz } : null);
      return;
    }
    const dx = x - prev.x, dz = z - prev.z;
    if (dx * dx + dz * dz < 0.36) return;
    const w = 0.17;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const P = this.pos, o = i * 18;
    const ax = prev.x + prev.rx * w, az = prev.z + prev.rz * w;
    const bx = prev.x - prev.rx * w, bz = prev.z - prev.rz * w;
    const cx = x + rx * w, cz = z + rz * w;
    const ex = x - rx * w, ez = z - rz * w;
    const y0 = prev.y + 0.035, y1 = y + 0.035;
    const verts = [ax, y0, az, bx, y0, bz, cx, y1, cz, bx, y0, bz, ex, y1, ez, cx, y1, cz];
    for (let k = 0; k < 18; k++) P[o + k] = verts[k];
    const a = Math.min(0.55, strength * 0.6);
    for (let k = 0; k < 6; k++) this.alpha[i * 6 + k] = a;
    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.last.set(key, { x, y, z, rx, rz });
  }
}
