// Nachbearbeitung: HDR-Rendering mit MSAA, Bloom (Glühen heller Lichter) und Ausgabe mit Tonemapping
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = false;
    this.composer = null;
  }

  setup(enabled, quality) {
    this.enabled = enabled && this.renderer.capabilities.isWebGL2;
    if (!this.enabled) {
      this.dispose();
      return;
    }
    if (this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality >= 2 ? 4 : 2,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  setBloom(strength, threshold = 0.88, radius = 0.55) {
    if (!this.bloom) return;
    this.bloom.strength = strength;
    this.bloom.threshold = threshold;
    this.bloom.radius = radius;
  }

  resize() {
    if (!this.composer) return;
    const pr = this.renderer.getPixelRatio();
    const s = this.renderer.getSize(new THREE.Vector2());
    this.composer.setPixelRatio(pr);
    this.composer.setSize(s.x, s.y);
  }

  render(scene, camera) {
    if (!this.enabled || !this.composer) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }

  dispose() {
    if (!this.composer) return;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    if (this.bloom) this.bloom.dispose();
    this.composer = null;
    this.bloom = null;
  }
}
