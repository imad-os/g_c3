import * as THREE from 'three';

/**
 * 2019 Citroën C3 (3rd Gen / SX) - 1.6 HDi 16V 92 (DV6DTED M Euro 5)
 * Supports 3 LOD levels ('high', 'medium', 'low'), dynamic lights,
 * wheel rotation/steering, real-world physics specs, and Web Audio diesel sound.
 */
export class CitroenC3 {
    // Real-world specs for 1.6 HDi 92 (DV6DTED) with 5-speed manual
    static SPECS = {
        name: "Citroën C3 2019 1.6 HDi 92",
        engineCode: "DV6DTED M Euro 5",
        massKg: 1090,
        Dimensions: { length: 3.996, width: 1.749, height: 1.474, wheelbase: 2.540, trackWidth: 1.475 },
        wheelRadius: 0.315, // 195/55 R16 or 205/55 R16
        powerHP: 92,
        powerKW: 68,
        powerRPM: 4000,
        torqueNm: 230,
        torqueRPM: 1750,
        idleRPM: 800,
        redlineRPM: 4500,
        maxSpeedKmh: 183,        // 50.83 m/s
        maxSpeedMs: 50.83,
        accel0to100s: 11.1,      // 0-100 km/h in seconds
        dragCoefficient: 0.30,   // Cx
        frontalAreaM2: 2.18,
        gearRatios: [3.45, 1.87, 1.15, 0.84, 0.66], // 5-speed BVM5
        reverseRatio: -3.33,
        finalDrive: 3.58,
        maxSteerRad: 0.61        // ~35 degrees max steering angle
    };

    /**
     * @param {'high'|'medium'|'low'} quality - Mesh detail & material pipeline
     */
    constructor(quality = 'high') {
        this.quality = quality.toLowerCase();
        this.specs = { ...CitroenC3.SPECS };
        this.root = new THREE.Group();
        this.root.name = `CitroenC3_${this.quality}`;

        // Animation & control references
        this.wheels = { fl: null, fr: null, rl: null, rr: null };
        this.steerPivots = { fl: null, fr: null };
        this.lightMats = {};
        this.headlightBeams = [];

        // State
        this.state = {
            speedMs: 0,
            steerAngle: 0,      // radians (-maxSteerRad to +maxSteerRad)
            throttle: 0,        // 0.0 to 1.0
            brake: 0,           // 0.0 to 1.0
            gear: 1,            // 1 to 5
            rpm: 800,
            headlightsOn: false,
            hazardsOn: false,
            blinkTimer: 0
        };

        // Audio state
        this.audioCtx = null;
        this.audioNodes = null;

        this._initMaterials();
        this._buildVehicle();
    }

    _initMaterials() {
        const isHigh = this.quality === 'high';
        const isLow = this.quality === 'low';

        const createBodyMat = (colorHex, roughness = 0.25, metalness = 0.1) => {
            if (isLow) return new THREE.MeshLambertMaterial({ color: colorHex });
            if (isHigh) {
                return new THREE.MeshPhysicalMaterial({
                    color: colorHex,
                    roughness: roughness,
                    metalness: metalness,
                    clearcoat: 0.85,
                    clearcoatRoughness: 0.12
                });
            }
            return new THREE.MeshStandardMaterial({ color: colorHex, roughness, metalness });
        };

        const createMat = (colorHex, roughness = 0.7, metalness = 0.1) => {
            if (isLow) return new THREE.MeshLambertMaterial({ color: colorHex });
            return new THREE.MeshStandardMaterial({ color: colorHex, roughness, metalness });
        };

        this.mats = {
            polarWhite: createBodyMat(0xF6F7F9, 0.2, 0.05),   // Banquise / Polar White
            sportRed: createBodyMat(0xC81D25, 0.22, 0.15),    // Aden / Sport Red roof & accents
            blackPlastic: createMat(0x1E1F22, 0.82, 0.05),    // Airbumps, arches, lower skirts
            glossBlack: createBodyMat(0x111215, 0.15, 0.2),   // A/B/C pillars & grille
            chrome: createMat(0xDCDFE4, 0.18, 0.88),          // Double chevron & alloy faces
            glass: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x1A242D })
                : new THREE.MeshPhysicalMaterial({
                    color: 0x162029,
                    roughness: 0.1,
                    metalness: 0.1,
                    transmission: isHigh ? 0.55 : 0,
                    transparent: true,
                    opacity: isHigh ? 0.82 : 0.88
                }),
            rubber: createMat(0x151618, 0.9, 0.0),
            interior: createMat(0x232528, 0.85, 0.0)
        };

        // Emissive materials for dynamic lights
        this.lightMats = {
            drl: new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
            headlight: new THREE.MeshBasicMaterial({ color: 0x444B54 }),
            foglight: new THREE.MeshBasicMaterial({ color: 0x333840 }),
            taillight: new THREE.MeshBasicMaterial({ color: 0x66080C }),
            indicator: new THREE.MeshBasicMaterial({ color: 0x442800 })
        };
    }

    _buildVehicle() {
        const segs = this.quality === 'high' ? 24 : (this.quality === 'medium' ? 14 : 8);
        const chassis = new THREE.Group();
        chassis.name = "Chassis";
        this.root.add(chassis);

        // 1. LOWER BODY & BLACK PLASTIC CLADDING (Skirts & Bumpers)
        const underbodyGeo = new THREE.BoxGeometry(1.70, 0.22, 3.88);
        const underbody = new THREE.Mesh(underbodyGeo, this.mats.blackPlastic);
        underbody.position.set(0, 0.35, 0);
        underbody.castShadow = true;
        underbody.receiveShadow = true;
        chassis.add(underbody);

        // 2. MAIN WHITE BODY SHELL (Rounded hatchback profile)
        const mainBodyGeo = new THREE.BoxGeometry(1.74, 0.56, 3.82);
        const mainBody = new THREE.Mesh(mainBodyGeo, this.mats.polarWhite);
        mainBody.position.set(0, 0.68, -0.02);
        mainBody.castShadow = true;
        mainBody.receiveShadow = true;
        chassis.add(mainBody);

        // Hood / Bonnet (sloping slightly forward)
        const hoodGeo = new THREE.BoxGeometry(1.66, 0.16, 1.05);
        const hood = new THREE.Mesh(hoodGeo, this.mats.polarWhite);
        hood.position.set(0, 0.96, 1.30);
        hood.rotation.x = 0.11;
        hood.castShadow = true;
        chassis.add(hood);

        // Front Nose / Upper Bumper
        const noseGeo = new THREE.BoxGeometry(1.68, 0.48, 0.30);
        const nose = new THREE.Mesh(noseGeo, this.mats.polarWhite);
        nose.position.set(0, 0.68, 1.84);
        nose.castShadow = true;
        chassis.add(nose);

        // Rear Tailgate (Upper white hatch)
        const tailgateGeo = new THREE.BoxGeometry(1.62, 0.52, 0.25);
        const tailgate = new THREE.Mesh(tailgateGeo, this.mats.polarWhite);
        tailgate.position.set(0, 0.78, -1.84);
        tailgate.rotation.x = -0.15;
        tailgate.castShadow = true;
        chassis.add(tailgate);

        // Rear Black Plastic Bumper Diffuser (High & characteristic on C3)
        const rearBumperGeo = new THREE.BoxGeometry(1.72, 0.38, 0.28);
        const rearBumper = new THREE.Mesh(rearBumperGeo, this.mats.blackPlastic);
        rearBumper.position.set(0, 0.44, -1.88);
        chassis.add(rearBumper);

        // 3. GREENHOUSE (Black pillars + Windows)
        const cabinGeo = new THREE.BoxGeometry(1.48, 0.46, 2.15);
        const cabin = new THREE.Mesh(cabinGeo, this.mats.glossBlack);
        cabin.position.set(0, 1.18, -0.22);
        cabin.castShadow = true;
        chassis.add(cabin);

        // Windshield
        const windshieldGeo = new THREE.PlaneGeometry(1.38, 0.58);
        const windshield = new THREE.Mesh(windshieldGeo, this.mats.glass);
        windshield.position.set(0, 1.17, 0.92);
        windshield.rotation.x = -0.58;
        chassis.add(windshield);

        // Rear Window
        const rearWinGeo = new THREE.PlaneGeometry(1.30, 0.46);
        const rearWin = new THREE.Mesh(rearWinGeo, this.mats.glass);
        rearWin.position.set(0, 1.18, -1.33);
        rearWin.rotation.x = Math.PI + 0.48;
        chassis.add(rearWin);

        // Side Windows (Left & Right)
        [-0.745, 0.745].forEach((x, idx) => {
            const sideWinGeo = new THREE.PlaneGeometry(1.75, 0.36);
            const sideWin = new THREE.Mesh(sideWinGeo, this.mats.glass);
            sideWin.position.set(x, 1.19, -0.20);
            sideWin.rotation.y = idx === 0 ? -Math.PI / 2 : Math.PI / 2;
            chassis.add(sideWin);

            // White C-Pillar Quarter Panel with Red/Black Stripe
            const cPillarGeo = new THREE.BoxGeometry(0.06, 0.44, 0.38);
            const cPillar = new THREE.Mesh(cPillarGeo, this.mats.polarWhite);
            cPillar.position.set(x * 0.98, 1.16, -1.12);
            cPillar.rotation.x = 0.32;
            chassis.add(cPillar);
        });

        // 4. SPORT RED FLOATING ROOF & SPOILER
        const roofGeo = new THREE.BoxGeometry(1.44, 0.10, 1.98);
        const roof = new THREE.Mesh(roofGeo, this.mats.sportRed);
        roof.position.set(0, 1.43, -0.28);
        roof.castShadow = true;
        chassis.add(roof);

        // Roof Spoiler (Red overhang at rear)
        const spoilerGeo = new THREE.BoxGeometry(1.38, 0.08, 0.24);
        const spoiler = new THREE.Mesh(spoilerGeo, this.mats.sportRed);
        spoiler.position.set(0, 1.42, -1.32);
        spoiler.rotation.x = 0.1;
        chassis.add(spoiler);

        // Roof Antenna (Medium & High LOD)
        if (this.quality !== 'low') {
            const antGeo = new THREE.CylinderGeometry(0.008, 0.018, 0.26, 6);
            const antenna = new THREE.Mesh(antGeo, this.mats.blackPlastic);
            antenna.position.set(0, 1.56, -1.05);
            antenna.rotation.x = -0.45;
            chassis.add(antenna);
        }

        // 5. SIGNATURE SIDE AIRBUMPS (Black panels with 1st capsule in Red)
        this._buildAirbumps(chassis);

        // 6. FRONT GRILLE, DOUBLE CHEVRONS, DUAL-TIER LIGHTS & RED FOG BEZELS
        this._buildFrontFascia(chassis);

        // 7. REAR 3D ROUNDED TAILLIGHTS & BADGING
        this._buildRearFascia(chassis);

        // 8. SIDE MIRRORS (Sport Red Caps) & DOOR HANDLES
        this._buildMirrorsAndHandles(chassis);

        // 9. WHEEL ARCH FLARES & 4 ROTATING/STEERING WHEELS
        this._buildWheelsAndArches(chassis, segs);
    }

    _buildAirbumps(chassis) {
        [-0.875, 0.875].forEach((xSide) => {
            const sign = Math.sign(xSide);
            // Main Black Airbump Panel
            const panelGeo = new THREE.BoxGeometry(0.04, 0.22, 1.48);
            const panel = new THREE.Mesh(panelGeo, this.mats.blackPlastic);
            panel.position.set(xSide, 0.49, 0.02);
            chassis.add(panel);

            // Front-most Red Airbump Capsule Accent (Signature C3 detail)
            const redFrameGeo = new THREE.BoxGeometry(0.055, 0.13, 0.16);
            const redFrame = new THREE.Mesh(redFrameGeo, this.mats.sportRed);
            redFrame.position.set(xSide + sign * 0.004, 0.49, 0.58);
            chassis.add(redFrame);

            const innerCapGeo = new THREE.BoxGeometry(0.06, 0.08, 0.10);
            const innerCap = new THREE.Mesh(innerCapGeo, this.mats.blackPlastic);
            innerCap.position.set(xSide + sign * 0.005, 0.49, 0.58);
            chassis.add(innerCap);

            // Remaining 6 Black Capsules (Medium & High LOD)
            if (this.quality !== 'low') {
                for (let i = 1; i <= 6; i++) {
                    const capGeo = new THREE.BoxGeometry(0.052, 0.12, 0.14);
                    const cap = new THREE.Mesh(capGeo, this.mats.blackPlastic);
                    cap.position.set(xSide + sign * 0.003, 0.49, 0.58 - i * 0.19);
                    chassis.add(cap);
                }
            }
        });
    }

    _buildFrontFascia(chassis) {
        // Upper Chrome Strip + Double Chevron Grille
        const chromeBarGeo = new THREE.BoxGeometry(1.36, 0.045, 0.04);
        const chromeBar = new THREE.Mesh(chromeBarGeo, this.mats.chrome);
        chromeBar.position.set(0, 0.88, 1.98);
        chassis.add(chromeBar);

        // Center Double Chevron Effect
        [-0.04, 0.04].forEach((xOff, i) => {
            const chevGeo = new THREE.BoxGeometry(0.11, 0.025, 0.05);
            const chevTop = new THREE.Mesh(chevGeo, this.mats.chrome);
            chevTop.position.set(xOff, 0.91, 1.99);
            chevTop.rotation.z = i === 0 ? 0.45 : -0.45;
            chassis.add(chevTop);
        });

        // Top-Tier Slim LED DRLs + Indicators
        [-0.58, 0.58].forEach((xSide) => {
            const drlGeo = new THREE.BoxGeometry(0.32, 0.055, 0.06);
            const drl = new THREE.Mesh(drlGeo, this.lightMats.drl);
            drl.position.set(xSide, 0.88, 1.97);
            chassis.add(drl);
        });

        // Mid-Tier Main Rounded Rectangular Headlamps
        [-0.60, 0.60].forEach((xSide) => {
            const bezelGeo = new THREE.BoxGeometry(0.30, 0.16, 0.06);
            const bezel = new THREE.Mesh(bezelGeo, this.mats.glossBlack);
            bezel.position.set(xSide, 0.72, 1.97);
            chassis.add(bezel);

            const lensGeo = new THREE.BoxGeometry(0.26, 0.13, 0.07);
            const lens = new THREE.Mesh(lensGeo, this.lightMats.headlight);
            lens.position.set(xSide, 0.72, 1.975);
            chassis.add(lens);
        });

        // Central Black Hexagonal Intake Grille
        const grilleGeo = new THREE.BoxGeometry(0.88, 0.28, 0.05);
        const grille = new THREE.Mesh(grilleGeo, this.mats.blackPlastic);
        grille.position.set(0, 0.62, 1.98);
        chassis.add(grille);

        // Front License Plate
        const plateGeo = new THREE.BoxGeometry(0.48, 0.10, 0.06);
        const plate = new THREE.Mesh(plateGeo, this.mats.polarWhite);
        plate.position.set(0, 0.58, 1.99);
        chassis.add(plate);

        // Bottom-Tier Sport Red Fog Light Surrounds + Fog Lamps
        [-0.56, 0.56].forEach((xSide) => {
            const redPodGeo = new THREE.BoxGeometry(0.28, 0.14, 0.07);
            const redPod = new THREE.Mesh(redPodGeo, this.mats.sportRed);
            redPod.position.set(xSide, 0.38, 1.96);
            chassis.add(redPod);

            const fogHoleGeo = new THREE.BoxGeometry(0.20, 0.09, 0.08);
            const fogHole = new THREE.Mesh(fogHoleGeo, this.mats.blackPlastic);
            fogHole.position.set(xSide, 0.38, 1.965);
            chassis.add(fogHole);

            const fogBulbGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.09, 8);
            const fogBulb = new THREE.Mesh(fogBulbGeo, this.lightMats.foglight);
            fogBulb.rotation.x = Math.PI / 2;
            fogBulb.position.set(xSide + Math.sign(xSide) * 0.03, 0.38, 1.97);
            chassis.add(fogBulb);
        });

        // Actual SpotLights for Night Racing (High & Medium LOD)
        if (this.quality !== 'low') {
            [-0.60, 0.60].forEach((xSide) => {
                const spot = new THREE.SpotLight(0xFFF6E0, 0, 35, Math.PI / 5, 0.4, 1.5);
                spot.position.set(xSide, 0.72, 2.0);
                spot.target.position.set(xSide * 0.8, 0.1, 12.0);
                chassis.add(spot);
                chassis.add(spot.target);
                this.headlightBeams.push(spot);
            });
        }
    }

    _buildRearFascia(chassis) {
        // 3D Rounded Rectangular Taillights
        [-0.62, 0.62].forEach((xSide) => {
            const tailHousingGeo = new THREE.BoxGeometry(0.32, 0.20, 0.14);
            const tailHousing = new THREE.Mesh(tailHousingGeo, this.mats.glossBlack);
            tailHousing.position.set(xSide, 0.84, -1.91);
            chassis.add(tailHousing);

            const tailLensGeo = new THREE.BoxGeometry(0.29, 0.17, 0.15);
            const tailLens = new THREE.Mesh(tailLensGeo, this.lightMats.taillight);
            tailLens.position.set(xSide, 0.84, -1.915);
            chassis.add(tailLens);
        });

        // Rear License Plate
        const rearPlateGeo = new THREE.BoxGeometry(0.48, 0.10, 0.04);
        const rearPlate = new THREE.Mesh(rearPlateGeo, this.mats.polarWhite);
        rearPlate.position.set(0, 0.62, -1.96);
        chassis.add(rearPlate);
    }

    _buildMirrorsAndHandles(chassis) {
        [-0.89, 0.89].forEach((xSide) => {
            // Black Mirror Stalk
            const stalkGeo = new THREE.BoxGeometry(0.10, 0.05, 0.06);
            const stalk = new THREE.Mesh(stalkGeo, this.mats.blackPlastic);
            stalk.position.set(xSide, 0.96, 0.62);
            chassis.add(stalk);

            // Sport Red Mirror Cap
            const capGeo = new THREE.BoxGeometry(0.14, 0.10, 0.14);
            const cap = new THREE.Mesh(capGeo, this.mats.sportRed);
            cap.position.set(xSide + Math.sign(xSide) * 0.04, 1.00, 0.60);
            chassis.add(cap);

            // Door Handles (Front & Rear)
            if (this.quality !== 'low') {
                [0.12, -0.68].forEach((zPos) => {
                    const handleGeo = new THREE.BoxGeometry(0.04, 0.035, 0.15);
                    const handle = new THREE.Mesh(handleGeo, this.mats.glossBlack);
                    handle.position.set(xSide * 0.98, 0.84, zPos);
                    chassis.add(handle);
                });
            }
        });
    }

    _buildWheelsAndArches(chassis, segs) {
        const wheelPositions = [
            { key: 'fl', x:  0.76, y: 0.315, z:  1.27, front: true,  left: true  },
            { key: 'fr', x: -0.76, y: 0.315, z:  1.27, front: true,  left: false },
            { key: 'rl', x:  0.76, y: 0.315, z: -1.27, front: false, left: true  },
            { key: 'rr', x: -0.76, y: 0.315, z: -1.27, front: false, left: false }
        ];

        wheelPositions.forEach((pos) => {
            // Black Matte Wheel Arch Cladding
            const archGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.14, segs, 1, false, 0, Math.PI);
            const arch = new THREE.Mesh(archGeo, this.mats.blackPlastic);
            arch.rotation.z = Math.PI / 2;
            arch.rotation.y = Math.PI / 2;
            arch.position.set(pos.x * 1.05, pos.y + 0.02, pos.z);
            chassis.add(arch);

            // Wheel Hierarchy: SteerPivot -> SpinHub -> Tire & 8-Spoke Diamond-Cut Rim
            const steerPivot = new THREE.Group();
            steerPivot.position.set(pos.x, pos.y, pos.z);
            chassis.add(steerPivot);

            const spinHub = new THREE.Group();
            steerPivot.add(spinHub);

            // Rubber Tire
            const tireGeo = new THREE.CylinderGeometry(0.315, 0.315, 0.205, segs);
            tireGeo.rotateZ(Math.PI / 2);
            const tire = new THREE.Mesh(tireGeo, this.mats.rubber);
            tire.castShadow = true;
            spinHub.add(tire);

            // Inner Dark Alloy Barrel
            const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.21, segs);
            rimGeo.rotateZ(Math.PI / 2);
            const rim = new THREE.Mesh(rimGeo, this.mats.glossBlack);
            spinHub.add(rim);

            // 8-Spoke Two-Tone Diamond-Cut Face (High & Medium get 3D spokes, Low gets simplified cross)
            const spokeCount = this.quality === 'low' ? 4 : 8;
            const outSign = pos.left ? 1 : -1;
            for (let i = 0; i < spokeCount; i++) {
                const angle = (i / spokeCount) * Math.PI * 2;
                const spokeGeo = new THREE.BoxGeometry(0.02, 0.18, 0.042);
                const spoke = new THREE.Mesh(spokeGeo, this.mats.chrome);
                spoke.position.x = outSign * 0.102;
                spoke.rotation.x = angle;
                spinHub.add(spoke);
            }

            if (pos.front) {
                this.steerPivots[pos.key] = steerPivot;
            }
            this.wheels[pos.key] = spinHub;
        });
    }

    /**
     * Toggle Headlights & Night Taillight Running Mode
     * @param {boolean} on
     */
    setHeadlights(on) {
        this.state.headlightsOn = Boolean(on);
        this.lightMats.headlight.color.setHex(on ? 0xFFFBE6 : 0x444B54);
        this.lightMats.foglight.color.setHex(on ? 0xFFE8B0 : 0x333840);
        this.headlightBeams.forEach(spot => {
            spot.intensity = on ? 45 : 0;
        });
        this._updateTaillights();
    }

    /**
     * Set Brake Pedal intensity (0.0 to 1.0) - brightens rear brake lights
     * @param {number} brakeAmount
     */
    setBraking(brakeAmount) {
        this.state.brake = THREE.MathUtils.clamp(brakeAmount, 0, 1);
        this._updateTaillights();
    }

    _updateTaillights() {
        if (this.state.brake > 0.05) {
            this.lightMats.taillight.color.setHex(0xFF1111); // Bright brake glow
        } else if (this.state.headlightsOn) {
            this.lightMats.taillight.color.setHex(0xAA0A12); // Running tail glow
        } else {
            this.lightMats.taillight.color.setHex(0x55060A); // Off
        }
    }

    /**
     * Initialize Web Audio API Procedural 1.6 HDi 16V 92 (DV6DTED) Turbo-Diesel Sound
     * Call once after a user gesture (click / keydown).
     */
    initEngineSound() {
        if (this.audioCtx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();

        // 1. 4-Cylinder Diesel Combustion Pulse (Sawtooth + Sub-harmonic Square)
        const mainOsc = this.audioCtx.createOscillator();
        mainOsc.type = 'sawtooth';

        const subOsc = this.audioCtx.createOscillator();
        subOsc.type = 'square';

        // 2. Diesel Direct-Injection Knock / Clatter Bandpass Noise
        const bufferSize = this.audioCtx.sampleRate * 2;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const clatterSource = this.audioCtx.createBufferSource();
        clatterSource.buffer = noiseBuffer;
        clatterSource.loop = true;

        const clatterFilter = this.audioCtx.createBiquadFilter();
        clatterFilter.type = 'bandpass';
        clatterFilter.frequency.value = 1150; // Characteristic HDi injector clatter band
        clatterFilter.Q.value = 3.5;

        const clatterGain = this.audioCtx.createGain();
        clatterGain.gain.value = 0.06;

        // 3. Garrett Turbocharger Whistle (Peaks around 1750 - 3000 RPM under load)
        const turboOsc = this.audioCtx.createOscillator();
        turboOsc.type = 'sine';
        const turboGain = this.audioCtx.createGain();
        turboGain.gain.value = 0.0;

        // Exhaust Lowpass Filter & Master Gain
        const exhaustFilter = this.audioCtx.createBiquadFilter();
        exhaustFilter.type = 'lowpass';
        exhaustFilter.frequency.value = 260;

        const masterGain = this.audioCtx.createGain();
        masterGain.gain.value = 0.18;

        // Routing
        mainOsc.connect(exhaustFilter);
        subOsc.connect(exhaustFilter);
        exhaustFilter.connect(masterGain);

        clatterSource.connect(clatterFilter);
        clatterFilter.connect(clatterGain);
        clatterGain.connect(masterGain);

        turboOsc.connect(turboGain);
        turboGain.connect(masterGain);

        masterGain.connect(this.audioCtx.destination);

        mainOsc.start();
        subOsc.start();
        clatterSource.start();
        turboOsc.start();

        this.audioNodes = { mainOsc, subOsc, exhaustFilter, clatterGain, turboOsc, turboGain, masterGain };
    }

    /**
     * Physics, Wheel Animation & Audio Update Loop (Call inside requestAnimationFrame)
     * @param {number} dt - Delta time in seconds
     * @param {Object} controls - { throttle: 0..1, brake: 0..1, steer: -1..1 }
     */
    update(dt, controls = {}) {
        const throttle = THREE.MathUtils.clamp(controls.throttle ?? this.state.throttle, 0, 1);
        const brake = THREE.MathUtils.clamp(controls.brake ?? this.state.brake, 0, 1);
        const steerInput = THREE.MathUtils.clamp(controls.steer ?? 0, -1, 1);

        this.state.throttle = throttle;
        this.setBraking(brake);

        // 1. Steering interpolation
        const targetSteer = steerInput * this.specs.maxSteerRad;
        this.state.steerAngle = THREE.MathUtils.lerp(this.state.steerAngle, targetSteer, Math.min(1, dt * 10));
        if (this.steerPivots.fl && this.steerPivots.fr) {
            this.steerPivots.fl.rotation.y = this.state.steerAngle;
            this.steerPivots.fr.rotation.y = this.state.steerAngle;
        }

        // 2. 1.6 HDi 92 Longitudinal Physics (Torque curve peaking at 230 Nm @ 1750 RPM)
        const gearRatio = this.specs.gearRatios[this.state.gear - 1];
        const overallRatio = gearRatio * this.specs.finalDrive;

        // Calculate RPM from wheel speed
        const wheelAngularVel = this.state.speedMs / this.specs.wheelRadius;
        const calculatedRPM = (wheelAngularVel * overallRatio * 60) / (2 * Math.PI);
        this.state.rpm = THREE.MathUtils.clamp(
            Math.max(this.specs.idleRPM + throttle * 400, calculatedRPM),
            this.specs.idleRPM,
            this.specs.redlineRPM
        );

        // Automatic 5-speed shift logic matching HDi diesel torque band
        if (this.state.rpm > 3850 && this.state.gear < 5) {
            this.state.gear++;
        } else if (this.state.rpm < 1400 && this.state.gear > 1) {
            this.state.gear--;
        }

        // DV6DTED Torque curve approximation (strong low-mid boost around 1750 RPM, tapers past 4000 RPM)
        const rpmNorm = (this.state.rpm - 800) / (4500 - 800);
        const torqueFactor = 0.65 + 0.35 * Math.sin(Math.min(1, rpmNorm * 1.4) * Math.PI);
        const engineTorque = throttle * this.specs.torqueNm * torqueFactor;

        const driveForce = (engineTorque * overallRatio * 0.88) / this.specs.wheelRadius;
        const aeroDrag = 0.5 * 1.225 * this.specs.dragCoefficient * this.specs.frontalAreaM2 * (this.state.speedMs ** 2);
        const rollingResistance = 145;
        const brakeForce = brake * 8500;

        const netForce = driveForce - aeroDrag - (this.state.speedMs > 0.05 ? rollingResistance + brakeForce : 0);
        const accel = netForce / this.specs.massKg;

        this.state.speedMs = THREE.MathUtils.clamp(this.state.speedMs + accel * dt, 0, this.specs.maxSpeedMs);

        // 3. Spin all 4 wheels accurately based on linear distance traveled
        const wheelSpinDelta = (this.state.speedMs * dt) / this.specs.wheelRadius;
        Object.values(this.wheels).forEach(wheel => {
            if (wheel) wheel.rotation.x += wheelSpinDelta;
        });

        // 4. Update 1.6 HDi Diesel Engine Audio
        if (this.audioNodes && this.audioCtx.state === 'running') {
            // 4-stroke 4-cylinder firing frequency = (RPM / 60) * 2
            const firingFreq = (this.state.rpm / 60) * 2;
            const now = this.audioCtx.currentTime;

            this.audioNodes.mainOsc.frequency.setTargetAtTime(firingFreq, now, 0.03);
            this.audioNodes.subOsc.frequency.setTargetAtTime(firingFreq * 0.5, now, 0.03);
            this.audioNodes.exhaustFilter.frequency.setTargetAtTime(180 + firingFreq * 2.2 + throttle * 250, now, 0.04);

            // Diesel clatter is louder at idle and low RPM, smooths out at higher RPM
            const clatterLevel = (0.07 - (this.state.rpm / 4500) * 0.035) * (0.7 + throttle * 0.5);
            this.audioNodes.clatterGain.gain.setTargetAtTime(Math.max(0.015, clatterLevel), now, 0.04);

            // Turbo whistle spools up above 1500 RPM under throttle
            const boost = Math.max(0, (this.state.rpm - 1400) / 2600) * throttle;
            this.audioNodes.turboOsc.frequency.setTargetAtTime(1900 + boost * 2400, now, 0.06);
            this.audioNodes.turboGain.gain.setTargetAtTime(boost * 0.022, now, 0.08);
        }
    }
}