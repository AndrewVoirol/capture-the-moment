/**
 * 3D Botanical Leaf Geometries for WebGPU Instancing
 * Refined smooth organic meshes:
 * 0: Japanese Maple (7 radiating palmate lobes)
 * 1: Sugar Maple (5 broad lobes)
 * 2: Oak (sinuous undulating rounded lobes)
 * 3: Ginkgo (delicate fan with central split)
 * 4: Birch / Aspen (fluttering spade)
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
   * Species 0: Japanese Maple (7 palmate lobes with serrated taper)
   */
  private static createJapaneseMapleMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 0;

    const centerIdx = verts.length;
    verts.push({
      pos: [0, -0.15, 0.05],
      norm: [0, 0, 1],
      uv: [0.5, 0.35],
      feature: [0.8, 0.0, 0.0, speciesId]
    });

    const lobeAngles = [-1.65, -1.15, -0.55, 0.0, 0.55, 1.15, 1.65];
    const lobeLengths = [0.48, 0.72, 0.90, 1.05, 0.90, 0.72, 0.48];

    let prevWingRight = -1;

    for (let l = 0; l < lobeAngles.length; l++) {
      const ang = lobeAngles[l];
      const len = lobeLengths[l];
      const tipX = Math.sin(ang) * len;
      const tipY = -0.15 + Math.cos(ang) * len;
      const curlZ = Math.sin(len * 2.2) * 0.07;

      const tipIdx = verts.length;
      verts.push({
        pos: [tipX, tipY, curlZ],
        norm: [0, 0, 1],
        uv: [tipX * 0.45 + 0.5, tipY * 0.45 + 0.5],
        feature: [0.0, 0.0, ang, speciesId]
      });

      const flankL = verts.length;
      const leftAng = ang - 0.15;
      const flankLen = len * 0.58;
      verts.push({
        pos: [Math.sin(leftAng) * flankLen, -0.15 + Math.cos(leftAng) * flankLen, curlZ * 0.5],
        norm: [0, 0, 1],
        uv: [Math.sin(leftAng) * flankLen * 0.45 + 0.5, (-0.15 + Math.cos(leftAng) * flankLen) * 0.45 + 0.5],
        feature: [0.08, 0.12, ang, speciesId]
      });

      const flankR = verts.length;
      const rightAng = ang + 0.15;
      verts.push({
        pos: [Math.sin(rightAng) * flankLen, -0.15 + Math.cos(rightAng) * flankLen, curlZ * 0.5],
        norm: [0, 0, 1],
        uv: [Math.sin(rightAng) * flankLen * 0.45 + 0.5, (-0.15 + Math.cos(rightAng) * flankLen) * 0.45 + 0.5],
        feature: [0.08, 0.12, ang, speciesId]
      });

      indices.push(centerIdx, flankL, tipIdx);
      indices.push(centerIdx, tipIdx, flankR);

      if (prevWingRight !== -1) {
        indices.push(centerIdx, prevWingRight, flankL);
      }
      prevWingRight = flankR;
    }

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 1: Sugar Maple (5 broad notched lobes)
   */
  private static createSugarMapleMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 1;

    const centerIdx = verts.length;
    verts.push({
      pos: [0, -0.1, 0.06],
      norm: [0, 0, 1],
      uv: [0.5, 0.35],
      feature: [0.8, 0.0, 0.0, speciesId]
    });

    const lobeAngles = [-1.3, -0.65, 0.0, 0.65, 1.3];
    const lobeLengths = [0.65, 0.95, 1.10, 0.95, 0.65];

    let prevWingRight = -1;

    for (let l = 0; l < lobeAngles.length; l++) {
      const ang = lobeAngles[l];
      const len = lobeLengths[l];
      const tipX = Math.sin(ang) * len;
      const tipY = -0.1 + Math.cos(ang) * len;
      const curlZ = Math.sin(ang * 1.5) * 0.06;

      const tipIdx = verts.length;
      verts.push({
        pos: [tipX, tipY, curlZ],
        norm: [0, 0, 1],
        uv: [tipX * 0.4 + 0.5, tipY * 0.4 + 0.5],
        feature: [0.0, 0.0, ang, speciesId]
      });

      const wingL = verts.length;
      verts.push({
        pos: [Math.sin(ang - 0.22) * len * 0.62, -0.1 + Math.cos(ang - 0.22) * len * 0.62, curlZ * 0.5],
        norm: [0, 0, 1],
        uv: [0.5 + Math.sin(ang - 0.22) * len * 0.25, 0.5 + Math.cos(ang - 0.22) * len * 0.25],
        feature: [0.05, 0.18, ang, speciesId]
      });

      const wingR = verts.length;
      verts.push({
        pos: [Math.sin(ang + 0.22) * len * 0.62, -0.1 + Math.cos(ang + 0.22) * len * 0.62, curlZ * 0.5],
        norm: [0, 0, 1],
        uv: [0.5 + Math.sin(ang + 0.22) * len * 0.25, 0.5 + Math.cos(ang + 0.22) * len * 0.25],
        feature: [0.05, 0.18, ang, speciesId]
      });

      indices.push(centerIdx, wingL, tipIdx);
      indices.push(centerIdx, tipIdx, wingR);

      if (prevWingRight !== -1) {
        indices.push(centerIdx, prevWingRight, wingL);
      }
      prevWingRight = wingR;
    }

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 2: Oak (smooth undulating rounded lobes with central spine)
   */
  private static createOakMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 2;

    const spineSegments = 12;
    const spineIndices: number[] = [];

    // Central spine
    for (let i = 0; i <= spineSegments; i++) {
      const t = i / spineSegments;
      const y = -0.75 + t * 1.5;
      const curlZ = Math.sin(t * Math.PI) * 0.08;
      spineIndices.push(verts.length);
      verts.push({
        pos: [0, y, curlZ],
        norm: [0, 0, 1],
        uv: [0.5, t],
        feature: [0.8, 0.0, 0.0, speciesId]
      });
    }

    // Smooth sinusoidal undulating margins (3 rounded lobe waves)
    for (let i = 1; i < spineSegments; i++) {
      const t = i / spineSegments;
      const y = -0.75 + t * 1.5;

      // Smooth undulating lobe envelope
      const baseEnvelope = Math.pow(Math.sin(t * Math.PI), 0.55);
      const lobeWave = 0.32 + 0.18 * Math.cos((t * 3.0 - 0.5) * Math.PI * 2.0);
      const width = baseEnvelope * lobeWave;
      const curlZ = Math.sin(t * Math.PI) * 0.06;

      const leftIdx = verts.length;
      verts.push({
        pos: [-width, y, curlZ * 0.5],
        norm: [-0.2, 0, 0.98],
        uv: [0.5 - width * 0.5, t],
        feature: [0.0, width, -1.57, speciesId]
      });

      const rightIdx = verts.length;
      verts.push({
        pos: [width, y, curlZ * 0.5],
        norm: [0.2, 0, 0.98],
        uv: [0.5 + width * 0.5, t],
        feature: [0.0, width, 1.57, speciesId]
      });

      const currSpine = spineIndices[i];
      const prevSpine = spineIndices[i - 1];
      const nextSpine = spineIndices[i + 1];

      indices.push(prevSpine, leftIdx, currSpine);
      indices.push(currSpine, leftIdx, nextSpine);
      indices.push(prevSpine, currSpine, rightIdx);
      indices.push(currSpine, nextSpine, rightIdx);
    }

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 3: Ginkgo (delicate fan with central scallop split)
   */
  private static createGinkgoMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 3;

    const petioleIdx = verts.length;
    verts.push({
      pos: [0, -0.65, 0.02],
      norm: [0, 0, 1],
      uv: [0.5, 0.05],
      feature: [0.7, 0.0, 0.0, speciesId]
    });

    const segments = 20;
    const fanSpan = Math.PI * 0.82;
    const startAngle = -fanSpan / 2;
    const rimIndices: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + t * fanSpan;
      // Central scallop notch
      const notch = 1.0 - Math.exp(-Math.pow((t - 0.5) * 8.0, 2)) * 0.25;
      const radius = 0.82 * notch;

      const x = Math.sin(angle) * radius;
      const y = -0.4 + Math.cos(angle) * radius;
      const curlZ = Math.sin(angle * 2.0) * 0.05;

      rimIndices.push(verts.length);
      verts.push({
        pos: [x, y, curlZ],
        norm: [0, 0, 1],
        uv: [x * 0.45 + 0.5, y * 0.45 + 0.5],
        feature: [0.0, radius, angle, speciesId]
      });
    }

    for (let i = 0; i < segments; i++) {
      indices.push(petioleIdx, rimIndices[i], rimIndices[i + 1]);
    }

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }

  /**
   * Species 4: Birch / Aspen (fluttering spade)
   */
  private static createBirchMesh(): MeshData {
    const verts: LeafVertex[] = [];
    const indices: number[] = [];
    const speciesId = 4;

    const baseIdx = verts.length;
    verts.push({
      pos: [0, -0.65, 0.0],
      norm: [0, 0, 1],
      uv: [0.5, 0.08],
      feature: [0.2, 0.0, 0.0, speciesId]
    });

    const centerIdx = verts.length;
    verts.push({
      pos: [0, -0.1, 0.07],
      norm: [0, 0, 1],
      uv: [0.5, 0.45],
      feature: [0.8, 0.0, 0.0, speciesId]
    });

    const tipIdx = verts.length;
    verts.push({
      pos: [0, 0.72, -0.04],
      norm: [0, 0, 1],
      uv: [0.5, 0.95],
      feature: [0.0, 0.0, 0.0, speciesId]
    });

    const leftCheek = verts.length;
    verts.push({
      pos: [-0.44, -0.16, 0.03],
      norm: [-0.3, 0, 0.95],
      uv: [0.1, 0.4],
      feature: [0.0, 0.35, -1.5, speciesId]
    });

    const rightCheek = verts.length;
    verts.push({
      pos: [0.44, -0.16, 0.03],
      norm: [0.3, 0, 0.95],
      uv: [0.9, 0.4],
      feature: [0.0, 0.35, 1.5, speciesId]
    });

    const leftShoulder = verts.length;
    verts.push({
      pos: [-0.3, 0.32, 0.04],
      norm: [-0.2, 0.2, 0.95],
      uv: [0.22, 0.7],
      feature: [0.0, 0.25, -1.0, speciesId]
    });

    const rightShoulder = verts.length;
    verts.push({
      pos: [0.3, 0.32, 0.04],
      norm: [0.2, 0.2, 0.95],
      uv: [0.78, 0.7],
      feature: [0.0, 0.25, 1.0, speciesId]
    });

    indices.push(baseIdx, leftCheek, centerIdx);
    indices.push(baseIdx, centerIdx, rightCheek);
    indices.push(centerIdx, leftCheek, leftShoulder);
    indices.push(centerIdx, leftShoulder, tipIdx);
    indices.push(centerIdx, tipIdx, rightShoulder);
    indices.push(centerIdx, rightShoulder, rightCheek);

    return {
      vertices: this.packVertices(verts),
      indices: new Uint16Array(indices),
      vertexCount: verts.length,
      indexCount: indices.length,
      indexOffset: 0
    };
  }
}
