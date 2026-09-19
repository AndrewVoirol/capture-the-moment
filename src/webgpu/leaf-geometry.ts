/**
 * 3D Botanical Leaf Geometries for WebGPU Instancing
 * Generates smooth organic meshes with calculated 3D normals, cupping, and curl:
 * 0: Japanese Maple (7 radiating palmate lobes)
 * 1: Sugar Maple (5 broad lobes with lateral notches)
 * 2: Oak (sinuous undulating rounded lobes with continuous quad strip)
 * 3: Ginkgo (delicate fan with radial ribbing & central notch)
 * 4: Birch / Aspen (fluttering cupped spade)
 */

export interface LeafVertex {
  pos: [number, number, number];
  norm: [number, number, number];
  uv: [number, number];
  feature: [number, number, number, number]; // [edgeDist, veinDist, veinAngle, speciesId]
}

export interface MeshData {
  vertices: Float32Array; // 12 floats per vertex
  indices: Uint16Array;
  indexCount: number;
  vertexCount: number;
  indexOffset: number;
}

export class LeafGeometryGenerator {
  public static buildAllMeshes(): {
    combinedVertices: Float32Array;
    combinedIndices: Uint16Array;
    speciesOffsets: Array<{ indexOffset: number; indexCount: number }>;
  } {
    const meshes = [
      this.createJapaneseMapleMesh(),
      this.createSugarMapleMesh(),
      this.createOakMesh(),
      this.createGinkgoMesh(),
      this.createBirchMesh()
    ];

    let totalVerts = 0;
    let totalIndices = 0;

    for (const m of meshes) {
      totalVerts += m.vertexCount;
      totalIndices += m.indexCount;
    }

    const pad = (totalIndices % 2 !== 0) ? 1 : 0;
    const combinedVertices = new Float32Array(totalVerts * 12);
    const combinedIndices = new Uint16Array(totalIndices + pad);
    const speciesOffsets: Array<{ indexOffset: number; indexCount: number }> = [];

    let vertOffset = 0;
    let indOffset = 0;

    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      combinedVertices.set(m.vertices, vertOffset * 12);

      for (let j = 0; j < m.indexCount; j++) {
        combinedIndices[indOffset + j] = m.indices[j] + vertOffset;
      }

      speciesOffsets.push({
        indexOffset: indOffset,
        indexCount: m.indexCount
      });

      vertOffset += m.vertexCount;
      indOffset += m.indexCount;
    }

    return {
      combinedVertices,
      combinedIndices,
      speciesOffsets
    };
  }

  /**
   * Recomputes smooth vertex normals from triangle cross-products
   */
  private static recomputeNormals(verts: LeafVertex[], indices: number[]) {
    const normalAcc: Array<[number, number, number]> = verts.map(() => [0, 0, 0]);

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      const p0 = verts[i0].pos;
      const p1 = verts[i1].pos;
      const p2 = verts[i2].pos;

      const ax = p1[0] - p0[0];
      const ay = p1[1] - p0[1];
      const az = p1[2] - p0[2];

      const bx = p2[0] - p0[0];
      const by = p2[1] - p0[1];
      const bz = p2[2] - p0[2];

      // Cross product
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;

      normalAcc[i0][0] += nx; normalAcc[i0][1] += ny; normalAcc[i0][2] += nz;
      normalAcc[i1][0] += nx; normalAcc[i1][1] += ny; normalAcc[i1][2] += nz;
      normalAcc[i2][0] += nx; normalAcc[i2][1] += ny; normalAcc[i2][2] += nz;
    }

    for (let i = 0; i < verts.length; i++) {
      const n = normalAcc[i];
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len > 0.0001) {
        verts[i].norm = [n[0] / len, n[1] / len, n[2] / len];
      } else {
        verts[i].norm = [0, 0, 1];
      }
    }
  }

  private static packVertices(verts: LeafVertex[]): Float32Array {
    const arr = new Float32Array(verts.length * 12);
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      const base = i * 12;
      arr[base + 0] = v.pos[0];
      arr[base + 1] = v.pos[1];
      arr[base + 2] = v.pos[2];
      arr[base + 3] = v.norm[0];
      arr[base + 4] = v.norm[1];
      arr[base + 5] = v.norm[2];
      arr[base + 6] = v.uv[0];
      arr[base + 7] = v.uv[1];
      arr[base + 8] = v.feature[0];
      arr[base + 9] = v.feature[1];
      arr[base + 10] = v.feature[2];
      arr[base + 11] = v.feature[3];
    }
    return arr;
  }

  /**
   * Species 0: Japanese Maple (Acer palmatum)
   * 7 radiating slender palmate lobes with central stem node & petiole
   */
  private static createJapaneseMapleMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 0;

    // Petiole base
    const petioleIdx = verts.length;
    verts.push({
      pos: [0, -0.65, 0.0],
      norm: [0, 0, 1],
      uv: [0.5, 0.0],
      feature: [0.3, 0.0, 0.0, speciesId]
    });

    // Central leaf node
    const centerIdx = verts.length;
    verts.push({
      pos: [0, -0.15, 0.04],
      norm: [0, 0, 1],
      uv: [0.5, 0.35],
      feature: [0.8, 0.0, 0.0, speciesId]
    });

    // Connect petiole
    // 7 palmate lobes
    const lobeAngles = [-1.55, -1.05, -0.52, 0.0, 0.52, 1.05, 1.55];
    const lobeLengths = [0.52, 0.76, 0.94, 1.08, 0.94, 0.76, 0.52];

    let prevWingRight = -1;

    for (let l = 0; l < lobeAngles.length; l++) {
      const ang = lobeAngles[l];
      const len = lobeLengths[l];
      const tipX = Math.sin(ang) * len;
      const tipY = -0.15 + Math.cos(ang) * len;
      // 3D curl at tip
      const curlZ = Math.sin(len * 2.5) * 0.06;

      const tipIdx = verts.length;
      verts.push({
        pos: [tipX, tipY, curlZ],
        norm: [0, 0, 1],
        uv: [tipX * 0.45 + 0.5, tipY * 0.45 + 0.5],
        feature: [0.0, 0.0, ang, speciesId]
      });

      const leftAng = ang - 0.14;
      const flankLen = len * 0.56;
      const flankL = verts.length;
      verts.push({
        pos: [Math.sin(leftAng) * flankLen, -0.15 + Math.cos(leftAng) * flankLen, curlZ * 0.4 + 0.02],
        norm: [0, 0, 1],
        uv: [Math.sin(leftAng) * flankLen * 0.45 + 0.5, (-0.15 + Math.cos(leftAng) * flankLen) * 0.45 + 0.5],
        feature: [0.08, 0.12, ang, speciesId]
      });

      const rightAng = ang + 0.14;
      const flankR = verts.length;
      verts.push({
        pos: [Math.sin(rightAng) * flankLen, -0.15 + Math.cos(rightAng) * flankLen, curlZ * 0.4 + 0.02],
        norm: [0, 0, 1],
        uv: [Math.sin(rightAng) * flankLen * 0.45 + 0.5, (-0.15 + Math.cos(rightAng) * flankLen) * 0.45 + 0.5],
        feature: [0.08, 0.12, ang, speciesId]
      });

      // Triangles for lobe
      indices.push(centerIdx, flankL, tipIdx);
      indices.push(centerIdx, tipIdx, flankR);

      // Sinus webbing connecting to previous lobe
      if (prevWingRight !== -1) {
        indices.push(centerIdx, prevWingRight, flankL);
      }
      prevWingRight = flankR;
    }

    // Connect petiole stem
    const firstFlankL = 2 + 1; // lobe 0 flankL
    const lastFlankR = verts.length - 1; // lobe 6 flankR
    indices.push(petioleIdx, firstFlankL, centerIdx);
    indices.push(petioleIdx, centerIdx, lastFlankR);

    this.recomputeNormals(verts, indices);

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 1: Sugar Maple (Acer saccharum)
   * 5 broad lobes with lateral notched wings and cupped blade
   */
  private static createSugarMapleMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 1;

    // Petiole base
    const petioleIdx = verts.length;
    verts.push({
      pos: [0, -0.65, 0.0],
      norm: [0, 0, 1],
      uv: [0.5, 0.05],
      feature: [0.3, 0.0, 0.0, speciesId]
    });

    const centerIdx = verts.length;
    verts.push({
      pos: [0, -0.1, 0.05],
      norm: [0, 0, 1],
      uv: [0.5, 0.38],
      feature: [0.8, 0.0, 0.0, speciesId]
    });

    const lobeAngles = [-1.25, -0.62, 0.0, 0.62, 1.25];
    const lobeLengths = [0.68, 0.98, 1.15, 0.98, 0.68];

    let prevWingRight = -1;

    for (let l = 0; l < lobeAngles.length; l++) {
      const ang = lobeAngles[l];
      const len = lobeLengths[l];
      const tipX = Math.sin(ang) * len;
      const tipY = -0.1 + Math.cos(ang) * len;
      const curlZ = Math.sin(ang * 1.5) * 0.05 + Math.sin(len * 2.0) * 0.04;

      const tipIdx = verts.length;
      verts.push({
        pos: [tipX, tipY, curlZ],
        norm: [0, 0, 1],
        uv: [tipX * 0.4 + 0.5, tipY * 0.4 + 0.5],
        feature: [0.0, 0.0, ang, speciesId]
      });

      const wingL = verts.length;
      const wlAng = ang - 0.22;
      verts.push({
        pos: [Math.sin(wlAng) * len * 0.62, -0.1 + Math.cos(wlAng) * len * 0.62, curlZ * 0.5 + 0.02],
        norm: [0, 0, 1],
        uv: [0.5 + Math.sin(wlAng) * len * 0.28, 0.4 + Math.cos(wlAng) * len * 0.28],
        feature: [0.05, 0.18, ang, speciesId]
      });

      const wingR = verts.length;
      const wrAng = ang + 0.22;
      verts.push({
        pos: [Math.sin(wrAng) * len * 0.62, -0.1 + Math.cos(wrAng) * len * 0.62, curlZ * 0.5 + 0.02],
        norm: [0, 0, 1],
        uv: [0.5 + Math.sin(wrAng) * len * 0.28, 0.4 + Math.cos(wrAng) * len * 0.28],
        feature: [0.05, 0.18, ang, speciesId]
      });

      indices.push(centerIdx, wingL, tipIdx);
      indices.push(centerIdx, tipIdx, wingR);

      if (prevWingRight !== -1) {
        indices.push(centerIdx, prevWingRight, wingL);
      }
      prevWingRight = wingR;
    }

    // Connect petiole to outer lobe wings
    const firstWingL = 2 + 1; // lobe 0 wingL
    const lastWingR = verts.length - 1; // lobe 4 wingR
    indices.push(petioleIdx, firstWingL, centerIdx);
    indices.push(petioleIdx, centerIdx, lastWingR);

    this.recomputeNormals(verts, indices);

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 2: Oak (Quercus alba)
   * Continuous smooth quad-strip with sinuous undulating rounded lobes
   */
  private static createOakMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 2;

    const spineSegments = 16;

    // Build structured grid: 3 vertices per segment (Left Margin, Spine, Right Margin)
    for (let i = 0; i <= spineSegments; i++) {
      const t = i / spineSegments;
      const y = -0.75 + t * 1.5;

      // Base width envelope (tapers smoothly at petiole base and apex tip)
      const baseEnvelope = Math.pow(Math.sin(t * Math.PI), 0.65);
      // 3 pairs of rounded undulating lobes
      const lobeWave = 0.36 + 0.16 * Math.sin((t * 3.5 - 0.2) * Math.PI * 2.0);
      const width = Math.max(0.01, baseEnvelope * lobeWave);

      // Spine longitudinal curl
      const spineCurlZ = Math.sin(t * Math.PI) * 0.07;
      // Lateral trough cupping
      const cupOffsetZ = 0.04 * (width / 0.5);

      // 1. Left Margin vertex
      const leftIdx = verts.length;
      verts.push({
        pos: [-width, y, spineCurlZ + cupOffsetZ],
        norm: [0, 0, 1],
        uv: [0.5 - width * 0.5, t],
        feature: [0.0, width, -1.3, speciesId]
      });

      // 2. Center Spine vertex
      const spineIdx = verts.length;
      verts.push({
        pos: [0, y, spineCurlZ],
        norm: [0, 0, 1],
        uv: [0.5, t],
        feature: [0.8, 0.0, 0.0, speciesId]
      });

      // 3. Right Margin vertex
      const rightIdx = verts.length;
      verts.push({
        pos: [width, y, spineCurlZ + cupOffsetZ],
        norm: [0, 0, 1],
        uv: [0.5 + width * 0.5, t],
        feature: [0.0, width, 1.3, speciesId]
      });

      // Triangulate between current segment i and previous segment i - 1
      if (i > 0) {
        const prevLeft = (i - 1) * 3 + 0;
        const prevSpine = (i - 1) * 3 + 1;
        const prevRight = (i - 1) * 3 + 2;

        const currLeft = leftIdx;
        const currSpine = spineIdx;
        const currRight = rightIdx;

        // Left quad: (prevSpine, prevLeft, currLeft, currSpine)
        indices.push(prevSpine, prevLeft, currLeft);
        indices.push(prevSpine, currLeft, currSpine);

        // Right quad: (prevSpine, currSpine, currRight, prevRight)
        indices.push(prevSpine, currRight, prevRight);
        indices.push(prevSpine, currSpine, currRight);
      }
    }

    this.recomputeNormals(verts, indices);

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 3: Ginkgo (Ginkgo biloba)
   * Delicate fan with radial ribs, intermediate ring for cupping, and central split
   */
  private static createGinkgoMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 3;

    // Petiole base
    const petioleIdx = verts.length;
    verts.push({
      pos: [0, -0.65, 0.0],
      norm: [0, 0, 1],
      uv: [0.5, 0.05],
      feature: [0.7, 0.0, 0.0, speciesId]
    });

    const segments = 22;
    const fanSpan = Math.PI * 0.82;
    const startAngle = -fanSpan / 2;

    const midRingIndices: number[] = [];
    const rimIndices: number[] = [];

    // Intermediate ring at r = 0.42 (adds 3D cupping curvature)
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + t * fanSpan;
      const radius = 0.42;
      const x = Math.sin(angle) * radius;
      const y = -0.45 + Math.cos(angle) * radius;
      const curlZ = 0.025 * Math.cos(angle * 1.5);

      midRingIndices.push(verts.length);
      verts.push({
        pos: [x, y, curlZ],
        norm: [0, 0, 1],
        uv: [x * 0.45 + 0.5, (y + 0.5) * 0.45 + 0.1],
        feature: [0.4, radius, angle, speciesId]
      });
    }

    // Outer rim with central scallop split
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + t * fanSpan;
      // Central scallop notch at t = 0.5
      const notch = 1.0 - Math.exp(-Math.pow((t - 0.5) * 9.0, 2)) * 0.22;
      const radius = 0.85 * notch;

      const x = Math.sin(angle) * radius;
      const y = -0.45 + Math.cos(angle) * radius;
      const curlZ = 0.05 * Math.sin(angle * 2.0);

      rimIndices.push(verts.length);
      verts.push({
        pos: [x, y, curlZ],
        norm: [0, 0, 1],
        uv: [x * 0.45 + 0.5, (y + 0.5) * 0.45 + 0.1],
        feature: [0.0, radius, angle, speciesId]
      });
    }

    // Inner fan: petiole to mid ring
    for (let i = 0; i < segments; i++) {
      indices.push(petioleIdx, midRingIndices[i], midRingIndices[i + 1]);
    }

    // Outer fan ring: mid ring to rim ring
    for (let i = 0; i < segments; i++) {
      const m0 = midRingIndices[i];
      const m1 = midRingIndices[i + 1];
      const r0 = rimIndices[i];
      const r1 = rimIndices[i + 1];

      indices.push(m0, r0, r1);
      indices.push(m0, r1, m1);
    }

    this.recomputeNormals(verts, indices);

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 4: Birch / Aspen (Betula pendula)
   * Fluttering spade with spine segments, serrated contour, and cupped blade
   */
  private static createBirchMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 4;

    const segments = 12;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = -0.65 + t * 1.4;

      // Birch spade width envelope (broad heart at bottom third, tapering to sharp apex)
      const baseWidth = Math.pow(Math.sin(t * Math.PI), 0.6) * (1.1 - t * 0.55);
      // Fine margin serrations
      const serration = 1.0 + 0.05 * Math.sin(t * Math.PI * 18.0);
      const width = Math.max(0.01, baseWidth * serration * 0.48);

      const curlZ = Math.sin(t * Math.PI) * 0.05;
      const cupZ = 0.03 * (width / 0.4);

      // Left margin
      const leftIdx = verts.length;
      verts.push({
        pos: [-width, y, curlZ + cupZ],
        norm: [0, 0, 1],
        uv: [0.5 - width * 0.5, t],
        feature: [0.0, width, -1.2, speciesId]
      });

      // Spine
      const spineIdx = verts.length;
      verts.push({
        pos: [0, y, curlZ],
        norm: [0, 0, 1],
        uv: [0.5, t],
        feature: [0.8, 0.0, 0.0, speciesId]
      });

      // Right margin
      const rightIdx = verts.length;
      verts.push({
        pos: [width, y, curlZ + cupZ],
        norm: [0, 0, 1],
        uv: [0.5 + width * 0.5, t],
        feature: [0.0, width, 1.2, speciesId]
      });

      if (i > 0) {
        const prevLeft = (i - 1) * 3 + 0;
        const prevSpine = (i - 1) * 3 + 1;
        const prevRight = (i - 1) * 3 + 2;

        const currLeft = leftIdx;
        const currSpine = spineIdx;
        const currRight = rightIdx;

        // Left quad
        indices.push(prevSpine, prevLeft, currLeft);
        indices.push(prevSpine, currLeft, currSpine);

        // Right quad
        indices.push(prevSpine, currRight, prevRight);
        indices.push(prevSpine, currSpine, currRight);
      }
    }

    this.recomputeNormals(verts, indices);

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }
}
