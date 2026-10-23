import * as THREE from 'three';

/**
 * 2019 Citroën C3 (3rd Gen / SX) - 1.6 HDi 16V 92 (DV6DTED M Euro 5)
 * Built using Blueprint Silhouette Extrusion + Baked Orthographic Fascia/Airbump Textures
 * Optimized for 60 FPS across High, Medium, and Low-Poly LODs.
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
        gearRatios: [3.45, 1.87, 1.15, 0.84, 0.66], // BVM5
        finalDrive: 3.58,
        maxSteerRad: 0.58
    };

    static DEFAULT_AUDIO_URLS = {
        idle: 'https://upload.wikimedia.org/wikipedia/commons/3/30/Diesel_engine_idle.ogg',
        load: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Tractor_engine_loop.ogg',
        turbo: 'https://actions.google.com/sounds/v1/transportation/car_accelerate.ogg'
    };

    // Shared textures across instances so switching LODs is instant and uses zero extra VRAM
    static SHARED_TEXTURES = null;

    constructor(quality = 'high') {
        this.quality = quality.toLowerCase();
        this.specs = { ...CitroenC3.SPECS };
        this.root = new THREE.Group();
        this.root.name = `CitroenC3_${this.quality}`;

        this.wheels = { fl: null, fr: null, rl: null, rr: null };
        this.steerPivots = { fl: null, fr: null };
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

        if (!CitroenC3.SHARED_TEXTURES) {
            CitroenC3.SHARED_TEXTURES = CitroenC3._generateBlueprintTextures();
        }
        this.textures = CitroenC3.SHARED_TEXTURES;

        this._initMaterials();
        this._buildVehicle();
    }

    /**
     * Generates photorealistic orthographic canvas textures matching the 2019 C3 reference photos:
     * 1. Clover/Cross 8-Spoke Diamond-Cut Rim
     * 2. Side Airbump Panel with 7 Rounded Capsules (1st capsule in Sport Red)
     * 3. 3D Concentric-Ring LED Taillight Lens
     * 4. Moroccan License Plate (35219 | ب | 15)
     * 5. Citroën Double-Chevron Chrome Badge
     */
    static _generateBlueprintTextures() {
        // 1. WHEEL TEXTURE (2019 C3 Cross/Clover Alloy Rim)
        const wCan = document.createElement('canvas');
        wCan.width = 512; wCan.height = 512;
        const wCtx = wCan.getContext('2d');
        wCtx.fillStyle = '#0d0f12';
        wCtx.fillRect(0, 0, 512, 512);
        wCtx.translate(256, 256);

        // Tire sidewall ring
        wCtx.beginPath();
        wCtx.arc(0, 0, 248, 0, Math.PI * 2);
        wCtx.fillStyle = '#181a1f';
        wCtx.fill();

        // Inner dark gloss alloy barrel
        wCtx.beginPath();
        wCtx.arc(0, 0, 178, 0, Math.PI * 2);
        wCtx.fillStyle = '#0a0c0e';
        wCtx.fill();
        wCtx.lineWidth = 8;
        wCtx.strokeStyle = '#cbd5e1';
        wCtx.stroke();

        // 8 Machined Diamond-Cut Spokes (4 pairs of split directional blades)
        for (let i = 0; i < 8; i++) {
            wCtx.save();
            wCtx.rotate((i * Math.PI * 2) / 8);
            const grad = wCtx.createLinearGradient(-18, 36, 18, 174);
            grad.addColorStop(0, '#e2e8f0');
            grad.addColorStop(0.5, '#ffffff');
            grad.addColorStop(1, '#94a3b8');
            wCtx.fillStyle = grad;

            wCtx.beginPath();
            wCtx.moveTo(-11, 38);
            wCtx.lineTo(-24, 172);
            wCtx.lineTo(14, 172);
            wCtx.lineTo(9, 38);
            wCtx.closePath();
            wCtx.fill();

            // Dark inset groove on each spoke
            wCtx.fillStyle = '#111318';
            wCtx.beginPath();
            wCtx.moveTo(-4, 65);
            wCtx.lineTo(-10, 160);
            wCtx.lineTo(2, 160);
            wCtx.lineTo(2, 65);
            wCtx.closePath();
            wCtx.fill();
            wCtx.restore();
        }

        // Center Cap & Double Chevron
        wCtx.beginPath();
        wCtx.arc(0, 0, 38, 0, Math.PI * 2);
        wCtx.fillStyle = '#0d0f14';
        wCtx.fill();
        wCtx.lineWidth = 3;
        wCtx.strokeStyle = '#e2e8f0';
        wCtx.stroke();

        wCtx.strokeStyle = '#ffffff';
        wCtx.lineWidth = 4;
        [-5, 5].forEach(y => {
            wCtx.beginPath();
            wCtx.moveTo(-11, y + 5);
            wCtx.lineTo(0, y - 5);
            wCtx.lineTo(11, y + 5);
            wCtx.stroke();
        });
        const wheelTex = new THREE.CanvasTexture(wCan);
        wheelTex.colorSpace = THREE.SRGBColorSpace;

        // 2. AIRBUMP TEXTURE (7 capsules, front capsule ringed in Sport Red)
        const aCan = document.createElement('canvas');
        aCan.width = 1024; aCan.height = 256;
        const aCtx = aCan.getContext('2d');
        aCtx.clearRect(0, 0, 1024, 256);

        // Rounded elongated black TPU body panel
        aCtx.fillStyle = '#1c1e22';
        aCtx.beginPath();
        aCtx.roundRect(12, 24, 1000, 208, [95, 95, 70, 70]);
        aCtx.fill();

        // 7 Airbump capsules along the panel
        for (let i = 0; i < 7; i++) {
            const x = 68 + i * 128;
            const y = 62;
            const w = 96;
            const h = 132;

            // Capsule outer rim (First one is Sport Red, others sculpted dark grey/black)
            aCtx.fillStyle = i === 0 ? '#c91a22' : '#282b30';
            aCtx.beginPath();
            aCtx.roundRect(x, y, w, h, 28);
            aCtx.fill();

            // Inner recessed pillow
            aCtx.fillStyle = '#16181c';
            aCtx.beginPath();
            aCtx.roundRect(x + 16, y + 20, w - 32, h - 40, 16);
            aCtx.fill();

            // Subtle top highlight for 3D pillow depth
            aCtx.strokeStyle = i === 0 ? '#ff5a60' : '#373b42';
            aCtx.lineWidth = 3;
            aCtx.strokeRect(x + 4, y + 4, w - 8, h - 8);
        }
        const airbumpTex = new THREE.CanvasTexture(aCan);
        airbumpTex.colorSpace = THREE.SRGBColorSpace;

        // 3. 3D CONCENTRIC-RING TAILLIGHT TEXTURE (Matches image_d6a45b.jpg)
        const tCan = document.createElement('canvas');
        tCan.width = 256; tCan.height = 192;
        const tCtx = tCan.getContext('2d');
        tCtx.fillStyle = '#1a0305';
        tCtx.fillRect(0, 0, 256, 192);

        // Outer ruby housing
        tCtx.fillStyle = '#6e060d';
        tCtx.beginPath();
        tCtx.roundRect(8, 8, 240, 176, 48);
        tCtx.fill();

        // Signature C3 dual 3D concentric glowing LED rings
        tCtx.strokeStyle = '#ff1e27';
        tCtx.lineWidth = 14;
        tCtx.beginPath();
        tCtx.roundRect(26, 26, 204, 140, 36);
        tCtx.stroke();

        tCtx.strokeStyle = '#ff555b';
        tCtx.lineWidth = 8;
        tCtx.beginPath();
        tCtx.roundRect(52, 48, 152, 96, 24);
        tCtx.stroke();

        // Central reverse/indicator clear bar
        tCtx.fillStyle = '#f8fafc';
        tCtx.beginPath();
        tCtx.roundRect(78, 78, 100, 36, 12);
        tCtx.fill();
        const taillightTex = new THREE.CanvasTexture(tCan);
        taillightTex.colorSpace = THREE.SRGBColorSpace;

        // 4. LICENSE PLATE TEXTURE (From image_d6a740.png: 35219 | ب | 15)
        const pCan = document.createElement('canvas');
        pCan.width = 512; pCan.height = 112;
        const pCtx = pCan.getContext('2d');
        pCtx.fillStyle = '#ffffff';
        pCtx.fillRect(0, 0, 512, 112);
        pCtx.strokeStyle = '#0f172a';
        pCtx.lineWidth = 6;
        pCtx.strokeRect(4, 4, 504, 104);
        pCtx.fillStyle = '#0f172a';
        pCtx.font = 'bold 54px sans-serif';
        pCtx.textAlign = 'center';
        pCtx.textBaseline = 'middle';
        pCtx.fillText('35219  |  ب  |  15', 256, 58);
        const plateTex = new THREE.CanvasTexture(pCan);
        plateTex.colorSpace = THREE.SRGBColorSpace;

        return { wheelTex, airbumpTex, taillightTex, plateTex };
    }

    _initMaterials() {
        const isHigh = this.quality === 'high';
        const isLow = this.quality === 'low';

        // Fast, GPU-friendly materials (Zero transmission passes!)
        const makePaint = (hex, rough = 0.16, metal = 0.08) => {
            if (isLow) return new THREE.MeshLambertMaterial({ color: hex });
            if (isHigh) {
                return new THREE.MeshPhysicalMaterial({
                    color: hex,
                    roughness: rough,
                    metalness: metal,
                    clearcoat: 0.9,
                    clearcoatRoughness: 0.1
                });
            }
            return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
        };

        this.mats = {
            polarWhite: makePaint(0xF6F8FA, 0.15, 0.05),
            sportRed: makePaint(0xC91A22, 0.16, 0.12),
            blackCladding: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x1C1E22 })
                : new THREE.MeshStandardMaterial({ color: 0x1C1E22, roughness: 0.82, metalness: 0.04 }),
            glossBlack: makePaint(0x0E1014, 0.10, 0.15),
            chrome: isLow
                ? new THREE.MeshLambertMaterial({ color: 0xE2E8F0 })
                : new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.12, metalness: 0.92 }),
            // Reflective dark tinted automotive glass (no slow refraction pass)
            glass: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x121A24 })
                : new THREE.MeshStandardMaterial({
                    color: 0x0F1722,
                    roughness: 0.06,
                    metalness: 0.35
                }),
            rubber: isLow
                ? new THREE.MeshLambertMaterial({ color: 0x15171A })
                : new THREE.MeshStandardMaterial({ color: 0x15171A, roughness: 0.88 }),
            wheelFace: new THREE.MeshStandardMaterial({
                map: this.textures.wheelTex,
                roughness: 0.25,
                metalness: 0.75
            }),
            airbump: new THREE.MeshStandardMaterial({
                map: this.textures.airbumpTex,
                transparent: true,
                roughness: 0.75
            }),
            taillight: new THREE.MeshStandardMaterial({
                map: this.textures.taillightTex,
                emissive: 0xFF111A,
                emissiveMap: this.textures.taillightTex,
                emissiveIntensity: 0.9,
                roughness: 0.15
            }),
            plate: new THREE.MeshStandardMaterial({ map: this.textures.plateTex, roughness: 0.3 }),
            drl: new THREE.MeshBasicMaterial({ color: 0xFFFFFF }),
            headlight: new THREE.MeshBasicMaterial({ color: 0xFFFBEB }),
            foglight: new THREE.MeshBasicMaterial({ color: 0xFDE68A })
        };
    }

    /**
     * Helper to extrude a 2D side-profile silhouette along the X-axis (car width)
     * with smooth rounded bevels to capture the bubbly C3 curves.
     */
    _extrudeProfile(points2D, width, bevelSize = 0.08, bevelSegments = 4, curveSegments = 16) {
        const shape = new THREE.Shape();
        shape.moveTo(points2D[0][0], points2D[0][1]);
        for (let i = 1; i < points2D.length; i++) {
            const pt = points2D[i];
            if (pt.length === 4) {
                shape.quadraticCurveTo(pt[0], pt[1], pt[2], pt[3]);
            } else {
                shape.lineTo(pt[0], pt[1]);
            }
        }
        shape.closePath();

        const extrudeDepth = Math.max(0.02, width - bevelSize * 2);
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: extrudeDepth,
            bevelEnabled: bevelSegments > 0,
            bevelThickness: bevelSize,
            bevelSize: bevelSize,
            bevelSegments: bevelSegments,
            curveSegments: curveSegments
        });

        // Rotate so 2D (X=Z_car, Y=Y_car) extrudes across car width (X_car) and center it
        geo.rotateY(Math.PI / 2);
        geo.translate(-extrudeDepth / 2, 0, 0);
        geo.computeVertexNormals();
        return geo;
    }

    _buildVehicle() {
        const bevSegs = this.quality === 'high' ? 6 : (this.quality === 'medium' ? 3 : 1);
        const curSegs = this.quality === 'high' ? 20 : (this.quality === 'medium' ? 12 : 6);
        const cylSegs = this.quality === 'high' ? 28 : (this.quality === 'medium' ? 16 : 10);

        this.chassis = new THREE.Group();
        this.root.add(this.chassis);

        // =========================================================================
        // 1. POLAR WHITE MAIN BODY SHELL (Traced from side blueprint image_d6aae6.jpg)
        // Z ranges from -1.96m (rear bumper) to +1.98m (front nose)
        // =========================================================================
        const whiteBodyProfile = [
            [-1.92, 0.36],
            [-1.96, 0.65, -1.86, 0.90], // Rounded lower rear hatch
            [-0.95, 0.92],              // Beltline under rear window
            [0.72, 0.93],               // Beltline under front window
            [1.35, 0.96, 1.80, 0.89],   // High, flat-ish sculpted C3 hood
            [1.98, 0.84, 1.99, 0.56],   // Rounded vertical C3 front nose
            [1.96, 0.34, 1.75, 0.32],   // Lower front chin
            [-1.75, 0.32]
        ];
        const mainBodyGeo = this._extrudeProfile(whiteBodyProfile, 1.73, 0.11, bevSegs, curSegs);
        const mainBody = new THREE.Mesh(mainBodyGeo, this.mats.polarWhite);
        mainBody.castShadow = true;
        mainBody.receiveShadow = true;
        this.chassis.add(mainBody);

        // =========================================================================
        // 2. MATTE BLACK LOWER SKIRT & HIGH REAR BUMPER CLADDING (image_d6a45b.jpg)
        // =========================================================================
        const blackCladdingProfile = [
            [-1.97, 0.30],
            [-1.99, 0.48, -1.92, 0.62], // High black rear bumper diffuser
            [-1.50, 0.60, -1.42, 0.38], // Drops down ahead of rear wheel
            [1.48, 0.38],               // Side sill rocker panel
            [1.62, 0.45, 1.99, 0.46],   // Front lower black bumper skirt
            [2.00, 0.29, 1.82, 0.27],
            [-1.85, 0.27]
        ];
        const claddingGeo = this._extrudeProfile(blackCladdingProfile, 1.75, 0.06, bevSegs, curSegs);
        const cladding = new THREE.Mesh(claddingGeo, this.mats.blackCladding);
        this.chassis.add(cladding);

        // =========================================================================
        // 3. GREENHOUSE CABIN & WRAP-AROUND BLACK A-PILLARS (image_d6aae6.jpg)
        // =========================================================================
        const cabinProfile = [
            [-1.54, 0.90],
            [-1.38, 1.18, -1.16, 1.38], // Rear tailgate window rake
            [-0.20, 1.42, 0.32, 1.40],  // Roofline arch
            [0.68, 1.16, 0.96, 0.91],   // Steep windshield rake
        ];
        const cabinGeo = this._extrudeProfile(cabinProfile, 1.46, 0.09, bevSegs, curSegs);
        const cabin = new THREE.Mesh(cabinGeo, this.mats.glass);
        this.chassis.add(cabin);

        // B-Pillar & Window Frame trim in Gloss Black
        const bPillarGeo = new THREE.BoxGeometry(1.48, 0.46, 0.10);
        const bPillar = new THREE.Mesh(bPillarGeo, this.mats.glossBlack);
        bPillar.position.set(0, 1.15, -0.18);
        this.chassis.add(bPillar);

        // White C-Pillar Quarter Panel with Sport Red Top Stripe (image_d6a45b.jpg)
        const cPillarProfile = [
            [-1.55, 0.90],
            [-1.37, 1.18, -1.17, 1.37],
            [-0.96, 1.37],
            [-1.12, 0.90]
        ];
        const cPillarGeo = this._extrudeProfile(cPillarProfile, 1.50, 0.04, Math.max(1, bevSegs - 1), curSegs);
        const cPillar = new THREE.Mesh(cPillarGeo, this.mats.polarWhite);
        this.chassis.add(cPillar);

        // Black & Red graphic stripe on C-Pillar transitions
        const cStripeGeo = new THREE.BoxGeometry(1.52, 0.035, 0.28);
        const cStripe = new THREE.Mesh(cStripeGeo, this.mats.glossBlack);
        cStripe.position.set(0, 1.34, -1.12);
        cStripe.rotation.x = -0.05;
        this.chassis.add(cStripe);

        // =========================================================================
        // 4. SPORT RED FLOATING ROOF, CANTRAILS & REAR SPOILER (image_d6aae6.jpg)
        // =========================================================================
        const roofProfile = [
            [-1.38, 1.37],
            [-1.42, 1.43, -1.25, 1.45], // Integrated rear roof spoiler lip
            [-0.35, 1.48, 0.42, 1.43],  // Domed red roof arch
            [0.52, 1.36],
            [-0.35, 1.40, -1.20, 1.36]
        ];
        const roofGeo = this._extrudeProfile(roofProfile, 1.44, 0.05, bevSegs, curSegs);
        const roof = new THREE.Mesh(roofGeo, this.mats.sportRed);
        roof.castShadow = true;
        this.chassis.add(roof);

        // Roof Antenna at rear
        if (this.quality !== 'low') {
            const antBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.07), this.mats.blackCladding);
            antBase.position.set(0, 1.46, -1.02);
            this.chassis.add(antBase);

            const antRod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.012, 0.26, 6), this.mats.blackCladding);
            antRod.position.set(0, 1.57, -1.10);
            antRod.rotation.x = -0.52;
            this.chassis.add(antRod);
        }

        // =========================================================================
        // 5. SIDE AIRBUMP PANELS, HANDLES & SPORT RED MIRRORS
        // =========================================================================
        [-1, 1].forEach((sideSign) => {
            const xOut = sideSign * 0.872;

            // Textured + 3D relief Airbump panel along lower doors
            const airbumpPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.26), this.mats.airbump);
            airbumpPlane.position.set(xOut, 0.50, 0.02);
            airbumpPlane.rotation.y = sideSign > 0 ? Math.PI / 2 : -Math.PI / 2;
            // Flip UV horizontally on the right side so the RED capsule is ALWAYS at the front!
            if (sideSign > 0) airbumpPlane.scale.x = -1;
            this.chassis.add(airbumpPlane);

            // Physical 3D backing pad for Airbump so it protrudes from the door skin
            const bumpPad = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.22, 1.46), this.mats.blackCladding);
            bumpPad.position.set(sideSign * 0.86, 0.50, 0.02);
            this.chassis.add(bumpPad);

            // Two-tone Sport Red & Black Wing Mirrors
            const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.06), this.mats.blackCladding);
            stalk.position.set(sideSign * 0.84, 0.94, 0.56);
            this.chassis.add(stalk);

            const mirrorHousing = new THREE.Mesh(
                new THREE.SphereGeometry(0.085, cylSegs / 2, cylSegs / 2),
                this.mats.sportRed
            );
            mirrorHousing.scale.set(1.1, 0.75, 0.85);
            mirrorHousing.position.set(sideSign * 0.91, 0.97, 0.54);
            this.chassis.add(mirrorHousing);

            // Gloss Black Horizontal Door Handles
            if (this.quality !== 'low') {
                [0.10, -0.68].forEach((zPos) => {
                    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.032, 0.15), this.mats.glossBlack);
                    handle.position.set(sideSign * 0.865, 0.83, zPos);
                    this.chassis.add(handle);
                });
            }
        });

        // =========================================================================
        // 6. FRONT FASCIA (Matches image_d6a740.png & image_d6a706.jpg)
        // =========================================================================
        this._buildAccurateFrontFascia(cylSegs);

        // =========================================================================
        // 7. REAR FASCIA (Matches image_d6a45b.jpg)
        // =========================================================================
        this._buildAccurateRearFascia(cylSegs);

        // =========================================================================
        // 8. MATTE BLACK WHEEL ARCH FLARES & 4 ROTATING DIAMOND-CUT WHEELS
        // =========================================================================
        this._buildAccurateWheels(cylSegs);
    }

    _buildAccurateFrontFascia(cylSegs) {
        // Upper Chrome Double-Bars extending from Center Double-Chevron to LED DRLs
        const upperChrome = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.022, 0.05), this.mats.chrome);
        upperChrome.position.set(0, 0.875, 1.96);
        this.chassis.add(upperChrome);

        const lowerChrome = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.020, 0.05), this.mats.chrome);
        lowerChrome.position.set(0, 0.845, 1.965);
        this.chassis.add(lowerChrome);

        // Center Raised Double-Chevrons (/\)
        [-0.042, 0.042].forEach((xOff, idx) => {
            const angle = idx === 0 ? 0.46 : -0.46;
            const topChev = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.06), this.mats.chrome);
            topChev.position.set(xOff, 0.905, 1.97);
            topChev.rotation.z = angle;
            this.chassis.add(topChev);

            const botChev = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.06), this.mats.chrome);
            botChev.position.set(xOff, 0.870, 1.975);
            botChev.rotation.z = angle;
            this.chassis.add(botChev);
        });

        // Top-Tier Slim Wraparound LED DRLs
        [-0.58, 0.58].forEach((xSide) => {
            const sign = Math.sign(xSide);
            const drlHousing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.08), this.mats.glossBlack);
            drlHousing.position.set(xSide, 0.86, 1.93);
            drlHousing.rotation.y = sign * 0.22;
            this.chassis.add(drlHousing);

            const drlStrip = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.032, 0.085), this.mats.drl);
            drlStrip.position.set(xSide, 0.86, 1.935);
            drlStrip.rotation.y = sign * 0.22;
            this.chassis.add(drlStrip);

            // Mid-Tier Main Rounded-Rectangular Headlamps (inset in white bumper)
            const headBezel = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.145, 0.09), this.mats.glossBlack);
            headBezel.position.set(xSide * 1.02, 0.70, 1.91);
            headBezel.rotation.y = sign * 0.25;
            this.chassis.add(headBezel);

            const headLens = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.115, 0.095), this.mats.headlight);
            headLens.position.set(xSide * 1.02, 0.70, 1.915);
            headLens.rotation.y = sign * 0.25;
            this.chassis.add(headLens);

            // Bottom-Tier Sport Red Rounded Fog Light Pods + Round Fog Lamps
            const redFogPod = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.13, 0.09), this.mats.sportRed);
            redFogPod.position.set(xSide * 0.98, 0.38, 1.92);
            redFogPod.rotation.y = sign * 0.20;
            this.chassis.add(redFogPod);

            const blackInsert = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.085, 0.095), this.mats.blackCladding);
            blackInsert.position.set(xSide * 0.98, 0.38, 1.925);
            blackInsert.rotation.y = sign * 0.20;
            this.chassis.add(blackInsert);

            const fogBulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), this.mats.foglight);
            fogBulb.position.set(xSide * 1.02, 0.38, 1.94);
            this.chassis.add(fogBulb);
        });

        // Large Central Trapezoidal Black Grille + Moroccan License Plate
        const centerGrille = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.26, 0.06), this.mats.blackCladding);
        centerGrille.position.set(0, 0.58, 1.965);
        this.chassis.add(centerGrille);

        const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.11), this.mats.plate);
        frontPlate.position.set(0, 0.56, 2.00);
        this.chassis.add(frontPlate);

        // Single Lightweight Spotlight Pair for High Quality only
        if (this.quality === 'high') {
            [-0.58, 0.58].forEach((xSide) => {
                const spot = new THREE.SpotLight(0xFFFBEB, 20, 30, Math.PI / 5, 0.5, 1.5);
                spot.position.set(xSide, 0.70, 1.96);
                spot.target.position.set(xSide * 0.8, 0.0, 10.0);
                this.chassis.add(spot);
                this.chassis.add(spot.target);
                this.headlightSpots.push(spot);
            });
        }
    }

    _buildAccurateRearFascia(cylSegs) {
        // Wraparound 3D Concentric-Ring Taillights (image_d6a45b.jpg)
        [-0.62, 0.62].forEach((xSide) => {
            const sign = Math.sign(xSide);
            const tailBlock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.21, 0.16), this.mats.glossBlack);
            tailBlock.position.set(xSide, 0.82, -1.86);
            tailBlock.rotation.y = -sign * 0.18;
            this.chassis.add(tailBlock);

            const tailFace = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.19), this.mats.taillight);
            tailFace.position.set(xSide, 0.82, -1.945);
            tailFace.rotation.y = Math.PI - sign * 0.18;
            this.chassis.add(tailFace);
        });

        // Rear Citroën Double Chevron Badge on White Tailgate
        [-0.032, 0.032].forEach((xOff, idx) => {
            const angle = idx === 0 ? -0.45 : 0.45;
            const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), this.mats.chrome);
            c1.position.set(xOff, 0.86, -1.94);
            c1.rotation.z = angle;
            this.chassis.add(c1);

            const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.02), this.mats.chrome);
            c2.position.set(xOff, 0.835, -1.94);
            c2.rotation.z = angle;
            this.chassis.add(c2);
        });

        // Rear Wiper Blade on Rear Glass
        if (this.quality !== 'low') {
            const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.018, 0.02), this.mats.blackCladding);
            wiper.position.set(-0.14, 0.95, -1.52);
            this.chassis.add(wiper);
        }

        // Rear License Plate Recessed in Lower Tailgate / Bumper
        const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.11), this.mats.plate);
        rearPlate.position.set(0, 0.64, -1.965);
        rearPlate.rotation.y = Math.PI;
        this.chassis.add(rearPlate);
    }

    _buildAccurateWheels(cylSegs) {
        const wheelPositions = [
            { key: 'fl', x:  0.77, y: 0.315, z:  1.27, front: true,  left: true  },
            { key: 'fr', x: -0.77, y: 0.315, z:  1.27, front: true,  left: false },
            { key: 'rl', x:  0.77, y: 0.315, z: -1.27, front: false, left: true  },
            { key: 'rr', x: -0.77, y: 0.315, z: -1.27, front: false, left: false }
        ];

        wheelPositions.forEach((pos) => {
            // Bold Matte Black Wheel Arch Cladding Ring (3D Torus Arch)
            const archGeo = new THREE.CylinderGeometry(0.385, 0.385, 0.14, cylSegs, 1, false, 0, Math.PI);
            const arch = new THREE.Mesh(archGeo, this.mats.blackCladding);
            arch.rotation.z = Math.PI / 2;
            arch.rotation.y = Math.PI / 2;
            arch.position.set(pos.x * 1.05, pos.y + 0.015, pos.z);
            this.chassis.add(arch);

            // Dark inner wheel well liner so you don't see through the car
            const wellGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12, 1, false, 0, Math.PI);
            const well = new THREE.Mesh(wellGeo, this.mats.rubber);
            well.rotation.z = Math.PI / 2;
            well.rotation.y = Math.PI / 2;
            well.position.set(pos.x * 0.92, pos.y + 0.01, pos.z);
            this.chassis.add(well);

            // Steering & Rotation Hierarchy
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

    setHeadlights(on) {
        this.state.headlightsOn = Boolean(on);
        this.mats.headlight.color.setHex(on ? 0xFFFBEB : 0x333842);
        this.mats.foglight.color.setHex(on ? 0xFDE68A : 0x282C34);
        this.headlightSpots.forEach(s => { s.intensity = on ? 20 : 0; });
        this._updateTaillights();
    }

    setBraking(brakeVal) {
        this.state.brake = THREE.MathUtils.clamp(brakeVal, 0, 1);
        this._updateTaillights();
    }

    _updateTaillights() {
        if (this.state.brake > 0.05) {
            this.mats.taillight.emissiveIntensity = 2.5;
        } else if (this.state.headlightsOn) {
            this.mats.taillight.emissiveIntensity = 0.9;
        } else {
            this.mats.taillight.emissiveIntensity = 0.15;
        }
    }

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

        // 2. 1.6 HDi 92 Physics & 5-Speed Manual Ratios
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

        // 3. Suspension Squat & Dive
        const targetPitch = (brake * 0.032) - (throttle * 0.020);
        const targetRoll = -steer * Math.min(1, this.state.speedMs / 15) * 0.035;
        this.state.bodyPitch = THREE.MathUtils.lerp(this.state.bodyPitch, targetPitch, Math.min(1, dt * 8));
        this.state.bodyRoll = THREE.MathUtils.lerp(this.state.bodyRoll, targetRoll, Math.min(1, dt * 8));
        this.chassis.rotation.x = this.state.bodyPitch;
        this.chassis.rotation.z = this.state.bodyRoll;

        // 4. Wheel Rotation
        const spinDelta = (this.state.speedMs * dt) / this.specs.wheelRadius;
        Object.values(this.wheels).forEach(w => { if (w) w.rotation.x += spinDelta; });

        // 5. Howler.js Real Sample Audio Crossfade
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
