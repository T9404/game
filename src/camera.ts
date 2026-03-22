import * as THREE from 'three';

export class GameCamera {
  camera: THREE.PerspectiveCamera;
  private azimuth = 0;
  private elevation = 0.1;
  private distance = 20;
  private target = new THREE.Vector3(0, 3, 0);
  private targetYOffset = 3;
  private aiming = false;
  // Управление мышью
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  // Вид сверху (арт-режим)
  private aimPoint = new THREE.Vector3();
  private topDownHeight = 200;
  private vehiclePos = new THREE.Vector3();
  private getTerrainH: ((x: number, z: number) => number) | null = null;

  setTerrainFunc(fn: (x: number, z: number) => number): void {
    this.getTerrainH = fn;
  }

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200000);
    this.updatePosition();
  }

  get azimuthDeg(): number { return THREE.MathUtils.radToDeg(this.azimuth); }
  get elevationDeg(): number { return THREE.MathUtils.radToDeg(this.elevation); }
  get azimuthRad(): number { return this.azimuth; }
  get elevationRad(): number { return this.elevation; }
  get isAiming(): boolean { return this.aiming; }

  /** Азимут от техники к точке прицеливания (для арт-режима) */
  get aimAzimuthRad(): number {
    if (!this.aiming) return this.azimuth + Math.PI;
    const dx = this.aimPoint.x - this.vehiclePos.x;
    const dz = this.aimPoint.z - this.vehiclePos.z;
    return Math.atan2(dx, dz);
  }

  /** Точка прицеливания на земле */
  get aimPointWorld(): THREE.Vector3 { return this.aimPoint; }

  /** Дистанция от техники до точки прицеливания (scene units) */
  get aimDistance(): number {
    const dx = this.aimPoint.x - this.vehiclePos.x;
    const dz = this.aimPoint.z - this.vehiclePos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  setAiming(v: boolean): void {
    this.aiming = v;
    if (v) {
      // Точка прицеливания в направлении куда башня смотрела
      const prevAz = this.azimuth + Math.PI;
      this.aimPoint.set(
        this.vehiclePos.x + Math.sin(prevAz) * 50,
        0,
        this.vehiclePos.z + Math.cos(prevAz) * 50
      );
      this.topDownHeight = 200;
    } else {
      this.distance = 20;
      this.targetYOffset = 3;
    }
  }

  setTarget(pos: THREE.Vector3): void {
    this.vehiclePos.copy(pos);
    if (!this.aiming) {
      this.target.x = pos.x;
      this.target.y = pos.y + this.targetYOffset;
      this.target.z = pos.z;
    }
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

      if (this.aiming) {
        // Арт-режим: двигаем точку прицеливания по земле
        const panSpeed = this.topDownHeight * 0.003;
        this.aimPoint.x += dx * panSpeed;
        this.aimPoint.z -= dy * panSpeed;
      } else {
        // Обычный режим: орбита
        this.azimuth -= dx * 0.005;
        this.elevation += dy * 0.005;
        this.elevation = THREE.MathUtils.clamp(this.elevation, 0.05, Math.PI / 2 - 0.05);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      if (this.aiming) return;
      this.distance += e.deltaY * 0.05;
      this.distance = THREE.MathUtils.clamp(this.distance, 5, 100);
    });
  }

  /** Scroll для высоты в арт-режиме (вызывается из main.ts capture listener) */
  adjustTopDownHeight(delta: number): void {
    this.topDownHeight += delta * 0.3;
    this.topDownHeight = THREE.MathUtils.clamp(this.topDownHeight, 50, 600);
  }

  private updatePosition(): void {
    if (this.aiming) {
      // Арт-режим: камера строго вниз, без lookAt (избегаем gimbal lock)
      const groundY = this.getTerrainH
        ? this.getTerrainH(this.aimPoint.x, this.aimPoint.z)
        : 0;
      this.camera.position.set(
        this.aimPoint.x,
        groundY + this.topDownHeight,
        this.aimPoint.z
      );
      // Вручную ставим ориентацию: смотрим вниз, +Z = верх экрана
      this.camera.rotation.set(-Math.PI / 2, 0, 0);
      this.camera.up.set(0, 1, 0);
    } else {
      // Обычный режим: орбита
      this.camera.up.set(0, 1, 0);
      const x = this.target.x + this.distance * Math.cos(this.elevation) * Math.sin(this.azimuth);
      const y = this.target.y + this.distance * Math.sin(this.elevation);
      const z = this.target.z + this.distance * Math.cos(this.elevation) * Math.cos(this.azimuth);
      this.camera.position.set(x, y, z);
      this.camera.lookAt(this.target);
    }
  }

  update(): void {
    this.updatePosition();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}