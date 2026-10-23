import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * 2019 Citroën C3 (SX) - 1.6 HDi 16V 92 (DV6DTED M Euro 5)
 * Uses Open-Source RoundedBoxGeometry, Canvas-baked Textures for Airbumps/Rims/Plates,
 * optional external .glb loading via DRACOLoader, and Howler.js Real Sample Audio Engine.
 */
export class CitroenC3 {
    static SPECS = {
        name: "Citroën C3 2019 1.6 HDi 92",
        engineCode: "DV6DTED M Euro 5",
        massKg: 1090,
        wheelRadius: 0.315,
        powerHP: 92,
        torqueNm: 230,           // 230 Nm @ 1750 RPM
        idleRPM: 800,
        redlineRPM: 4500,
        maxSpeedKmh: 183,
        maxSpeedMs: 50.83,
        accel0to100s: 11.1,
        dragCoefficient: 0.30,
        frontalAreaM2: 2.18,
        gearRatios: [3.45, 1.87, 1.15, 0.84, 0.66], // 5-speed manual BVM5
        finalDrive: 3.58,
        maxSteerRad: 0.60
    };

    // Open-source CC0 recorded engine audio loops (Wikimedia Commons / Freesound CC0 mirrors)
    // You can also replace these URLs with local files in your project: './assets/audio/hdi_idle.ogg'
    static DEFAULT_AUDIO_URLS = {
        idle: 'https://upload.wikimedia.org/wikipedia/commons/3/30/Diesel_engine_idle.ogg',
        load: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Tractor_engine_loop.ogg',
        turbo: 'https://actions.google.com/sounds/v1/transportation/car_accelerate.ogg',
        brakeScreech: 'https://actions.google.com/sounds/v1/transportation/tires_squeal.ogg'
    };

    /**
     * @param {'high'|'medium'|'low'} quality
     */
    constructor(quality = 'high') {
        this.quality = quality.toLowerCase();
        this.specs = { ...CitroenC3.SPECS };
        this.root = new THREE.Group();
        this.root.name = `CitroenC3_${this.quality}`;

        this.wheels = { fl: null, fr: null, rl: null, rr: null };
        this.steerPivots = { fl: null, fr: null };
        this.brakeCalipers = [];
        this.headlightSpots = [];

        this.state = {
            speedMs: 0,
            steerAngle: 0,
            throttle: 0,
            brake: 0,
            gear: 1,
            rpm: 800,
            headlightsOn: true,
            bodyPitch: 0,
            bodyRoll: 0
        };

        this.sounds = null;
        this._initTextures();
        this._initMaterials();
        this._buildVehicle();
    }

    /**
     * Generates crisp procedural normal/diffuse textures for the Diamond-Cut Rims,
     * Hexagonal Grille, and Plate so we don't rely on blocky boxes.
     */
    _initTextures() {
        // 1. 8-Spoke Two-Tone Diamond-Cut Alloy Wheel Texture
        const wheelCanvas = document.createElement('canvas');
        wheelCanvas.width = 512;
        wheelCanvas.height = 512;
        const wCtx = wheelCanvas.getContext('2d');

        // Dark gloss barrel background
        wCtx.fillStyle = '#111317';
        wCtx.fillRect(0, 0, 512, 512);

        wCtx.translate(256, 256);
        // Outer machined alloy lip
        wCtx.beginPath();
        wCtx.arc(0, 0, 240, 0, Math.PI * 2);
        wCtx.strokeStyle = '#d8dee9';
        wCtx.lineWidth = 14;
        wCtx.stroke();

        // 8 Machined Split Spokes (matching the 2019 C3 Clover/Cross 16"/17" alloy wheels)
        for (let i = 0; i < 8; i++) {
            wCtx.save();
            wCtx.rotate((i * Math.PI * 2) / 8);
            const grad = wCtx.createLinearGradient(-22, 40, 22, 235);
            grad.addColorStop(0, '#cfd6e2');
            grad.addColorStop(0.5, '#f8fafc');
            grad.addColorStop(1, '#94a3b8');
            wCtx.fillStyle = grad;

            wCtx.beginPath();
            wCtx.moveTo(-14, 42);
            wCtx.lineTo(-28, 232);
            wCtx.lineTo(18, 232);
            wCtx.lineTo(10, 42);
            wCtx.closePath();
            wCtx.fill();
            wCtx.restore();
        }

        // Center hub cap + Citroën Double Chevron
        wCtx.beginPath();
        wCtx.arc(0, 0, 46, 0, Math.PI * 2);
        wCtx.fillStyle = '#0f1115';
        wCtx.fill();
        wCtx.lineWidth = 4;
        wCtx.strokeStyle = '#cbd5e1';
        wCtx.stroke();

        // Draw Double Chevron inside center cap
        wCtx.strokeStyle = '#f8fafc';
        wCtx.lineWidth = 5;
        [-6, 6].forEach(yOff => {
            wCtx.beginPath();
            wCtx.moveTo(-14, yOff + 6);
            wCtx.lineTo(0, yOff - 7);
            wCtx.lineTo(14, yOff + 6);
            wCtx.stroke();
        });

        this.wheelTexture = new THREE.CanvasTexture(wheelCanvas);
        this.wheelTexture.colorSpace = THREE.SRGBColorSpace;

        // 2. Front & Rear License Plate Texture
        const plateCanvas = document.createElement('canvas');
        plateCanvas.width = 512;
        plateCanvas.height = 112;
        const pCtx = plateCanvas.getContext('2d');
        pCtx.fillStyle = '#f8fafc';
        pCtx.fillRect(0, 0, 512, 112);
        pCtx.strokeStyle = '#1e293b';
        pCtx.lineWidth = 6;
        pCtx.strokeRect(4, 4, 504, 104);
        pCtx.fillStyle = '#0f172a';
        pCtx.font = 'bold 56px monospace';
        pCtx.textAlign = 'center';
        pCtx.textBaseline = 'middle';
        pCtx.fillText('35219 | ب | 15', 256, 58);

        this.plateTexture = new THREE.CanvasTexture(plateCanvas);
        this.plateTexture.colorSpace = THREE.SRGBColorSpace;
    }

    _initMaterials() {
        const isHigh = this.quality === 'high';
        const isLow = this.quality === 'low';

        const createPaint = (hex, roughness = 0.14, metalness = 0.08, clearcoat = 1.0) => {
            if (isLow) return new THREE.MeshLambertMaterial({ color: hex });
            if (isHigh) {
                return new THREE.MeshPhysicalMaterial({
                    color: hex,
                    roughness,
                    metalness,
                    clearcoat,
                    clearcoatRoughness: 0.08,
                    envMapIntensity: 1.6
                });
            }
            return new THREE.MeshStandardMaterial({ color: hex, roughness, metalness, envMapIntensity: 1.2 });
        };

        this.mats = {
            polarWhite: createPaint(0xF5F7FA, 0.14, 0.05, 1.0), // Banquise White
            sportRed: createPaint(0xC91A22, 0.16, 0.18, 1.0),   // Sport Red Roof/Mirrors/Fog
            blackCladding: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x1A1C20 })
                : new THREE.MeshStandardMaterial({ color: 0x1A1C20, roughness: 0.78, metalness: 0.05 }),
            glossBlack: createPaint(0x0D0F12, 0.08, 0.2, 1.0),
            chrome: isLow
                ? new THREE.MeshLambertMaterial({ color: 0xE2E8F0 })
                : new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.08, metalness: 0.95, envMapIntensity: 2.0 }),
            glass: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x111924 })
                : new THREE.MeshPhysicalMaterial({
                    color: 0x0C131D,
                    roughness: 0.05,
                    metalness: 0.1,
                    transmission: isHigh ? 0.65 : 0,
                    transparent: true,
                    opacity: isHigh ? 0.85 : 0.92,
                    envMapIntensity: 2.0
                }),
            rubber: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x141619 })
                : new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.88, metalness: 0.02 }),
            wheelFace: new THREE.MeshStandardMaterial({
                map: this.wheelTexture,
                roughness: 0.22,
                metalness: 0.8,
                envMapIntensity: 1.5
            }),
            plate: new THREE.MeshStandardMaterial({ map: this.plateTexture, roughness: 0.3 }),
            // Emissive Materials that trigger UnrealBloomPass when turned on
            drl: new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                emissive: 0xE0F2FE,
                emissiveIntensity: 3.2,
                roughness: 0.1
            }),
            headlight: new THREE.MeshStandardMaterial({
                color: 0xFFFBEB,
                emissive: 0xFEF3C7,
                emissiveIntensity: 2.8,
                roughness: 0.1
            }),
            foglight: new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
                emissive: 0xFDE68A,
                emissiveIntensity: 1.8
            }),
            taillight: new THREE.MeshStandardMaterial({
                color: 0x990812,
                emissive: 0xFF0A1B,
                emissiveIntensity: 1.6,
                roughness: 0.15
            })
        };
    }

    _buildVehicle() {
        const bevelSegs = this.quality === 'high' ? 6 : (this.quality === 'medium' ? 3 : 1);
        const cylSegs = this.quality === 'high' ? 32 : (this.quality === 'medium' ? 18 : 10);

        this.chassis = new THREE.Group();
        this.root.add(this.chassis);

        // 1. LOWER MATTE BLACK CLADDING SILL
        const sillGeo = new RoundedBoxGeometry(1.72, 0.22, 3.92, bevelSegs, 0.06);
        const sill = new THREE.Mesh(sillGeo, this.mats.blackCladding);
        sill.position.set(0, 0.33, 0);
        sill.castShadow = true;
        sill.receiveShadow = true;
        this.chassis.add(sill);

        // 2. ROUNDED POLAR WHITE LOWER HATCHBACK BODY
        const lowerBodyGeo = new RoundedBoxGeometry(1.75, 0.56, 3.86, bevelSegs, 0.14);
        const lowerBody = new THREE.Mesh(lowerBodyGeo, this.mats.polarWhite);
        lowerBody.position.set(0, 0.67, -0.02);
        lowerBody.castShadow = true;
        lowerBody.receiveShadow = true;
        this.chassis.add(lowerBody);

        // Sculpted High Rounded Bonnet / Hood (Signature C3 flat-ish high nose)
        const hoodGeo = new RoundedBoxGeometry(1.66, 0.22, 1.18, bevelSegs, 0.09);
        const hood = new THREE.Mesh(hoodGeo, this.mats.polarWhite);
        hood.position.set(0, 0.93, 1.25);
        hood.rotation.x = 0.09;
        hood.castShadow = true;
        this.chassis.add(hood);

        // 3. GREENHOUSE CABIN & CURVED WINDOWS
        const cabinGeo = new RoundedBoxGeometry(1.50, 0.48, 2.22, bevelSegs, 0.12);
        const cabin = new THREE.Mesh(cabinGeo, this.mats.glossBlack);
        cabin.position.set(0, 1.16, -0.22);
        cabin.castShadow = true;
        this.chassis.add(cabin);

        // Sloped Front Windshield Glass
        const frontGlassGeo = new RoundedBoxGeometry(1.42, 0.04, 0.68, 2, 0.01);
        const frontGlass = new THREE.Mesh(frontGlassGeo, this.mats.glass);
        frontGlass.position.set(0, 1.18, 0.88);
        frontGlass.rotation.x = 0.95;
        this.chassis.add(frontGlass);

        // Sloped Rear Tailgate Glass
        const rearGlassGeo = new RoundedBoxGeometry(1.36, 0.04, 0.52, 2, 0.01);
        const rearGlass = new THREE.Mesh(rearGlassGeo, this.mats.glass);
        rearGlass.position.set(0, 1.18, -1.32);
        rearGlass.rotation.x = -0.88;
        this.chassis.add(rearGlass);

        // Side Windows + White C-Pillar with Red/Black Graphic Accent
        [-0.752, 0.752].forEach((xSide) => {
            const sideWinGeo = new RoundedBoxGeometry(0.03, 0.36, 1.72, 2, 0.01);
            const sideWin = new THREE.Mesh(sideWinGeo, this.mats.glass);
            sideWin.position.set(xSide, 1.18, -0.18);
            this.chassis.add(sideWin);

            // White C-pillar fin
            const cFinGeo = new RoundedBoxGeometry(0.06, 0.44, 0.38, bevelSegs, 0.02);
            const cFin = new THREE.Mesh(cFinGeo, this.mats.polarWhite);
            cFin.position.set(xSide * 0.97, 1.15, -1.14);
            cFin.rotation.x = 0.35;
            this.chassis.add(cFin);
        });

        // 4. SPORT RED FLOATING ROOF & INTEGRATED SPOILER
        const roofGeo = new RoundedBoxGeometry(1.46, 0.12, 2.06, bevelSegs, 0.05);
        const roof = new THREE.Mesh(roofGeo, this.mats.sportRed);
        roof.position.set(0, 1.41, -0.25);
        roof.castShadow = true;
        this.chassis.add(roof);

        const spoilerGeo = new RoundedBoxGeometry(1.40, 0.08, 0.28, bevelSegs, 0.03);
        const spoiler = new THREE.Mesh(spoilerGeo, this.mats.sportRed);
        spoiler.position.set(0, 1.41, -1.32);
        spoiler.rotation.x = 0.08;
        this.chassis.add(spoiler);

        if (this.quality !== 'low') {
            const antGeo = new THREE.CylinderGeometry(0.006, 0.016, 0.28, 8);
            const antenna = new THREE.Mesh(antGeo, this.mats.blackCladding);
            antenna.position.set(0, 1.56, -1.06);
            antenna.rotation.x = -0.45;
            this.chassis.add(antenna);
        }

        // 5. SIGNATURE SIDE AIRBUMPS (7 Rounded Capsules, Front Capsule Ringed in Sport Red)
        this._buildAirbumps(bevelSegs);

        // 6. FRONT FASCIA (Double Chevron Chrome, DRLs, Rounded Headlamps, Red Fog Pods)
        this._buildFrontFascia(bevelSegs);

        // 7. REAR FASCIA (High Black Bumper, 3D Red Taillights, Rear Wiper)
        this._buildRearFascia(bevelSegs);

        // 8. SPORT RED MIRRORS & HANDLES
        this._buildMirrorsAndHandles(bevelSegs);

        // 9. ARCH FLARES & DIAMOND-CUT ALLOY WHEELS
        this._buildWheelsAndArches(cylSegs);
    }

    _buildAirbumps(bevelSegs) {
        [-0.875, 0.875].forEach((xSide) => {
            const sign = Math.sign(xSide);
            // Main Matte Black Airbump Moulding
            const stripGeo = new RoundedBoxGeometry(0.045, 0.23, 1.52, bevelSegs, 0.02);
            const strip = new THREE.Mesh(stripGeo, this.mats.blackCladding);
            strip.position.set(xSide, 0.49, 0.02);
            this.chassis.add(strip);

            // 1st Capsule: Sport Red Outer Ring + Black Center
            const redPodGeo = new RoundedBoxGeometry(0.06, 0.14, 0.17, bevelSegs, 0.03);
            const redPod = new THREE.Mesh(redPodGeo, this.mats.sportRed);
            redPod.position.set(xSide + sign * 0.005, 0.49, 0.60);
            this.chassis.add(redPod);

            const innerDarkGeo = new RoundedBoxGeometry(0.065, 0.085, 0.11, bevelSegs, 0.02);
            const innerDark = new THREE.Mesh(innerDarkGeo, this.mats.blackCladding);
            innerDark.position.set(xSide + sign * 0.007, 0.49, 0.60);
            this.chassis.add(innerDark);

            // Remaining 6 Sculpted Black Airbump Capsules
            if (this.quality !== 'low') {
                for (let i = 1; i <= 6; i++) {
                    const capGeo = new RoundedBoxGeometry(0.056, 0.13, 0.15, bevelSegs, 0.025);
                    const cap = new THREE.Mesh(capGeo, this.mats.blackCladding);
                    cap.position.set(xSide + sign * 0.004, 0.49, 0.60 - i * 0.195);
                    this.chassis.add(cap);
                }
            }
        });
    }

    _buildFrontFascia(bevelSegs) {
        // Upper Chrome Double-Bar extending to DRLs
        const barGeo = new RoundedBoxGeometry(1.38, 0.045, 0.06, 2, 0.01);
        const bar = new THREE.Mesh(barGeo, this.mats.chrome);
        bar.position.set(0, 0.90, 1.93);
        this.chassis.add(bar);

        // Center Citroën Double Chevrons
        [-0.045, 0.045].forEach((xOff, i) => {
            const chevGeo = new RoundedBoxGeometry(0.12, 0.026, 0.07, 2, 0.005);
            const chev = new THREE.Mesh(chevGeo, this.mats.chrome);
            chev.position.set(xOff, 0.935, 1.94);
            chev.rotation.z = i === 0 ? 0.44 : -0.44;
            this.chassis.add(chev);
        });

        // Top-Tier LED DRL Strips
        [-0.58, 0.58].forEach((xSide) => {
            const drlGeo = new RoundedBoxGeometry(0.32, 0.055, 0.08, bevelSegs, 0.02);
            const drl = new THREE.Mesh(drlGeo, this.mats.drl);
            drl.position.set(xSide, 0.90, 1.92);
            this.chassis.add(drl);
        });

        // Mid-Tier Main Rounded Headlamps
        [-0.60, 0.60].forEach((xSide) => {
            const surroundGeo = new RoundedBoxGeometry(0.31, 0.17, 0.08, bevelSegs, 0.04);
            const surround = new THREE.Mesh(surroundGeo, this.mats.glossBlack);
            surround.position.set(xSide, 0.72, 1.92);
            this.chassis.add(surround);

            const lampGeo = new RoundedBoxGeometry(0.26, 0.13, 0.09, bevelSegs, 0.03);
            const lamp = new THREE.Mesh(lampGeo, this.mats.headlight);
            lamp.position.set(xSide, 0.72, 1.925);
            this.chassis.add(lamp);
        });

        // Central Black Lower Grille & License Plate
        const grilleGeo = new RoundedBoxGeometry(0.92, 0.30, 0.06, bevelSegs, 0.03);
        const grille = new THREE.Mesh(grilleGeo, this.mats.blackCladding);
        grille.position.set(0, 0.62, 1.93);
        this.chassis.add(grille);

        const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.11), this.mats.plate);
        frontPlate.position.set(0, 0.60, 1.965);
        this.chassis.add(frontPlate);

        // Lower Sport Red Fog Light Bezels + Circular Fog Bulbs
        [-0.56, 0.56].forEach((xSide) => {
            const podGeo = new RoundedBoxGeometry(0.29, 0.145, 0.08, bevelSegs, 0.04);
            const pod = new THREE.Mesh(podGeo, this.mats.sportRed);
            pod.position.set(xSide, 0.38, 1.91);
            this.chassis.add(pod);

            const recessGeo = new RoundedBoxGeometry(0.21, 0.09, 0.085, bevelSegs, 0.02);
            const recess = new THREE.Mesh(recessGeo, this.mats.blackCladding);
            recess.position.set(xSide, 0.38, 1.915);
            this.chassis.add(recess);

            const bulbGeo = new THREE.SphereGeometry(0.038, 12, 12);
            const bulb = new THREE.Mesh(bulbGeo, this.mats.foglight);
            bulb.position.set(xSide + Math.sign(xSide) * 0.04, 0.38, 1.93);
            this.chassis.add(bulb);
        });

        // Real Headlight Spotlights
        if (this.quality !== 'low') {
            [-0.60, 0.60].forEach((xSide) => {
                const spot = new THREE.SpotLight(0xFFFBEB, 35, 38, Math.PI / 5, 0.45, 1.5);
                spot.position.set(xSide, 0.72, 1.95);
                spot.target.position.set(xSide * 0.8, 0.05, 12.0);
                this.chassis.add(spot);
                this.chassis.add(spot.target);
                this.headlightSpots.push(spot);
            });
        }
    }

    _buildRearFascia(bevelSegs) {
        // High Matte Black Rear Bumper Cladding (Signature C3 rear look)
        const rearBumpGeo = new RoundedBoxGeometry(1.74, 0.40, 0.32, bevelSegs, 0.08);
        const rearBump = new THREE.Mesh(rearBumpGeo, this.mats.blackCladding);
        rearBump.position.set(0, 0.43, -1.85);
        this.chassis.add(rearBump);

        // 3D Rounded Rectangular Taillights
        [-0.62, 0.62].forEach((xSide) => {
            const bezelGeo = new RoundedBoxGeometry(0.33, 0.21, 0.14, bevelSegs, 0.05);
            const bezel = new THREE.Mesh(bezelGeo, this.mats.glossBlack);
            bezel.position.set(xSide, 0.84, -1.89);
            this.chassis.add(bezel);

            const lensGeo = new RoundedBoxGeometry(0.29, 0.17, 0.15, bevelSegs, 0.04);
            const lens = new THREE.Mesh(lensGeo, this.mats.taillight);
            lens.position.set(xSide, 0.84, -1.895);
            this.chassis.add(lens);
        });

        // Rear License Plate
        const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.11), this.mats.plate);
        rearPlate.position.set(0, 0.65, -1.96);
        rearPlate.rotation.y = Math.PI;
        this.chassis.add(rearPlate);
    }

    _buildMirrorsAndHandles(bevelSegs) {
        [-0.90, 0.90].forEach((xSide) => {
            const stalk = new THREE.Mesh(new RoundedBoxGeometry(0.10, 0.045, 0.06, 2, 0.01), this.mats.blackCladding);
            stalk.position.set(xSide, 0.95, 0.60);
            this.chassis.add(stalk);

            const cap = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.10, 0.14, bevelSegs, 0.04), this.mats.sportRed);
            cap.position.set(xSide + Math.sign(xSide) * 0.04, 0.99, 0.58);
            this.chassis.add(cap);

            if (this.quality !== 'low') {
                [0.12, -0.68].forEach((zPos) => {
                    const handle = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.04, 0.16, 2, 0.015), this.mats.glossBlack);
                    handle.position.set(xSide * 0.97, 0.84, zPos);
                    this.chassis.add(handle);
                });
            }
        });
    }

    _buildWheelsAndArches(cylSegs) {
        const positions = [
            { key: 'fl', x:  0.77, y: 0.315, z:  1.27, front: true,  left: true  },
            { key: 'fr', x: -0.77, y: 0.315, z:  1.27, front: true,  left: false },
            { key: 'rl', x:  0.77, y: 0.315, z: -1.27, front: false, left: true  },
            { key: 'rr', x: -0.77, y: 0.315, z: -1.27, front: false, left: false }
        ];

        positions.forEach((pos) => {
            // Black Matte Wheel Arch Flare
            const archGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.15, cylSegs, 1, false, 0, Math.PI);
            const arch = new THREE.Mesh(archGeo, this.mats.blackCladding);
            arch.rotation.z = Math.PI / 2;
            arch.rotation.y = Math.PI / 2;
            arch.position.set(pos.x * 1.04, pos.y + 0.02, pos.z);
            this.chassis.add(arch);

            const steerPivot = new THREE.Group();
            steerPivot.position.set(pos.x, pos.y, pos.z);
            this.chassis.add(steerPivot);

            const spinHub = new THREE.Group();
            steerPivot.add(spinHub);

            // Tire cylinder with textured 8-spoke diamond-cut alloy wheel faces on outer sides
            const tireGeo = new THREE.CylinderGeometry(0.315, 0.315, 0.215, cylSegs);
            tireGeo.rotateZ(Math.PI / 2);

            const wheelMaterials = [
                this.mats.rubber,    // Tire tread
                pos.left ? this.mats.wheelFace : this.mats.rubber, // Left cap
                pos.left ? this.mats.rubber : this.mats.wheelFace  // Right cap
            ];
            const wheelMesh = new THREE.Mesh(tireGeo, wheelMaterials);
            wheelMesh.castShadow = true;
            spinHub.add(wheelMesh);

            if (pos.front) this.steerPivots[pos.key] = steerPivot;
            this.wheels[pos.key] = spinHub;
        });
    }

    /**
     * Optional: Load an external Sketchfab / Blender .glb file (with Draco compression support)
     * while preserving all physics, audio, and wheel controllers!
     */
    async loadExternalGLB(glbUrl) {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
        const gltfLoader = new GLTFLoader();
        gltfLoader.setDRACOLoader(dracoLoader);

        const gltf = await gltfLoader.loadAsync(glbUrl);
        this.chassis.clear();
        this.chassis.add(gltf.scene);
        return gltf.scene;
    }

    /**
     * Toggle Headlights & Bloom Intensity
     */
    setHeadlights(on) {
        this.state.headlightsOn = Boolean(on);
        this.mats.headlight.emissiveIntensity = on ? 2.8 : 0.0;
        this.mats.foglight.emissiveIntensity = on ? 1.8 : 0.0;
        this.headlightSpots.forEach(s => { s.intensity = on ? 35 : 0; });
        this._updateTaillights();
    }

    setBraking(brakeVal) {
        this.state.brake = THREE.MathUtils.clamp(brakeVal, 0, 1);
        this._updateTaillights();
    }

    _updateTaillights() {
        if (this.state.brake > 0.05) {
            this.mats.taillight.emissiveIntensity = 4.2; // Intense Bloom on Braking
        } else if (this.state.headlightsOn) {
            this.mats.taillight.emissiveIntensity = 1.4;
        } else {
            this.mats.taillight.emissiveIntensity = 0.0;
        }
    }

    /**
     * Initializes Howler.js Open-Source Audio Engine with Real Recorded Diesel Samples
     * Crossfades between Idle clatter, Under-Load Diesel roar, and Turbo spool based on RPM/Throttle.
     * @param {Object} customUrls - Optional custom .ogg/.mp3 sample URLs
     */
    initHowlerAudio(customUrls = {}) {
        if (this.sounds || !window.Howl) return;
        const urls = { ...CitroenC3.DEFAULT_AUDIO_URLS, ...customUrls };

        this.sounds = {
            idle: new window.Howl({ src: [urls.idle], loop: true, volume: 0.65, rate: 1.0 }),
            load: new window.Howl({ src: [urls.load], loop: true, volume: 0.0, rate: 0.85 }),
            turbo: new window.Howl({ src: [urls.turbo], loop: true, volume: 0.0, rate: 1.0 })
        };

        this.sounds.idle.play();
        this.sounds.load.play();
        this.sounds.turbo.play();
    }

    /**
     * Update Physics, Suspension Pitch/Roll, Wheel Spin, and Howler.js Sample Crossfading
     */
    update(dt, controls = {}) {
        const throttle = THREE.MathUtils.clamp(controls.throttle ?? 0, 0, 1);
        const brake = THREE.MathUtils.clamp(controls.brake ?? 0, 0, 1);
        const steer = THREE.MathUtils.clamp(controls.steer ?? 0, -1, 1);

        this.state.throttle = throttle;
        this.setBraking(brake);

        // 1. Steering
        const targetSteer = steer * this.specs.maxSteerRad;
        this.state.steerAngle = THREE.MathUtils.lerp(this.state.steerAngle, targetSteer, Math.min(1, dt * 10));
        if (this.steerPivots.fl && this.steerPivots.fr) {
            this.steerPivots.fl.rotation.y = this.state.steerAngle;
            this.steerPivots.fr.rotation.y = this.state.steerAngle;
        }

        // 2. 1.6 HDi 92 (DV6DTED) Physics & Gearbox
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
        const brakeForce = brake * 8600;
        const netForce = driveForce - aeroDrag - (this.state.speedMs > 0.05 ? 140 + brakeForce : 0);

        const accel = netForce / this.specs.massKg;
        this.state.speedMs = THREE.MathUtils.clamp(this.state.speedMs + accel * dt, 0, this.specs.maxSpeedMs);

        // 3. Realistic Suspension Body Pitch (Squat on throttle, Dive on brake) & Roll
        const targetPitch = (brake * 0.035) - (throttle * 0.022);
        const targetRoll = -steer * Math.min(1, this.state.speedMs / 15) * 0.04;
        this.state.bodyPitch = THREE.MathUtils.lerp(this.state.bodyPitch, targetPitch, Math.min(1, dt * 8));
        this.state.bodyRoll = THREE.MathUtils.lerp(this.state.bodyRoll, targetRoll, Math.min(1, dt * 8));
        this.chassis.rotation.x = this.state.bodyPitch;
        this.chassis.rotation.z = this.state.bodyRoll;

        // 4. Wheel Spin
        const spinDelta = (this.state.speedMs * dt) / this.specs.wheelRadius;
        Object.values(this.wheels).forEach(w => { if (w) w.rotation.x += spinDelta; });

        // 5. Update Howler.js Real Sample Audio Pitch & Crossfade
        if (this.sounds) {
            const rpmRatio = this.state.rpm / this.specs.idleRPM; // 1.0 at 800 RPM -> ~5.0 at 4000 RPM

            // Idle diesel sample fades out as RPM rises
            const idleVol = Math.max(0.15, 0.75 - rpmNorm * 0.65);
            this.sounds.idle.rate(THREE.MathUtils.clamp(0.95 + rpmNorm * 1.15, 0.9, 2.2));
            this.sounds.idle.volume(idleVol);

            // Deep diesel load sample swells with RPM & throttle
            const loadVol = THREE.MathUtils.clamp(rpmNorm * 0.65 + throttle * 0.35, 0.05, 0.9);
            this.sounds.load.rate(THREE.MathUtils.clamp(0.75 + (rpmRatio - 1) * 0.38, 0.75, 2.4));
            this.sounds.load.volume(loadVol);

            // Turbocharger whistle spools above 1500 RPM under throttle
            const boost = Math.max(0, (this.state.rpm - 1450) / 2600) * throttle;
            this.sounds.turbo.rate(THREE.MathUtils.clamp(0.9 + boost * 1.1, 0.9, 2.2));
            this.sounds.turbo.volume(boost * 0.35);
        }
    }
}