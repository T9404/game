import * as THREE from 'three';
import GUI from 'lil-gui';
import { GameCamera } from './camera';
import { createHowitzer } from './howitzer';
import { createTargets, updateTargets, type TargetData } from './targets';
import { createProjectile, stepProjectile, type ProjectileState, type PhysicsParams } from './physics';
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

// ===== ГАУБИЦА =====
const howitzer = createHowitzer();
howitzer.position.set(0, 0, 0);
scene.add(howitzer);

// ===== ЦЕЛИ =====
const targets = createTargets();
for (const t of targets) {
  scene.add(t.mesh);
}

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

// Scroll в прицельном режиме — угол ствола (перехватываем до камеры)
renderer.domElement.addEventListener('wheel', (e) => {
  if (aimMode) {
    e.preventDefault();
    e.stopImmediatePropagation();
    barrelElevation += e.deltaY * -0.003;
    barrelElevation = THREE.MathUtils.clamp(barrelElevation, 0.05, 1.2); // ~3° — ~69°
  }
}, { capture: true });

// ===== СНАРЯДЫ =====
const MUZZLE_VELOCITY = 940; // м/с (2С35)
const PROJECTILE_SIM_SPEED = 20; // ускорение симуляции
const PHYSICS_DT = 0.05; // шаг физики (с)

interface ActiveProjectile {
  state: ProjectileState;
  params: PhysicsParams;
  mesh: THREE.Mesh;
  trail: THREE.Points;
  trailPositions: number[];
}

const activeProjectiles: ActiveProjectile[] = [];

function fireProjectile(): void {
  // Азимут стрельбы = направление взгляда камеры (противоположно орбите)
  const fireAz = gameCam.azimuthRad + Math.PI;
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

      // Добавляем точку следа (каждые 4 шага)
      if (s % 4 === 0) {
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

        const impactPos = new THREE.Vector3(
          p.state.position.x / SCALE,
          0.5,
          p.state.position.z / SCALE
        );
        const impactLight = new THREE.PointLight(0xff2200, 80, 40);
        impactLight.position.copy(impactPos);
        scene.add(impactLight);
        setTimeout(() => scene.remove(impactLight), 600);

        // Кратер (визуальный)
        const crater = new THREE.Mesh(
          new THREE.RingGeometry(0.5, 3, 16),
          new THREE.MeshBasicMaterial({ color: 0x332200, side: THREE.DoubleSide })
        );
        crater.rotation.x = -Math.PI / 2;
        crater.position.copy(impactPos);
        crater.position.y = 0.02;
        scene.add(crater);

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

  if (e.code === 'Space' && aimMode && activeProjectiles.length === 0) {
    e.preventDefault();
    fireProjectile();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    aimMode = !aimMode;
    crosshair.style.display = aimMode ? 'block' : 'none';
    modeLabel.textContent = aimMode
      ? 'ПРИЦЕЛИВАНИЕ [Tab — обзор] [Клик — отметить] [Scroll — угол] [Пробел — огонь]'
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

  // Синхронизация башни и ствола с прицелом (относительно корпуса)
  turretGroup.rotation.y = gameCam.azimuthRad + Math.PI - vehicleHeading;
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
  const fireAzDeg = THREE.MathUtils.radToDeg(gameCam.azimuthRad + Math.PI) % 360;
  azimuthEl.textContent = (fireAzDeg < 0 ? fireAzDeg + 360 : fireAzDeg).toFixed(1) + '°';
  elevationEl.textContent = THREE.MathUtils.radToDeg(barrelElevation).toFixed(1) + '°';
  speedEl.textContent = (Math.abs(vehicleSpeed) / MAX_SPEED * 100).toFixed(0);

  if (selectedTarget) {
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

  renderer.render(scene, gameCam.camera);
}

animate();