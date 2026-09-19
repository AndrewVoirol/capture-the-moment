/**
 * 3D Aerodynamic Autumn Leaf Physics Engine
 * - Zhukovsky aerodynamic flutter & autorotation tumble
 * - 3D curl turbulence & ambient autumn wind currents
 * - Interactive mouse wake / vortex interactions
 * - Natural organic ground bed accumulation with varied resting angles
 * - Calligraphic 'capture the moment' leaf constellation guidance
 * - Instant freeze / pause for captured moment inspection
 */

export interface LeafParticle {
  // 3D Kinematics
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  pitch: number;
  yaw: number;
  roll: number;
  vPitch: number;
  vYaw: number;
  vRoll: number;
  scale: number;

  // Metadata & Properties
  species: number;        // 0: Jap. Maple, 1: Sugar Maple, 2: Oak, 3: Ginkgo, 4: Birch
  paletteId: number;      // 0: Vermilion, 1: Ginkgo, 2: Woodland, 3: Twilight
  colorVariation: number; // 0..1
  status: number;         // 0: falling, 1: landing, 2: resting on ground, 3: caught in user vortex
  groundY: number;        // Target resting Y level
  restPitch: number;      // Natural resting pitch angle
  restRoll: number;       // Natural resting roll angle
  restTime: number;       // Elapsed time resting
  flutterPhase: number;
  flutterFreq: number;
  hatchAngle: number;     // Angle of colored pencil hatching for this leaf
  targetPoint: [number, number] | null; // For 'evoke words' guiding
}

export interface PackResult {
  totalCount: number;
  speciesOffsets: number[];
  speciesCounts: number[];
}

export class LeafSimulation {
  public leaves: LeafParticle[] = [];
  public maxLeaves: number = 320;
  public groundCount: number = 0;
  public isPaused: boolean = false;

  // Wind state
  public ambientWindX: number = 0.07;
  public ambientWindY: number = -0.015;
  public gustStrength: number = 0.0;
  public gustTimer: number = 0.0;

  // Mouse wind interaction
  public mouseX: number = 0;
  public mouseY: number = 0;
  public mouseVx: number = 0;
  public mouseVy: number = 0;
  public mouseActive: boolean = false;
  public currentTool: 'breeze' | 'pencil' | 'gust' = 'breeze';

  // Active palette
  public currentPalette: number = 0; // 0: Vermilion, 1: Ginkgo, 2: Woodland, 3: Twilight

  // Constellation mode: "capture the moment"
  public evokeActive: boolean = false;
  public evokeTimer: number = 0.0;
  private wordWaypoints: Array<[number, number]> = [];

  constructor() {
    this.spawnInitialLeaves(130);
  }

  public setWordWaypoints(waypoints: Array<[number, number]>) {
    this.wordWaypoints = waypoints;
  }

  public spawnInitialLeaves(count: number) {
    for (let i = 0; i < count; i++) {
      const leaf = this.createLeaf(true);
      this.leaves.push(leaf);
    }
  }

  public spawnFlurry(count: number = 45) {
    for (let i = 0; i < count; i++) {
      const leaf = this.createLeaf(false);
      // Stagger spawn heights above top edge
      leaf.y = 1.15 + Math.random() * 0.7;
      leaf.x = (Math.random() * 2.4 - 1.2);
      leaf.vx = (Math.random() - 0.5) * 0.7;
      leaf.vy = -0.35 - Math.random() * 0.45;
      this.leaves.push(leaf);
    }
  }

  public triggerGust(strength: number = 1.3) {
    this.gustStrength = Math.max(this.gustStrength, strength);
    this.gustTimer = 2.4;
  }

  public triggerEvokeWords() {
    this.evokeActive = true;
    this.evokeTimer = 5.5;

    for (const leaf of this.leaves) {
      leaf.targetPoint = null;
    }

    const activeLeaves = this.leaves.filter(l => l.status === 0 || l.status === 3);
    if (this.wordWaypoints.length > 0 && activeLeaves.length > 0) {
      // Pick at most 24 leaves to trace the calligraphy without burying the lettering
      const count = Math.min(24, activeLeaves.length);
      for (let i = 0; i < count; i++) {
        const wpIdx = Math.floor((i / count) * this.wordWaypoints.length);
        activeLeaves[i].targetPoint = this.wordWaypoints[wpIdx];
      }
    }
  }

  private createLeaf(isInitial: boolean = false): LeafParticle {
    const species = Math.floor(Math.random() * 5);
    // Botanical scale: large enough to display pencil textures, veins, and lobes clearly
    const scale = 0.075 + Math.random() * 0.045;

    // Organic ground landing target Y: lower ground area (-0.74 to -0.92) with slight terrain undulation
    let x = (Math.random() * 2.4 - 1.2);
    const terrainUndulation = Math.sin(x * 2.0) * 0.04;
    const groundY = -0.74 - Math.random() * 0.18 + terrainUndulation;

    let y = isInitial ? (Math.random() * 2.0 - 0.8) : (1.15 + Math.random() * 0.4);
    let status = 0;

    // Natural 3D resting tilt
    const restPitch = (Math.random() - 0.5) * 0.28;
    const restRoll = (Math.random() - 0.5) * 0.32;

    if (isInitial && y < groundY + 0.1) {
      y = groundY;
      status = 2; // resting
    }

    return {
      x,
      y,
      z: (Math.random() * 0.4 - 0.2),
      vx: (Math.random() - 0.5) * 0.05,
      vy: -0.15 - Math.random() * 0.2,
      vz: (Math.random() - 0.5) * 0.02,
      pitch: status === 2 ? restPitch : Math.random() * Math.PI * 2,
      yaw: Math.random() * Math.PI * 2,
      roll: status === 2 ? restRoll : (Math.random() - 0.5) * 0.6,
      vPitch: (Math.random() - 0.5) * 2.5,
      vYaw: (Math.random() - 0.5) * 1.8,
      vRoll: (Math.random() - 0.5) * 1.5,
      scale,
      species,
      paletteId: this.currentPalette,
      colorVariation: Math.random(),
      status,
      groundY,
      restPitch,
      restRoll,
      restTime: status === 2 ? Math.random() * 10 : 0,
      flutterPhase: Math.random() * Math.PI * 2,
      flutterFreq: 2.8 + Math.random() * 2.0,
      hatchAngle: 0.65 + (Math.random() - 0.5) * 0.35, // ~37° colored pencil hatching
      targetPoint: null
    };
  }

  public update(dt: number, aspect: number) {
    if (this.isPaused) return;

    dt = Math.min(dt, 0.05);

    // Gust decay
    if (this.gustTimer > 0) {
      this.gustTimer -= dt;
      if (this.gustTimer <= 0) {
        this.gustStrength = 0;
      }
    }

    // Evoke timer
    if (this.evokeActive) {
      this.evokeTimer -= dt;
      if (this.evokeTimer <= 0) {
        this.evokeActive = false;
        for (const leaf of this.leaves) {
          leaf.targetPoint = null;
        }
      }
    }

    const gustX = this.gustStrength * (0.95 + Math.sin(Date.now() * 0.003) * 0.35);
    const totalWindX = this.ambientWindX + gustX;

    this.groundCount = 0;

    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const p = this.leaves[i];

      // Status 2: Resting on ground bed
      if (p.status === 2) {
        this.groundCount++;
        p.restTime += dt;

        let disturbed = false;

        if (this.gustStrength > 0.35) {
          disturbed = true;
          p.vy = 0.22 + Math.random() * 0.42;
          p.vx = gustX * (0.45 + Math.random() * 0.5);
          p.vPitch = (Math.random() - 0.5) * 8.0;
        }

        if (this.mouseActive) {
          const dx = (p.x - this.mouseX) * aspect;
          const dy = p.y - this.mouseY;
          const dist = Math.hypot(dx, dy);

          if (this.currentTool === 'gust' && dist < 0.45) {
            disturbed = true;
            const force = (0.45 - dist) / 0.45;
            p.vy = 0.65 * force + Math.random() * 0.2;
            p.vx = (this.mouseVx * 0.8 + (Math.random() - 0.5) * 0.4) * force;
            p.vRoll = (Math.random() - 0.5) * 12.0;
          } else if (this.currentTool === 'breeze' && dist < 0.28) {
            const speed = Math.hypot(this.mouseVx, this.mouseVy);
            if (speed > 0.18) {
              disturbed = true;
              p.vy = 0.16 * speed;
              p.vx = this.mouseVx * 0.35;
              p.vPitch += (Math.random() - 0.5) * 3.5;
            }
          }
        }

        if (disturbed) {
          p.status = 0;
          p.restTime = 0;
          p.groundY = -0.74 - Math.random() * 0.18;
        } else {
          // Relax smoothly toward natural 3D resting angles (NOT rigid 0, 0!)
          p.pitch += (p.restPitch - p.pitch) * dt * 2.5;
          p.roll += (p.restRoll - p.roll) * dt * 2.5;
          continue;
        }
      }

      // Status 0 or 3: Airborne
      p.flutterPhase += dt * p.flutterFreq;

      // 1. Gravity & Terminal Velocity
      const gravity = -0.72;
      p.vy += gravity * dt;

      const maxFallSpeed = -0.42;
      if (p.vy < maxFallSpeed) {
        p.vy += (maxFallSpeed - p.vy) * dt * 4.0;
      }

      // 2. Zhukovsky Aerodynamic Flutter:
      // Coupled side-to-side lift and roll oscillation
      const flutterForce = Math.sin(p.flutterPhase) * 0.45;
      p.vx += flutterForce * dt;
      p.vRoll = Math.cos(p.flutterPhase) * 2.4;

      // Pitch autorotation tumble when tilted steeply
      p.vPitch += Math.sin(p.pitch * 2.0) * 1.6 * dt;

      // 3. Ambient Wind & Updrafts
      p.vx += (totalWindX - p.vx) * dt * 0.65;
      p.vy += Math.sin(p.x * 3.0 + p.flutterPhase) * 0.08 * dt;

      // 4. Mouse Interactivity
      if (this.mouseActive) {
        const dx = (p.x - this.mouseX) * aspect;
        const dy = p.y - this.mouseY;
        const dist = Math.hypot(dx, dy);

        if (this.currentTool === 'gust') {
          if (dist < 0.55 && dist > 0.01) {
            const factor = (0.55 - dist) / 0.55;
            const tangentX = -dy / dist;
            const tangentY = dx / dist;
            p.vx += tangentX * 1.8 * factor * dt;
            p.vy += (tangentY * 1.2 + 0.9) * factor * dt;
            p.vYaw += 15.0 * factor * dt;
            p.status = 3;
          }
        } else if (this.currentTool === 'breeze') {
          if (dist < 0.36) {
            const factor = (0.36 - dist) / 0.36;
            p.vx += (this.mouseVx * 0.5 + (p.x - this.mouseX) * 0.5) * factor * dt;
            p.vy += (this.mouseVy * 0.3 + 0.1) * factor * dt;
            p.vPitch += (Math.random() - 0.5) * 4.0 * factor * dt;
          }
        }
      }

      // 5. 'Capture the Moment' Calligraphic Constellation Guidance
      if (p.targetPoint && this.evokeActive) {
        const tx = p.targetPoint[0] * aspect;
        const ty = p.targetPoint[1] + Math.sin(p.flutterPhase * 0.8) * 0.035;
        const toX = tx - p.x;
        const toY = ty - p.y;
        const dist = Math.hypot(toX, toY);

        if (dist > 0.015) {
          const steerForce = Math.min(2.0, dist * 3.2);
          p.vx += (toX / dist * steerForce - p.vx) * dt * 2.6;
          p.vy += (toY / dist * steerForce - p.vy) * dt * 2.6;
          // Flatten leaf gently towards viewer so the leaf blade is visible
          p.pitch += (0 - p.pitch) * dt * 4.0;
          p.roll += (0 - p.roll) * dt * 4.0;
        }
      }

      // 6. Kinematic Integration & Angular Damping
      p.pitch += p.vPitch * dt;
      p.yaw += p.vYaw * dt;
      p.roll += p.vRoll * dt;

      p.vPitch *= Math.pow(0.85, dt * 60);
      p.vYaw *= Math.pow(0.92, dt * 60);
      p.vRoll *= Math.pow(0.88, dt * 60);

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // 7. Ground Collision
      if (p.y <= p.groundY) {
        p.y = p.groundY;
        p.vy = 0;
        p.vx *= 0.4;
        p.vz *= 0.4;
        p.status = 2; // settled on ground bed
        this.groundCount++;
      }

      // 8. Screen Boundary Wrap & Recycle
      if (p.x < -1.45) {
        p.x = 1.35;
      } else if (p.x > 1.45) {
        p.x = -1.35;
      }

      if (p.y < -1.15 || (p.status === 2 && p.restTime > 45 && this.leaves.length > this.maxLeaves * 0.75)) {
        p.x = (Math.random() * 2.4 - 1.2);
        p.y = 1.15 + Math.random() * 0.3;
        p.z = (Math.random() * 0.4 - 0.2);
        p.vx = (Math.random() - 0.5) * 0.05;
        p.vy = -0.15 - Math.random() * 0.15;
        p.pitch = Math.random() * Math.PI * 2;
        p.roll = (Math.random() - 0.5) * 0.6;
        p.status = 0;
        p.restTime = 0;
        p.groundY = -0.74 - Math.random() * 0.18;
        p.paletteId = this.currentPalette;
      }
    }

    // Maintain steady leaf population
    if (this.leaves.length < this.maxLeaves) {
      if (Math.random() < 0.08) {
        this.leaves.push(this.createLeaf(false));
      }
    }
  }

  /**
   * Packs simulation state into Float32Array instance buffer, partitioned by botanical species
   */
  public packInstanceData(outBuffer: Float32Array): PackResult {
    const speciesBuckets: LeafParticle[][] = [[], [], [], [], []];
    for (const leaf of this.leaves) {
      const s = Math.max(0, Math.min(4, Math.floor(leaf.species)));
      speciesBuckets[s].push(leaf);
    }

    const speciesOffsets = [0, 0, 0, 0, 0];
    const speciesCounts = [0, 0, 0, 0, 0];
    let writeIdx = 0;
    const now = Date.now() * 0.001;

    for (let s = 0; s < 5; s++) {
      speciesOffsets[s] = writeIdx;
      const bucket = speciesBuckets[s];
      for (let i = 0; i < bucket.length; i++) {
        if ((writeIdx + 1) * 16 > outBuffer.length) break;
        const p = bucket[i];
        const base = writeIdx * 16;

        outBuffer[base + 0] = p.x;
        outBuffer[base + 1] = p.y;
        outBuffer[base + 2] = p.z;
        outBuffer[base + 3] = p.scale;

        outBuffer[base + 4] = p.pitch;
        outBuffer[base + 5] = p.yaw;
        outBuffer[base + 6] = p.roll;
        outBuffer[base + 7] = p.species;

        const groundRestFactor = p.status === 2 ? 1.0 : (p.status === 1 ? 0.5 : 0.0);
        outBuffer[base + 8] = p.paletteId;
        outBuffer[base + 9] = p.colorVariation;
        outBuffer[base + 10] = groundRestFactor;
        outBuffer[base + 11] = p.status;

        const shadowDist = Math.max(0.0, p.y - p.groundY);
        outBuffer[base + 12] = p.hatchAngle;
        outBuffer[base + 13] = shadowDist;
        outBuffer[base + 14] = p.flutterPhase;
        outBuffer[base + 15] = now;

        writeIdx++;
      }
      speciesCounts[s] = writeIdx - speciesOffsets[s];
    }

    return {
      totalCount: writeIdx,
      speciesOffsets,
      speciesCounts
    };
  }
}
