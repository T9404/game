import * as THREE from 'three';

export interface TargetData {
  id: number;
  name: string;
  mesh: THREE.Group;
  distance: number;       // м
  speed: number;          // м/с (0 = неподвижная)
  direction: THREE.Vector3; // направление движения
  marked: boolean;        // отмечена ли на карте
  destroyed: boolean;
  // Маршрут по точкам
  waypoints?: THREE.Vector3[];
  waypointIdx?: number;
  heading?: number;       // текущий курс (рад)
}

function createTank(color: number, variant: 'light' | 'medium' | 'heavy'): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.6 });

  // Размеры зависят от варианта
  const cfg = variant === 'heavy'
    ? { hullW: 3.8, hullH: 1.4, hullL: 7, trackW: 1.0, trackH: 1.0, trackL: 7.5, turretR1: 1.6, turretR2: 1.8, turretH: 1.0, barrelR: 0.14, barrelL: 8, wheels: 6, wheelR: 0.4 }
    : variant === 'medium'
    ? { hullW: 3.4, hullH: 1.2, hullL: 6, trackW: 0.9, trackH: 0.9, trackL: 6.5, turretR1: 1.3, turretR2: 1.5, turretH: 0.9, barrelR: 0.11, barrelL: 6, wheels: 5, wheelR: 0.35 }
    : { hullW: 2.8, hullH: 1.0, hullL: 5, trackW: 0.8, trackH: 0.8, trackL: 5.5, turretR1: 1.0, turretR2: 1.2, turretH: 0.7, barrelR: 0.08, barrelL: 4.5, wheels: 5, wheelR: 0.3 };

  // --- Корпус ---
  const hull = new THREE.Mesh(new THREE.BoxGeometry(cfg.hullW, cfg.hullH, cfg.hullL), mat);
  hull.position.y = cfg.trackH + cfg.hullH / 2;
  hull.castShadow = true;
  g.add(hull);

  // Скос спереди (наклонная лобовая броня)
  const frontSlope = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.hullW - 0.2, cfg.hullH * 0.7, cfg.hullL * 0.25), mat
  );
  frontSlope.rotation.x = -0.4;
  frontSlope.position.set(0, cfg.trackH + cfg.hullH * 1.1, cfg.hullL * 0.45);
  frontSlope.castShadow = true;
  g.add(frontSlope);

  // Скос сзади
  const rearSlope = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.hullW - 0.3, cfg.hullH * 0.5, cfg.hullL * 0.15), mat
  );
  rearSlope.rotation.x = 0.3;
  rearSlope.position.set(0, cfg.trackH + cfg.hullH * 0.8, -cfg.hullL * 0.45);
  g.add(rearSlope);

  // --- Гусеницы и катки ---
  const trackOffset = cfg.hullW / 2 + cfg.trackW / 2 - 0.1;
  for (const side of [-1, 1]) {
    // Гусеница
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.trackW, cfg.trackH, cfg.trackL), darkMat
    );
    track.position.set(side * trackOffset, cfg.trackH / 2, 0);
    g.add(track);

    // Крыло над гусеницей
    const fender = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.trackW + 0.2, 0.06, cfg.trackL + 0.3), mat
    );
    fender.position.set(side * trackOffset, cfg.trackH + cfg.hullH / 2, 0);
    g.add(fender);

    // Катки
    for (let i = 0; i < cfg.wheels; i++) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(cfg.wheelR, cfg.wheelR, 0.2, 10), metalMat
      );
      wheel.rotation.z = Math.PI / 2;
      const zPos = -cfg.trackL / 2 + cfg.trackL / (cfg.wheels + 1) * (i + 1);
      wheel.position.set(side * trackOffset, cfg.wheelR, zPos);
      g.add(wheel);
    }

    // Ведущее колесо (спереди, побольше)
    const drive = new THREE.Mesh(
      new THREE.CylinderGeometry(cfg.wheelR * 1.2, cfg.wheelR * 1.2, 0.25, 10), metalMat
    );
    drive.rotation.z = Math.PI / 2;
    drive.position.set(side * trackOffset, cfg.wheelR * 1.3, cfg.trackL / 2 - 0.3);
    g.add(drive);

    // Ленивец (сзади)
    const idler = new THREE.Mesh(
      new THREE.CylinderGeometry(cfg.wheelR * 1.1, cfg.wheelR * 1.1, 0.25, 10), metalMat
    );
    idler.rotation.z = Math.PI / 2;
    idler.position.set(side * trackOffset, cfg.wheelR * 1.2, -cfg.trackL / 2 + 0.3);
    g.add(idler);
  }

  // --- Башня ---
  const turretY = cfg.trackH + cfg.hullH + cfg.turretH / 2;
  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.turretR1, cfg.turretR2, cfg.turretH, 10), mat
  );
  turretBase.position.set(0, turretY, -cfg.hullL * 0.05);
  turretBase.castShadow = true;
  g.add(turretBase);

  // Верхняя часть башни (скошенная)
  const turretTop = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.turretR1 * 1.6, cfg.turretH * 0.5, cfg.turretR1 * 1.8), mat
  );
  turretTop.position.set(0, turretY + cfg.turretH * 0.5, -cfg.hullL * 0.05);
  g.add(turretTop);

  // Корма башни (ящик боеукладки)
  const turretRear = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.turretR1 * 1.4, cfg.turretH * 0.7, cfg.turretR1 * 0.6), mat
  );
  turretRear.position.set(0, turretY, -cfg.hullL * 0.05 - cfg.turretR2 - 0.2);
  g.add(turretRear);

  // --- Ствол ---
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.barrelR * 0.8, cfg.barrelR, cfg.barrelL, 10), metalMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, turretY, cfg.barrelL / 2 + cfg.turretR1 * 0.5);
  g.add(barrel);

  // Дульный тормоз
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.barrelR * 1.5, cfg.barrelR * 1.2, cfg.barrelL * 0.06, 8), metalMat
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, turretY, cfg.barrelL + cfg.turretR1 * 0.5);
  g.add(muzzle);

  // Эжектор на стволе
  const ejector = new THREE.Mesh(
    new THREE.CylinderGeometry(cfg.barrelR * 1.3, cfg.barrelR * 1.3, cfg.barrelL * 0.04, 8), darkMat
  );
  ejector.rotation.x = Math.PI / 2;
  ejector.position.set(0, turretY, cfg.barrelL * 0.45 + cfg.turretR1 * 0.5);
  g.add(ejector);

  // --- Детали ---
  // Люк командира
  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.06, 8), metalMat
  );
  hatch.position.set(0.4, turretY + cfg.turretH * 0.75, -cfg.hullL * 0.05 - 0.3);
  g.add(hatch);

  // Люк наводчика
  const hatch2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.06, 8), metalMat
  );
  hatch2.position.set(-0.5, turretY + cfg.turretH * 0.75, -cfg.hullL * 0.05 + 0.3);
  g.add(hatch2);

  // Фары
  for (const side of [-1, 1]) {
    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.3 })
    );
    headlight.position.set(side * (cfg.hullW / 2 - 0.3), cfg.trackH + cfg.hullH * 0.9, cfg.hullL / 2 + 0.1);
    g.add(headlight);
  }

  // Антенна
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 2.5, 3), metalMat
  );
  antenna.position.set(-cfg.turretR1 + 0.2, turretY + cfg.turretH + 1.25, -cfg.hullL * 0.05 - cfg.turretR2 + 0.3);
  g.add(antenna);

  // Выхлоп сзади
  for (const side of [-1, 1]) {
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.4, 5), darkMat
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 0.6, cfg.trackH + cfg.hullH * 0.5, -cfg.hullL / 2 - 0.2);
    g.add(exhaust);
  }

  return g;
}

function createTargetMesh(color: number, type: 'btr' | 'sau' | 'bunker'): THREE.Group {
  const g = new THREE.Group();

  // Все враги — танки разных классов
  const variant = type === 'btr' ? 'light' : type === 'sau' ? 'heavy' : 'medium';
  const tank = createTank(color, variant);
  g.add(tank);

  // Маркер над целью (кольцо + ромб)
  const markerGroup = new THREE.Group();
  const markerRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.08, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.7 })
  );
  markerRing.rotation.x = Math.PI / 2;
  markerRing.position.y = 5;
  markerGroup.add(markerRing);

  const markerDiamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6, 0),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 })
  );
  markerDiamond.position.y = 5;
  markerGroup.add(markerDiamond);
  markerGroup.userData.isMarker = true;
  g.add(markerGroup);

  return g;
}

export function createTargets(): TargetData[] {
  const targets: TargetData[] = [];

  // Цель 1: подвижная, 20км — едет по квадрату
  const t1 = createTargetMesh(0x8B4513, 'btr');
  const cx = 30, cz = 195, half = 15; // центр ~20км, сторона 3км
  const wp = [
    new THREE.Vector3(cx + half, 0, cz + half),
    new THREE.Vector3(cx - half, 0, cz + half),
    new THREE.Vector3(cx - half, 0, cz - half),
    new THREE.Vector3(cx + half, 0, cz - half),
  ];
  t1.position.set(wp[0].x, 0, wp[0].z);
  targets.push({
    id: 1,
    name: 'БТР (подвижн.)',
    mesh: t1,
    distance: 20000,
    speed: 20 * 1000 / 3600,
    direction: new THREE.Vector3(0, 0, 0),
    marked: false,
    destroyed: false,
    waypoints: wp,
    waypointIdx: 1,
    heading: 0,
  });

  // Цель 2: неподвижная, 30км
  const t2 = createTargetMesh(0x5A5A5A, 'bunker');
  t2.position.set(-100, 0, 280); // ~30км
  targets.push({
    id: 2,
    name: 'Бункер (неподвижн.)',
    mesh: t2,
    distance: 30000,
    speed: 0,
    direction: new THREE.Vector3(0, 0, 0),
    marked: false,
    destroyed: false,
  });

  // Цель 3: неподвижная, 50км
  const t3 = createTargetMesh(0x6B6B3A, 'sau');
  t3.position.set(200, 0, 460); // ~50км
  targets.push({
    id: 3,
    name: 'САУ (неподвижн.)',
    mesh: t3,
    distance: 50000,
    speed: 0,
    direction: new THREE.Vector3(0, 0, 0),
    marked: false,
    destroyed: false,
  });

  return targets;
}

export function updateTargets(
  targets: TargetData[], dt: number, scale: number,
  getHeight?: (x: number, z: number) => number
): void {
  for (const t of targets) {
    if (t.destroyed) continue;

    if (t.waypoints && t.waypointIdx != null && t.heading != null) {
      const wp = t.waypoints[t.waypointIdx];
      const dx = wp.x - t.mesh.position.x;
      const dz = wp.z - t.mesh.position.z;
      const distToWp = Math.sqrt(dx * dx + dz * dz);

      // Целевой курс к следующей точке
      const targetHeading = Math.atan2(dx, dz);

      // Плавный поворот (как танк — на месте или в движении)
      let angleDiff = targetHeading - t.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const turnRate = 1.5; // рад/с
      const maxTurn = turnRate * dt;
      t.heading += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

      // Едем вперёд только если смотрим примерно в нужную сторону
      const moveSpeed = (t.speed / scale) * 30; // ускорение для игрового масштаба
      if (Math.abs(angleDiff) < 0.3) {
        t.mesh.position.x += Math.sin(t.heading) * moveSpeed * dt;
        t.mesh.position.z += Math.cos(t.heading) * moveSpeed * dt;
      }

      // Достигли точки — следующая
      if (distToWp < 2) {
        t.waypointIdx = (t.waypointIdx + 1) % t.waypoints.length;
      }

      t.mesh.rotation.y = t.heading + Math.PI;

      // Обновляем distance от игрока
      const ddx = t.mesh.position.x * scale, ddz = t.mesh.position.z * scale;
      t.distance = Math.sqrt(ddx * ddx + ddz * ddz);
    } else if (t.speed > 0) {
      // Линейное движение
      t.mesh.position.x += (t.direction.x * t.speed * dt) / scale;
      t.mesh.position.z += (t.direction.z * t.speed * dt) / scale;
    }

    // Ставим на рельеф
    if (getHeight) {
      t.mesh.position.y = getHeight(t.mesh.position.x, t.mesh.position.z);
    }

    // Вращаем и пульсируем маркер (для всех целей)
    const marker = t.mesh.children.find(c => c.userData.isMarker);
    if (marker) {
      marker.rotation.y += dt * 2;
      const pulse = 0.85 + 0.15 * Math.sin(Date.now() * 0.005);
      marker.scale.setScalar(pulse);
    }
  }
}
