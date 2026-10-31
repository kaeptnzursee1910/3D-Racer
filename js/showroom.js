// Garage-Szene mit Drehteller
import * as THREE from '../vendor/three.module.min.js';
import { buildCarModel } from './carModel.js';
import { damp } from './utils.js';

export class Showroom {
  constructor(renderer, camera, quality) {
    this.renderer = renderer;
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a0b12');
    this.scene.fog = new THREE.Fog('#0a0b12', 18, 40);
    this.q = quality;
    this.angle = 0.6;
    this.spin = 0.25;
    this.dragging = false;
    this.build();
  }

  build() {
    const s = this.scene;
    // Studio-Umgebung für Spiegelungen
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    env.background = new THREE.Color('#111218');
    const panel = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(20, 4), panel);
    p1.position.set(0, 12, 0);
    p1.rotation.x = Math.PI / 2;
    env.add(p1);
    for (const [x, z, c] of [[-12, 0, '#ff3b5c'], [12, 0, '#2ee6ff'], [0, -12, '#ffffff']]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(x, 4, z);
      m.lookAt(0, 3, 0);
      env.add(m);
    }
    this.envRT = pm.fromScene(env, 0.04);
    s.environment = this.envRT.texture;
    pm.dispose();

    s.add(new THREE.HemisphereLight('#c8d4ff', '#202028', 0.6));
    const key = new THREE.SpotLight('#ffffff', 300, 40, 0.6, 0.5, 1.5);
    key.position.set(5, 10, 6);
    key.castShadow = this.q.shadows;
    key.shadow.mapSize.set(1024, 1024);
    s.add(key);
    const rim = new THREE.SpotLight('#ff3b5c', 150, 30, 0.7, 0.6, 1.5);
    rim.position.set(-7, 5, -6);
    s.add(rim);
    const rim2 = new THREE.SpotLight('#2ee6ff', 150, 30, 0.7, 0.6, 1.5);
    rim2.position.set(7, 4, -6);
    s.add(rim2);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0b0c11', roughness: 0.55, metalness: 0.2, envMapIntensity: 0.3 }));
    floor.receiveShadow = true;
    s.add(floor);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.16, 64), new THREE.MeshStandardMaterial({ color: '#23252f', roughness: 0.25, metalness: 0.8 }));
    disc.position.y = 0.08;
    disc.receiveShadow = true;
    s.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.04, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
    ring.position.y = 0.17;
    s.add(ring);
    this.turn = new THREE.Group();
    this.turn.position.y = 0.16;
    s.add(this.turn);
    this.disc = disc;
  }

  setCar(def, color) {
    if (this.model) {
      this.turn.remove(this.model.root);
      this.model.paint.dispose();
      this.model.tail.dispose();
    }
    this.model = buildCarModel(def, color, { physical: this.q.physical, shadowStrong: true });
    this.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.turn.add(this.model.root);
  }

  setColor(color) {
    if (this.model) this.model.paint.color.set(color);
  }

  rotateBy(dx) {
    this.angle += dx * 0.01;
    this.spin = 0;
  }

  update(dt) {
    this.spin = damp(this.spin, 0.25, 0.5, dt);
    this.angle += this.spin * dt;
    this.turn.rotation.y = this.angle;
    this.disc.rotation.y = this.angle;
    const cam = this.camera;
    const portrait = window.innerHeight > window.innerWidth;
    const dist = portrait ? 11 : 8;
    cam.position.set(0, 2.6, dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0.6, 0);
    if (cam.fov !== 42) {
      cam.fov = 42;
      cam.updateProjectionMatrix();
    }
  }

  render() {
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.render(this.scene, this.camera);
  }
}
