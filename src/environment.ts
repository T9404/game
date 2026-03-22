import * as THREE from 'three';

let seed = 12345;
function seededRandom(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

export function populateEnvironment(
  scene: THREE.Scene,
  getHeight: (x: number, z: number) => number
): void {
  const tempMatrix = new THREE.Matrix4();
  const tempPosition = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const tempScale = new THREE.Vector3();

  // === TREES (400) ===
  const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3a1e });
  const crownGeometry = new THREE.ConeGeometry(1.2, 3, 6);
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a1e });

  const treeCount = 400;
  const trunkMesh = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeCount);
  const crownMesh = new THREE.InstancedMesh(crownGeometry, crownMaterial, treeCount);

  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  crownMesh.castShadow = true;
  crownMesh.receiveShadow = true;

  let treeIndex = 0;
  while (treeIndex < treeCount) {
    const x = (seededRandom() * 2 - 1) * 900;
    const z = (seededRandom() * 2 - 1) * 900;
    const r = Math.sqrt(x * x + z * z);
    if (r < 30) continue;

    const height = getHeight(x, z);
    if (height > 9) continue;

    const scale = 0.7 + seededRandom() * 0.6;

    // Trunk
    tempPosition.set(x, height + 1 * scale, z);
    tempQuaternion.identity();
    tempScale.set(scale, scale, scale);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    trunkMesh.setMatrixAt(treeIndex, tempMatrix);

    // Crown
    tempPosition.set(x, height + 2.8 * scale, z);
    tempQuaternion.identity();
    tempScale.set(scale, scale, scale);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    crownMesh.setMatrixAt(treeIndex, tempMatrix);

    treeIndex++;
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  scene.add(trunkMesh);
  scene.add(crownMesh);

  // === BUSHES (300) ===
  const bushGeometry = new THREE.SphereGeometry(0.5, 6, 5);
  const bushMaterial = new THREE.MeshStandardMaterial({ color: 0x3a6a2a });

  const bushCount = 300;
  const bushMesh = new THREE.InstancedMesh(bushGeometry, bushMaterial, bushCount);
  bushMesh.castShadow = true;
  bushMesh.receiveShadow = true;

  let bushIndex = 0;
  while (bushIndex < bushCount) {
    const x = (seededRandom() * 2 - 1) * 900;
    const z = (seededRandom() * 2 - 1) * 900;
    const r = Math.sqrt(x * x + z * z);
    if (r < 20) continue;

    const height = getHeight(x, z);

    tempPosition.set(x, height + 0.15, z);
    tempQuaternion.identity();
    tempScale.set(1, 0.5, 1);
    tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
    bushMesh.setMatrixAt(bushIndex, tempMatrix);

    bushIndex++;
  }

  bushMesh.instanceMatrix.needsUpdate = true;
  scene.add(bushMesh);

  // === ROCKS (150) ===
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x777777,
    roughness: 0.95,
  });

  const rockTemplates: THREE.IcosahedronGeometry[] = [];
  for (let t = 0; t < 5; t++) {
    const geo = new THREE.IcosahedronGeometry(0.8, 1);
    const posAttr = geo.getAttribute('position');
    for (let v = 0; v < posAttr.count; v++) {
      const dx = (seededRandom() - 0.5) * 0.4;
      const dy = (seededRandom() - 0.5) * 0.4;
      const dz = (seededRandom() - 0.5) * 0.4;
      posAttr.setXYZ(
        v,
        posAttr.getX(v) + dx,
        posAttr.getY(v) + dy,
        posAttr.getZ(v) + dz
      );
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
    rockTemplates.push(geo);
  }

  const instancesPerTemplate = 30;

  for (let t = 0; t < 5; t++) {
    const rockMesh = new THREE.InstancedMesh(
      rockTemplates[t],
      rockMaterial,
      instancesPerTemplate
    );
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    let rockIndex = 0;
    while (rockIndex < instancesPerTemplate) {
      const x = (seededRandom() * 2 - 1) * 900;
      const z = (seededRandom() * 2 - 1) * 900;
      const r = Math.sqrt(x * x + z * z);
      if (r < 25) continue;

      const height = getHeight(x, z);
      const scale = 0.5 + seededRandom() * 1.5;
      const yRotation = seededRandom() * Math.PI * 2;

      tempPosition.set(x, height, z);
      tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yRotation);
      tempScale.set(scale, scale, scale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      rockMesh.setMatrixAt(rockIndex, tempMatrix);

      rockIndex++;
    }

    rockMesh.instanceMatrix.needsUpdate = true;
    scene.add(rockMesh);
  }
}
