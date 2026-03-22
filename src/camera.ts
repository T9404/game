import * as THREE from 'three';

export class GameCamera {
  camera: THREE.PerspectiveCamera;
  private azimuth = 0;        // горизонтальный поворот (рад)
  private elevation = 0.1;    // вертикальный угол (рад)
  private distance = 20;      // расстояние от цели (орбита)
  private target = new THREE.Vector3(0, 3, 0);
  private targetYOffset = 3;
  private aiming = false;
  // Управление мышью
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200000);
    this.updatePosition();
  }

  get azimuthDeg(): number { return THREE.MathUtils.radToDeg(this.azimuth); }
  get elevationDeg(): number { return THREE.MathUtils.radToDeg(this.elevation); }
  get azimuthRad(): number { return this.azimuth; }
  get elevationRad(): number { return this.elevation; }

  setAiming(v: boolean): void {
    this.aiming = v;
    if (v) {
      this.distance = 8;
      this.targetYOffset = 4.5;
    } else {
      this.distance = 20;
      this.targetYOffset = 3;
    }
  }

  setTarget(pos: THREE.Vector3): void {
    this.target.x = pos.x;
    this.target.y = pos.y + this.targetYOffset;
    this.target.z = pos.z;
  }

  bindEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => { this.isDragging = false; });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      this.azimuth -= dx * 0.005;
      this.elevation += dy * 0.005;
      this.elevation = THREE.MathUtils.clamp(this.elevation, 0.05, Math.PI / 2 - 0.05);
    });

    canvas.addEventListener('wheel', (e) => {
      if (this.aiming) return;
      this.distance += e.deltaY * 0.05;
      this.distance = THREE.MathUtils.clamp(this.distance, 5, 100);
    });
  }

  private updatePosition(): void {
    const x = this.target.x + this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
    const y = this.target.y + this.distance * Math.sin(this.elevation);
    const z = this.target.z + this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  update(): void {
    this.updatePosition();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}