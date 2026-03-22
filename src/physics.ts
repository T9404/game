import * as THREE from 'three';

export interface PhysicsParams {
  muzzleVelocity: number;   // м/с
  elevationRad: number;     // угол возвышения (рад)
  azimuthRad: number;       // азимут (рад)
  windSpeed: number;        // м/с
  windDirectionRad: number; // направление ветра (рад)
  humidity: number;         // 0-1
  airDensity?: number;      // кг/м³
  dragCoeff?: number;       // коэффициент сопротивления
  projectileMass?: number;  // кг
  projectileArea?: number;  // м² (сечение)
}

export interface ProjectileState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  time: number;
  alive: boolean;
}

const GRAVITY = 9.81;

export function createProjectile(origin: THREE.Vector3, params: PhysicsParams): ProjectileState {
  const vx = params.muzzleVelocity * Math.cos(params.elevationRad) * Math.sin(params.azimuthRad);
  const vy = params.muzzleVelocity * Math.sin(params.elevationRad);
  const vz = params.muzzleVelocity * Math.cos(params.elevationRad) * Math.cos(params.azimuthRad);

  return {
    position: origin.clone(),
    velocity: new THREE.Vector3(vx, vy, vz),
    time: 0,
    alive: true,
  };
}

export function stepProjectile(state: ProjectileState, dt: number, params: PhysicsParams): void {
  if (!state.alive) return;

  const rho = params.airDensity ?? 1.225;
  const cd = params.dragCoeff ?? 0.15;
  const mass = params.projectileMass ?? 43;    // 152мм снаряд ~43кг
  const area = params.projectileArea ?? 0.018; // π*(0.076)²

  // Влажность немного уменьшает плотность воздуха
  const humidityFactor = 1 - params.humidity * 0.02;
  const effectiveRho = rho * humidityFactor;

  // Ветер
  const windX = params.windSpeed * Math.sin(params.windDirectionRad);
  const windZ = params.windSpeed * Math.cos(params.windDirectionRad);

  // Относительная скорость (скорость снаряда минус ветер)
  const relVx = state.velocity.x - windX;
  const relVy = state.velocity.y;
  const relVz = state.velocity.z - windZ;
  const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy + relVz * relVz);

  // Сила сопротивления: F = 0.5 * ρ * Cd * A * v²
  const dragMag = 0.5 * effectiveRho * cd * area * relSpeed * relSpeed;

  // Ускорение от сопротивления (против направления относительной скорости)
  const ax = -(dragMag / mass) * (relVx / (relSpeed || 1));
  const ay = -GRAVITY - (dragMag / mass) * (relVy / (relSpeed || 1));
  const az = -(dragMag / mass) * (relVz / (relSpeed || 1));

  // Интеграция Эйлера
  state.velocity.x += ax * dt;
  state.velocity.y += ay * dt;
  state.velocity.z += az * dt;

  state.position.x += state.velocity.x * dt;
  state.position.y += state.velocity.y * dt;
  state.position.z += state.velocity.z * dt;

  state.time += dt;

  // Снаряд упал на землю
  if (state.position.y < 0) {
    state.position.y = 0;
    state.alive = false;
  }
}

/**
 * Быстрая симуляция: возвращает горизонтальную дальность (в метрах)
 * для заданного угла возвышения. Используется для бинарного поиска угла.
 */
export function simulateRange(elevationRad: number, params: PhysicsParams): number {
  const dt = 0.5; // грубый шаг — достаточно для оценки
  const vx = params.muzzleVelocity * Math.cos(elevationRad);
  let vy = params.muzzleVelocity * Math.sin(elevationRad);
  let y = 400; // стартовая высота ~400м (ствол)
  let hDist = 0;

  const rho = params.airDensity ?? 1.225;
  const cd = params.dragCoeff ?? 0.15;
  const mass = params.projectileMass ?? 43;
  const area = params.projectileArea ?? 0.018;
  const humFactor = 1 - params.humidity * 0.02;
  const effRho = rho * humFactor;

  let vHoriz = vx;

  for (let i = 0; i < 2000; i++) {
    const speed = Math.sqrt(vHoriz * vHoriz + vy * vy);
    const drag = 0.5 * effRho * cd * area * speed * speed;
    const dragH = (drag / mass) * (vHoriz / (speed || 1));
    const dragV = (drag / mass) * (vy / (speed || 1));

    vHoriz -= dragH * dt;
    vy -= (GRAVITY + dragV) * dt;

    hDist += vHoriz * dt;
    y += vy * dt;

    if (y < 0) break;
  }
  return hDist;
}