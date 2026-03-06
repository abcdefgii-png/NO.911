import * as THREE from 'three';

export class ParticleSystem {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  particles: THREE.Points | null = null;
  geometry: THREE.BufferGeometry | null = null;
  material: THREE.PointsMaterial | null = null;
  
  // State
  originalPositions: Float32Array | null = null;
  currentPositions: Float32Array | null = null;
  velocities: Float32Array | null = null;
  
  targetScale: number = 1;
  targetDiffusion: number = 0;
  
  particleColor: THREE.Color = new THREE.Color(0x00ffff);
  
  animationId: number | null = null;
  container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Scene Setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.z = 500;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Initial Particles (Placeholder circle)
    this.createPlaceholderParticles();
    
    // Handle Resize
    window.addEventListener('resize', this.onWindowResize);
    
    this.animate();
  }

  createPlaceholderParticles() {
    const count = 5000;
    const positions = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 100 + Math.random() * 50;
      positions[i * 3] = r * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(theta);
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    
    this.setParticles(positions);
  }

  setParticles(positions: Float32Array) {
    if (this.particles) {
      this.scene.remove(this.particles);
      if (this.geometry) this.geometry.dispose();
      if (this.material) this.material.dispose();
    }

    this.originalPositions = positions.slice();
    this.currentPositions = positions.slice();
    this.velocities = new Float32Array(positions.length); // Init velocities to 0

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.currentPositions, 3));

    this.material = new THREE.PointsMaterial({
      color: this.particleColor,
      size: 2,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.particles);
  }

  updateFromImage(imageData: ImageData) {
    const { width, height, data } = imageData;
    const points: number[] = [];
    const threshold = 128; // Brightness threshold for "dark" pixels (lines)

    // Center offset
    const cx = width / 2;
    const cy = height / 2;

    // Skip factor to reduce density if image is huge
    const skip = 2; 

    for (let y = 0; y < height; y += skip) {
      for (let x = 0; x < width; x += skip) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = (r + g + b) / 3;

        // Invert logic: if it's dark (line art), we want a particle
        // Or if it's an edge. Let's assume dark lines on light bg.
        if (brightness < 200) { 
          // Map to 3D space. 
          // Y is inverted in image data vs 3D space usually
          points.push(x - cx, -(y - cy), 0);
        }
      }
    }

    if (points.length > 0) {
      this.setParticles(new Float32Array(points));
      // Adjust camera to fit
      const maxDim = Math.max(width, height);
      this.camera.position.z = maxDim * 0.8; 
    }
  }

  setColor(color: string) {
    this.particleColor.set(color);
    if (this.material) {
      this.material.color = this.particleColor;
    }
  }

  // Called by external hand tracking
  updateInteraction(scale: number, diffusion: number) {
    // Smoothly interpolate targets
    this.targetScale = scale;
    this.targetDiffusion = diffusion;
  }

  onWindowResize = () => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

    if (!this.particles || !this.geometry || !this.originalPositions || !this.currentPositions) return;

    const positions = this.geometry.attributes.position.array as Float32Array;
    const originals = this.originalPositions;
    
    // Physics parameters
    const ease = 0.1;
    const time = Date.now() * 0.001;

    for (let i = 0; i < positions.length; i += 3) {
      // Target position based on scale
      const tx = originals[i] * this.targetScale;
      const ty = originals[i + 1] * this.targetScale;
      const tz = originals[i + 2] * this.targetScale;

      // Add diffusion (noise)
      // We use sin/cos based on index and time to create a "floating" effect when diffused
      const noiseX = Math.sin(time + i) * this.targetDiffusion * 200;
      const noiseY = Math.cos(time + i * 0.5) * this.targetDiffusion * 200;
      const noiseZ = Math.sin(time + i * 0.2) * this.targetDiffusion * 200;

      // Apply forces
      positions[i] += (tx + noiseX - positions[i]) * ease;
      positions[i + 1] += (ty + noiseY - positions[i + 1]) * ease;
      positions[i + 2] += (tz + noiseZ - positions[i + 2]) * ease;
    }

    this.geometry.attributes.position.needsUpdate = true;
    
    // Gentle rotation of the whole system
    this.particles.rotation.y += 0.001;
    this.particles.rotation.x += 0.0005;

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    window.removeEventListener('resize', this.onWindowResize);
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.container.removeChild(this.renderer.domElement);
    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer.dispose();
  }
}
