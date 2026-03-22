import * as THREE from 'three';
import GUI from 'lil-gui';
import { GameCamera } from './camera';
import { createHowitzer } from './howitzer';
import { createTargets, updateTargets, type TargetData } from './targets';
import { createProjectile, stepProjectile, simulateRange, type ProjectileState, type PhysicsParams } from './physics';
import { populateEnvironment } from './environment';

// ===== КОНСТАНТЫ =====
const SCALE = 100; // 1 unit = 100м
const WIND_SPEED = 2;
const WIND_DIR = Math.PI;
const HUMIDITY = 0.7;

// ===== СЦЕНА =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc8d8e8);
scene.fog = new THREE.Fog(0xc8d8e8, 200, 900);

// ===== КАМЕРА =====
const gameCam = new GameCamera(window.innerWidth / window.innerHeight);
gameCam.bindEvents(renderer.domElement);
// Передадим функцию рельефа после её определения (ниже)
// см. после определения getTerrainHeight

// ===== СВЕТ =====
const hemiLight = new THREE.HemisphereLight(0x88bbee, 0x445522, 0.6);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.5);
sunLight.position.set(150, 300, 100);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(4096, 4096);
sunLight.shadow.camera.far = 1000;
sunLight.shadow.bias = -0.0005;
const s = 200;
sunLight.shadow.camera.left = -s;
sunLight.shadow.camera.right = s;
sunLight.shadow.camera.top = s;
sunLight.shadow.camera.bottom = -s;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0xaabbcc, 0.3);
fillLight.position.set(-100, 100, -100);
scene.add(fillLight);

// ===== НЕБО =====
const skyGeo = new THREE.SphereGeometry(900, 32, 16);
const skyColors: number[] = [];
const skyPos = skyGeo.getAttribute('position');
for (let i = 0; i < skyPos.count; i++) {
  const y = skyPos.getY(i) / 900; // -1 to 1
  let r: number, g: number, b: number;
  if (y > 0.3) {
    const t = (y - 0.3) / 0.7;
    r = THREE.MathUtils.lerp(0.45, 0.15, t);
    g = THREE.MathUtils.lerp(0.65, 0.30, t);
    b = THREE.MathUtils.lerp(0.90, 0.65, t);
  } else if (y > 0) {
    const t = y / 0.3;
    r = THREE.MathUtils.lerp(0.75, 0.45, t);
    g = THREE.MathUtils.lerp(0.85, 0.65, t);
    b = THREE.MathUtils.lerp(0.92, 0.90, t);
  } else {
    r = THREE.MathUtils.lerp(0.75, 0.65, Math.abs(y));
    g = THREE.MathUtils.lerp(0.85, 0.75, Math.abs(y));
    b = THREE.MathUtils.lerp(0.92, 0.70, Math.abs(y));
  }
  skyColors.push(r, g, b);
}
skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
  vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
}));
scene.add(sky);

// ===== ЗЕМЛЯ =====
function terrainNoise(x: number, z: number): number {
  let h = 0;
  h += Math.sin(x * 0.008) * Math.cos(z * 0.006) * 8.0;
  h += Math.sin(x * 0.025 + 1.3) * Math.cos(z * 0.03 + 0.7) * 3.0;
  h += Math.sin(x * 0.08 + 2.1) * Math.cos(z * 0.07 + 1.5) * 1.0;
  h += Math.sin(x * 0.2 + 0.5) * Math.cos(z * 0.22 + 3.0) * 0.3;
  // Сгладить у спавна
  const dist = Math.sqrt(x * x + z * z);
  const fade = THREE.MathUtils.smoothstep(dist, 10, 40);
  return h * fade;
}

function getTerrainHeight(wx: number, wz: number): number {
  // PlaneGeometry повёрнута -PI/2 по X: localY → -worldZ
  return terrainNoise(wx, -wz);
}

const groundGeo = new THREE.PlaneGeometry(2000, 2000, 400, 400);
const posAttr = groundGeo.getAttribute('position');
const colors: number[] = [];
const colLow = new THREE.Color(0.22, 0.35, 0.15);
const colMid = new THREE.Color(0.29, 0.48, 0.23);
const colHigh = new THREE.Color(0.45, 0.42, 0.28);
const colTop = new THREE.Color(0.50, 0.40, 0.25);
const tmpCol = new THREE.Color();

for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i);
  const y = posAttr.getY(i);
  const h = terrainNoise(x, y);
  posAttr.setZ(i, h);

  // Vertex color по высоте
  if (h < 0) tmpCol.copy(colLow);
  else if (h < 4) tmpCol.lerpColors(colLow, colMid, h / 4);
  else if (h < 8) tmpCol.lerpColors(colMid, colHigh, (h - 4) / 4);
  else tmpCol.lerpColors(colHigh, colTop, Math.min((h - 8) / 4, 1));
  colors.push(tmpCol.r, tmpCol.g, tmpCol.b);
}
groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
groundGeo.computeVertexNormals();

const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.95,
}));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ===== ОКРУЖЕНИЕ =====
populateEnvironment(scene, getTerrainHeight);
gameCam.setTerrainFunc(getTerrainHeight);

// ===== ГАУБИЦА =====
const howitzer = createHowitzer();
howitzer.position.set(0, 0, 0);
scene.add(howitzer);

// ===== ЦЕЛИ =====
const targets = createTargets();
for (const t of targets) {
  scene.add(t.mesh);
}

// ===== ПРИЦЕЛ НА ЗЕМЛЕ (арт-режим) =====
const reticleGroup = new THREE.Group();
// Кольцо
const reticleRing = new THREE.Mesh(
  new THREE.RingGeometry(3, 3.5, 32),
  new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
);
reticleRing.rotation.x = -Math.PI / 2;
reticleGroup.add(reticleRing);
// Внутренний круг (зона поражения)
const reticleInner = new THREE.Mesh(
  new THREE.RingGeometry(0, 5, 32),
  new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.08 })
);
reticleInner.rotation.x = -Math.PI / 2;
reticleGroup.add(reticleInner);
// Крестик
for (let i = 0; i < 4; i++) {
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 4),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
  );
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = (Math.PI / 2) * i;
  line.position.y = 0.05;
  // Сдвиг от центра
  const offset = 5.5;
  line.position.x = Math.sin((Math.PI / 2) * i) * offset;
  line.position.z = Math.cos((Math.PI / 2) * i) * offset;
  reticleGroup.add(line);
}
reticleGroup.visible = false;
scene.add(reticleGroup);

// ===== HUD =====
let aimMode = false;
const crosshair = document.getElementById('crosshair')!;
const modeLabel = document.getElementById('mode-label')!;
const azimuthEl = document.getElementById('azimuth')!;
const elevationEl = document.getElementById('elevation')!;
const distanceInfo = document.getElementById('distance-info')!;
const targetsList = document.getElementById('targets-list')!;

const raycaster = new THREE.Raycaster();
raycaster.far = 100000;
const screenCenter = new THREE.Vector2(0, 0);

let selectedTarget: TargetData | null = null;

// ===== МИНИКАРТА =====
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const mmCtx = minimapCanvas.getContext('2d')!;
const MM = 220;
const MM_RANGE = 600; // scene units от центра

function drawMinimap(): void {
  const cx = MM / 2;
  const cy = MM / 2;
  const hx = howitzer.position.x;
  const hz = howitzer.position.z;

  // Конвертация мировых координат → пиксели миникарты
  // Canvas Y идёт вниз, world Z идёт "вперёд" → инвертируем Z
  const toX = (wx: number) => cx + (wx - hx) / MM_RANGE * cx;
  const toY = (wz: number) => cy - (wz - hz) / MM_RANGE * cy;

  // Очистка
  mmCtx.clearRect(0, 0, MM, MM);

  // Сетка (каждые 100 units = 10км)
  mmCtx.strokeStyle = 'rgba(0,255,0,0.1)';
  mmCtx.lineWidth = 0.5;
  const gridStep = 100;
  const gridStart = Math.floor((hx - MM_RANGE) / gridStep) * gridStep;
  const gridEndX = hx + MM_RANGE;
  const gridStartZ = Math.floor((hz - MM_RANGE) / gridStep) * gridStep;
  const gridEndZ = hz + MM_RANGE;
  mmCtx.beginPath();
  for (let gx = gridStart; gx <= gridEndX; gx += gridStep) {
    const px = toX(gx);
    mmCtx.moveTo(px, 0);
    mmCtx.lineTo(px, MM);
  }
  for (let gz = gridStartZ; gz <= gridEndZ; gz += gridStep) {
    const py = toY(gz);
    mmCtx.moveTo(0, py);
    mmCtx.lineTo(MM, py);
  }
  mmCtx.stroke();

  // Граница карты (±1000 scene units)
  mmCtx.strokeStyle = 'rgba(0,255,0,0.3)';
  mmCtx.lineWidth = 1;
  const bx1 = toX(-1000), by1 = toY(-1000);
  const bx2 = toX(1000), by2 = toY(1000);
  mmCtx.strokeRect(Math.min(bx1, bx2), Math.min(by1, by2), Math.abs(bx2 - bx1), Math.abs(by2 - by1));

  // Круг максимальной дальности (V²/g без drag — приблизительная макс. дальность)
  const maxRangeMeters = (MUZZLE_VELOCITY * MUZZLE_VELOCITY) / 9.81 * 0.7; // с учётом drag ~70%
  const maxRangeScene = maxRangeMeters / SCALE;
  const maxRangePx = maxRangeScene / MM_RANGE * cx;
  mmCtx.strokeStyle = 'rgba(255,100,0,0.3)';
  mmCtx.lineWidth = 1;
  mmCtx.setLineDash([4, 4]);
  mmCtx.beginPath();
  mmCtx.arc(cx, cy, maxRangePx, 0, Math.PI * 2);
  mmCtx.stroke();
  mmCtx.setLineDash([]);

  // Подпись дальности
  mmCtx.fillStyle = 'rgba(255,140,0,0.5)';
  mmCtx.font = '8px Courier New';
  mmCtx.textAlign = 'center';
  mmCtx.fillText(`${(maxRangeMeters / 1000).toFixed(0)}км`, cx + maxRangePx - 14, cy - 3);

  // Конус прицеливания (WoT arty style)
  const fireAz = gameCam.aimAzimuthRad;
  const coneLen = 80; // пикселей
  const coneHalf = 0.08; // ~4.5°
  // На canvas: угол 0 = вправо, world az 0 = +Z = вверх на canvas = -PI/2
  const drawAngle = -fireAz + Math.PI / 2;
  mmCtx.fillStyle = 'rgba(0,255,0,0.12)';
  mmCtx.strokeStyle = 'rgba(0,255,0,0.4)';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(cx, cy);
  mmCtx.lineTo(
    cx + Math.cos(drawAngle - coneHalf) * coneLen,
    cy - Math.sin(drawAngle - coneHalf) * coneLen
  );
  mmCtx.lineTo(
    cx + Math.cos(drawAngle + coneHalf) * coneLen,
    cy - Math.sin(drawAngle + coneHalf) * coneLen
  );
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.stroke();

  // Линия прицела (центр конуса)
  mmCtx.strokeStyle = 'rgba(0,255,0,0.5)';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(cx, cy);
  mmCtx.lineTo(
    cx + Math.cos(drawAngle) * coneLen,
    cy - Math.sin(drawAngle) * coneLen
  );
  mmCtx.stroke();

  // Цели
  mmCtx.font = '9px Courier New';
  mmCtx.textAlign = 'left';
  for (const t of targets) {
    const tx = toX(t.mesh.position.x);
    const ty = toY(t.mesh.position.z);
    // Если за пределами canvas — пропустить
    if (tx < -10 || tx > MM + 10 || ty < -10 || ty > MM + 10) continue;

    mmCtx.beginPath();
    mmCtx.arc(tx, ty, 4, 0, Math.PI * 2);
    if (t.destroyed) {
      mmCtx.fillStyle = '#555';
    } else if (t.marked) {
      mmCtx.fillStyle = '#ff0';
    } else {
      mmCtx.fillStyle = '#f00';
    }
    mmCtx.fill();

    // ID
    if (!t.destroyed) {
      mmCtx.fillStyle = mmCtx.fillStyle;
      mmCtx.fillText(`${t.id}`, tx + 6, ty + 3);
    }
  }

  // Воронки (кратеры) — оранжевые кольца, затухают за 30с
  const now = Date.now();
  for (let i = impactMarks.length - 1; i >= 0; i--) {
    const mark = impactMarks[i];
    const age = (now - mark.time) / 1000;
    if (age > 30) { impactMarks.splice(i, 1); continue; }
    const mx = toX(mark.x);
    const my = toY(mark.z);
    if (mx < -10 || mx > MM + 10 || my < -10 || my > MM + 10) continue;
    const alpha = Math.max(0, 1 - age / 30);
    mmCtx.strokeStyle = `rgba(255,140,0,${(alpha * 0.8).toFixed(2)})`;
    mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.arc(mx, my, 3, 0, Math.PI * 2);
    mmCtx.stroke();
    // Крестик
    mmCtx.strokeStyle = `rgba(255,80,0,${(alpha * 0.6).toFixed(2)})`;
    mmCtx.lineWidth = 1;
    mmCtx.beginPath();
    mmCtx.moveTo(mx - 2, my - 2); mmCtx.lineTo(mx + 2, my + 2);
    mmCtx.moveTo(mx + 2, my - 2); mmCtx.lineTo(mx - 2, my + 2);
    mmCtx.stroke();
  }

  // Летящие снаряды — яркие оранжевые точки
  for (const p of activeProjectiles) {
    if (!p.state.alive) continue;
    const px = toX(p.state.position.x / SCALE);
    const py = toY(p.state.position.z / SCALE);
    if (px < -10 || px > MM + 10 || py < -10 || py > MM + 10) continue;
    mmCtx.fillStyle = '#ff4400';
    mmCtx.beginPath();
    mmCtx.arc(px, py, 2.5, 0, Math.PI * 2);
    mmCtx.fill();
    // Свечение
    mmCtx.fillStyle = 'rgba(255,100,0,0.3)';
    mmCtx.beginPath();
    mmCtx.arc(px, py, 5, 0, Math.PI * 2);
    mmCtx.fill();
  }

  // Игрок (треугольник по направлению движения)
  const headingDraw = -vehicleHeading + Math.PI / 2;
  const ps = 6; // размер
  mmCtx.fillStyle = '#0f0';
  mmCtx.beginPath();
  mmCtx.moveTo(cx + Math.cos(headingDraw) * ps, cy - Math.sin(headingDraw) * ps);
  mmCtx.lineTo(cx + Math.cos(headingDraw + 2.5) * ps * 0.7, cy - Math.sin(headingDraw + 2.5) * ps * 0.7);
  mmCtx.lineTo(cx + Math.cos(headingDraw - 2.5) * ps * 0.7, cy - Math.sin(headingDraw - 2.5) * ps * 0.7);
  mmCtx.closePath();
  mmCtx.fill();

  // Рамка
  mmCtx.strokeStyle = 'rgba(0,255,0,0.5)';
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(0, 0, MM, MM);
}

// ===== БАШНЯ И СТВОЛ =====
const turretGroup = howitzer.userData.turret as THREE.Group;
const barrelGroup = howitzer.userData.barrelGroup as THREE.Group;
let barrelElevation = 0.5; // угол возвышения ствола (рад), ~28°

// ===== ДВИЖЕНИЕ =====
const keys: Record<string, boolean> = {};
let vehicleHeading = 0;       // рад, 0 = +Z
let vehicleSpeed = 0;          // scene units/s
const MAX_SPEED = 20;
const ACCELERATION = 15;
const DECELERATION = 25;
const TURN_SPEED = 1.5;        // рад/с на полной скорости
const TURN_SPEED_STATIONARY = 0.8;
const WHEEL_SPIN_AXIS = new THREE.Vector3(0, 1, 0);
const speedEl = document.getElementById('speed-info')!;

function updateVehicle(dt: number): void {
  // Поворот
  const turning = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
  const speedRatio = Math.abs(vehicleSpeed) / MAX_SPEED;
  const turnRate = THREE.MathUtils.lerp(TURN_SPEED_STATIONARY, TURN_SPEED, speedRatio);
  if (turning !== 0) {
    vehicleHeading += turning * turnRate * dt;
  }

  // Газ / тормоз
  const forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  if (forward !== 0) {
    vehicleSpeed += forward * ACCELERATION * dt;
    vehicleSpeed = THREE.MathUtils.clamp(vehicleSpeed, -MAX_SPEED * 0.4, MAX_SPEED);
  } else {
    if (vehicleSpeed > 0) vehicleSpeed = Math.max(0, vehicleSpeed - DECELERATION * dt);
    else if (vehicleSpeed < 0) vehicleSpeed = Math.min(0, vehicleSpeed + DECELERATION * dt);
  }

  // Перемещение
  howitzer.position.x += Math.sin(vehicleHeading) * vehicleSpeed * dt;
  howitzer.position.z += Math.cos(vehicleHeading) * vehicleSpeed * dt;
  howitzer.position.y = getTerrainHeight(howitzer.position.x, howitzer.position.z);
  howitzer.rotation.y = vehicleHeading;

  // Вращение катков
  const wheels = howitzer.userData.wheels as THREE.Mesh[];
  const angularVel = vehicleSpeed / 0.45;
  for (const w of wheels) {
    w.rotateOnAxis(WHEEL_SPIN_AXIS, angularVel * dt);
  }
}

// Scroll в прицельном режиме — высота камеры (перехватываем до камеры)
renderer.domElement.addEventListener('wheel', (e) => {
  if (aimMode) {
    e.preventDefault();
    e.stopImmediatePropagation();
    gameCam.adjustTopDownHeight(e.deltaY);
  }
}, { capture: true });

// ===== СНАРЯДЫ =====
const MUZZLE_VELOCITY = 940; // м/с (2С35)
const PROJECTILE_SIM_SPEED = 200; // шагов физики за кадр
const PHYSICS_DT = 0.02; // шаг физики (с) — мелкий чтобы не пролетал землю

interface ActiveProjectile {
  state: ProjectileState;
  params: PhysicsParams;
  mesh: THREE.Mesh;
  trail: THREE.Points;
  trailPositions: number[];
}

const activeProjectiles: ActiveProjectile[] = [];
const impactMarks: { x: number; z: number; time: number }[] = [];

function fireProjectile(): void {
  // Азимут стрельбы = направление взгляда камеры (противоположно орбите)
  const fireAz = gameCam.aimAzimuthRad;
  const fireEl = barrelElevation;

  const params: PhysicsParams = {
    muzzleVelocity: MUZZLE_VELOCITY,
    elevationRad: fireEl,
    azimuthRad: fireAz,
    windSpeed: debugParams.windSpeed,
    windDirectionRad: THREE.MathUtils.degToRad(debugParams.windDir),
    humidity: debugParams.humidity / 100,
  };

  // Позиция дула (примерно конец ствола)
  howitzer.updateMatrixWorld(true);
  const muzzleWorld = new THREE.Vector3(0, 0, 9.5);
  barrelGroup.localToWorld(muzzleWorld);

  // Начальная позиция в реальных метрах (переводим из сцены)
  const originMeters = new THREE.Vector3(
    muzzleWorld.x * SCALE,
    muzzleWorld.y * SCALE,
    muzzleWorld.z * SCALE
  );

  const state = createProjectile(originMeters, params);

  // Визуал снаряда
  const projMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4400 })
  );
  projMesh.position.copy(muzzleWorld);
  scene.add(projMesh);

  // След
  const trailGeo = new THREE.BufferGeometry();
  const trailPositions: number[] = [];
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  const trail = new THREE.Points(
    trailGeo,
    new THREE.PointsMaterial({ color: 0xff8800, size: 0.3, transparent: true, opacity: 0.6 })
  );
  scene.add(trail);

  activeProjectiles.push({ state, params, mesh: projMesh, trail, trailPositions });

  // Вспышка выстрела
  const flash = new THREE.PointLight(0xff6600, 50, 30);
  flash.position.copy(muzzleWorld);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 150);
}

function checkHit(pos: THREE.Vector3): void {
  // pos в метрах, цели в scene-units (1 unit = SCALE метров)
  const posScene = new THREE.Vector3(pos.x / SCALE, pos.y / SCALE, pos.z / SCALE);

  for (const t of targets) {
    if (t.destroyed) continue;
    const dist = posScene.distanceTo(t.mesh.position);
    if (dist < 5) { // радиус поражения ~500м
      t.destroyed = true;
      t.marked = false;
      if (selectedTarget === t) selectedTarget = null;

      // Визуал взрыва
      const explosion = new THREE.PointLight(0xff4400, 100, 50);
      explosion.position.copy(t.mesh.position);
      explosion.position.y += 3;
      scene.add(explosion);
      setTimeout(() => scene.remove(explosion), 500);

      // Скрываем цель
      t.mesh.visible = false;
      updateTargetsList();
    }
  }
}

function updateProjectiles(): void {
  for (let i = activeProjectiles.length - 1; i >= 0; i--) {
    const p = activeProjectiles[i];
    if (!p.state.alive) {
      // Удалим через 3 секунды после падения
      setTimeout(() => {
        scene.remove(p.mesh);
        scene.remove(p.trail);
      }, 3000);
      activeProjectiles.splice(i, 1);
      continue;
    }

    // Несколько шагов физики за кадр (ускоренная симуляция)
    for (let s = 0; s < PROJECTILE_SIM_SPEED; s++) {
      stepProjectile(p.state, PHYSICS_DT, p.params);

      // Проверка столкновения с рельефом (не только y<0)
      if (p.state.alive) {
        const scX = p.state.position.x / SCALE;
        const scZ = p.state.position.z / SCALE;
        const scY = p.state.position.y / SCALE;
        const terrainY = getTerrainHeight(scX, scZ);
        if (scY <= terrainY) {
          p.state.position.y = terrainY * SCALE;
          p.state.alive = false;
        }
      }

      // Добавляем точку следа (каждые 20 шагов)
      if (s % 20 === 0) {
        p.trailPositions.push(
          p.state.position.x / SCALE,
          p.state.position.y / SCALE,
          p.state.position.z / SCALE
        );
        const arr = new Float32Array(p.trailPositions);
        p.trail.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      }

      if (!p.state.alive) {
        // Снаряд упал — проверяем попадание и создаём взрыв на земле
        checkHit(p.state.position);

        const impSceneX = p.state.position.x / SCALE;
        const impSceneZ = p.state.position.z / SCALE;
        const impTerrainY = getTerrainHeight(impSceneX, impSceneZ);

        // Взрыв (свет + частицы) НА поверхности рельефа
        const impactPos = new THREE.Vector3(impSceneX, impTerrainY + 0.5, impSceneZ);

        const impactLight = new THREE.PointLight(0xff2200, 120, 60);
        impactLight.position.copy(impactPos);
        impactLight.position.y += 2;
        scene.add(impactLight);
        setTimeout(() => scene.remove(impactLight), 800);

        // Огненная сфера взрыва (видна сверху)
        const fireball = new THREE.Mesh(
          new THREE.SphereGeometry(3, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7 })
        );
        fireball.position.copy(impactPos);
        fireball.position.y += 1.5;
        scene.add(fireball);
        // Анимация затухания
        let fbLife = 0;
        const fbInterval = setInterval(() => {
          fbLife += 0.05;
          fireball.scale.setScalar(1 + fbLife * 2);
          (fireball.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - fbLife);
          if (fbLife >= 1) { scene.remove(fireball); clearInterval(fbInterval); }
        }, 50);

        // Столб дыма (виден издалека сверху)
        const smoke = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 3, 15, 8),
          new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 })
        );
        smoke.position.copy(impactPos);
        smoke.position.y += 8;
        scene.add(smoke);
        setTimeout(() => scene.remove(smoke), 3000);

        // Кратер НА рельефе
        const crater = new THREE.Mesh(
          new THREE.RingGeometry(0.5, 3, 16),
          new THREE.MeshBasicMaterial({ color: 0x332200, side: THREE.DoubleSide })
        );
        crater.rotation.x = -Math.PI / 2;
        crater.position.set(impSceneX, impTerrainY + 0.05, impSceneZ);
        scene.add(crater);

        // Запоминаем для миникарты
        impactMarks.push({ x: impactPos.x, z: impactPos.z, time: Date.now() });

        break;
      }
    }

    // Обновляем позицию меша
    p.mesh.position.set(
      p.state.position.x / SCALE,
      p.state.position.y / SCALE,
      p.state.position.z / SCALE
    );
  }
}

function updateTargetsList(): void {
  let html = '';
  for (const t of targets) {
    const cls = t.marked ? 'target-item marked' : 'target-item';
    const status = t.destroyed ? '✕ УНИЧТОЖЕНА' : t.marked ? '◉ ОТМЕЧЕНА' : '○ не отмечена';
    const dist = (t.distance / 1000).toFixed(0);
    html += `<div class="${cls}">
      #${t.id} ${t.name}<br>
      Дист: ${dist}км | ${t.speed > 0 ? (t.speed * 3.6).toFixed(0) + ' км/ч' : 'стац.'}<br>
      ${status}
    </div>`;
  }
  targetsList.innerHTML = html;
}
updateTargetsList();

// Клик — отметить цель или выстрелить
renderer.domElement.addEventListener('click', () => {
  if (!aimMode) return;

  raycaster.setFromCamera(screenCenter, gameCam.camera);
  const allChildren: THREE.Object3D[] = [];
  targets.filter(t => !t.destroyed).forEach(t => t.mesh.traverse(c => allChildren.push(c)));

  const intersects = raycaster.intersectObjects(allChildren, false);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    for (const t of targets) {
      let found = false;
      t.mesh.traverse(c => { if (c === hit) found = true; });
      if (found) {
        t.marked = !t.marked;
        selectedTarget = t.marked ? t : null;
        updateTargetsList();

        const marker = t.mesh.children.find(c => c.userData.isMarker);
        if (marker) {
          marker.traverse(c => {
            if ((c as THREE.Mesh).isMesh) {
              ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(
                t.marked ? 0xffff00 : 0xff0000
              );
            }
          });
        }
        break;
      }
    }
  }
});

// Клавиатура
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;

  if (e.code === 'Space') {
    e.preventDefault();
    fireProjectile();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    aimMode = !aimMode;
    crosshair.style.display = 'none'; // В арт-режиме прицел на миникарте
    modeLabel.textContent = aimMode
      ? 'АРТ-РЕЖИМ [Tab — обзор] [Мышь — прицел] [Scroll — высота] [Пробел — огонь]'
      : 'НАБЛЮДЕНИЕ [Tab — прицел] [WASD — движение]';
    gameCam.setAiming(aimMode);
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ===== DEBUG GUI =====
const gui = new GUI({ title: 'Отладка' });
const debugParams = {
  windSpeed: WIND_SPEED,
  windDir: THREE.MathUtils.radToDeg(WIND_DIR),
  humidity: HUMIDITY * 100,
  fogDensity: 900,
};
gui.add(debugParams, 'windSpeed', 0, 20, 0.1).name('Ветер м/с');
gui.add(debugParams, 'windDir', 0, 360, 1).name('Напр. ветра °');
gui.add(debugParams, 'humidity', 0, 100, 1).name('Влажность %');
gui.add(debugParams, 'fogDensity', 100, 2000, 10).name('Туман дальн.').onChange((v: number) => {
  (scene.fog as THREE.Fog).far = v;
});

// ===== RESIZE =====
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  gameCam.resize(window.innerWidth / window.innerHeight);
});

// ===== GAME LOOP =====
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  updateVehicle(dt);
  gameCam.setTarget(howitzer.position);

  updateTargets(targets, dt, SCALE);
  updateProjectiles();

  // В арт-режиме: бинарный поиск угла ствола через мини-симуляцию с drag
  if (aimMode) {
    const distMeters = gameCam.aimDistance * SCALE;
    const simParams: PhysicsParams = {
      muzzleVelocity: MUZZLE_VELOCITY,
      elevationRad: 0, azimuthRad: 0,
      windSpeed: debugParams.windSpeed,
      windDirectionRad: THREE.MathUtils.degToRad(debugParams.windDir),
      humidity: debugParams.humidity / 100,
    };
    // Бинарный поиск: 10 итераций достаточно для точности ~0.001 рад
    let lo = 0.01, hi = 1.3;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const range = simulateRange(mid, simParams);
      if (range < distMeters) lo = mid; else hi = mid;
    }
    barrelElevation = THREE.MathUtils.clamp((lo + hi) / 2, 0.05, 1.2);

    // Прицел на земле
    const ap = gameCam.aimPointWorld;
    reticleGroup.position.set(ap.x, getTerrainHeight(ap.x, ap.z) + 1.5, ap.z);
    reticleGroup.visible = true;
  } else {
    reticleGroup.visible = false;
  }

  // Синхронизация башни и ствола с прицелом (относительно корпуса)
  turretGroup.rotation.y = gameCam.aimAzimuthRad - vehicleHeading;
  barrelGroup.rotation.x = -barrelElevation;

  for (const t of targets) {
    const marker = t.mesh.children.find(c => c.userData.isMarker);
    if (marker) {
      marker.rotation.y += dt * 2;
      const pulse = 0.85 + 0.15 * Math.sin(Date.now() * 0.005);
      marker.scale.setScalar(pulse);
    }
  }

  gameCam.update();

  // HUD обновление
  // Азимут стрельбы (куда смотрит башня)
  const fireAzDeg = THREE.MathUtils.radToDeg(gameCam.aimAzimuthRad) % 360;
  azimuthEl.textContent = (fireAzDeg < 0 ? fireAzDeg + 360 : fireAzDeg).toFixed(1) + '°';
  elevationEl.textContent = THREE.MathUtils.radToDeg(barrelElevation).toFixed(1) + '°';
  speedEl.textContent = (Math.abs(vehicleSpeed) / MAX_SPEED * 100).toFixed(0);

  if (aimMode) {
    const aimDist = gameCam.aimDistance * SCALE;
    distanceInfo.textContent = `Дист. прицела: ${(aimDist / 1000).toFixed(1)} км`;
  } else if (selectedTarget) {
    const d = howitzer.position.distanceTo(selectedTarget.mesh.position) * SCALE;
    distanceInfo.textContent = `До цели: ${(d / 1000).toFixed(1)} км`;
  } else {
    distanceInfo.textContent = '';
  }

  if (aimMode) {
    raycaster.setFromCamera(screenCenter, gameCam.camera);
    const allChildren: THREE.Object3D[] = [];
    targets.filter(t => !t.destroyed).forEach(t => t.mesh.traverse(c => allChildren.push(c)));
    const intersects = raycaster.intersectObjects(allChildren, false);
    crosshair.style.borderColor = intersects.length > 0
      ? 'rgba(255,255,0,0.9)'
      : 'rgba(0,255,0,0.6)';
  }

  drawMinimap();
  renderer.render(scene, gameCam.camera);
}

animate();