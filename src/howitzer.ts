import * as THREE from 'three';

/**
 * Процедурная модель 2С35 «Коалиция-СВ»
 * Упрощённая, но узнаваемая
 */
export function createHowitzer(): THREE.Group {
  const group = new THREE.Group();
  const mat = {
    body: new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8 }),     // хаки
    dark: new THREE.MeshStandardMaterial({ color: 0x2a3a2a, roughness: 0.9 }),     // тёмный
    metal: new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.4 }),
    track: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x3a4a3a, metalness: 0.3, roughness: 0.5 }),
  };

  // --- Корпус (шасси) ---
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1.5, 8),
    mat.body
  );
  hull.position.y = 1;
  hull.castShadow = true;
  group.add(hull);

  // Скосы корпуса спереди
  const frontSlope = new THREE.Mesh(
    new THREE.BoxGeometry(3.8, 1, 2),
    mat.body
  );
  frontSlope.position.set(0, 1.8, 4.2);
  frontSlope.rotation.x = -0.3;
  group.add(frontSlope);

  // --- Гусеницы ---
  const wheels: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1.2, 8.5),
      mat.track
    );
    track.position.set(side * 2.3, 0.6, 0);
    group.add(track);

    // Катки (по 6 на сторону)
    for (let i = 0; i < 6; i++) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12),
        mat.metal
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 2.3, 0.5, -3 + i * 1.3);
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  // --- Башня ---
  const turret = new THREE.Group();
  turret.position.set(0, 2.2, -0.5);

  // Основание башни
  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.8, 2, 1.2, 8),
    mat.body
  );
  group.add(turretBase);
  turret.add(turretBase);

  // Верх башни (скошенный)
  const turretTop = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.4, 3.5),
    mat.body
  );
  turretTop.position.set(0, 1, 0);
  turretTop.castShadow = true;
  turret.add(turretTop);

  // Скос башни назад
  const turretBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 1, 1.5),
    mat.dark
  );
  turretBack.position.set(0, 0.8, -2);
  turretBack.rotation.x = 0.2;
  turret.add(turretBack);

  // --- Ствол (основная часть) ---
  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 1.2, 1.5);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.18, 9, 12),
    mat.barrel
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 4.5;
  barrelGroup.add(barrel);

  // Дульный тормоз
  const muzzleBrake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.22, 0.8, 8),
    mat.metal
  );
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.z = 9.2;
  barrelGroup.add(muzzleBrake);

  // Эжектор на стволе
  const ejector = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8),
    mat.dark
  );
  ejector.rotation.x = Math.PI / 2;
  ejector.position.z = 5;
  barrelGroup.add(ejector);

  turret.add(barrelGroup);

  // --- Antenna on turret ---
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), mat.metal);
  antenna.position.set(-0.8, 2.5, -0.5);
  turret.add(antenna);

  // --- Hatches on turret top ---
  for (let i = 0; i < 2; i++) {
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 8), mat.metal);
    hatch.position.set(-0.5 + i * 1.0, 1.78, -0.3);
    turret.add(hatch);
  }

  group.add(turret);

  // --- Fenders over tracks ---
  for (const side of [-1, 1]) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 9), mat.body);
    fender.position.set(side * 2.3, 1.35, 0);
    group.add(fender);
  }

  // --- Side skirts ---
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 8), mat.dark);
    skirt.position.set(side * 1.65, 0.7, 0);
    group.add(skirt);
  }

  // --- Tool boxes on hull sides ---
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.8), mat.dark);
      toolbox.position.set(side * 1.85, 1.6, -1.5 + i * 3);
      group.add(toolbox);
    }
  }

  // --- Headlights on front ---
  for (const side of [-1, 1]) {
    const headlight = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.3 })
    );
    headlight.position.set(side * 1.5, 1.9, 5.0);
    group.add(headlight);
  }

  // --- Exhaust pipes at rear ---
  for (const side of [-1, 1]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6), mat.metal);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 1.0, 1.3, -4.3);
    group.add(exhaust);
  }

  // Сохраняем ссылки для анимации
  group.userData.turret = turret;
  group.userData.barrelGroup = barrelGroup;
  group.userData.wheels = wheels;

  return group;
}