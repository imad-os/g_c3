import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * 2019 Citroën C3 (SX) - 1.6 HDi 16V 92 (DV6DTED M Euro 5)
 * Built from scratch using a 3D Lofted Cross-Section Surface (curved in X, Y, Z)
 * + Baked Front/Rear/Side Projection Textures + Howler.js Audio.
 */
export class CitroenC3 {
    static SPECS = {
        massKg: 1090,
        wheelRadius: 0.315,
        powerHP: 92,
        torqueNm: 230,           // 230 Nm @ 1750 RPM
        idleRPM: 800,
        redlineRPM: 4500,
        maxSpeedMs: 50.83,       // 183 km/h
        dragCoefficient: 0.30,
        frontalAreaM2: 2.18,
        gearRatios: [3.45, 1.87, 1.15, 0.84, 0.66],
        finalDrive: 3.58,
        maxSteerRad: 0.58
    };

    static SHARED_ASSETS = null;

    constructor(quality = 'high') {
        this.quality = quality.toLowerCase();
        this.specs = { ...CitroenC3.SPECS };
        this.root = new THREE.Group();
        this.chassis = new THREE.Group();
        this.root.add(this.chassis);

        this.wheels = { fl: null, fr: null, rl: null, rr: null };
        this.steerPivots = { fl: null, fr: null };
        this.lightMeshes = { drl: [], head: [], fog: [], tail: [] };
        this.headlightSpots = [];

        this.state = {
            speedMs: 0,
            steerAngle: 0,
            throttle: 0,
            brake: 0,
            gear: 1,
            rpm: 800,
            headlightsOn: true,
            pitch: 0,
            roll: 0
        };

        this.sounds = null;

        if (!CitroenC3.SHARED_ASSETS) {
            CitroenC3.SHARED_ASSETS = CitroenC3._createSharedTextures();
        }
        this.tex = CitroenC3.SHARED_ASSETS;

        this._initMaterials();
        this._buildLoftedCar();
    }

    /**
     * Builds crisp 2D textures for the complex graphic details (Wheels, Airbumps,
     * Front Grille/Plate, Rear Taillights/Badge) so they match the photos cleanly.
     */
    static _createSharedTextures() {
        // 1. Clover 16"/17" Two-Tone Diamond-Cut Wheel Texture
        const wCan = document.createElement('canvas');
        wCan.width = 512; wCan.height = 512;
        const wCtx = wCan.getContext('2d');
        wCtx.fillStyle = '#121418';
        wCtx.fillRect(0, 0, 512, 512);
        wCtx.translate(256, 256);

        // Tire rubber sidewall
        wCtx.beginPath();
        wCtx.arc(0, 0, 250, 0, Math.PI * 2);
        wCtx.fillStyle = '#181a1f';
        wCtx.fill();

        // Rim outer machined ring
        wCtx.beginPath();
        wCtx.arc(0, 0, 176, 0, Math.PI * 2);
        wCtx.fillStyle = '#0c0e12';
        wCtx.fill();
        wCtx.lineWidth = 7;
        wCtx.strokeStyle = '#d8dee9';
        wCtx.stroke();

        // 4-Twin Clover Leaf Machined Spokes (Matches image_d6aae6.jpg & image_d6a706.jpg)
        for (let i = 0; i < 4; i++) {
            wCtx.save();
            wCtx.rotate((i * Math.PI * 2) / 4);
            [-0.24, 0.24].forEach((subAngle, idx) => {
                wCtx.save();
                wCtx.rotate(subAngle);
                const grad = wCtx.createLinearGradient(0, 32, 0, 172);
                grad.addColorStop(0, '#e2e8f0');
                grad.addColorStop(0.6, '#ffffff');
                grad.addColorStop(1, '#94a3b8');
                wCtx.fillStyle = grad;
                wCtx.beginPath();
                wCtx.moveTo(-10, 36);
                wCtx.lineTo(idx === 0 ? -24 : -14, 170);
                wCtx.lineTo(idx === 0 ? 14 : 24, 170);
                wCtx.lineTo(10, 36);
                wCtx.closePath();
                wCtx.fill();
                wCtx.restore();
            });
            wCtx.restore();
        }

        // Center Cap with Citroën Chevrons
        wCtx.beginPath();
        wCtx.arc(0, 0, 36, 0, Math.PI * 2);
        wCtx.fillStyle = '#0f1116';
        wCtx.fill();
        wCtx.lineWidth = 3;
        wCtx.strokeStyle = '#cbd5e1';
        wCtx.stroke();
        wCtx.strokeStyle = '#ffffff';
        wCtx.lineWidth = 3.5;
        [-4, 5].forEach(y => {
            wCtx.beginPath();
            wCtx.moveTo(-10, y + 4);
            wCtx.lineTo(0, y - 5);
            wCtx.lineTo(10, y + 4);
            wCtx.stroke();
        });
        const wheelTex = new THREE.CanvasTexture(wCan);
        wheelTex.colorSpace = THREE.SRGBColorSpace;

        // 2. Side Airbump Panel Texture (Black panel + 7 capsules, 1st capsule ringed in Red)
        const aCan = document.createElement('canvas');
        aCan.width = 1024; aCan.height = 256;
        const aCtx = aCan.getContext('2d');
        aCtx.fillStyle = '#1b1d21';
        aCtx.beginPath();
        aCtx.roundRect(10, 20, 1004, 216, 95);
        aCtx.fill();

        for (let i = 0; i < 7; i++) {
            const x = 68 + i * 128;
            aCtx.fillStyle = i === 0 ? '#c91a22' : '#282b32';
            aCtx.beginPath();
            aCtx.roundRect(x, 58, 96, 140, 28);
            aCtx.fill();

            aCtx.fillStyle = '#15171b';
            aCtx.beginPath();
            aCtx.roundRect(x + 16, 78, 64, 100, 16);
            aCtx.fill();
        }
        const airbumpTex = new THREE.CanvasTexture(aCan);
        airbumpTex.colorSpace = THREE.SRGBColorSpace;

        // 3. Moroccan License Plate (35219 | ب | 15)
        const pCan = document.createElement('canvas');
        pCan.width = 512; pCan.height = 112;
        const pCtx = pCan.getContext('2d');
        pCtx.fillStyle = '#ffffff';
        pCtx.fillRect(0, 0, 512, 112);
        pCtx.strokeStyle = '#1e293b';
        pCtx.lineWidth = 6;
        pCtx.strokeRect(4, 4, 504, 104);
        pCtx.fillStyle = '#0f172a';
        pCtx.font = 'bold 54px sans-serif';
        pCtx.textAlign = 'center';
        pCtx.textBaseline = 'middle';
        pCtx.fillText('35219  |  ب  |  15', 256, 58);
        const plateTex = new THREE.CanvasTexture(pCan);
        plateTex.colorSpace = THREE.SRGBColorSpace;

        // 4. 3D Concentric-Ring Taillight Texture
        const tCan = document.createElement('canvas');
        tCan.width = 256; tCan.height = 192;
        const tCtx = tCan.getContext('2d');
        tCtx.fillStyle = '#220407';
        tCtx.fillRect(0, 0, 256, 192);
        tCtx.strokeStyle = '#ff1e27';
        tCtx.lineWidth = 16;
        tCtx.beginPath();
        tCtx.roundRect(22, 22, 212, 148, 42);
        tCtx.stroke();
        tCtx.strokeStyle = '#ff5a60';
        tCtx.lineWidth = 10;
        tCtx.beginPath();
        tCtx.roundRect(50, 48, 156, 96, 26);
        tCtx.stroke();
        const tailTex = new THREE.CanvasTexture(tCan);
        tailTex.colorSpace = THREE.SRGBColorSpace;

        return { wheelTex, airbumpTex, plateTex, tailTex };
    }

    _initMaterials() {
        const isHigh = this.quality === 'high';
        const isLow = this.quality === 'low';

        const makeBodyMat = (hex, rough = 0.16, metal = 0.06) => {
            if (isLow) return new THREE.MeshLambertMaterial({ color: hex });
            if (isHigh) {
                return new THREE.MeshPhysicalMaterial({
                    color: hex,
                    roughness: rough,
                    metalness: metal,
                    clearcoat: 0.9,
                    clearcoatRoughness: 0.08
                });
            }
            return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
        };

        this.mats = {
            white: makeBodyMat(0xF5F7FA, 0.15, 0.05),
            red: makeBodyMat(0xC91A22, 0.16, 0.12),
            blackPlastic: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x1B1D21 })
                : new THREE.MeshStandardMaterial({ color: 0x1B1D21, roughness: 0.82, metalness: 0.04 }),
            glossBlack: makeBodyMat(0x0E1014, 0.08, 0.15),
            chrome: isLow
                ? new THREE.MeshLambertMaterial({ color: 0xE2E8F0 })
                : new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.12, metalness: 0.92 }),
            glass: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x121A24 })
                : new THREE.MeshStandardMaterial({ color: 0x0E1520, roughness: 0.05, metalness: 0.4 }),
            rubber: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x15171A })
                : new THREE.MeshStandardMaterial({ color: 0x15171A, roughness: 0.88 }),
            wheelFace: new THREE.MeshStandardMaterial({ map: this.tex.wheelTex, roughness: 0.25, metalness: 0.75 }),
            airbump: new THREE.MeshStandardMaterial({ map: this.tex.airbumpTex, transparent: true, roughness: 0.75 }),
            plate: new THREE.MeshStandardMaterial({ map: this.tex.plateTex, roughness: 0.3 }),
            taillight: new THREE.MeshStandardMaterial({
                map: this.tex.tailTex,
                emissive: 0xFF111A,
                emissiveMap: this.tex.tailTex,
                emissiveIntensity: 1.0,
                roughness: 0.15
            }),
            drl: new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
            headlight: new THREE.MeshBasicMaterial({ color: 0xFFFBEB }),
            foglight: new THREE.MeshBasicMaterial({ color: 0xFDE68A })
        };
    }

    /**
     * Core 3D Lofting Engine:
     * Takes an array of Z-slices along the length of the car and generates a smooth,
     * curved 3D shell that tapers in width (plan view curve), height (side profile),
     * and tumblehome (cabin inward curve).
     */
    _createLoftedMesh(slices, radialSteps, material) {
        const positions = [];
        const indices = [];

        // Generate 3D cross-section rings for each longitudinal Z-slice
        for (let s = 0; s < slices.length; s++) {
            const st = slices[s];
            for (let r = 0; r <= radialSteps; r++) {
                // u goes from 0.0 (bottom-center-left) -> 0.5 (beltline) -> 1.0 (top-center-roof)
                const u = r / radialSteps;
                let x = 0, y = 0, z = st.z;

                if (u <= 0.25) {
                    // Bottom sill to lower door bulge
                    const t = u / 0.25;
                    x = THREE.MathUtils.lerp(0, st.halfWidth * 0.94, Math.sin(t * Math.PI * 0.5));
                    y = THREE.MathUtils.lerp(st.yBottom, st.yMid, t * 0.45);
                } else if (u <= 0.62) {
                    // Lower door bulge to shoulder beltline (maximum width)
                    const t = (u - 0.25) / 0.37;
                    x = st.halfWidth * (0.94 + 0.06 * Math.sin(t * Math.PI));
                    y = THREE.MathUtils.lerp(st.yBottom + (st.yMid - st.yBottom) * 0.45, st.yMid, t);
                    // Plan-view curvature (front bumper & rear bumper curve backward at outer edges)
                    z -= st.edgeCurveZ * (x / Math.max(0.01, st.halfWidth)) ** 2;
                } else {
                    // Shoulder beltline up to roof (tumblehome inward taper)
                    const t = (u - 0.62) / 0.38;
                    const smoothT = Math.sin(t * Math.PI * 0.5);
                    x = THREE.MathUtils.lerp(st.halfWidth * 0.96, 0, t ** 1.35);
                    y = THREE.MathUtils.lerp(st.yMid, st.yTop, smoothT);
                    z -= st.edgeCurveZ * (x / Math.max(0.01, st.halfWidth)) ** 2;
                }

                positions.push(x, y, z);
            }
        }

        // Mirror for the right side (-X) so the hull is symmetrical and closed
        const ringVerts = radialSteps + 1;
        const leftVertCount = slices.length * ringVerts;
        for (let i = 0; i < leftVertCount; i++) {
            positions.push(-positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        }

        // Stitch triangles for Left (+X) and Right (-X) halves
        for (let s = 0; s < slices.length - 1; s++) {
            for (let r = 0; r < radialSteps; r++) {
                // Left side (+X)
                const a = s * ringVerts + r;
                const b = (s + 1) * ringVerts + r;
                const c = (s + 1) * ringVerts + (r + 1);
                const d = s * ringVerts + (r + 1);
                indices.push(a, b, d, b, c, d);

                // Right side (-X, reversed winding)
                const aR = leftVertCount + a;
                const bR = leftVertCount + b;
                const cR = leftVertCount + c;
                const dR = leftVertCount + d;
                indices.push(aR, dR, bR, bR, dR, cR);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }

    _buildLoftedCar() {
        const radialSteps = this.quality === 'high' ? 24 : (this.quality === 'medium' ? 14 : 8);
        const cylSegs = this.quality === 'high' ? 28 : (this.quality === 'medium' ? 16 : 10);

        // =========================================================================
        // 1. 3D LOFTED POLAR WHITE LOWER BODY & BONNET (Curved in X, Y, and Z!)
        // =========================================================================
        const bodySlices = [
            { z: -1.96, halfWidth: 0.62, yBottom: 0.36, yMid: 0.72, yTop: 0.84, edgeCurveZ: -0.10 }, // Rear bumper tip
            { z: -1.82, halfWidth: 0.82, yBottom: 0.32, yMid: 0.84, yTop: 0.92, edgeCurveZ: -0.08 }, // Rear quarter
            { z: -1.30, halfWidth: 0.87, yBottom: 0.28, yMid: 0.88, yTop: 0.94, edgeCurveZ:  0.00 }, // Rear wheel arch
            { z: -0.50, halfWidth: 0.86, yBottom: 0.28, yMid: 0.88, yTop: 0.94, edgeCurveZ:  0.00 }, // B-pillar doors
            { z:  0.50, halfWidth: 0.86, yBottom: 0.28, yMid: 0.89, yTop: 0.95, edgeCurveZ:  0.00 }, // A-pillar base
            { z:  1.27, halfWidth: 0.87, yBottom: 0.29, yMid: 0.88, yTop: 0.96, edgeCurveZ:  0.04 }, // Front wheel arch
            { z:  1.75, halfWidth: 0.80, yBottom: 0.31, yMid: 0.82, yTop: 0.92, edgeCurveZ:  0.12 }, // Rounded C3 high hood
            { z:  1.96, halfWidth: 0.66, yBottom: 0.33, yMid: 0.72, yTop: 0.85, edgeCurveZ:  0.16 }, // Curved front fascia
            { z:  2.01, halfWidth: 0.42, yBottom: 0.36, yMid: 0.62, yTop: 0.76, edgeCurveZ:  0.08 }  // Front nose center
        ];
        const whiteBody = this._createLoftedMesh(bodySlices, radialSteps, this.mats.white);
        this.chassis.add(whiteBody);

        // =========================================================================
        // 2. 3D LOFTED GREENHOUSE CABIN (Tapered Tumblehome Windows & Black Pillars)
        // =========================================================================
        const cabinSlices = [
            { z: -1.62, halfWidth: 0.64, yBottom: 0.86, yMid: 1.02, yTop: 1.08, edgeCurveZ: -0.06 },
            { z: -1.32, halfWidth: 0.70, yBottom: 0.88, yMid: 1.24, yTop: 1.38, edgeCurveZ: -0.05 }, // Rear glass top
            { z: -0.75, halfWidth: 0.74, yBottom: 0.88, yMid: 1.32, yTop: 1.43, edgeCurveZ:  0.00 }, // Rear doors
            { z: -0.10, halfWidth: 0.75, yBottom: 0.89, yMid: 1.34, yTop: 1.45, edgeCurveZ:  0.00 }, // B-pillar peak
            { z:  0.42, halfWidth: 0.72, yBottom: 0.90, yMid: 1.30, yTop: 1.40, edgeCurveZ:  0.05 }, // Windshield header
            { z:  0.96, halfWidth: 0.74, yBottom: 0.90, yMid: 0.96, yTop: 1.00, edgeCurveZ:  0.08 }  // Windshield cowl
        ];
        const cabinMesh = this._createLoftedMesh(cabinSlices, radialSteps, this.mats.glass);
        this.chassis.add(cabinMesh);

        // White C-Pillar Sail Panels (Behind rear doors, matching image_d6a45b.jpg & image_d6aae6.jpg)
        const cPillarSlices = [
            { z: -1.56, halfWidth: 0.68, yBottom: 0.86, yMid: 1.08, yTop: 1.16, edgeCurveZ: -0.04 },
            { z: -1.30, halfWidth: 0.71, yBottom: 0.88, yMid: 1.26, yTop: 1.36, edgeCurveZ: -0.02 },
            { z: -1.04, halfWidth: 0.73, yBottom: 0.88, yMid: 1.28, yTop: 1.36, edgeCurveZ:  0.00 }
        ];
        const cPillarMesh = this._createLoftedMesh(cPillarSlices, Math.max(6, radialSteps / 2), this.mats.white);
        this.chassis.add(cPillarMesh);

        // =========================================================================
        // 3. 3D LOFTED SPORT RED FLOATING ROOF & REAR SPOILER
        // =========================================================================
        const roofSlices = [
            { z: -1.42, halfWidth: 0.61, yBottom: 1.36, yMid: 1.41, yTop: 1.43, edgeCurveZ: -0.04 }, // Spoiler tip
            { z: -1.24, halfWidth: 0.65, yBottom: 1.35, yMid: 1.42, yTop: 1.45, edgeCurveZ: -0.03 },
            { z: -0.60, halfWidth: 0.68, yBottom: 1.36, yMid: 1.44, yTop: 1.47, edgeCurveZ:  0.00 },
            { z:  0.05, halfWidth: 0.68, yBottom: 1.36, yMid: 1.43, yTop: 1.46, edgeCurveZ:  0.02 },
            { z:  0.48, halfWidth: 0.64, yBottom: 1.34, yMid: 1.39, yTop: 1.41, edgeCurveZ:  0.06 }  // Windshield brow
        ];
        const redRoof = this._createLoftedMesh(roofSlices, Math.max(8, radialSteps / 2), this.mats.red);
        this.chassis.add(redRoof);

        // Roof Antenna
        if (this.quality !== 'low') {
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.012, 0.25, 6), this.mats.blackPlastic);
            ant.position.set(0, 1.54, -1.12);
            ant.rotation.x = -0.5;
            this.chassis.add(ant);
        }

        // =========================================================================
        // 4. MATTE BLACK LOWER CLADDING SILLS & HIGH REAR BUMPER DIFFUSER
        // =========================================================================
        const claddingSlices = [
            { z: -1.98, halfWidth: 0.66, yBottom: 0.28, yMid: 0.52, yTop: 0.60, edgeCurveZ: -0.10 }, // High black rear bumper
            { z: -1.78, halfWidth: 0.84, yBottom: 0.27, yMid: 0.50, yTop: 0.56, edgeCurveZ: -0.06 },
            { z: -1.45, halfWidth: 0.86, yBottom: 0.26, yMid: 0.36, yTop: 0.39, edgeCurveZ:  0.00 },
            { z:  1.45, halfWidth: 0.86, yBottom: 0.26, yMid: 0.36, yTop: 0.39, edgeCurveZ:  0.00 },
            { z:  1.88, halfWidth: 0.76, yBottom: 0.28, yMid: 0.42, yTop: 0.46, edgeCurveZ:  0.12 },
            { z:  2.02, halfWidth: 0.46, yBottom: 0.30, yMid: 0.42, yTop: 0.46, edgeCurveZ:  0.08 }
        ];
        const blackCladding = this._createLoftedMesh(claddingSlices, Math.max(8, radialSteps / 2), this.mats.blackPlastic);
        this.chassis.add(blackCladding);

        // =========================================================================
        // 5. SIDE AIRBUMPS, SPORT RED MIRRORS & HANDLES
        // =========================================================================
        [-1, 1].forEach((side) => {
            // Airbump panel curved slightly against the lower doors
            const bump = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.25), this.mats.airbump);
            bump.position.set(side * 0.872, 0.49, 0.02);
            bump.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
            if (side > 0) bump.scale.x = -1; // Keep Red capsule on the front door on both sides
            this.chassis.add(bump);

            // Sport Red Rounded Wing Mirrors
            const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.05), this.mats.blackPlastic);
            stalk.position.set(side * 0.78, 0.93, 0.52);
            this.chassis.add(stalk);

            const mirrorCap = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 14), this.mats.red);
            mirrorCap.scale.set(1.15, 0.72, 0.82);
            mirrorCap.position.set(side * 0.86, 0.96, 0.50);
            this.chassis.add(mirrorCap);

            // Black Door Handles
            if (this.quality !== 'low') {
                [0.08, -0.68].forEach((zPos) => {
                    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), this.mats.glossBlack);
                    handle.position.set(side * 0.862, 0.82, zPos);
                    this.chassis.add(handle);
                });
            }
        });

        // =========================================================================
        // 6. FRONT FASCIA DETAILS (Wraparound DRLs, Chrome Chevrons, Red Fog Pods)
        // =========================================================================
        this._addCurvedFrontDetails();

        // =========================================================================
        // 7. REAR FASCIA DETAILS (Wraparound 3D Taillights, Badge, Plate)
        // =========================================================================
        this._addCurvedRearDetails();

        // =========================================================================
        // 8. WHEEL ARCH FLARES & 4 ROTATING CLOVER ALLOY WHEELS
        // =========================================================================
        this._addWheelsAndArches(cylSegs);
    }

    _addCurvedFrontDetails() {
        // Curved Upper & Lower Chrome Grille Bars (following the nose plan-view arc)
        const chromeArcGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.022, 24, 1, true, -0.52, 1.04);
        const topChrome = new THREE.Mesh(chromeArcGeo, this.mats.chrome);
        topChrome.position.set(0, 0.84, 0.86);
        this.chassis.add(topChrome);

        const botChrome = new THREE.Mesh(chromeArcGeo, this.mats.chrome);
        botChrome.position.set(0, 0.81, 0.865);
        this.chassis.add(botChrome);

        // Center Double Chevrons
        [-0.038, 0.038].forEach((xOff, idx) => {
            const rotZ = idx === 0 ? 0.46 : -0.46;
            const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.04), this.mats.chrome);
            c1.position.set(xOff, 0.865, 2.005);
            c1.rotation.z = rotZ;
            this.chassis.add(c1);

            const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.04), this.mats.chrome);
            c2.position.set(xOff, 0.835, 2.01);
            c2.rotation.z = rotZ;
            this.chassis.add(c2);
        });

        // Wraparound Top-Tier DRLs, Mid-Tier Rounded Headlamps, and Bottom Red Fog Pods
        [-1, 1].forEach((side) => {
            const yaw = side * 0.34; // Follows the curved front corner!

            // Top-Tier Slim LED DRL
            const drl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.06), this.mats.drl);
            drl.position.set(side * 0.56, 0.83, 1.88);
            drl.rotation.y = yaw;
            this.chassis.add(drl);

            // Mid-Tier Rounded Rectangular Headlamp
            const headBezel = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.07), this.mats.glossBlack);
            headBezel.position.set(side * 0.58, 0.68, 1.86);
            headBezel.rotation.y = yaw;
            this.chassis.add(headBezel);

            const headLens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.075), this.mats.headlight);
            headLens.position.set(side * 0.58, 0.68, 1.865);
            headLens.rotation.y = yaw;
            this.chassis.add(headLens);

            // Bottom-Tier Sport Red Fog Light Bezel + Fog Lamp
            const redPod = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.07), this.mats.red);
            redPod.position.set(side * 0.54, 0.38, 1.88);
            redPod.rotation.y = yaw;
            this.chassis.add(redPod);

            const darkRecess = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.075, 0.075), this.mats.blackPlastic);
            darkRecess.position.set(side * 0.54, 0.38, 1.885);
            darkRecess.rotation.y = yaw;
            this.chassis.add(darkRecess);

            const fogBulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), this.mats.foglight);
            fogBulb.position.set(side * 0.57, 0.38, 1.90);
            this.chassis.add(fogBulb);
        });

        // Central Hexagonal Black Intake Grille & Moroccan License Plate
        const grille = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.24, 0.06), this.mats.blackPlastic);
        grille.position.set(0, 0.56, 1.99);
        this.chassis.add(grille);

        const fPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.105), this.mats.plate);
        fPlate.position.set(0, 0.55, 2.025);
        this.chassis.add(fPlate);

        if (this.quality === 'high') {
            [-0.56, 0.56].forEach((xSide) => {
                const spot = new THREE.SpotLight(0xFFFBEB, 18, 28, Math.PI / 5, 0.5, 1.5);
                spot.position.set(xSide, 0.68, 1.92);
                spot.target.position.set(xSide * 0.8, 0.0, 10.0);
                this.chassis.add(spot);
                this.chassis.add(spot.target);
                this.headlightSpots.push(spot);
            });
        }
    }

    _addCurvedRearDetails() {
        // Wraparound 3D Concentric-Ring Taillights
        [-1, 1].forEach((side) => {
            const yaw = -side * 0.26;
            const tailHousing = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.19, 0.12), this.mats.glossBlack);
            tailHousing.position.set(side * 0.60, 0.80, -1.84);
            tailHousing.rotation.y = yaw;
            this.chassis.add(tailHousing);

            const tailLens = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.17), this.mats.taillight);
            tailLens.position.set(side * 0.61, 0.80, -1.905);
            tailLens.rotation.y = Math.PI + yaw;
            this.chassis.add(tailLens);
        });

        // Rear License Plate
        const rPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.105), this.mats.plate);
        rPlate.position.set(0, 0.58, -1.97);
        rPlate.rotation.y = Math.PI;
        this.chassis.add(rPlate);
    }

    _addWheelsAndArches(cylSegs) {
        const wheelPositions = [
            { key: 'fl', x:  0.77, y: 0.315, z:  1.27, front: true,  left: true  },
            { key: 'fr', x: -0.77, y: 0.315, z:  1.27, front: true,  left: false },
            { key: 'rl', x:  0.77, y: 0.315, z: -1.27, front: false, left: true  },
            { key: 'rr', x: -0.77, y: 0.315, z: -1.27, front: false, left: false }
        ];

        wheelPositions.forEach((pos) => {
            // Bold Matte Black Wheel Arch Cladding Flare
            const archGeo = new THREE.CylinderGeometry(0.385, 0.385, 0.14, cylSegs, 1, false, 0, Math.PI);
            const arch = new THREE.Mesh(archGeo, this.mats.blackPlastic);
            arch.rotation.z = Math.PI / 2;
            arch.rotation.y = Math.PI / 2;
            arch.position.set(pos.x * 1.05, pos.y + 0.015, pos.z);
            this.chassis.add(arch);

            const steerPivot = new THREE.Group();
            steerPivot.position.set(pos.x, pos.y, pos.z);
            this.chassis.add(steerPivot);

            const spinHub = new THREE.Group();
            steerPivot.add(spinHub);

            const tireGeo = new THREE.CylinderGeometry(0.315, 0.315, 0.215, cylSegs);
            tireGeo.rotateZ(Math.PI / 2);

            const wheelMats = [
                this.mats.rubber,
                pos.left ? this.mats.wheelFace : this.mats.rubber,
                pos.left ? this.mats.rubber : this.mats.wheelFace
            ];
            const tireMesh = new THREE.Mesh(tireGeo, wheelMats);
            tireMesh.castShadow = true;
            spinHub.add(tireMesh);

            if (pos.front) this.steerPivots[pos.key] = steerPivot;
            this.wheels[pos.key] = spinHub;
        });
    }

    /**
     * Optional 1-line external GLB loader if you ever download a Sketchfab/Blender mesh
     */
    async loadGLB(url) {
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(url);
        this.chassis.clear();
        this.chassis.add(gltf.scene);
    }

    setHeadlights(on) {
        this.state.headlightsOn = Boolean(on);
        this.mats.headlight.color.setHex(on ? 0xFFFBEB : 0x333842);
        this.mats.foglight.color.setHex(on ? 0xFDE68A : 0x282C34);
        this.headlightSpots.forEach(s => { s.intensity = on ? 18 : 0; });
        this._updateTaillights();
    }

    setBraking(brakeVal) {
        this.state.brake = THREE.MathUtils.clamp(brakeVal, 0, 1);
        this._updateTaillights();
    }

    _updateTaillights() {
        if (this.state.brake > 0.05) {
            this.mats.taillight.emissiveIntensity = 2.6;
        } else if (this.state.headlightsOn) {
            this.mats.taillight.emissiveIntensity = 1.0;
        } else {
            this.mats.taillight.emissiveIntensity = 0.15;
        }
    }

    initHowlerAudio() {
        if (this.sounds || !window.Howl) return;
        this.sounds = {
            idle: new window.Howl({ src: ['https://upload.wikimedia.org/wikipedia/commons/3/30/Diesel_engine_idle.ogg'], loop: true, volume: 0.65 }),
            load: new window.Howl({ src: ['https://upload.wikimedia.org/wikipedia/commons/e/e6/Tractor_engine_loop.ogg'], loop: true, volume: 0.0 }),
            turbo: new window.Howl({ src: ['https://actions.google.com/sounds/v1/transportation/car_accelerate.ogg'], loop: true, volume: 0.0 })
        };
        this.sounds.idle.play();
        this.sounds.load.play();
        this.sounds.turbo.play();
    }

    update(dt, controls = {}) {
        const throttle = THREE.MathUtils.clamp(controls.throttle ?? 0, 0, 1);
        const brake = THREE.MathUtils.clamp(controls.brake ?? 0, 0, 1);
        const steer = THREE.MathUtils.clamp(controls.steer ?? 0, -1, 1);

        this.state.throttle = throttle;
        this.setBraking(brake);

        const targetSteer = steer * this.specs.maxSteerRad;
        this.state.steerAngle = THREE.MathUtils.lerp(this.state.steerAngle, targetSteer, Math.min(1, dt * 10));
        if (this.steerPivots.fl && this.steerPivots.fr) {
            this.steerPivots.fl.rotation.y = this.state.steerAngle;
            this.steerPivots.fr.rotation.y = this.state.steerAngle;
        }

        const gearRatio = this.specs.gearRatios[this.state.gear - 1];
        const totalRatio = gearRatio * this.specs.finalDrive;
        const wheelRadPerSec = this.state.speedMs / this.specs.wheelRadius;
        const calcRPM = (wheelRadPerSec * totalRatio * 60) / (2 * Math.PI);

        this.state.rpm = THREE.MathUtils.clamp(
            Math.max(this.specs.idleRPM + throttle * 450, calcRPM),
            this.specs.idleRPM,
            this.specs.redlineRPM
        );

        if (this.state.rpm > 3850 && this.state.gear < 5) this.state.gear++;
        else if (this.state.rpm < 1400 && this.state.gear > 1) this.state.gear--;

        const rpmNorm = (this.state.rpm - 800) / (4500 - 800);
        const torqueCurve = 0.65 + 0.35 * Math.sin(Math.min(1, rpmNorm * 1.4) * Math.PI);
        const engineTorque = throttle * this.specs.torqueNm * torqueCurve;

        const driveForce = (engineTorque * totalRatio * 0.88) / this.specs.wheelRadius;
        const aeroDrag = 0.5 * 1.225 * this.specs.dragCoefficient * this.specs.frontalAreaM2 * (this.state.speedMs ** 2);
        const netForce = driveForce - aeroDrag - (this.state.speedMs > 0.05 ? 140 + brake * 8600 : 0);

        this.state.speedMs = THREE.MathUtils.clamp(
            this.state.speedMs + (netForce / this.specs.massKg) * dt,
            0,
            this.specs.maxSpeedMs
        );

        const spinDelta = (this.state.speedMs * dt) / this.specs.wheelRadius;
        Object.values(this.wheels).forEach(w => { if (w) w.rotation.x += spinDelta; });

        if (this.sounds) {
            const rpmRatio = this.state.rpm / this.specs.idleRPM;
            this.sounds.idle.rate(THREE.MathUtils.clamp(0.95 + rpmNorm * 1.15, 0.9, 2.2));
            this.sounds.idle.volume(Math.max(0.15, 0.75 - rpmNorm * 0.65));

            this.sounds.load.rate(THREE.MathUtils.clamp(0.75 + (rpmRatio - 1) * 0.38, 0.75, 2.4));
            this.sounds.load.volume(THREE.MathUtils.clamp(rpmNorm * 0.65 + throttle * 0.35, 0.05, 0.9));

            const boost = Math.max(0, (this.state.rpm - 1450) / 2600) * throttle;
            this.sounds.turbo.rate(THREE.MathUtils.clamp(0.9 + boost * 1.1, 0.9, 2.2));
            this.sounds.turbo.volume(boost * 0.35);
        }
    }
}
