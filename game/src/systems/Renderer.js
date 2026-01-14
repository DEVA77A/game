export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.baseWidth = 1024;
        this.baseHeight = 576;
        this.width = this.baseWidth;
        this.height = this.baseHeight;
        this.dpr = 1;
        this.scale = 1;
        
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
        this.glitchTimer = 0;
        
        this.particles = [];

        // Impact feedback (purely visual)
        this.impactFlashTimer = 0;
        this.impactFlashDuration = 0;
        this.impactFlashStrength = 0;
        this.impactFlashColor = 'rgba(255,255,255,0.35)';

        // Projectile Clash Effect System
        this.clashEffects = [];
        this.clashShockwaves = [];
        
        // Map system - 3 One Piece themed maps
        // 0 = Forest (existing), 1 = Onigashima, 2 = Pirate Island (Arabasta desert)
        this.currentMapIndex = 0;
        this.totalMaps = 3;
    }

    resize() {
        const parent = this.canvas.parentElement;
        if (!parent) return;

        const rect = parent.getBoundingClientRect();
        const cssWidth = Math.max(1, rect.width);
        const cssHeight = Math.max(1, rect.height);

        // Device pixel ratio for crisp rendering on high-DPI screens
        this.dpr = window.devicePixelRatio || 1;
        this.scale = cssWidth / this.baseWidth;

        // Backing store size in physical pixels
        this.canvas.width = Math.round(cssWidth * this.dpr);
        this.canvas.height = Math.round(cssHeight * this.dpr);

        // Logical coordinate system stays fixed
        this.width = this.baseWidth;
        this.height = this.baseHeight;

        // Base transform applied each frame before drawing
        this.ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);
    }

    triggerShake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeTimer = duration;
    }

    triggerGlitch(duration) {
        this.glitchTimer = duration;
    }

    triggerImpactFlash(color = 'rgba(255,255,255,0.35)', strength = 0.35, duration = 0.06) {
        this.impactFlashColor = color;
        this.impactFlashStrength = Math.max(this.impactFlashStrength, strength);
        this.impactFlashDuration = Math.max(this.impactFlashDuration, duration);
        this.impactFlashTimer = Math.max(this.impactFlashTimer, duration);
    }

    triggerHitSparks(x, y, color = '#ffffff', direction = 1, count = 14, strength = 1) {
        const dir = direction >= 0 ? 1 : -1;
        const baseAngle = dir === 1 ? 0 : Math.PI;
        for (let i = 0; i < count; i++) {
            const spread = (Math.random() - 0.5) * 1.2;
            const angle = baseAngle + spread;
            const speed = (10 + Math.random() * 18) * (0.7 + strength * 0.6);
            this.particles.push({
                kind: 'spark',
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (Math.random() * 3),
                life: 1.0,
                color,
                length: (10 + Math.random() * 22) * (0.7 + strength * 0.6),
                width: 1 + Math.random() * 1.8,
                rot: angle,
                rotV: (Math.random() - 0.5) * 0.3
            });
        }
    }

    triggerParticles(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                kind: 'dot',
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                color: color,
                size: Math.random() * 3 + 1
            });
        }
    }

    // Trigger skill hit visual effect based on character type
    triggerSkillHitEffect(x, y, charType) {
        if (charType === 'ice') {
            // Ice freeze effect - ice crystals and cold mist
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 8;
                this.particles.push({
                    kind: 'ice_crystal',
                    x: x + (Math.random() - 0.5) * 30,
                    y: y + (Math.random() - 0.5) * 50,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2,
                    life: 1.5,
                    size: 6 + Math.random() * 8,
                    rotation: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 5
                });
            }
            // Frost mist
            for (let i = 0; i < 10; i++) {
                this.particles.push({
                    kind: 'frost_mist',
                    x: x + (Math.random() - 0.5) * 40,
                    y: y + (Math.random() - 0.5) * 60,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -1 - Math.random(),
                    life: 2.0,
                    size: 20 + Math.random() * 30
                });
            }
        } else if (charType === 'fire') {
            // Fire burn effect - flames and embers
            for (let i = 0; i < 25; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 4 + Math.random() * 10;
                this.particles.push({
                    kind: 'fire_ember',
                    x: x + (Math.random() - 0.5) * 30,
                    y: y + (Math.random() - 0.5) * 50,
                    vx: Math.cos(angle) * speed * 0.5,
                    vy: -3 - Math.random() * 8,
                    life: 1.2,
                    size: 4 + Math.random() * 6
                });
            }
            // Flame burst
            for (let i = 0; i < 8; i++) {
                this.particles.push({
                    kind: 'flame_burst',
                    x: x + (Math.random() - 0.5) * 20,
                    y: y + Math.random() * 30,
                    vx: (Math.random() - 0.5) * 3,
                    vy: -5 - Math.random() * 5,
                    life: 0.8,
                    size: 15 + Math.random() * 20
                });
            }
        } else if (charType === 'lightning') {
            // Lightning shock effect - electric bolts and sparks
            for (let i = 0; i < 15; i++) {
                const angle = Math.random() * Math.PI * 2;
                this.particles.push({
                    kind: 'electric_bolt',
                    x: x,
                    y: y,
                    angle: angle,
                    length: 30 + Math.random() * 50,
                    life: 0.4 + Math.random() * 0.3,
                    branches: Math.floor(1 + Math.random() * 2)
                });
            }
            // Electric sparks
            for (let i = 0; i < 20; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 8 + Math.random() * 15;
                this.particles.push({
                    kind: 'electric_spark',
                    x: x + (Math.random() - 0.5) * 30,
                    y: y + (Math.random() - 0.5) * 50,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 0.5,
                    size: 3 + Math.random() * 3
                });
            }
        }
        
        // Screen shake for skill hit
        this.triggerShake(15, 0.3);
    }

    drawShieldEffect(entity) {
        const x = entity.x;
        const y = entity.y - 30; // Center on body
        const t = Date.now() / 1000;
        
        // Calculate shield alpha based on remaining time (fade out effect)
        const shieldAlpha = Math.min(1, entity.perfectBlockTimer / 0.3); // Fade out in last 0.3s
        
        this.ctx.save();
        this.ctx.globalAlpha = 0.6 * shieldAlpha;
        
        // Outer glow ring
        const baseRadius = 50;
        const pulseRadius = baseRadius + Math.sin(t * 10) * 5;
        
        // Rotating shield effect
        const rotation = t * 3;
        
        // Draw multiple rotating arc segments for shield appearance
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 4;
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#00ffff';
        
        // Main shield circle
        this.ctx.beginPath();
        this.ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Inner rotating segments
        this.ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            const startAngle = rotation + (i * Math.PI / 2);
            const endAngle = startAngle + Math.PI / 3;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pulseRadius - 8, startAngle, endAngle);
            this.ctx.stroke();
        }
        
        // Energy particles around shield
        this.ctx.fillStyle = '#00ffff';
        for (let i = 0; i < 8; i++) {
            const angle = rotation * 2 + (i * Math.PI / 4);
            const particleX = x + Math.cos(angle) * pulseRadius;
            const particleY = y + Math.sin(angle) * pulseRadius;
            this.ctx.beginPath();
            this.ctx.arc(particleX, particleY, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Center glow
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, pulseRadius);
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.15)');
        gradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }

    clear() {
        this.particles = [];
        this.shakeTimer = 0;
        this.glitchTimer = 0;
        this.impactFlashTimer = 0;
        this.impactFlashDuration = 0;
        this.impactFlashStrength = 0;
        this.clashEffects = [];
        this.clashShockwaves = [];
    }

    draw(entities, ghosts, projectiles = [], gameState = 'fighting', countdown = 0) {
        // Ensure transform is correct even if other code modified it
        this.ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, 0, 0);

        // Clear
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.save();

        // Screen Shake
        if (this.shakeTimer > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
            this.shakeTimer -= 0.016;
        }

        // Background
        this.drawBackground();

        // Draw Ghosts
        this.ctx.globalAlpha = 0.3;
        ghosts.forEach(ghost => {
            if (ghost.active) this.drawStickman(ghost, true);
        });
        this.ctx.globalAlpha = 1.0;

        // Draw Entities
        entities.forEach(entity => {
            if (!entity.isDead) this.drawStickman(entity, false);
        });

        // Draw "YOU" indicator above player's head
        this.drawYouIndicator(entities);

        // Draw Status Effect Visuals on entities (only when affected by skill)
        // Shows freeze/burn/shock effects ONLY when hit by opponent's skill
        entities.forEach(entity => {
            if (!entity.isDead) {
                this.drawStatusEffects(entity);
            }
        });

        // Draw Perfect Block Shield Effect
        entities.forEach(entity => {
            if (entity.perfectBlockActive) {
                this.drawShieldEffect(entity);
            }
        });

        // Draw Projectiles
        projectiles.forEach(proj => {
            this.drawProjectile(proj);
        });

        // Draw Particles
        this.drawParticles();

        // Draw Projectile Clash Effects (God-Tier Animation)
        this.drawClashEffects();

        // Glitch Effect
        if (this.glitchTimer > 0) {
            this.drawGlitch();
            this.glitchTimer -= 0.016;
        }

        this.ctx.restore();

        // Impact flash (drawn after world, before countdown overlay)
        if (this.impactFlashTimer > 0) {
            const t = this.impactFlashDuration > 0 ? (this.impactFlashTimer / this.impactFlashDuration) : 0;
            const alpha = Math.max(0, Math.min(1, t)) * this.impactFlashStrength;
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = this.impactFlashColor;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();

            this.impactFlashTimer -= 0.016;
            if (this.impactFlashTimer <= 0) {
                this.impactFlashStrength = 0;
                this.impactFlashDuration = 0;
            }
        }

        // Draw Countdown Overlay
        if (gameState === 'pre_fight') {
            this.drawCountdown(countdown);
        }
    }

    drawCountdown(time) {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.font = 'bold 120px "Courier New", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#00f3ff';
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.shadowBlur = 20;
        
        let text = Math.ceil(time).toString();
        if (time <= 0.5) text = "FIGHT!";
        
        this.ctx.fillText(text, this.width / 2, this.height / 2);
        this.ctx.restore();
    }

    drawProjectile(proj) {
        this.ctx.save();
        this.ctx.translate(proj.x, proj.y);
        
        // Trail
        proj.trail.forEach(t => {
            this.ctx.globalAlpha = t.alpha * 0.3;
            this.ctx.fillStyle = proj.color;
            this.ctx.beginPath();
            this.ctx.arc(t.x - proj.x, t.y - proj.y, 10 + Math.random()*5, 0, Math.PI*2);
            this.ctx.fill();
        });
        
        this.ctx.globalAlpha = 1.0;
        
        // Core - Beam Shape
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = proj.color;
        this.ctx.shadowBlur = 20;
        
        // Rotate based on facing
        if (proj.facing === -1) this.ctx.scale(-1, 1);

        // Draw Beam Head
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 30, 15, 0, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Outer Glow
        this.ctx.strokeStyle = proj.color;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 35, 20, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Energy Tail
        this.ctx.beginPath();
        this.ctx.moveTo(-20, -10);
        this.ctx.lineTo(-60 - Math.random()*20, 0);
        this.ctx.lineTo(-20, 10);
        this.ctx.fillStyle = proj.color;
        this.ctx.fill();
        
        this.ctx.restore();
    }

    // Set the current map index (called from Game.js for sync)
    setMap(mapIndex) {
        this.currentMapIndex = mapIndex % this.totalMaps;
    }

    // Get a random map index
    getRandomMapIndex() {
        return Math.floor(Math.random() * this.totalMaps);
    }

    drawBackground() {
        // Dispatch to the correct map based on currentMapIndex
        switch (this.currentMapIndex) {
            case 1:
                this.drawOnigashimaMap();
                break;
            case 2:
                this.drawPirateIslandMap();
                break;
            default:
                this.drawForestMap();
                break;
        }
    }

    drawForestMap() {
        const groundY = 420; // Raised up to show platform below
        const ctx = this.ctx;
        const t = Date.now() / 1000;
        
        // ============== DENSE ATMOSPHERIC FOREST BACKGROUND ==============
        
        // Deep sky gradient (dark atmospheric)
        const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
        skyGradient.addColorStop(0, '#050d18');
        skyGradient.addColorStop(0.2, '#0a1628');
        skyGradient.addColorStop(0.5, '#122035');
        skyGradient.addColorStop(0.8, '#152540');
        skyGradient.addColorStop(1, '#0a1828');
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, this.width, groundY);
        
        // Atmospheric fog layers with animation
        for (let i = 0; i < 6; i++) {
            const fogY = 80 + i * 70;
            const fogOffset = Math.sin(t * 0.15 + i * 0.8) * 30;
            ctx.fillStyle = `rgba(80, 120, 160, ${0.02 + i * 0.005})`;
            ctx.beginPath();
            ctx.ellipse(this.width / 2 + fogOffset, fogY, this.width * 0.9, 50 + i * 10, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Moon glow (subtle pulsing)
        const moonX = this.width - 140;
        const moonY = 70;
        const moonPulse = 1 + Math.sin(t * 0.5) * 0.05;
        const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 180 * moonPulse);
        moonGlow.addColorStop(0, 'rgba(200, 220, 255, 0.5)');
        moonGlow.addColorStop(0.2, 'rgba(150, 180, 220, 0.2)');
        moonGlow.addColorStop(0.5, 'rgba(100, 150, 200, 0.08)');
        moonGlow.addColorStop(1, 'rgba(80, 120, 180, 0)');
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 180, 0, Math.PI * 2);
        ctx.fill();
        
        // Moon
        ctx.fillStyle = 'rgba(230, 240, 255, 0.95)';
        ctx.shadowBlur = 30;
        ctx.shadowColor = 'rgba(200, 220, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // ============== LAYER 1: Very Far Background Trees (Tiny silhouettes) ==============
        ctx.fillStyle = '#050a12';
        for (let i = 0; i < 40; i++) {
            const treeX = i * 30 + Math.sin(i * 3.1) * 15;
            const treeH = 80 + Math.sin(i * 2.3) * 40;
            const treeW = 6 + Math.sin(i * 1.8) * 3;
            
            ctx.beginPath();
            ctx.moveTo(treeX, groundY - 80);
            ctx.lineTo(treeX - treeW, groundY - 80 - treeH * 0.3);
            ctx.lineTo(treeX, groundY - 80 - treeH);
            ctx.lineTo(treeX + treeW, groundY - 80 - treeH * 0.3);
            ctx.closePath();
            ctx.fill();
        }
        
        // ============== LAYER 2: Far Background Trees ==============
        ctx.fillStyle = '#080e18';
        for (let i = 0; i < 30; i++) {
            const treeX = i * 45 + Math.sin(i * 2.5) * 20;
            const treeH = 180 + Math.sin(i * 1.7) * 70;
            const treeW = 12 + Math.sin(i * 3.2) * 5;
            const sway = Math.sin(t * 0.3 + i * 0.5) * 2;
            
            // Tree trunk
            ctx.beginPath();
            ctx.moveTo(treeX - treeW/4, groundY - 60);
            ctx.lineTo(treeX - treeW/6 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/6 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/4, groundY - 60);
            ctx.fill();
            
            // Tree canopy layers
            for (let c = 0; c < 3; c++) {
                const canopyY = groundY - treeH * (0.5 + c * 0.18);
                const canopyW = treeW * (2.2 - c * 0.4);
                ctx.beginPath();
                ctx.moveTo(treeX + sway, canopyY - 30 - c * 15);
                ctx.lineTo(treeX - canopyW + sway * 0.5, canopyY + 10);
                ctx.lineTo(treeX + canopyW + sway * 0.5, canopyY + 10);
                ctx.closePath();
                ctx.fill();
            }
        }
        
        // ============== LAYER 3: Mid-far Trees ==============
        ctx.fillStyle = '#0a1420';
        for (let i = 0; i < 20; i++) {
            const treeX = i * 65 + 25 + Math.cos(i * 2.1) * 30;
            const treeH = 240 + Math.sin(i * 1.9) * 60;
            const treeW = 16 + Math.cos(i * 2.5) * 6;
            const sway = Math.sin(t * 0.4 + i * 0.7) * 3;
            
            ctx.beginPath();
            ctx.moveTo(treeX - treeW/3, groundY - 45);
            ctx.lineTo(treeX - treeW/5 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/5 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/3, groundY - 45);
            ctx.fill();
            
            // Dense branches
            for (let b = 0; b < 4; b++) {
                const branchY = groundY - treeH * (0.35 + b * 0.16);
                const branchLen = treeW * (2.0 - b * 0.35);
                ctx.beginPath();
                ctx.moveTo(treeX + sway * 0.7, branchY - 20);
                ctx.lineTo(treeX - branchLen + sway * 0.4, branchY + 12);
                ctx.lineTo(treeX + branchLen + sway * 0.4, branchY + 12);
                ctx.closePath();
                ctx.fill();
            }
        }
        
        // ============== LAYER 4: Mid-ground Trees (More detail) ==============
        ctx.fillStyle = '#0c1828';
        for (let i = 0; i < 14; i++) {
            const treeX = i * 85 + 40 + Math.cos(i * 1.8) * 35;
            const treeH = 300 + Math.sin(i * 2.1) * 50;
            const treeW = 22 + Math.cos(i * 2.8) * 8;
            const sway = Math.sin(t * 0.5 + i * 0.9) * 4;
            
            ctx.beginPath();
            ctx.moveTo(treeX - treeW/3, groundY - 35);
            ctx.lineTo(treeX - treeW/5 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/5 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/3, groundY - 35);
            ctx.fill();
            
            // Detailed branches
            for (let b = 0; b < 5; b++) {
                const branchY = groundY - treeH * (0.3 + b * 0.14);
                const branchLen = treeW * (1.8 - b * 0.25);
                ctx.beginPath();
                ctx.moveTo(treeX + sway * 0.6, branchY - 18);
                ctx.lineTo(treeX - branchLen + sway * 0.3, branchY + 10);
                ctx.lineTo(treeX + branchLen + sway * 0.3, branchY + 10);
                ctx.closePath();
                ctx.fill();
            }
        }
        
        // ============== LAYER 5: Near Trees (Larger, more visible) ==============
        ctx.fillStyle = '#0e1c30';
        for (let i = 0; i < 8; i++) {
            const treeX = i * 150 + 60 + Math.sin(i * 2.3) * 40;
            const treeH = 380 + Math.cos(i * 1.5) * 40;
            const treeW = 28 + Math.sin(i * 2.1) * 10;
            const sway = Math.sin(t * 0.6 + i * 1.1) * 5;
            
            ctx.beginPath();
            ctx.moveTo(treeX - treeW/2.5, groundY - 25);
            ctx.lineTo(treeX - treeW/4 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/4 + sway, groundY - treeH);
            ctx.lineTo(treeX + treeW/2.5, groundY - 25);
            ctx.fill();
            
            // Full branch layers
            for (let b = 0; b < 6; b++) {
                const branchY = groundY - treeH * (0.25 + b * 0.12);
                const branchLen = treeW * (2.0 - b * 0.2);
                ctx.beginPath();
                ctx.moveTo(treeX + sway * 0.5, branchY - 22);
                ctx.lineTo(treeX - branchLen + sway * 0.25, branchY + 8);
                ctx.lineTo(treeX + branchLen + sway * 0.25, branchY + 8);
                ctx.closePath();
                ctx.fill();
            }
        }
        
        // ============== ATMOSPHERIC EFFECTS ==============
        
        // Ground-level mist with animation
        for (let i = 0; i < 8; i++) {
            const mistX = (i * 150 + t * 15 + Math.sin(t * 0.2 + i) * 40) % (this.width + 200) - 100;
            const mistY = groundY - 30 + Math.sin(t * 0.3 + i * 0.8) * 15;
            const mistGrad = ctx.createRadialGradient(mistX, mistY, 0, mistX, mistY, 100);
            mistGrad.addColorStop(0, 'rgba(100, 150, 180, 0.08)');
            mistGrad.addColorStop(1, 'rgba(80, 120, 160, 0)');
            ctx.fillStyle = mistGrad;
            ctx.beginPath();
            ctx.ellipse(mistX, mistY, 120, 40, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Foreground atmospheric glow
        const groundGlow = ctx.createLinearGradient(0, groundY - 80, 0, groundY + 20);
        groundGlow.addColorStop(0, 'rgba(0, 150, 180, 0)');
        groundGlow.addColorStop(0.6, 'rgba(0, 180, 200, 0.06)');
        groundGlow.addColorStop(1, 'rgba(0, 200, 220, 0.12)');
        ctx.fillStyle = groundGlow;
        ctx.fillRect(0, groundY - 80, this.width, 100);
        
        // ============== SOLID FIGHTING STAGE / PLATFORM ==============
        
        // Platform top surface (where fighters stand) - raised stone look
        const platformTop = groundY - 15;
        const platformHeight = 100;
        
        // Main platform body - dark stone with depth
        const platformGrad = ctx.createLinearGradient(0, platformTop, 0, platformTop + platformHeight);
        platformGrad.addColorStop(0, '#2a3545');
        platformGrad.addColorStop(0.05, '#1f2a38');
        platformGrad.addColorStop(0.15, '#182230');
        platformGrad.addColorStop(0.4, '#121a25');
        platformGrad.addColorStop(0.7, '#0c1218');
        platformGrad.addColorStop(1, '#060a0e');
        ctx.fillStyle = platformGrad;
        ctx.fillRect(0, platformTop, this.width, platformHeight);
        
        // Platform 3D edge (left side)
        const edgeGradL = ctx.createLinearGradient(0, platformTop, 20, platformTop);
        edgeGradL.addColorStop(0, '#0a1015');
        edgeGradL.addColorStop(1, 'transparent');
        ctx.fillStyle = edgeGradL;
        ctx.fillRect(0, platformTop, 20, platformHeight);
        
        // Platform 3D edge (right side)
        const edgeGradR = ctx.createLinearGradient(this.width - 20, platformTop, this.width, platformTop);
        edgeGradR.addColorStop(0, 'transparent');
        edgeGradR.addColorStop(1, '#0a1015');
        ctx.fillStyle = edgeGradR;
        ctx.fillRect(this.width - 20, platformTop, 20, platformHeight);
        
        // Stone texture - vertical cracks
        ctx.strokeStyle = 'rgba(40, 55, 70, 0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            const lineX = i * 55 + Math.sin(i * 2.3) * 15 + 20;
            ctx.beginPath();
            ctx.moveTo(lineX, platformTop + 5);
            ctx.lineTo(lineX + Math.sin(i) * 3, platformTop + platformHeight);
            ctx.stroke();
        }
        
        // Horizontal stone layers
        ctx.strokeStyle = 'rgba(30, 45, 60, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, platformTop + 25);
        ctx.lineTo(this.width, platformTop + 25);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, platformTop + 50);
        ctx.lineTo(this.width, platformTop + 50);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, platformTop + 75);
        ctx.lineTo(this.width, platformTop + 75);
        ctx.stroke();
        
        // Top surface highlight - glowing edge where fighters stand
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#00e5ff';
        ctx.beginPath();
        ctx.moveTo(0, platformTop);
        ctx.lineTo(this.width, platformTop);
        ctx.stroke();
        
        // Secondary inner glow
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(0, platformTop + 3);
        ctx.lineTo(this.width, platformTop + 3);
        ctx.stroke();
        
        // Pulsing energy line
        const pulseAlpha = 0.4 + Math.sin(t * 2.5) * 0.2;
        ctx.strokeStyle = `rgba(0, 255, 220, ${pulseAlpha})`;
        ctx.lineWidth = 6;
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#00ffcc';
        ctx.beginPath();
        ctx.moveTo(0, platformTop - 1);
        ctx.lineTo(this.width, platformTop - 1);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Corner decorations (arena style)
        const cornerSize = 60;
        ctx.fillStyle = 'rgba(0, 200, 220, 0.15)';
        // Left corner
        ctx.beginPath();
        ctx.moveTo(0, platformTop);
        ctx.lineTo(cornerSize, platformTop);
        ctx.lineTo(0, platformTop + cornerSize);
        ctx.closePath();
        ctx.fill();
        // Right corner
        ctx.beginPath();
        ctx.moveTo(this.width, platformTop);
        ctx.lineTo(this.width - cornerSize, platformTop);
        ctx.lineTo(this.width, platformTop + cornerSize);
        ctx.closePath();
        ctx.fill();
        
        // ============== FLOATING PARTICLES (Fireflies/Dust) ==============
        
        // Bright fireflies
        for (let i = 0; i < 20; i++) {
            const px = (i * 57 + Math.sin(t * 0.4 + i * 1.3) * 60) % this.width;
            const py = 80 + Math.sin(t * 0.25 + i * 0.6) * 180 + i * 15;
            const size = 1.2 + Math.sin(t * 2.5 + i * 1.1) * 0.8;
            const alpha = 0.4 + Math.sin(t * 3 + i * 0.9) * 0.4;
            
            ctx.fillStyle = `rgba(200, 255, 220, ${alpha})`;
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(150, 255, 200, 0.8)';
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Subtle dust particles
        ctx.shadowBlur = 0;
        for (let i = 0; i < 30; i++) {
            const px = (i * 37 + t * 8 + Math.sin(t * 0.15 + i * 2.1) * 30) % this.width;
            const py = 50 + Math.sin(t * 0.2 + i * 0.4) * 200 + (i % 10) * 35;
            const size = 0.5 + Math.sin(t + i) * 0.3;
            ctx.fillStyle = `rgba(150, 180, 200, ${0.2 + Math.sin(t * 1.5 + i) * 0.15})`;
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ============== ONIGASHIMA MAP (Exact replica of reference image) ==============
    drawOnigashimaMap() {
        const groundY = 420;
        const ctx = this.ctx;
        const t = Date.now() / 1000;
        
        // ============== DARK PURPLE/VIOLET STORMY SKY ==============
        const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
        skyGradient.addColorStop(0, '#1a0a2e');      // Deep purple at top
        skyGradient.addColorStop(0.15, '#2d1245');   // Dark violet
        skyGradient.addColorStop(0.3, '#3d1a55');    // Purple
        skyGradient.addColorStop(0.5, '#4a2065');    // Lighter purple center
        skyGradient.addColorStop(0.7, '#3a1850');    // Back to darker
        skyGradient.addColorStop(0.85, '#2a1040');   // Dark purple
        skyGradient.addColorStop(1, '#1a0825');      // Very dark at horizon
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, this.width, groundY);
        
        // ============== SWIRLING DARK STORM CLOUDS ==============
        // Dark menacing clouds in the sky
        for (let layer = 0; layer < 3; layer++) {
            for (let i = 0; i < 12; i++) {
                const cloudX = (i * 100 - 50 + Math.sin(t * 0.05 + i + layer) * 20) % (this.width + 100);
                const cloudY = 20 + layer * 40 + Math.sin(i * 0.7 + layer) * 25;
                const cloudW = 100 + Math.sin(i * 2.1 + layer) * 50;
                const cloudH = 25 + Math.sin(i * 1.5) * 15;
                
                // Darker purple clouds
                ctx.fillStyle = `rgba(${30 + layer * 10}, ${10 + layer * 5}, ${40 + layer * 15}, ${0.5 - layer * 0.1})`;
                ctx.beginPath();
                ctx.ellipse(cloudX, cloudY, cloudW, cloudH, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // ============== BRIGHT PINK/MAGENTA LIGHTNING BOLTS ==============
        // Multiple persistent lightning bolts behind the skull
        const drawLightningBoltOnigashima = (startX, startY, endY, seed, thickness, branches) => {
            ctx.save();
            ctx.strokeStyle = '#ff88ff';
            ctx.lineWidth = thickness;
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#ff00ff';
            ctx.lineCap = 'round';
            
            // Main bolt
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            let x = startX;
            let y = startY;
            const segments = 12;
            for (let i = 0; i < segments; i++) {
                const progress = i / segments;
                y = startY + (endY - startY) * progress;
                x = startX + Math.sin(seed + i * 2.5 + t * 3) * (40 - progress * 20);
                ctx.lineTo(x, y);
                
                // Add branches
                if (branches && i > 2 && i < segments - 2 && i % 3 === 0) {
                    const branchDir = (i % 2 === 0) ? 1 : -1;
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + branchDir * (30 + Math.sin(seed + i) * 20), y + 25);
                    ctx.moveTo(x, y);
                }
            }
            ctx.stroke();
            
            // White hot core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = thickness * 0.4;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ffaaff';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            x = startX;
            y = startY;
            for (let i = 0; i < segments; i++) {
                const progress = i / segments;
                y = startY + (endY - startY) * progress;
                x = startX + Math.sin(seed + i * 2.5 + t * 3) * (40 - progress * 20);
                ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        };
        
        // Draw multiple lightning bolts
        const lightningPhase = (Math.sin(t * 2) + 1) / 2;
        if (lightningPhase > 0.3) {
            // Left side bolts
            drawLightningBoltOnigashima(this.width * 0.25, -20, groundY - 180, 1.5, 4, true);
            drawLightningBoltOnigashima(this.width * 0.18, -10, groundY - 120, 3.2, 3, true);
            
            // Center bolts (behind skull, going up)
            drawLightningBoltOnigashima(this.width * 0.48, -30, groundY - 250, 2.1, 5, true);
            drawLightningBoltOnigashima(this.width * 0.52, -20, groundY - 260, 4.5, 5, true);
            
            // Right side bolts
            drawLightningBoltOnigashima(this.width * 0.75, -15, groundY - 170, 5.8, 4, true);
            drawLightningBoltOnigashima(this.width * 0.82, -25, groundY - 130, 7.2, 3, true);
        }
        
        // Lightning glow effect on sky
        if (lightningPhase > 0.5) {
            const glowIntensity = (lightningPhase - 0.5) * 0.3;
            ctx.fillStyle = `rgba(255, 100, 255, ${glowIntensity})`;
            ctx.fillRect(0, 0, this.width, groundY * 0.6);
        }
        
        // ============== ROCKY SPIKES ON SIDES ==============
        // Left side rocky spikes
        ctx.fillStyle = '#2a2035';
        ctx.beginPath();
        ctx.moveTo(-20, groundY);
        ctx.lineTo(30, groundY - 180);
        ctx.lineTo(60, groundY - 120);
        ctx.lineTo(100, groundY - 200);
        ctx.lineTo(130, groundY - 100);
        ctx.lineTo(160, groundY);
        ctx.closePath();
        ctx.fill();
        
        // Right side rocky spikes
        ctx.beginPath();
        ctx.moveTo(this.width + 20, groundY);
        ctx.lineTo(this.width - 30, groundY - 160);
        ctx.lineTo(this.width - 70, groundY - 100);
        ctx.lineTo(this.width - 100, groundY - 190);
        ctx.lineTo(this.width - 140, groundY - 110);
        ctx.lineTo(this.width - 170, groundY);
        ctx.closePath();
        ctx.fill();
        
        // ============== GIANT DEMON SKULL ==============
        const skullCenterX = this.width / 2;
        const skullBaseY = groundY - 100;
        
        // Skull main body - dark grayish stone
        const skullGrad = ctx.createRadialGradient(skullCenterX, skullBaseY - 80, 20, skullCenterX, skullBaseY - 60, 180);
        skullGrad.addColorStop(0, '#5a5065');
        skullGrad.addColorStop(0.4, '#4a4055');
        skullGrad.addColorStop(0.7, '#3a3045');
        skullGrad.addColorStop(1, '#2a2035');
        ctx.fillStyle = skullGrad;
        
        // Main skull dome shape
        ctx.beginPath();
        ctx.moveTo(skullCenterX - 120, skullBaseY);
        ctx.quadraticCurveTo(skullCenterX - 140, skullBaseY - 60, skullCenterX - 100, skullBaseY - 120);
        ctx.quadraticCurveTo(skullCenterX - 60, skullBaseY - 160, skullCenterX, skullBaseY - 170);
        ctx.quadraticCurveTo(skullCenterX + 60, skullBaseY - 160, skullCenterX + 100, skullBaseY - 120);
        ctx.quadraticCurveTo(skullCenterX + 140, skullBaseY - 60, skullCenterX + 120, skullBaseY);
        ctx.closePath();
        ctx.fill();
        
        // Skull face details - brow ridges
        ctx.fillStyle = '#3a3045';
        ctx.beginPath();
        ctx.moveTo(skullCenterX - 90, skullBaseY - 90);
        ctx.quadraticCurveTo(skullCenterX - 50, skullBaseY - 110, skullCenterX, skullBaseY - 100);
        ctx.quadraticCurveTo(skullCenterX + 50, skullBaseY - 110, skullCenterX + 90, skullBaseY - 90);
        ctx.quadraticCurveTo(skullCenterX + 50, skullBaseY - 95, skullCenterX, skullBaseY - 85);
        ctx.quadraticCurveTo(skullCenterX - 50, skullBaseY - 95, skullCenterX - 90, skullBaseY - 90);
        ctx.fill();
        
        // Spiky crown on top of skull
        ctx.fillStyle = '#4a4055';
        const spikes = [
            { x: -60, h: 35 }, { x: -35, h: 50 }, { x: -10, h: 40 },
            { x: 10, h: 45 }, { x: 35, h: 55 }, { x: 60, h: 38 }
        ];
        spikes.forEach(spike => {
            ctx.beginPath();
            ctx.moveTo(skullCenterX + spike.x - 12, skullBaseY - 150);
            ctx.lineTo(skullCenterX + spike.x, skullBaseY - 150 - spike.h);
            ctx.lineTo(skullCenterX + spike.x + 12, skullBaseY - 150);
            ctx.closePath();
            ctx.fill();
        });
        
        // ============== CURVED DEMON HORNS (Large, sweeping upward) ==============
        const drawHorn = (startX, startY, direction, length, curvature) => {
            ctx.save();
            
            // Horn base gradient
            const hornGrad = ctx.createLinearGradient(
                startX, startY,
                startX + direction * length * 0.8, startY - length
            );
            hornGrad.addColorStop(0, '#5a5565');
            hornGrad.addColorStop(0.3, '#6a6575');
            hornGrad.addColorStop(0.6, '#5a5565');
            hornGrad.addColorStop(1, '#4a4555');
            ctx.fillStyle = hornGrad;
            
            // Draw thick curved horn
            ctx.beginPath();
            // Base of horn (thick)
            ctx.moveTo(startX - direction * 20, startY);
            
            // Outer curve
            ctx.quadraticCurveTo(
                startX + direction * curvature * 0.6, startY - length * 0.4,
                startX + direction * curvature, startY - length * 0.8
            );
            ctx.quadraticCurveTo(
                startX + direction * curvature * 0.8, startY - length,
                startX + direction * curvature * 0.5, startY - length * 1.1
            );
            
            // Tip (pointed)
            ctx.lineTo(startX + direction * curvature * 0.4, startY - length * 1.05);
            
            // Inner curve back down
            ctx.quadraticCurveTo(
                startX + direction * curvature * 0.5, startY - length * 0.7,
                startX + direction * curvature * 0.3, startY - length * 0.3
            );
            ctx.quadraticCurveTo(
                startX + direction * 15, startY - length * 0.1,
                startX + direction * 5, startY
            );
            
            ctx.closePath();
            ctx.fill();
            
            // Horn ridges/texture
            ctx.strokeStyle = 'rgba(80, 70, 90, 0.5)';
            ctx.lineWidth = 2;
            for (let i = 1; i < 6; i++) {
                const t = i / 6;
                const rx = startX + direction * curvature * t * 0.6;
                const ry = startY - length * t * 0.8;
                ctx.beginPath();
                ctx.arc(rx, ry, 8 + (1 - t) * 12, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            ctx.restore();
        };
        
        // Left horn - curves outward and up
        drawHorn(skullCenterX - 100, skullBaseY - 100, -1, 200, 180);
        // Right horn - curves outward and up
        drawHorn(skullCenterX + 100, skullBaseY - 100, 1, 200, 180);
        
        // ============== GLOWING RED EYES ==============
        const eyeGlow = 0.8 + Math.sin(t * 3) * 0.2;
        
        // Eye socket shadows
        ctx.fillStyle = '#1a0a15';
        ctx.beginPath();
        ctx.ellipse(skullCenterX - 45, skullBaseY - 70, 32, 38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(skullCenterX + 45, skullBaseY - 70, 32, 38, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Glowing red eyes
        ctx.shadowBlur = 50;
        ctx.shadowColor = '#ff0000';
        const eyeGrad = ctx.createRadialGradient(skullCenterX - 45, skullBaseY - 70, 0, skullCenterX - 45, skullBaseY - 70, 28);
        eyeGrad.addColorStop(0, `rgba(255, 100, 80, ${eyeGlow})`);
        eyeGrad.addColorStop(0.5, `rgba(255, 30, 0, ${eyeGlow})`);
        eyeGrad.addColorStop(1, `rgba(180, 0, 0, ${eyeGlow * 0.7})`);
        ctx.fillStyle = eyeGrad;
        ctx.beginPath();
        ctx.ellipse(skullCenterX - 45, skullBaseY - 70, 25, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        
        const eyeGrad2 = ctx.createRadialGradient(skullCenterX + 45, skullBaseY - 70, 0, skullCenterX + 45, skullBaseY - 70, 28);
        eyeGrad2.addColorStop(0, `rgba(255, 100, 80, ${eyeGlow})`);
        eyeGrad2.addColorStop(0.5, `rgba(255, 30, 0, ${eyeGlow})`);
        eyeGrad2.addColorStop(1, `rgba(180, 0, 0, ${eyeGlow * 0.7})`);
        ctx.fillStyle = eyeGrad2;
        ctx.beginPath();
        ctx.ellipse(skullCenterX + 45, skullBaseY - 70, 25, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // ============== GLOWING RED MOUTH WITH TEETH ==============
        // Mouth opening
        ctx.fillStyle = '#0a0005';
        ctx.beginPath();
        ctx.moveTo(skullCenterX - 60, skullBaseY - 25);
        ctx.quadraticCurveTo(skullCenterX, skullBaseY - 15, skullCenterX + 60, skullBaseY - 25);
        ctx.lineTo(skullCenterX + 55, skullBaseY + 25);
        ctx.quadraticCurveTo(skullCenterX, skullBaseY + 35, skullCenterX - 55, skullBaseY + 25);
        ctx.closePath();
        ctx.fill();
        
        // Red glow inside mouth
        ctx.shadowBlur = 40;
        ctx.shadowColor = '#ff0000';
        const mouthGrad = ctx.createRadialGradient(skullCenterX, skullBaseY + 5, 0, skullCenterX, skullBaseY + 5, 60);
        mouthGrad.addColorStop(0, `rgba(255, 50, 20, ${0.8 + Math.sin(t * 2.5) * 0.2})`);
        mouthGrad.addColorStop(0.5, 'rgba(200, 20, 0, 0.6)');
        mouthGrad.addColorStop(1, 'rgba(100, 0, 0, 0.3)');
        ctx.fillStyle = mouthGrad;
        ctx.beginPath();
        ctx.ellipse(skullCenterX, skullBaseY + 5, 50, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Vertical teeth/bars in mouth
        ctx.fillStyle = '#3a3045';
        for (let i = 0; i < 7; i++) {
            const toothX = skullCenterX - 48 + i * 16;
            const toothH = 35 + Math.sin(i * 1.2) * 8;
            ctx.fillRect(toothX, skullBaseY - 20, 8, toothH);
        }
        
        // ============== DARK LAYERED ROCKY FOREGROUND ==============
        // Multiple layers of dark horizontal rocky terrain
        
        // Back layer - darkest
        ctx.fillStyle = '#1a1525';
        ctx.beginPath();
        ctx.moveTo(0, groundY - 40);
        for (let i = 0; i <= 25; i++) {
            const x = i * (this.width / 25);
            const y = groundY - 55 + Math.sin(i * 0.4) * 15 + Math.sin(i * 0.9) * 8;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(this.width, groundY + 50);
        ctx.lineTo(0, groundY + 50);
        ctx.closePath();
        ctx.fill();
        
        // Middle layer
        ctx.fillStyle = '#252030';
        ctx.beginPath();
        ctx.moveTo(0, groundY - 25);
        for (let i = 0; i <= 30; i++) {
            const x = i * (this.width / 30);
            const y = groundY - 35 + Math.sin(i * 0.5 + 1) * 12 + Math.sin(i * 0.8) * 6;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(this.width, groundY + 50);
        ctx.lineTo(0, groundY + 50);
        ctx.closePath();
        ctx.fill();
        
        // Horizontal striations on rocks
        ctx.strokeStyle = 'rgba(60, 50, 70, 0.4)';
        ctx.lineWidth = 1;
        for (let layer = 0; layer < 5; layer++) {
            ctx.beginPath();
            const baseY = groundY - 20 + layer * 8;
            ctx.moveTo(0, baseY);
            for (let i = 0; i <= 40; i++) {
                const x = i * (this.width / 40);
                const y = baseY + Math.sin(i * 0.3 + layer) * 3;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        
        // Front layer - fighting surface
        ctx.fillStyle = '#2d2838';
        ctx.beginPath();
        ctx.moveTo(0, groundY - 10);
        for (let i = 0; i <= 35; i++) {
            const x = i * (this.width / 35);
            const y = groundY - 15 + Math.sin(i * 0.6 + 0.5) * 8;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(this.width, groundY + 50);
        ctx.lineTo(0, groundY + 50);
        ctx.closePath();
        ctx.fill();
        
        // Draw the unique demon stone fighting platform
        this.drawOnigashimaPlatform(groundY, ctx, t);
    }
    
    // Unique dark demonic platform for Onigashima
    drawOnigashimaPlatform(groundY, ctx, t) {
        const platformTop = groundY - 15;
        const platformHeight = 100;
        
        // Dark volcanic stone base
        const stoneGrad = ctx.createLinearGradient(0, platformTop, 0, platformTop + platformHeight);
        stoneGrad.addColorStop(0, '#2a1525');
        stoneGrad.addColorStop(0.1, '#201020');
        stoneGrad.addColorStop(0.3, '#180a18');
        stoneGrad.addColorStop(0.6, '#100810');
        stoneGrad.addColorStop(1, '#080408');
        ctx.fillStyle = stoneGrad;
        ctx.fillRect(0, platformTop, this.width, platformHeight);
        
        // Cracked lava veins
        ctx.strokeStyle = 'rgba(255, 80, 20, 0.6)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 15; i++) {
            const veinX = i * 70 + Math.sin(i * 2.1) * 25;
            const veinGlow = 0.4 + Math.sin(t * 2 + i) * 0.3;
            ctx.strokeStyle = `rgba(255, ${60 + Math.sin(t * 3 + i) * 40}, 20, ${veinGlow})`;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ff4400';
            ctx.beginPath();
            ctx.moveTo(veinX, platformTop + 5);
            let vy = platformTop + 5;
            while (vy < platformTop + platformHeight - 10) {
                vy += 10 + Math.random() * 15;
                ctx.lineTo(veinX + (Math.random() - 0.5) * 15, vy);
            }
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
        
        // Horizontal cracks
        ctx.strokeStyle = 'rgba(80, 40, 60, 0.5)';
        ctx.lineWidth = 1;
        for (let h of [20, 45, 70]) {
            ctx.beginPath();
            let x = 0;
            ctx.moveTo(x, platformTop + h);
            while (x < this.width) {
                x += 20 + Math.random() * 30;
                ctx.lineTo(x, platformTop + h + (Math.random() - 0.5) * 6);
            }
            ctx.stroke();
        }
        
        // Glowing magenta/purple edge (demonic energy)
        const pulseIntensity = 0.7 + Math.sin(t * 3) * 0.3;
        ctx.strokeStyle = `rgba(255, 0, 180, ${pulseIntensity})`;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 35;
        ctx.shadowColor = '#ff00aa';
        ctx.beginPath();
        ctx.moveTo(0, platformTop);
        ctx.lineTo(this.width, platformTop);
        ctx.stroke();
        
        // Secondary inner demonic glow
        ctx.strokeStyle = `rgba(180, 0, 255, ${pulseIntensity * 0.8})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#aa00ff';
        ctx.beginPath();
        ctx.moveTo(0, platformTop + 3);
        ctx.lineTo(this.width, platformTop + 3);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // ============== PIRATE ISLAND MAP (Alabasta-style desert city with skull rock - exact replica) ==============
    drawPirateIslandMap() {
        const groundY = 420;
        const ctx = this.ctx;
        const t = Date.now() / 1000;
        
        // ============== BRIGHT BLUE SKY ==============
        const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
        skyGradient.addColorStop(0, '#4a9fd4');      // Bright blue at top
        skyGradient.addColorStop(0.2, '#5bb5e8');    // Lighter blue
        skyGradient.addColorStop(0.4, '#7cc8f0');    // Even lighter
        skyGradient.addColorStop(0.6, '#a0dcf8');    // Pale blue
        skyGradient.addColorStop(0.8, '#c8ecfc');    // Very pale
        skyGradient.addColorStop(1, '#e8f4fc');      // Almost white at horizon
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, 0, this.width, groundY);
        
        // ============== WHITE FLUFFY CLOUDS ==============
        const drawCloud = (x, y, scale) => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            // Main cloud body (multiple overlapping ellipses)
            ctx.beginPath();
            ctx.ellipse(x, y, 50 * scale, 25 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x - 35 * scale, y + 5 * scale, 35 * scale, 20 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + 40 * scale, y + 3 * scale, 40 * scale, 22 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x + 15 * scale, y - 15 * scale, 30 * scale, 18 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(x - 20 * scale, y - 10 * scale, 25 * scale, 15 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
        };
        
        // Draw clouds across the sky
        drawCloud(150 + Math.sin(t * 0.02) * 5, 60, 1.2);
        drawCloud(450 + Math.sin(t * 0.015 + 1) * 5, 45, 0.9);
        drawCloud(750 + Math.sin(t * 0.018 + 2) * 5, 70, 1.0);
        drawCloud(950 + Math.sin(t * 0.02 + 3) * 5, 50, 0.7);
        
        // Wispy cloud streaks
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            const streakY = 90 + i * 35;
            ctx.beginPath();
            ctx.moveTo(100 + i * 200, streakY);
            ctx.quadraticCurveTo(150 + i * 200, streakY - 10, 200 + i * 200, streakY + 5);
            ctx.stroke();
        }
        
        // ============== GIANT SKULL ROCK (Alabasta style) ==============
        const skullCenterX = this.width / 2;
        const skullBaseY = groundY - 80;
        
        // Main skull rock formation - tan/beige weathered stone
        const rockGrad = ctx.createLinearGradient(skullCenterX - 150, 0, skullCenterX + 150, 0);
        rockGrad.addColorStop(0, '#c9a878');
        rockGrad.addColorStop(0.3, '#d8bc8c');
        rockGrad.addColorStop(0.5, '#e8cca0');
        rockGrad.addColorStop(0.7, '#d8bc8c');
        rockGrad.addColorStop(1, '#c9a878');
        
        // Skull main shape - rounded top
        ctx.fillStyle = rockGrad;
        ctx.beginPath();
        ctx.moveTo(skullCenterX - 130, skullBaseY + 20);
        ctx.quadraticCurveTo(skullCenterX - 150, skullBaseY - 40, skullCenterX - 120, skullBaseY - 100);
        ctx.quadraticCurveTo(skullCenterX - 80, skullBaseY - 150, skullCenterX - 40, skullBaseY - 170);
        ctx.quadraticCurveTo(skullCenterX, skullBaseY - 180, skullCenterX + 40, skullBaseY - 170);
        ctx.quadraticCurveTo(skullCenterX + 80, skullBaseY - 150, skullCenterX + 120, skullBaseY - 100);
        ctx.quadraticCurveTo(skullCenterX + 150, skullBaseY - 40, skullCenterX + 130, skullBaseY + 20);
        ctx.closePath();
        ctx.fill();
        
        // Skull shadow/depth on sides
        ctx.fillStyle = '#b89868';
        ctx.beginPath();
        ctx.moveTo(skullCenterX - 130, skullBaseY + 20);
        ctx.quadraticCurveTo(skullCenterX - 145, skullBaseY - 30, skullCenterX - 115, skullBaseY - 90);
        ctx.lineTo(skullCenterX - 100, skullBaseY - 80);
        ctx.quadraticCurveTo(skullCenterX - 120, skullBaseY - 20, skullCenterX - 110, skullBaseY + 15);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(skullCenterX + 130, skullBaseY + 20);
        ctx.quadraticCurveTo(skullCenterX + 145, skullBaseY - 30, skullCenterX + 115, skullBaseY - 90);
        ctx.lineTo(skullCenterX + 100, skullBaseY - 80);
        ctx.quadraticCurveTo(skullCenterX + 120, skullBaseY - 20, skullCenterX + 110, skullBaseY + 15);
        ctx.closePath();
        ctx.fill();
        
        // Rock texture cracks
        ctx.strokeStyle = 'rgba(150, 120, 80, 0.4)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
            const crackX = skullCenterX - 80 + i * 20;
            ctx.beginPath();
            ctx.moveTo(crackX + Math.random() * 10, skullBaseY - 160 + Math.abs(skullCenterX - crackX) * 0.5);
            let cy = skullBaseY - 160 + Math.abs(skullCenterX - crackX) * 0.5;
            while (cy < skullBaseY + 10) {
                cy += 15 + Math.random() * 20;
                ctx.lineTo(crackX + (Math.random() - 0.5) * 8, cy);
            }
            ctx.stroke();
        }
        
        // ============== DARK EYE SOCKETS (Empty/hollow) ==============
        ctx.fillStyle = '#1a1512';
        // Left eye - round/oval
        ctx.beginPath();
        ctx.ellipse(skullCenterX - 45, skullBaseY - 80, 28, 35, 0, 0, Math.PI * 2);
        ctx.fill();
        // Right eye - round/oval
        ctx.beginPath();
        ctx.ellipse(skullCenterX + 45, skullBaseY - 80, 28, 35, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye socket depth shadows
        ctx.fillStyle = '#0a0805';
        ctx.beginPath();
        ctx.ellipse(skullCenterX - 45, skullBaseY - 78, 20, 27, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(skullCenterX + 45, skullBaseY - 78, 20, 27, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // ============== NOSE HOLE (Triangle) ==============
        ctx.fillStyle = '#1a1512';
        ctx.beginPath();
        ctx.moveTo(skullCenterX, skullBaseY - 45);
        ctx.lineTo(skullCenterX - 15, skullBaseY - 20);
        ctx.lineTo(skullCenterX + 15, skullBaseY - 20);
        ctx.closePath();
        ctx.fill();
        
        // ============== FLOATING ROCK PIECES (Broken off skull) ==============
        ctx.fillStyle = '#d8bc8c';
        // Top right floating rocks
        ctx.beginPath();
        ctx.moveTo(skullCenterX + 100, skullBaseY - 190);
        ctx.lineTo(skullCenterX + 130, skullBaseY - 210);
        ctx.lineTo(skullCenterX + 150, skullBaseY - 195);
        ctx.lineTo(skullCenterX + 140, skullBaseY - 175);
        ctx.lineTo(skullCenterX + 110, skullBaseY - 180);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(skullCenterX + 140, skullBaseY - 230);
        ctx.lineTo(skullCenterX + 165, skullBaseY - 245);
        ctx.lineTo(skullCenterX + 180, skullBaseY - 225);
        ctx.lineTo(skullCenterX + 160, skullBaseY - 215);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = '#c9a878';
        ctx.beginPath();
        ctx.moveTo(skullCenterX + 170, skullBaseY - 195);
        ctx.lineTo(skullCenterX + 190, skullBaseY - 205);
        ctx.lineTo(skullCenterX + 195, skullBaseY - 185);
        ctx.lineTo(skullCenterX + 175, skullBaseY - 180);
        ctx.closePath();
        ctx.fill();
        
        // ============== DESERT CITY BUILDINGS ==============
        const drawBuilding = (x, y, w, h, hasWindow = true, hasDome = false) => {
            // Main building body
            const buildingGrad = ctx.createLinearGradient(x, y - h, x + w, y);
            buildingGrad.addColorStop(0, '#e8d4a8');
            buildingGrad.addColorStop(0.5, '#d8c498');
            buildingGrad.addColorStop(1, '#c8b488');
            ctx.fillStyle = buildingGrad;
            ctx.fillRect(x, y - h, w, h);
            
            // Shadow on right side
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.fillRect(x + w - 5, y - h, 5, h);
            
            // Windows
            if (hasWindow) {
                ctx.fillStyle = '#2a2520';
                const windowW = w * 0.3;
                const windowH = h * 0.25;
                ctx.fillRect(x + w/2 - windowW/2, y - h * 0.7, windowW, windowH);
                
                // Window arch
                ctx.beginPath();
                ctx.arc(x + w/2, y - h * 0.7, windowW/2, Math.PI, 0);
                ctx.fill();
            }
            
            // Dome on top
            if (hasDome) {
                ctx.fillStyle = '#d8c498';
                ctx.beginPath();
                ctx.arc(x + w/2, y - h, w/2, Math.PI, 0);
                ctx.fill();
            }
        };
        
        // Buildings on left side (in front of skull)
        drawBuilding(30, groundY - 30, 40, 70, true, false);
        drawBuilding(80, groundY - 25, 35, 55, true, false);
        drawBuilding(125, groundY - 30, 45, 80, true, true);
        drawBuilding(180, groundY - 28, 38, 65, true, false);
        
        // Buildings on right side
        drawBuilding(this.width - 70, groundY - 30, 40, 75, true, false);
        drawBuilding(this.width - 120, groundY - 25, 35, 60, true, true);
        drawBuilding(this.width - 170, groundY - 32, 42, 85, true, false);
        drawBuilding(this.width - 220, groundY - 28, 38, 55, true, false);
        
        // More buildings in middle-ground
        drawBuilding(skullCenterX - 200, groundY - 40, 30, 50, true, false);
        drawBuilding(skullCenterX - 160, groundY - 45, 35, 60, true, true);
        drawBuilding(skullCenterX + 130, groundY - 42, 32, 55, true, false);
        drawBuilding(skullCenterX + 170, groundY - 38, 40, 65, true, true);
        
        // ============== PALM TREES ==============
        const drawPalmTreeAlabasta = (x, baseY, scale, lean) => {
            const trunkHeight = 100 * scale;
            
            // Trunk - brown with segments
            ctx.strokeStyle = '#5a4020';
            ctx.lineWidth = 10 * scale;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, baseY);
            ctx.quadraticCurveTo(x + lean * 20, baseY - trunkHeight * 0.5, x + lean * 10, baseY - trunkHeight);
            ctx.stroke();
            
            // Trunk segments
            ctx.strokeStyle = '#4a3018';
            ctx.lineWidth = 2;
            for (let i = 1; i < 6; i++) {
                const segY = baseY - trunkHeight * (i / 6);
                const segX = x + lean * 10 * (i / 6);
                ctx.beginPath();
                ctx.arc(segX, segY, 5 * scale, 0, Math.PI);
                ctx.stroke();
            }
            
            // Palm fronds - large feathered leaves
            const frondTopX = x + lean * 10;
            const frondTopY = baseY - trunkHeight;
            
            const drawFrond = (angle, length, droop) => {
                ctx.strokeStyle = '#2d7830';
                ctx.lineWidth = 3 * scale;
                ctx.lineCap = 'round';
                
                const endX = frondTopX + Math.cos(angle) * length;
                const endY = frondTopY + Math.sin(angle) * length * droop;
                
                // Main frond stem
                ctx.beginPath();
                ctx.moveTo(frondTopX, frondTopY);
                ctx.quadraticCurveTo(
                    frondTopX + Math.cos(angle) * length * 0.6,
                    frondTopY + Math.sin(angle) * length * 0.4 * droop,
                    endX, endY
                );
                ctx.stroke();
                
                // Leaves along frond
                ctx.fillStyle = '#3a8838';
                for (let l = 0; l < 8; l++) {
                    const lt = (l + 1) / 9;
                    const lx = frondTopX + Math.cos(angle) * length * lt;
                    const ly = frondTopY + Math.sin(angle) * length * lt * droop;
                    
                    ctx.beginPath();
                    ctx.ellipse(lx, ly, 12 * scale * (1 - lt * 0.5), 4 * scale, angle + 0.4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(lx, ly, 12 * scale * (1 - lt * 0.5), 4 * scale, angle - 0.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            };
            
            // Draw fronds in all directions
            drawFrond(-0.3, 60 * scale, 0.8);
            drawFrond(-0.8, 55 * scale, 0.7);
            drawFrond(-1.3, 50 * scale, 0.6);
            drawFrond(-1.8, 45 * scale, 0.5);
            drawFrond(-2.3, 50 * scale, 0.6);
            drawFrond(-2.8, 55 * scale, 0.7);
            drawFrond(0.2, 58 * scale, 0.75);
            drawFrond(0.5, 52 * scale, 0.65);
        };
        
        // Draw palm trees
        drawPalmTreeAlabasta(50, groundY - 30, 0.9, -0.5);
        drawPalmTreeAlabasta(150, groundY - 35, 0.7, 0.3);
        drawPalmTreeAlabasta(this.width - 60, groundY - 32, 0.85, 0.4);
        drawPalmTreeAlabasta(this.width - 150, groundY - 28, 0.65, -0.3);
        
        // ============== GREEN VEGETATION/BUSHES ==============
        ctx.fillStyle = '#3a7830';
        for (let i = 0; i < 10; i++) {
            const bushX = 40 + i * 100 + Math.sin(i * 2.3) * 30;
            if (Math.abs(bushX - skullCenterX) > 180) { // Not in front of skull
                ctx.beginPath();
                ctx.ellipse(bushX, groundY - 35, 20 + Math.sin(i) * 8, 12, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Foreground bushes (darker green)
        ctx.fillStyle = '#2a5820';
        ctx.beginPath();
        ctx.ellipse(20, groundY - 20, 35, 18, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(this.width - 25, groundY - 22, 40, 20, -0.2, 0, Math.PI * 2);
        ctx.fill();
        
        // ============== SANDY GROUND/TERRAIN ==============
        // Base sand color
        ctx.fillStyle = '#d8c090';
        ctx.beginPath();
        ctx.moveTo(0, groundY - 25);
        for (let i = 0; i <= 30; i++) {
            const x = i * (this.width / 30);
            const y = groundY - 28 + Math.sin(i * 0.5) * 6;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(this.width, groundY + 100);
        ctx.lineTo(0, groundY + 100);
        ctx.closePath();
        ctx.fill();
        
        // Rock outcroppings on sides
        ctx.fillStyle = '#8a7a60';
        // Left rocks
        ctx.beginPath();
        ctx.moveTo(0, groundY - 10);
        ctx.lineTo(20, groundY - 40);
        ctx.lineTo(50, groundY - 25);
        ctx.lineTo(70, groundY - 35);
        ctx.lineTo(90, groundY - 15);
        ctx.lineTo(90, groundY);
        ctx.lineTo(0, groundY);
        ctx.closePath();
        ctx.fill();
        
        // Right rocks
        ctx.beginPath();
        ctx.moveTo(this.width, groundY - 15);
        ctx.lineTo(this.width - 25, groundY - 45);
        ctx.lineTo(this.width - 60, groundY - 30);
        ctx.lineTo(this.width - 85, groundY - 40);
        ctx.lineTo(this.width - 100, groundY - 20);
        ctx.lineTo(this.width - 100, groundY);
        ctx.lineTo(this.width, groundY);
        ctx.closePath();
        ctx.fill();
        
        // Draw the unique desert platform
        this.drawAlabastaPlatform(groundY, ctx, t);
    }
    
    // Unique sandy/stone platform for Alabasta map
    drawAlabastaPlatform(groundY, ctx, t) {
        const platformTop = groundY - 15;
        const platformHeight = 100;
        
        // Sandy stone base
        const sandGrad = ctx.createLinearGradient(0, platformTop, 0, platformTop + platformHeight);
        sandGrad.addColorStop(0, '#d8c498');
        sandGrad.addColorStop(0.1, '#c8b488');
        sandGrad.addColorStop(0.3, '#b8a478');
        sandGrad.addColorStop(0.6, '#a89468');
        sandGrad.addColorStop(1, '#988458');
        ctx.fillStyle = sandGrad;
        ctx.fillRect(0, platformTop, this.width, platformHeight);
        
        // Stone block lines (horizontal)
        ctx.strokeStyle = 'rgba(120, 100, 70, 0.4)';
        ctx.lineWidth = 1;
        for (let h of [20, 40, 60, 80]) {
            ctx.beginPath();
            ctx.moveTo(0, platformTop + h);
            ctx.lineTo(this.width, platformTop + h);
            ctx.stroke();
        }
        
        // Stone block lines (vertical)
        for (let i = 0; i < 18; i++) {
            const blockX = i * 60 + 30;
            ctx.beginPath();
            ctx.moveTo(blockX, platformTop);
            ctx.lineTo(blockX, platformTop + platformHeight);
            ctx.stroke();
        }
        
        // Sand texture (small dots)
        for (let i = 0; i < 100; i++) {
            const sx = Math.random() * this.width;
            const sy = platformTop + Math.random() * 30;
            ctx.fillStyle = `rgba(${180 + Math.random() * 30}, ${150 + Math.random() * 30}, ${100 + Math.random() * 20}, 0.3)`;
            ctx.beginPath();
            ctx.arc(sx, sy, 1 + Math.random(), 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Warm golden glow on edge
        const sunGlow = 0.5 + Math.sin(t * 0.5) * 0.15;
        ctx.strokeStyle = `rgba(255, 200, 100, ${sunGlow})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(255, 180, 80, 0.6)';
        ctx.beginPath();
        ctx.moveTo(0, platformTop);
        ctx.lineTo(this.width, platformTop);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    // Common fighting platform (reusable for all maps)
    drawFightingPlatform(groundY, ctx, t, edgeColor1, edgeColor2) {
        const platformTop = groundY - 15;
        const platformHeight = 100;
        
        // Main platform body
        const platformGrad = ctx.createLinearGradient(0, platformTop, 0, platformTop + platformHeight);
        platformGrad.addColorStop(0, '#2a3545');
        platformGrad.addColorStop(0.05, '#1f2a38');
        platformGrad.addColorStop(0.15, '#182230');
        platformGrad.addColorStop(0.4, '#121a25');
        platformGrad.addColorStop(0.7, '#0c1218');
        platformGrad.addColorStop(1, '#060a0e');
        ctx.fillStyle = platformGrad;
        ctx.fillRect(0, platformTop, this.width, platformHeight);
        
        // Platform edges
        const edgeGradL = ctx.createLinearGradient(0, platformTop, 20, platformTop);
        edgeGradL.addColorStop(0, '#0a1015');
        edgeGradL.addColorStop(1, 'transparent');
        ctx.fillStyle = edgeGradL;
        ctx.fillRect(0, platformTop, 20, platformHeight);
        
        const edgeGradR = ctx.createLinearGradient(this.width - 20, platformTop, this.width, platformTop);
        edgeGradR.addColorStop(0, 'transparent');
        edgeGradR.addColorStop(1, '#0a1015');
        ctx.fillStyle = edgeGradR;
        ctx.fillRect(this.width - 20, platformTop, 20, platformHeight);
        
        // Stone texture
        ctx.strokeStyle = 'rgba(40, 55, 70, 0.5)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 20; i++) {
            const lineX = i * 55 + Math.sin(i * 2.3) * 15 + 20;
            ctx.beginPath();
            ctx.moveTo(lineX, platformTop + 5);
            ctx.lineTo(lineX + Math.sin(i) * 3, platformTop + platformHeight);
            ctx.stroke();
        }
        
        // Horizontal lines
        ctx.strokeStyle = 'rgba(30, 45, 60, 0.4)';
        for (let h of [25, 50, 75]) {
            ctx.beginPath();
            ctx.moveTo(0, platformTop + h);
            ctx.lineTo(this.width, platformTop + h);
            ctx.stroke();
        }
        
        // Glowing edge (themed color)
        ctx.strokeStyle = edgeColor2;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 30;
        ctx.shadowColor = edgeColor2;
        ctx.beginPath();
        ctx.moveTo(0, platformTop);
        ctx.lineTo(this.width, platformTop);
        ctx.stroke();
        
        // Secondary inner glow
        ctx.strokeStyle = edgeColor1;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(0, platformTop + 3);
        ctx.lineTo(this.width, platformTop + 3);
        ctx.stroke();
        
        // Pulsing energy line
        const pulseAlpha = 0.4 + Math.sin(t * 2.5) * 0.2;
        ctx.strokeStyle = `rgba(${this.hexToRgb(edgeColor2)}, ${pulseAlpha})`;
        ctx.lineWidth = 6;
        ctx.shadowBlur = 40;
        ctx.shadowColor = edgeColor2;
        ctx.beginPath();
        ctx.moveTo(0, platformTop - 1);
        ctx.lineTo(this.width, platformTop - 1);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    // Helper to convert hex to rgb string
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
        }
        return '255, 255, 255';
    }

    drawStickman(entity, isGhost) {
        const x = entity.x;
        const y = entity.y;
        const color = isGhost ? '#ffffff' : entity.color;
        const facing = entity.facing;
        
        this.ctx.save();
        this.ctx.translate(x, y - 30);
        this.ctx.scale(facing, 1);

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.shadowBlur = isGhost ? 5 : 15;
        this.ctx.shadowColor = color;

        const t = Date.now() / 1000;
        
        // Use simple variables instead of objects to avoid GC
        let headY = -50;
        let torsoY = -20;
        
        let handLX = -25, handLY = -20;
        let handRX = 25, handRY = -20;
        let elbowLX = -15, elbowLY = -35;
        let elbowRX = 15, elbowRY = -35;
        
        let kneeLX = -10, kneeLY = 10;
        let kneeRX = 10, kneeRY = 10;
        let footLX = -15, footLY = 30;
        let footRX = 15, footRY = 30;

        // State Machine for Poses
        if (entity.state === 'stance_idle') {
            // Boxing stance idle animation
            const breathe = Math.sin(t * 5) * 2;
            headY += breathe;
            
            // Guard up
            handLX = 15; handLY = -40 + breathe;
            handRX = 25; handRY = -35 + breathe;
            elbowLX = 5; elbowLY = -25;
            elbowRX = 15; elbowRY = -25;
            
            // Feet apart
            footLX = -20; footLY = 30;
            footRX = 20; footRY = 30;
            kneeLX = -10; kneeLY = 10;
            kneeRX = 10; kneeRY = 10;
        } else if (entity.state === 'move') {
            const run = t * 15;
            headY += Math.abs(Math.sin(run)) * 5;
            
            handLX = Math.cos(run) * 20;
            handLY = -30 + Math.sin(run) * 10;
            handRX = Math.cos(run + Math.PI) * 20;
            handRY = -30 + Math.sin(run + Math.PI) * 10;

            kneeLX = Math.sin(run) * 10;
            footLX = Math.sin(run) * 20;
            footLY = 30 - Math.abs(Math.cos(run)) * 10;
            
            kneeRX = Math.sin(run + Math.PI) * 10;
            footRX = Math.sin(run + Math.PI) * 20;
            footRY = 30 - Math.abs(Math.cos(run + Math.PI)) * 10;
        } else if (entity.state === 'jump') {
            kneeLX = -10; kneeLY = 0; 
            footLX = -10; footLY = 10;
            kneeRX = 10; kneeRY = -10; 
            footRX = 10; footRY = 0;
            handLY = -50; handRY = -50;
        } else if (entity.state === 'dash') {
            this.ctx.rotate(0.3);
            headY = -40;
            handLX = -30; handLY = -20;
            handRX = 30; handRY = -20;
            footLX = -40; footLY = 20;
            footRX = -20; footRY = 30;
            
            this.ctx.beginPath();
            this.ctx.moveTo(-50, -40); this.ctx.lineTo(-80, -40);
            this.ctx.moveTo(-50, 0); this.ctx.lineTo(-90, 0);
            this.ctx.moveTo(-50, 40); this.ctx.lineTo(-70, 40);
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.lineWidth = 4;
        } else if (entity.state.startsWith('attack_punch')) {
            const step = parseInt(entity.state.split('_')[2]) || 1;
            const duration = 0.55;
            const progress = Math.min(1, Math.max(0, 1 - (entity.stateTimer / duration)));
            // Smooth easing for natural motion
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const punch = Math.sin(progress * Math.PI);
            const punchSnap = progress < 0.35 ? easeOut * 2.8 : (1 - (progress - 0.35) / 0.65);
            // Recoil effect - arm pulls back slightly at end
            const recoil = progress > 0.7 ? (progress - 0.7) / 0.3 : 0;
            
            if (step === 1) {
                // LEFT Hand Jab - front hand punches
                const bodyShift = punch * 2;
                headY = -50 + bodyShift;
                torsoY = -20 + bodyShift;
                
                // Left arm punches forward - shorter reach
                handLX = 16 + punchSnap * 25 - recoil * 6;
                handLY = -42 + punch * 3;
                elbowLX = 11 + punchSnap * 10;
                elbowLY = -34 + punch * 2;
                
                // Right hand pulls BACK - chamber position
                handRX = -8 - punch * 6; handRY = -28 + punch * 3;
                elbowRX = -14 - punch * 4; elbowRY = -20;
                
                // Shoulder rotation
                this.ctx.rotate(punch * 0.12);
                
                // Subtle weight shift
                footLX = -14 + punch * 3; footLY = 30;
                footRX = 16 - punch * 2; footRY = 30;
                kneeLX = -10; kneeLY = 12;
                kneeRX = 11; kneeRY = 12;
                
            } else if (step === 2) {
                // RIGHT Hand Cross - rear hand punches
                const bodyRotate = punch * 0.22;
                this.ctx.rotate(-bodyRotate);
                
                headY = -50 + punch * 3;
                torsoY = -20 + punch * 2;
                
                // Right arm punches forward - shorter reach
                handRX = 14 + punchSnap * 28 - recoil * 8;
                handRY = -44 + punch * 5;
                elbowRX = 9 + punchSnap * 12;
                elbowRY = -35 + punch * 3;
                
                // Left hand guards near CHEST - front guard position
                handLX = 14 + punch * 2; handLY = -36 - punch * 2;
                elbowLX = 8; elbowLY = -26;
                
                // Hip rotation for power
                footLX = -14; footLY = 30;
                footRX = 16 + punch * 5; footRY = 30;
                kneeLX = -10; kneeLY = 11;
                kneeRX = 11 + punch * 3; kneeRY = 11;
                
            } else if (step === 3) {
                // LEFT Hand Uppercut - front hand punches again
                const dipPhase = progress < 0.25 ? progress / 0.25 : 1;
                const risePhase = progress < 0.25 ? 0 : (progress - 0.25) / 0.75;
                const dip = Math.sin(dipPhase * Math.PI * 0.5) * 6;
                const rise = Math.sin(risePhase * Math.PI) * 10;
                
                headY = -50 + dip - rise * 0.4;
                torsoY = -20 + dip - rise * 0.25;
                
                // Body rotation
                this.ctx.rotate(0.1 - punch * 0.25);
                
                // Left arm uppercuts - shorter reach
                handLX = 12 + punch * 12;
                handLY = -26 + dip - punchSnap * 22;
                elbowLX = 9 + punch * 5;
                elbowLY = -18 + dip - punch * 10;
                
                // Right hand pulls BACK - chamber position
                handRX = -10 - punch * 5; handRY = -30 + dip;
                elbowRX = -16 - punch * 3; elbowRY = -22;
                
                // Legs drive upward
                footLX = -16 + rise * 0.3; footLY = 30 - rise * 0.4;
                footRX = 15; footRY = 30 - rise * 0.8;
                kneeLX = -11; kneeLY = 12 - rise * 0.25;
                kneeRX = 10; kneeRY = 11 - rise * 0.4;
            }
        } else if (entity.state.startsWith('attack_kick')) {
            const step = parseInt(entity.state.split('_')[2]) || 1;
            const duration = 0.42;
            const progress = Math.min(1, Math.max(0, 1 - (entity.stateTimer / duration)));
            // Smooth easing with snap
            const easeOut = 1 - Math.pow(1 - progress, 2.5);
            const kick = Math.sin(progress * Math.PI);
            const kickSnap = progress < 0.3 ? (progress / 0.3) : (1 - (progress - 0.3) / 0.7);
            const kickPower = Math.sin(Math.min(1, progress * 1.5) * Math.PI);
            // Retract phase for realism
            const retract = progress > 0.65 ? (progress - 0.65) / 0.35 : 0;
            
            if (step === 1) {
                // Right Leg Mid Kick - Snappy roundhouse
                const chamber = progress < 0.2 ? progress / 0.2 : 1;
                const extend = progress < 0.2 ? 0 : Math.min(1, (progress - 0.2) / 0.45);
                
                // Pivot foot planted firmly
                footLX = -10; footLY = 30;
                kneeLX = -8; kneeLY = 13 + kick * 2;
                
                // Hip rotation drives power
                this.ctx.rotate(-0.08 + kickPower * 0.25);
                torsoY = -20 + kick * 3;
                headY = -50 + kick * 2;
                
                // Right leg - chamber then snap out
                kneeRX = 6 + chamber * 12 + extend * 20 - retract * 10;
                kneeRY = 12 - chamber * 18 - extend * 4 + retract * 8;
                footRX = 10 + chamber * 8 + extend * 45 - retract * 15;
                footRY = 30 - chamber * 12 - extend * 16 + retract * 10;
                
                // Arms balance naturally
                handLX = -6 - kickPower * 10; handLY = -38 - kick * 3;
                handRX = 14 + kickPower * 6; handRY = -44;
                elbowLX = -4 - kick * 5; elbowLY = -30;
                elbowRX = 10 + kick * 3; elbowRY = -32;
                
            } else if (step === 2) {
                // Left Leg High Kick - Quick crescent
                const chamber = progress < 0.18 ? progress / 0.18 : 1;
                const extend = progress < 0.18 ? 0 : Math.min(1, (progress - 0.18) / 0.47);
                
                // Pivot on right foot
                footRX = 10; footRY = 30;
                kneeRX = 8; kneeRY = 13 + kick * 2;
                
                // Body counter-leans
                this.ctx.rotate(0.08 - kickPower * 0.28);
                torsoY = -20 + kick * 4;
                headY = -50 + kick * 3;
                
                // Left leg - snappy high arc
                kneeLX = -4 + chamber * 16 + extend * 24 - retract * 12;
                kneeLY = 12 - chamber * 22 - extend * 12 + retract * 10;
                footLX = -8 + chamber * 12 + extend * 52 - retract * 18;
                footLY = 30 - chamber * 18 - extend * 42 + retract * 20;
                
                // Arms swing for momentum
                handRX = 20 + kickPower * 15; handRY = -35 - kick * 8;
                handLX = -10 - kickPower * 20; handLY = -38 + kick * 5;
                elbowRX = 15 + kick * 8; elbowRY = -28;
                elbowLX = -8 - kick * 10; elbowLY = -30;
                
            } else if (step === 3) {
                // Right Leg Rising Upperkick - Launcher
                const crouch = progress < 0.18 ? progress / 0.18 : (progress < 0.35 ? 1 : 1 - (progress - 0.35) / 0.65);
                const launch = progress < 0.22 ? 0 : Math.min(1, (progress - 0.22) / 0.45);
                
                // Crouch then explosive rise
                const crouchDepth = crouch * 8;
                torsoY = -20 + crouchDepth - launch * 6;
                headY = -50 + crouchDepth - launch * 4;
                
                // Body leans back for vertical kick
                this.ctx.rotate(-0.15 + kickPower * 0.38);
                
                // Planted left foot
                footLX = -14; footLY = 30;
                kneeLX = -11; kneeLY = 12 + crouchDepth * 0.4 - launch * 2;
                
                // Right leg rises vertically with snap
                kneeRX = 5 + launch * 12 - retract * 5;
                kneeRY = 12 + crouchDepth * 0.6 - launch * 42 + retract * 15;
                footRX = 8 + launch * 16 - retract * 8;
                footRY = 30 + crouchDepth * 0.4 - launch * 85 + retract * 30;
                
                // Arms swing for upward momentum
                handLX = -10 - launch * 15; handLY = -32 + crouchDepth - launch * 12;
                handRX = 14 + launch * 12; handRY = -36 + crouchDepth - launch * 8;
                elbowLX = -7 - launch * 10; elbowLY = -27;
                elbowRX = 11 + launch * 6; elbowRY = -30;
            }
        } else if (entity.state === 'attack_special_windup') {
            headY += 5;
            torsoY += 5;
            handLX = -20; handLY = -10;
            handRX = -20; handRY = -10;
            
            this.ctx.beginPath();
            this.ctx.arc(0, -20, 10 + Math.random()*20, 0, Math.PI*2);
            this.ctx.strokeStyle = '#fff';
            this.ctx.stroke();
            this.ctx.strokeStyle = color;
        } else if (entity.state === 'attack_special_active') {
            handRX = 40; handRY = -30;
            handLX = 30; handLY = -30;
            headY -= 5;
            
            this.ctx.beginPath();
            this.ctx.arc(40, -30, 30 + Math.random()*10, 0, Math.PI*2);
            this.ctx.fillStyle = color;
            this.ctx.fill();
        } else if (entity.state === 'blocking' || entity.state === 'blockstun') {
            // X symbol blocking pose - arms crossed in front
            // Left arm crosses to right side
            elbowLX = 5; elbowLY = -35;
            handLX = 25; handLY = -50;
            // Right arm crosses to left side
            elbowRX = -5; elbowRY = -30;
            handRX = -20; handRY = -45;
            // Defensive crouch stance
            footLX = -20; footLY = 30;
            footRX = 20; footRY = 30;
            kneeLX = -12; kneeLY = 15;
            kneeRX = 12; kneeRY = 15;
            headY = -45; // Slight duck
            if (entity.state === 'blockstun') {
                this.ctx.translate((Math.random()-0.5)*3, 0); // Shake on blockstun
            }
        } else if (entity.state === 'perfect_block_shield') {
            // Power stance with arms in strong X formation
            // Left arm crosses up-right
            elbowLX = 0; elbowLY = -40;
            handLX = 30; handLY = -55;
            // Right arm crosses up-left
            elbowRX = 0; elbowRY = -35;
            handRX = -25; handRY = -50;
            // Wide power stance
            footLX = -28; footLY = 30;
            footRX = 28; footRY = 30;
            kneeLX = -18; kneeLY = 12;
            kneeRX = 18; kneeRY = 12;
            headY = -48;
        } else if (entity.state === 'hitstun') {
            // Reeling back from hit
            const stunProgress = Math.min(1, entity.stateTimer / 0.3);
            const recoil = Math.sin(stunProgress * Math.PI);
            
            this.ctx.rotate(-0.3 - recoil * 0.25);
            headY = -48 + recoil * 8;
            torsoY = -20 + recoil * 5;
            
            // Arms flail back
            handLX = -15 - recoil * 12; handLY = -35 + recoil * 10;
            handRX = -10 - recoil * 8; handRY = -40 + recoil * 8;
            elbowLX = -10 - recoil * 6; elbowLY = -28;
            elbowRX = -5 - recoil * 4; elbowRY = -32;
            
            // Legs buckle slightly
            footLX = -12 - recoil * 5; footLY = 30;
            footRX = 15 + recoil * 3; footRY = 30;
            kneeLX = -10 - recoil * 3; kneeLY = 14 + recoil * 2;
            kneeRX = 12; kneeRY = 14 + recoil * 2;
            
            this.ctx.strokeStyle = '#ffffff';
        } else if (entity.state === 'knockdown') {
            // Falling/spinning knockdown animation
            const knockProgress = Math.min(1, 1 - (entity.stateTimer / 1.5));
            const fallPhase = Math.min(1, knockProgress * 2); // First half - falling
            const groundPhase = knockProgress > 0.5 ? (knockProgress - 0.5) * 2 : 0; // Second half - on ground
            
            // Spin while falling, then settle
            const spin = fallPhase < 1 ? fallPhase * 2.2 : 2.2 - groundPhase * 0.5;
            this.ctx.rotate(-spin);
            
            // Body lowers as they fall
            const fallY = fallPhase * 35;
            headY = -50 + fallY;
            torsoY = -20 + fallY * 0.8;
            
            // Arms spread out during fall
            const armSpread = Math.sin(fallPhase * Math.PI);
            handLX = -20 - armSpread * 25; handLY = -30 + fallY * 0.5 - armSpread * 15;
            handRX = 15 + armSpread * 20; handRY = -35 + fallY * 0.5 + armSpread * 10;
            elbowLX = -12 - armSpread * 12; elbowLY = -25 + fallY * 0.3;
            elbowRX = 10 + armSpread * 10; elbowRY = -28 + fallY * 0.3;
            
            // Legs kick out during knockdown
            footLX = -8 + armSpread * 15; footLY = 30 - fallPhase * 15;
            footRX = 20 + armSpread * 20; footRY = 25 - fallPhase * 10;
            kneeLX = -5 + armSpread * 8; kneeLY = 12 - fallPhase * 5;
            kneeRX = 15 + armSpread * 12; kneeRY = 10 - fallPhase * 3;
            
            // Bounce effect when hitting ground
            if (groundPhase > 0) {
                const bounce = Math.sin(groundPhase * Math.PI * 2) * (1 - groundPhase) * 3;
                headY += bounce;
                torsoY += bounce * 0.5;
            }
        } else if (entity.state === 'getting_up') {
            // Rising from knockdown
            const getUpProgress = Math.min(1, 1 - (entity.stateTimer / 0.4));
            const risePhase = getUpProgress;
            
            // Gradually rotate back to standing
            this.ctx.rotate(-1.7 + risePhase * 1.7);
            
            // Push up with arms
            const pushUp = Math.sin(risePhase * Math.PI * 0.5);
            headY = -15 - pushUp * 35;
            torsoY = 15 - pushUp * 35;
            
            // Arms push off ground then return to stance
            if (risePhase < 0.5) {
                handLX = -25 + risePhase * 20; handLY = 10 - risePhase * 30;
                handRX = 20 - risePhase * 10; handRY = 15 - risePhase * 35;
            } else {
                const armReturn = (risePhase - 0.5) * 2;
                handLX = -15 + armReturn * 5; handLY = -5 - armReturn * 30;
                handRX = 15 - armReturn * 5; handRY = -2 - armReturn * 33;
            }
            
            // Legs tuck under then stand
            footLX = -15 + risePhase * 5; footLY = 20 + risePhase * 10;
            footRX = 18 - risePhase * 3; footRY = 25 + risePhase * 5;
            kneeLX = -10 + risePhase * 2; kneeLY = 8 + risePhase * 4;
            kneeRX = 12 - risePhase * 2; kneeRY = 10 + risePhase * 2;
        }

        // ============== 3D SILHOUETTE STICKMAN RENDERING ==============
        // Creates a dark silhouette with glowing colored edges like fighting game art
        
        const drawLimb = (x1, y1, x2, y2, thickness = 8) => {
            // Draw thick black silhouette
            this.ctx.strokeStyle = '#000000';
            this.ctx.lineWidth = thickness + 4;
            this.ctx.lineCap = 'round';
            this.ctx.shadowBlur = 0;
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            
            // Draw colored glow edge
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.shadowBlur = isGhost ? 8 : 15;
            this.ctx.shadowColor = color;
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        };
        
        // Draw a full-body limb with flesh (not skeleton)
        const drawFleshLimb = (x1, y1, x2, y2, thickness = 10, isLeg = false) => {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
            
            this.ctx.save();
            this.ctx.translate(x1, y1);
            this.ctx.rotate(angle);
            
            // Flesh-colored limb body (dark silhouette)
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.shadowBlur = 0;
            
            // Tapered limb shape for realistic muscle
            const taperStart = thickness * 1.1;
            const taperEnd = thickness * 0.85;
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, -taperStart/2);
            this.ctx.quadraticCurveTo(length * 0.3, -taperStart/2 - 2, length * 0.5, -thickness/2);
            this.ctx.quadraticCurveTo(length * 0.7, -taperEnd/2, length, -taperEnd/2);
            this.ctx.lineTo(length, taperEnd/2);
            this.ctx.quadraticCurveTo(length * 0.7, taperEnd/2, length * 0.5, thickness/2);
            this.ctx.quadraticCurveTo(length * 0.3, taperStart/2 + 2, 0, taperStart/2);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Colored glow outline
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1.5;
            this.ctx.shadowBlur = isGhost ? 6 : 12;
            this.ctx.shadowColor = color;
            this.ctx.stroke();
            
            // Inner highlight for 3D effect
            const grad = this.ctx.createLinearGradient(0, -thickness/2, 0, thickness/2);
            grad.addColorStop(0, 'rgba(255,255,255,0.12)');
            grad.addColorStop(0.3, 'rgba(255,255,255,0.03)');
            grad.addColorStop(1, 'rgba(0,0,0,0.15)');
            this.ctx.fillStyle = grad;
            this.ctx.shadowBlur = 0;
            this.ctx.fill();
            
            this.ctx.restore();
        };
        
        const drawFleshJoint = (cx, cy, radius = 7) => {
            // Dark body joint
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.shadowBlur = 0;
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Colored glow ring
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1.5;
            this.ctx.shadowBlur = isGhost ? 6 : 10;
            this.ctx.shadowColor = color;
            this.ctx.stroke();
            
            // 3D highlight
            const grad = this.ctx.createRadialGradient(cx - radius*0.3, cy - radius*0.3, 0, cx, cy, radius);
            grad.addColorStop(0, 'rgba(255,255,255,0.15)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = grad;
            this.ctx.shadowBlur = 0;
            this.ctx.fill();
        };
        
        const drawFleshHead = (cy, radius = 14) => {
            // Shadow underneath
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.shadowBlur = 0;
            this.ctx.beginPath();
            this.ctx.ellipse(3, cy + radius * 0.6, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Dark silhouette head
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.beginPath();
            this.ctx.arc(0, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Colored glow outline
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.shadowBlur = isGhost ? 8 : 18;
            this.ctx.shadowColor = color;
            this.ctx.stroke();
            
            // Inner 3D highlight
            const gradient = this.ctx.createRadialGradient(-radius*0.25, cy - radius*0.25, 0, 0, cy, radius);
            gradient.addColorStop(0, 'rgba(255,255,255,0.18)');
            gradient.addColorStop(0.4, 'rgba(255,255,255,0.05)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = gradient;
            this.ctx.shadowBlur = 0;
            this.ctx.fill();
        };
        
        const drawFleshTorso = (topY, bottomY) => {
            const shoulderWidth = 18;
            const waistWidth = 12;
            const height = bottomY - topY;
            
            // Shadow
            this.ctx.fillStyle = 'rgba(0,0,0,0.25)';
            this.ctx.shadowBlur = 0;
            this.ctx.beginPath();
            this.ctx.ellipse(4, bottomY + 4, waistWidth * 0.8, 5, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Full body torso shape
            this.ctx.fillStyle = '#0a0a0a';
            this.ctx.beginPath();
            // Shoulders
            this.ctx.moveTo(-shoulderWidth, topY + 5);
            // Left side - chest to waist
            this.ctx.quadraticCurveTo(-shoulderWidth * 1.1, topY + height * 0.3, -waistWidth * 1.2, topY + height * 0.5);
            this.ctx.quadraticCurveTo(-waistWidth, topY + height * 0.8, -waistWidth * 0.8, bottomY);
            // Bottom
            this.ctx.lineTo(waistWidth * 0.8, bottomY);
            // Right side - waist to chest
            this.ctx.quadraticCurveTo(waistWidth, topY + height * 0.8, waistWidth * 1.2, topY + height * 0.5);
            this.ctx.quadraticCurveTo(shoulderWidth * 1.1, topY + height * 0.3, shoulderWidth, topY + 5);
            // Top (neck area)
            this.ctx.quadraticCurveTo(shoulderWidth * 0.3, topY - 3, 0, topY - 5);
            this.ctx.quadraticCurveTo(-shoulderWidth * 0.3, topY - 3, -shoulderWidth, topY + 5);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Colored glow outline
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1.5;
            this.ctx.shadowBlur = isGhost ? 6 : 14;
            this.ctx.shadowColor = color;
            this.ctx.stroke();
            
            // Inner 3D gradient (chest definition)
            const gradient = this.ctx.createLinearGradient(-shoulderWidth, topY, shoulderWidth, bottomY);
            gradient.addColorStop(0, 'rgba(255,255,255,0.12)');
            gradient.addColorStop(0.2, 'rgba(255,255,255,0.05)');
            gradient.addColorStop(0.5, 'rgba(0,0,0,0.05)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
            this.ctx.fillStyle = gradient;
            this.ctx.shadowBlur = 0;
            this.ctx.fill();
        };
        
        // Draw body shadow on ground
        if (!isGhost && entity.state !== 'jump' && entity.state !== 'knockdown') {
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.shadowBlur = 0;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 35, 30, 10, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw legs first (behind body) - with flesh
        drawFleshLimb(0, torsoY + 2, kneeLX, kneeLY, 9, true);
        drawFleshLimb(kneeLX, kneeLY, footLX, footLY, 8, true);
        drawFleshJoint(kneeLX, kneeLY, 6);
        drawFleshJoint(footLX, footLY, 5);
        
        drawFleshLimb(0, torsoY + 2, kneeRX, kneeRY, 9, true);
        drawFleshLimb(kneeRX, kneeRY, footRX, footRY, 8, true);
        drawFleshJoint(kneeRX, kneeRY, 6);
        drawFleshJoint(footRX, footRY, 5);
        
        // Draw torso with full body
        drawFleshTorso(headY + 10, torsoY + 5);
        
        // Draw arms with flesh
        const shoulderY = headY + 14;
        drawFleshLimb(0, shoulderY, elbowLX, elbowLY, 7);
        drawFleshLimb(elbowLX, elbowLY, handLX, handLY, 6);
        drawFleshJoint(elbowLX, elbowLY, 5);
        drawFleshJoint(handLX, handLY, 6); // Fist is slightly larger
        
        drawFleshLimb(0, shoulderY, elbowRX, elbowRY, 7);
        drawFleshLimb(elbowRX, elbowRY, handRX, handRY, 6);
        drawFleshJoint(elbowRX, elbowRY, 5);
        drawFleshJoint(handRX, handRY, 6);
        
        // Draw head last (on top)
        drawFleshHead(headY, 13);
        
        // Add energy aura effect for special states
        if (entity.state === 'dash' || entity.state === 'special_startup') {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1;
            this.ctx.shadowBlur = 25;
            this.ctx.shadowColor = color;
            this.ctx.globalAlpha = 0.3 + Math.sin(t * 20) * 0.2;
            this.ctx.beginPath();
            this.ctx.ellipse(0, -15, 35 + Math.sin(t * 15) * 5, 55 + Math.cos(t * 12) * 5, 0, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
        }
        
        // Hit flash effect - SMALLER SIZE
        if (entity.state === 'hitstun' || entity.state === 'blockstun') {
            this.ctx.globalAlpha = 0.25 + Math.sin(t * 30) * 0.15;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(0, -20, 18, 0, Math.PI * 2); // Reduced from 40 to 18
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }
        
        this.ctx.restore();
    }

    drawParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Handle character-specific particles and skill hit effects
            if (p.kind.startsWith('ice_') || p.kind.startsWith('fire_') || 
                p.kind.startsWith('electric_') || p.kind.startsWith('lightning_trail') ||
                p.kind.startsWith('frost_') || p.kind.startsWith('flame_')) {
                if (this.drawCharacterParticle(p)) {
                    this.particles.splice(i, 1);
                }
                continue;
            }

            p.life -= 0.05;
            p.x += p.vx;
            p.y += p.vy;
            if (p.kind === 'spark') {
                p.rot += (p.rotV || 0);
                // Mild gravity
                p.vy += 0.4;
                // Fast drag
                p.vx *= 0.92;
                p.vy *= 0.92;
            }
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            
            if (p.kind === 'spark') {
                this.ctx.save();
                this.ctx.globalAlpha = Math.min(1, p.life * 1.2);
                this.ctx.translate(p.x, p.y);
                this.ctx.rotate(p.rot || 0);

                // Bright core
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = p.width || 2;
                this.ctx.shadowColor = p.color;
                this.ctx.shadowBlur = 14;
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo((p.length || 18) * p.life, 0);
                this.ctx.stroke();

                // White hot tip
                this.ctx.shadowBlur = 0;
                this.ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                this.ctx.lineWidth = Math.max(1, (p.width || 2) - 1);
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo(Math.max(2, (p.length || 18) * p.life * 0.35), 0);
                this.ctx.stroke();

                this.ctx.restore();
            } else {
                this.ctx.globalAlpha = p.life;
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawGlitch() {
        const slices = 10;
        const maxOffset = 20;
        
        for (let i = 0; i < slices; i++) {
            const y = Math.random() * this.height;
            const h = Math.random() * 50;
            const offset = (Math.random() - 0.5) * maxOffset;
            
            // Copy a slice and draw it offset
            try {
                this.ctx.drawImage(this.canvas, 
                    0, y, this.width, h, 
                    offset, y, this.width, h
                );
                
                this.ctx.fillStyle = `rgba(${Math.random()>0.5?255:0}, ${Math.random()>0.5?255:0}, 255, 0.1)`;
                this.ctx.fillRect(0, y, this.width, h);
            } catch(e) {
                // Ignore drawImage errors if canvas is not ready
            }
        }
    }

    // ==========================================
    // PROJECTILE CLASH - GOD TIER ANIMATION
    // ==========================================
    
    triggerProjectileClash(x, y, color1, color2) {
        // Create epic clash effect at collision point
        const clashEffect = {
            x: x,
            y: y,
            life: 1.0,
            maxLife: 1.0,
            color1: color1,
            color2: color2,
            rotation: Math.random() * Math.PI * 2,
            pulsePhase: 0
        };
        this.clashEffects.push(clashEffect);

        // Create multiple expanding shockwaves
        for (let i = 0; i < 3; i++) {
            this.clashShockwaves.push({
                x: x,
                y: y,
                radius: 10 + i * 15,
                maxRadius: 200 + i * 80,
                life: 1.0 - i * 0.15,
                thickness: 8 - i * 2,
                color1: color1,
                color2: color2,
                delay: i * 0.08
            });
        }

        // Spawn god-tier particles - energy explosion
        this.spawnClashParticles(x, y, color1, color2);

        // Extra screen shake for clash
        this.triggerShake(25, 0.5);

        // Epic impact flash - white hot center
        this.triggerImpactFlash('rgba(255, 255, 255, 0.8)', 0.7, 0.15);

        // Trigger glitch for extra impact
        this.triggerGlitch(0.15);
    }

    spawnClashParticles(x, y, color1, color2) {
        const colors = [color1, color2, '#ffffff', '#ffff00', '#00ffff', '#ff00ff'];
        
        // Central explosion burst - radial sparks
        for (let i = 0; i < 40; i++) {
            const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
            const speed = 15 + Math.random() * 25;
            const color = colors[Math.floor(Math.random() * colors.length)];
            this.particles.push({
                kind: 'spark',
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 5,
                life: 1.2 + Math.random() * 0.5,
                color: color,
                length: 20 + Math.random() * 35,
                width: 2 + Math.random() * 3,
                rot: angle,
                rotV: (Math.random() - 0.5) * 0.5
            });
        }

        // Energy orbs flying outward
        for (let i = 0; i < 25; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 8 + Math.random() * 15;
            this.particles.push({
                kind: 'energy_orb',
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - Math.random() * 8,
                life: 1.0 + Math.random() * 0.8,
                color: i % 2 === 0 ? color1 : color2,
                size: 4 + Math.random() * 8,
                pulseSpeed: 10 + Math.random() * 10
            });
        }

        // Lightning bolt fragments
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const length = 40 + Math.random() * 60;
            this.particles.push({
                kind: 'lightning',
                x: x,
                y: y,
                angle: angle,
                length: length,
                life: 0.4 + Math.random() * 0.3,
                color: Math.random() > 0.5 ? color1 : color2,
                branches: Math.floor(2 + Math.random() * 3)
            });
        }

        // Smoke/dust cloud
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 6;
            this.particles.push({
                kind: 'smoke',
                x: x + (Math.random() - 0.5) * 40,
                y: y + (Math.random() - 0.5) * 40,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 1.5 + Math.random() * 0.5,
                size: 15 + Math.random() * 25,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 2
            });
        }

        // Star burst effect
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            this.particles.push({
                kind: 'star_burst',
                x: x,
                y: y,
                angle: angle,
                life: 0.8,
                maxLength: 120 + Math.random() * 40,
                color: i % 2 === 0 ? color1 : color2
            });
        }
    }

    drawClashEffects() {
        const dt = 0.016;

        // Draw and update shockwaves
        for (let i = this.clashShockwaves.length - 1; i >= 0; i--) {
            const sw = this.clashShockwaves[i];
            
            if (sw.delay > 0) {
                sw.delay -= dt;
                continue;
            }

            sw.life -= dt * 1.5;
            const progress = 1 - sw.life;
            sw.radius = sw.radius + (sw.maxRadius - sw.radius) * 0.15;

            if (sw.life <= 0) {
                this.clashShockwaves.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = sw.life * 0.8;

            // Dual-color gradient shockwave
            const gradient = this.ctx.createRadialGradient(
                sw.x, sw.y, sw.radius * 0.8,
                sw.x, sw.y, sw.radius
            );
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(0.5, sw.color1);
            gradient.addColorStop(0.7, sw.color2);
            gradient.addColorStop(1, 'transparent');

            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = sw.thickness * sw.life;
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = sw.color1;

            this.ctx.beginPath();
            this.ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
            this.ctx.stroke();

            // Inner bright ring
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = sw.thickness * sw.life * 0.5;
            this.ctx.beginPath();
            this.ctx.arc(sw.x, sw.y, sw.radius * 0.95, 0, Math.PI * 2);
            this.ctx.stroke();

            this.ctx.restore();
        }

        // Draw and update main clash effects
        for (let i = this.clashEffects.length - 1; i >= 0; i--) {
            const effect = this.clashEffects[i];
            effect.life -= dt * 1.2;
            effect.rotation += dt * 8;
            effect.pulsePhase += dt * 20;

            if (effect.life <= 0) {
                this.clashEffects.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.translate(effect.x, effect.y);

            const lifeRatio = effect.life / effect.maxLife;
            const pulse = Math.sin(effect.pulsePhase) * 0.3 + 1;

            // Helper to convert any color to rgba
            const toRgba = (color, alpha) => {
                if (color.startsWith('#')) {
                    const hex = color.slice(1);
                    const r = parseInt(hex.substr(0, 2), 16);
                    const g = parseInt(hex.substr(2, 2), 16);
                    const b = parseInt(hex.substr(4, 2), 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                } else if (color.startsWith('rgb(')) {
                    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
                } else if (color.startsWith('rgba(')) {
                    return color.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
                }
                return `rgba(255, 255, 255, ${alpha})`;
            };

            // Central explosion glow
            const glowSize = (80 + (1 - lifeRatio) * 40) * pulse;
            const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${lifeRatio * 0.9})`);
            gradient.addColorStop(0.2, toRgba(effect.color1, lifeRatio * 0.7));
            gradient.addColorStop(0.5, toRgba(effect.color2, lifeRatio * 0.5));
            gradient.addColorStop(1, 'transparent');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
            this.ctx.fill();

            // Rotating energy cross
            this.ctx.rotate(effect.rotation);
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 4 * lifeRatio;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = effect.color1;
            this.ctx.globalAlpha = lifeRatio * 0.8;

            const crossSize = 60 * lifeRatio * pulse;
            for (let j = 0; j < 4; j++) {
                this.ctx.save();
                this.ctx.rotate(j * Math.PI / 2);
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo(crossSize, 0);
                this.ctx.stroke();
                this.ctx.restore();
            }

            // Spinning energy arcs
            this.ctx.strokeStyle = effect.color1;
            this.ctx.lineWidth = 3 * lifeRatio;
            for (let j = 0; j < 6; j++) {
                const arcStart = (j / 6) * Math.PI * 2 + effect.rotation * 0.5;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 35 * pulse, arcStart, arcStart + 0.4);
                this.ctx.stroke();
            }

            this.ctx.restore();
        }

        // Draw special particle types
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            if (p.kind === 'energy_orb') {
                p.life -= 0.025;
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.3; // gravity
                p.vx *= 0.98;
                p.vy *= 0.98;

                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                const pulse = Math.sin(Date.now() / 1000 * p.pulseSpeed) * 0.3 + 1;
                this.ctx.save();
                this.ctx.globalAlpha = p.life * 0.9;

                const gradient = this.ctx.createRadialGradient(
                    p.x, p.y, 0,
                    p.x, p.y, p.size * pulse
                );
                gradient.addColorStop(0, '#ffffff');
                gradient.addColorStop(0.4, p.color);
                gradient.addColorStop(1, 'transparent');

                this.ctx.fillStyle = gradient;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * pulse, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.restore();
            } else if (p.kind === 'lightning') {
                p.life -= 0.05;

                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                this.ctx.save();
                this.ctx.globalAlpha = p.life * 0.9;
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = 2;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = p.color;

                this.drawLightningBolt(p.x, p.y, p.angle, p.length * p.life, p.branches);

                this.ctx.restore();
            } else if (p.kind === 'smoke') {
                p.life -= 0.02;
                p.x += p.vx;
                p.y += p.vy;
                p.vy -= 0.1; // rise
                p.vx *= 0.98;
                p.size += 0.5;
                p.rotation += p.rotSpeed * 0.05;

                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                this.ctx.save();
                this.ctx.globalAlpha = p.life * 0.4;
                this.ctx.translate(p.x, p.y);
                this.ctx.rotate(p.rotation);

                const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
                gradient.addColorStop(0, 'rgba(150, 150, 150, 0.5)');
                gradient.addColorStop(1, 'transparent');

                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.restore();
            } else if (p.kind === 'star_burst') {
                p.life -= 0.03;

                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }

                const currentLength = p.maxLength * (1 - p.life);
                
                this.ctx.save();
                this.ctx.globalAlpha = p.life;
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = 4 * p.life;
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = p.color;

                this.ctx.beginPath();
                this.ctx.moveTo(p.x, p.y);
                this.ctx.lineTo(
                    p.x + Math.cos(p.angle) * currentLength,
                    p.y + Math.sin(p.angle) * currentLength
                );
                this.ctx.stroke();

                // Bright tip
                this.ctx.fillStyle = '#ffffff';
                this.ctx.beginPath();
                this.ctx.arc(
                    p.x + Math.cos(p.angle) * currentLength,
                    p.y + Math.sin(p.angle) * currentLength,
                    3 * p.life,
                    0, Math.PI * 2
                );
                this.ctx.fill();

                this.ctx.restore();
            }
        }
    }

    drawLightningBolt(x, y, angle, length, branches) {
        const segments = 6;
        const segLength = length / segments;
        let currentX = x;
        let currentY = y;

        this.ctx.beginPath();
        this.ctx.moveTo(currentX, currentY);

        for (let i = 0; i < segments; i++) {
            const deviation = (Math.random() - 0.5) * 30;
            const nextX = currentX + Math.cos(angle) * segLength + Math.cos(angle + Math.PI/2) * deviation;
            const nextY = currentY + Math.sin(angle) * segLength + Math.sin(angle + Math.PI/2) * deviation;
            
            this.ctx.lineTo(nextX, nextY);

            // Random branches
            if (branches > 0 && Math.random() > 0.6) {
                const branchAngle = angle + (Math.random() - 0.5) * Math.PI * 0.5;
                const branchLength = segLength * (0.3 + Math.random() * 0.4);
                const bx = nextX + Math.cos(branchAngle) * branchLength;
                const by = nextY + Math.sin(branchAngle) * branchLength;
                
                this.ctx.moveTo(nextX, nextY);
                this.ctx.lineTo(bx, by);
                this.ctx.moveTo(nextX, nextY);
            }

            currentX = nextX;
            currentY = nextY;
        }

        this.ctx.stroke();
    }

    // ==========================================
    // CHARACTER-SPECIFIC VISUAL EFFECTS (GOD TIER)
    // ==========================================

    drawCharacterAura(entity) {
        const x = entity.x;
        const y = entity.y - 30;
        const t = Date.now() / 1000;
        const charId = entity.characterId;

        this.ctx.save();

        if (charId === 'ice') {
            // ICE AURA - Frozen mist and crystalline glow
            const pulse = Math.sin(t * 3) * 0.2 + 0.8;
            
            // Outer cold mist
            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 60 * pulse);
            gradient.addColorStop(0, 'rgba(0, 212, 255, 0.15)');
            gradient.addColorStop(0.5, 'rgba(100, 200, 255, 0.08)');
            gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 60 * pulse, 0, Math.PI * 2);
            this.ctx.fill();

            // Floating ice crystals
            for (let i = 0; i < 6; i++) {
                const angle = (t * 0.5 + i * Math.PI / 3);
                const dist = 35 + Math.sin(t * 2 + i) * 8;
                const cx = x + Math.cos(angle) * dist;
                const cy = y + Math.sin(angle) * dist * 0.6;
                const size = 4 + Math.sin(t * 3 + i) * 2;

                this.ctx.save();
                this.ctx.translate(cx, cy);
                this.ctx.rotate(t * 2 + i);
                this.ctx.fillStyle = 'rgba(200, 240, 255, 0.6)';
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = '#00d4ff';
                
                // Diamond shape
                this.ctx.beginPath();
                this.ctx.moveTo(0, -size);
                this.ctx.lineTo(size * 0.6, 0);
                this.ctx.lineTo(0, size);
                this.ctx.lineTo(-size * 0.6, 0);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.restore();
            }

        } else if (charId === 'fire') {
            // FIRE AURA - Blazing flames and ember glow
            const pulse = Math.sin(t * 4) * 0.15 + 0.85;
            
            // Inner heat glow
            const gradient = this.ctx.createRadialGradient(x, y + 10, 0, x, y, 70 * pulse);
            gradient.addColorStop(0, 'rgba(255, 100, 0, 0.2)');
            gradient.addColorStop(0.4, 'rgba(255, 50, 0, 0.1)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 70 * pulse, 0, Math.PI * 2);
            this.ctx.fill();

            // Rising flame wisps
            for (let i = 0; i < 5; i++) {
                const xOff = Math.sin(t * 3 + i * 1.2) * 20;
                const yOff = ((t * 80 + i * 50) % 80) - 40;
                const alpha = 1 - Math.abs(yOff) / 40;
                const flameX = x + xOff + (i - 2) * 12;
                const flameY = y + yOff;
                
                this.ctx.save();
                this.ctx.globalAlpha = alpha * 0.5;
                this.ctx.fillStyle = i % 2 === 0 ? '#ff6600' : '#ffaa00';
                this.ctx.shadowBlur = 12;
                this.ctx.shadowColor = '#ff4400';
                
                // Flame shape
                this.ctx.beginPath();
                this.ctx.moveTo(flameX, flameY + 15);
                this.ctx.quadraticCurveTo(flameX - 8, flameY, flameX, flameY - 15);
                this.ctx.quadraticCurveTo(flameX + 8, flameY, flameX, flameY + 15);
                this.ctx.fill();
                this.ctx.restore();
            }

        } else if (charId === 'lightning') {
            // LIGHTNING AURA - Electric crackle and energy field
            const pulse = Math.sin(t * 6) * 0.25 + 0.75;
            
            // Electric field
            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 55 * pulse);
            gradient.addColorStop(0, 'rgba(255, 221, 0, 0.15)');
            gradient.addColorStop(0.5, 'rgba(255, 255, 100, 0.08)');
            gradient.addColorStop(1, 'rgba(255, 221, 0, 0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 55 * pulse, 0, Math.PI * 2);
            this.ctx.fill();

            // Random electric arcs
            if (Math.random() > 0.7) {
                this.ctx.strokeStyle = '#ffdd00';
                this.ctx.lineWidth = 1.5;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#ffdd00';
                
                const arcAngle = Math.random() * Math.PI * 2;
                const arcDist = 25 + Math.random() * 20;
                this.drawLightningBolt(
                    x, y, 
                    arcAngle, 
                    arcDist, 
                    1
                );
            }
        }

        this.ctx.restore();
    }

    drawCharacterEffects(entity) {
        const x = entity.x;
        const y = entity.y;
        const t = Date.now() / 1000;
        const charId = entity.characterId;

        // Spawn character-specific particles during attacks
        if (entity.state && entity.state.startsWith('attack_')) {
            this.spawnAttackParticles(entity);
        }

        // Character trail effects during movement
        if (entity.state === 'move' || entity.state === 'dash') {
            this.spawnMovementTrail(entity);
        }
    }

    spawnAttackParticles(entity) {
        const x = entity.x + entity.facing * 30;
        const y = entity.y - 30;
        const charId = entity.characterId;

        // Only spawn occasionally
        if (Math.random() > 0.3) return;

        if (charId === 'ice') {
            // Ice shards
            this.particles.push({
                kind: 'ice_shard',
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 40,
                vx: entity.facing * (2 + Math.random() * 3),
                vy: (Math.random() - 0.5) * 2,
                life: 0.5 + Math.random() * 0.3,
                size: 3 + Math.random() * 4,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 8
            });
        } else if (charId === 'fire') {
            // Fire sparks
            this.particles.push({
                kind: 'fire_spark',
                x: x + (Math.random() - 0.5) * 20,
                y: y + (Math.random() - 0.5) * 40,
                vx: entity.facing * (3 + Math.random() * 4),
                vy: -2 - Math.random() * 3,
                life: 0.4 + Math.random() * 0.3,
                size: 2 + Math.random() * 3
            });
        } else if (charId === 'lightning') {
            // Electric sparks
            this.particles.push({
                kind: 'electric_spark',
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 50,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 0.2 + Math.random() * 0.2,
                size: 2 + Math.random() * 2
            });
        }
    }

    spawnMovementTrail(entity) {
        const x = entity.x;
        const y = entity.y - 30;
        const charId = entity.characterId;

        if (Math.random() > 0.4) return;

        if (charId === 'ice') {
            this.particles.push({
                kind: 'ice_trail',
                x: x + (Math.random() - 0.5) * 10,
                y: y + Math.random() * 30,
                vx: -entity.facing * 0.5,
                vy: 0.5,
                life: 0.4,
                size: 4 + Math.random() * 3
            });
        } else if (charId === 'fire') {
            this.particles.push({
                kind: 'fire_trail',
                x: x + (Math.random() - 0.5) * 10,
                y: y + Math.random() * 30,
                vx: -entity.facing * 0.3,
                vy: -1.5,
                life: 0.5,
                size: 5 + Math.random() * 4
            });
        } else if (charId === 'lightning') {
            this.particles.push({
                kind: 'lightning_trail',
                x: x + (Math.random() - 0.5) * 15,
                y: y + Math.random() * 30,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                life: 0.15,
                size: 2
            });
        }
    }

    // ============================================
    // GOD-TIER STATUS EFFECT VISUAL SYSTEM
    // Epic visual feedback for character skill effects
    // ============================================
    drawStatusEffects(entity) {
        if (!entity.statusEffects) return;

        const x = entity.x;
        const y = entity.y;
        const t = Date.now() / 1000;

        this.ctx.save();

        // ========== FREEZE EFFECT - FROZEN IN ICE ==========
        // Complete ice encasement - opponent is FROZEN SOLID for 5 seconds
        if (entity.isFrozen) {
            // ICE BLOCK ENCASEMENT
            this.ctx.save();
            
            // Outer ice glow
            this.ctx.shadowBlur = 40;
            this.ctx.shadowColor = '#00d4ff';
            
            // Main ice block shape - covers entire body
            const iceWidth = 55;
            const iceHeight = 95;
            
            // Ice block gradient - crystalline look
            const iceGrad = this.ctx.createLinearGradient(x - iceWidth, y - 80, x + iceWidth, y + 20);
            iceGrad.addColorStop(0, 'rgba(180, 240, 255, 0.7)');
            iceGrad.addColorStop(0.3, 'rgba(100, 200, 255, 0.5)');
            iceGrad.addColorStop(0.5, 'rgba(150, 230, 255, 0.6)');
            iceGrad.addColorStop(0.7, 'rgba(80, 180, 255, 0.5)');
            iceGrad.addColorStop(1, 'rgba(200, 250, 255, 0.7)');
            
            // Draw main ice block
            this.ctx.fillStyle = iceGrad;
            this.ctx.beginPath();
            // Irregular ice block shape
            this.ctx.moveTo(x - iceWidth * 0.8, y - 75);
            this.ctx.lineTo(x - iceWidth, y - 40);
            this.ctx.lineTo(x - iceWidth * 0.9, y + 10);
            this.ctx.lineTo(x - iceWidth * 0.5, y + 20);
            this.ctx.lineTo(x + iceWidth * 0.5, y + 20);
            this.ctx.lineTo(x + iceWidth * 0.9, y + 10);
            this.ctx.lineTo(x + iceWidth, y - 40);
            this.ctx.lineTo(x + iceWidth * 0.8, y - 75);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Ice surface highlights - makes it look 3D crystalline
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x - iceWidth * 0.6, y - 70);
            this.ctx.lineTo(x - iceWidth * 0.75, y - 45);
            this.ctx.moveTo(x - iceWidth * 0.5, y - 65);
            this.ctx.lineTo(x - iceWidth * 0.7, y - 25);
            this.ctx.stroke();
            
            // Frost crystals on surface - animated
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1.5;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2 + t * 0.5;
                const cx = x + Math.cos(angle * 2 + i) * 25;
                const cy = y - 30 + Math.sin(angle * 3) * 30;
                this.drawFrostCrystal(cx, cy, 8 + Math.sin(t * 2 + i) * 3, angle);
            }
            
            // Ice cracks pattern - static and animated
            this.ctx.strokeStyle = 'rgba(200, 250, 255, 0.8)';
            this.ctx.lineWidth = 1;
            for (let i = 0; i < 12; i++) {
                const startX = x + (Math.sin(i * 1.3) * 35);
                const startY = y - 30 + (Math.cos(i * 1.7) * 40);
                this.drawIceCrack(startX, startY, i * 0.5, 3);
            }
            
            // Floating ice particles around frozen entity
            for (let i = 0; i < 6; i++) {
                const particleAngle = t * 1.5 + (i / 6) * Math.PI * 2;
                const radius = 45 + Math.sin(t * 3 + i) * 10;
                const px = x + Math.cos(particleAngle) * radius;
                const py = y - 30 + Math.sin(particleAngle * 0.7) * 40;
                
                this.ctx.globalAlpha = 0.6 + Math.sin(t * 4 + i) * 0.3;
                this.ctx.fillStyle = '#b0f0ff';
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = '#00d4ff';
                this.ctx.beginPath();
                this.ctx.arc(px, py, 3 + Math.sin(t * 2 + i) * 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            // Cold mist at the bottom
            this.ctx.globalAlpha = 0.4;
            const mistGrad = this.ctx.createRadialGradient(x, y + 15, 0, x, y + 15, 60);
            mistGrad.addColorStop(0, 'rgba(180, 230, 255, 0.5)');
            mistGrad.addColorStop(1, 'transparent');
            this.ctx.fillStyle = mistGrad;
            this.ctx.beginPath();
            this.ctx.ellipse(x, y + 15, 60, 20, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // FROZEN text indicator
            this.ctx.globalAlpha = 0.8 + Math.sin(t * 5) * 0.2;
            this.ctx.fillStyle = '#00d4ff';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#00d4ff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('FROZEN', x, y - 95);
            
            this.ctx.restore();
        }

        // Get active effects for burn and shock
        const activeEffects = entity.statusEffects?.getActiveEffects?.() || [];
        const burnEffect = activeEffects.find(e => e.type === 'burn');
        const shockEffect = activeEffects.find(e => e.type === 'shock');
        const hasBurn = !!burnEffect;
        const hasShock = !!shockEffect;

        // ========== BURN EFFECT - ENGULFED IN FLAMES ==========
        // Opponent is ON FIRE, losing 5 HP per second
        if (hasBurn) {
            this.ctx.save();
            
            // Multiple flame layers for depth
            for (let layer = 0; layer < 3; layer++) {
                const layerOffset = layer * 0.3;
                
                // Draw flames around body
                for (let i = 0; i < 12; i++) {
                    const baseX = x + (i - 6) * 8 + Math.sin(t * 8 + i) * 5;
                    const baseY = y + 5;
                    const flameHeight = 40 + Math.sin(t * 10 + i * 0.5) * 20 + layer * 15;
                    const flameWidth = 12 + Math.sin(t * 6 + i) * 4;
                    
                    // Flame gradient - white core to red tips
                    const flameGrad = this.ctx.createLinearGradient(baseX, baseY, baseX, baseY - flameHeight);
                    if (layer === 0) {
                        flameGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                        flameGrad.addColorStop(0.2, 'rgba(255, 255, 0, 0.8)');
                        flameGrad.addColorStop(0.5, 'rgba(255, 150, 0, 0.7)');
                        flameGrad.addColorStop(0.8, 'rgba(255, 50, 0, 0.5)');
                        flameGrad.addColorStop(1, 'rgba(200, 0, 0, 0)');
                    } else {
                        flameGrad.addColorStop(0, 'rgba(255, 200, 50, 0.6)');
                        flameGrad.addColorStop(0.5, 'rgba(255, 100, 0, 0.4)');
                        flameGrad.addColorStop(1, 'transparent');
                    }
                    
                    this.ctx.fillStyle = flameGrad;
                    this.ctx.shadowBlur = layer === 0 ? 20 : 10;
                    this.ctx.shadowColor = '#ff4400';
                    
                    // Draw animated flame shape
                    this.ctx.beginPath();
                    this.ctx.moveTo(baseX - flameWidth / 2, baseY);
                    
                    // Wavy flame edges
                    const segments = 5;
                    for (let s = 0; s <= segments; s++) {
                        const segY = baseY - (s / segments) * flameHeight;
                        const waveMod = Math.sin(t * 15 + i + s + layerOffset) * (flameWidth / 3);
                        const segWidth = flameWidth * (1 - s / segments * 0.8);
                        
                        if (s === segments) {
                            // Flame tip
                            this.ctx.lineTo(baseX + waveMod, segY);
                        } else {
                            this.ctx.quadraticCurveTo(
                                baseX - segWidth / 2 + waveMod, segY - flameHeight / segments / 2,
                                baseX + waveMod * 0.5, segY
                            );
                        }
                    }
                    
                    // Right side
                    for (let s = segments - 1; s >= 0; s--) {
                        const segY = baseY - (s / segments) * flameHeight;
                        const waveMod = Math.sin(t * 15 + i + s + Math.PI + layerOffset) * (flameWidth / 3);
                        const segWidth = flameWidth * (1 - s / segments * 0.8);
                        this.ctx.quadraticCurveTo(
                            baseX + segWidth / 2 + waveMod, segY - flameHeight / segments / 2,
                            baseX + waveMod * 0.5, segY
                        );
                    }
                    
                    this.ctx.closePath();
                    this.ctx.fill();
                }
            }
            
            // Fire embers floating up
            for (let i = 0; i < 15; i++) {
                const emberLife = (t * 2 + i * 0.3) % 1;
                const emberX = x + (Math.sin(i * 2.5 + t) * 30);
                const emberY = y - emberLife * 120;
                const emberSize = (1 - emberLife) * 4 + 1;
                
                this.ctx.globalAlpha = (1 - emberLife) * 0.8;
                this.ctx.fillStyle = Math.random() > 0.5 ? '#ffff00' : '#ff6600';
                this.ctx.shadowBlur = 5;
                this.ctx.shadowColor = '#ff4400';
                this.ctx.beginPath();
                this.ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            // Heat distortion glow
            this.ctx.globalAlpha = 0.3;
            const heatGrad = this.ctx.createRadialGradient(x, y - 30, 10, x, y - 30, 80);
            heatGrad.addColorStop(0, 'rgba(255, 100, 0, 0.4)');
            heatGrad.addColorStop(0.5, 'rgba(255, 50, 0, 0.2)');
            heatGrad.addColorStop(1, 'transparent');
            this.ctx.fillStyle = heatGrad;
            this.ctx.beginPath();
            this.ctx.ellipse(x, y - 30, 80, 70, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // BURNING text with damage indicator
            this.ctx.globalAlpha = 0.9;
            this.ctx.fillStyle = '#ff4400';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#ff0000';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('BURNING -5 HP/s', x, y - 100 + Math.sin(t * 8) * 3);
            
            this.ctx.restore();
        }

        // ========== SHOCK EFFECT - ELECTROCUTED ==========
        // Opponent is being SHOCKED - 50% movement slow
        if (hasShock) {
            this.ctx.save();
            
            // Electric aura around body
            this.ctx.globalAlpha = 0.4;
            const auraGrad = this.ctx.createRadialGradient(x, y - 30, 10, x, y - 30, 70);
            auraGrad.addColorStop(0, 'rgba(255, 255, 100, 0.5)');
            auraGrad.addColorStop(0.5, 'rgba(255, 221, 0, 0.3)');
            auraGrad.addColorStop(1, 'transparent');
            this.ctx.fillStyle = auraGrad;
            this.ctx.beginPath();
            this.ctx.ellipse(x, y - 30, 60, 55, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Multiple lightning bolts arcing around body
            this.ctx.globalAlpha = 0.9;
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = '#ffdd00';
            
            for (let i = 0; i < 8; i++) {
                const angle = (t * 3 + i * Math.PI / 4) % (Math.PI * 2);
                const startX = x + Math.cos(angle) * 35;
                const startY = y - 30 + Math.sin(angle) * 45;
                const endAngle = angle + Math.PI * (0.3 + Math.random() * 0.4);
                const endX = x + Math.cos(endAngle) * 35;
                const endY = y - 30 + Math.sin(endAngle) * 45;
                
                this.ctx.lineWidth = 2 + Math.random();
                this.drawLightningArc(startX, startY, endX, endY, 4);
            }
            
            // Electric sparks shooting out
            for (let i = 0; i < 12; i++) {
                const sparkAngle = t * 5 + i * 0.5;
                const sparkDist = 30 + Math.sin(sparkAngle * 3) * 20;
                const sparkX = x + Math.cos(sparkAngle) * sparkDist;
                const sparkY = y - 30 + Math.sin(sparkAngle * 0.7) * sparkDist;
                
                this.ctx.globalAlpha = 0.7 + Math.sin(t * 10 + i) * 0.3;
                this.ctx.fillStyle = '#ffff88';
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#ffdd00';
                this.ctx.beginPath();
                this.ctx.arc(sparkX, sparkY, 2 + Math.random() * 2, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Mini lightning from spark
                if (Math.random() > 0.7) {
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(sparkX, sparkY);
                    this.ctx.lineTo(
                        sparkX + (Math.random() - 0.5) * 15,
                        sparkY + (Math.random() - 0.5) * 15
                    );
                    this.ctx.stroke();
                }
            }
            
            // Body outline electric pulses
            this.ctx.globalAlpha = 0.6 + Math.sin(t * 15) * 0.3;
            this.ctx.strokeStyle = '#ffdd00';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.ellipse(x, y - 30, 28 + Math.sin(t * 20) * 3, 48, 0, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // SHOCKED text
            this.ctx.globalAlpha = 0.9;
            this.ctx.fillStyle = '#ffdd00';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#ffaa00';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('SHOCKED -50% SPD', x, y - 100 + Math.sin(t * 10) * 2);
            
            this.ctx.restore();
        }

        // ========== SPEED BOOST EFFECT (Lightning user gets this) ==========
        const speedBoostEffect = activeEffects.find(e => e.type === 'speedBoost');
        if (speedBoostEffect) {
            this.ctx.save();
            
            // Yellow speed lines trailing behind
            this.ctx.globalAlpha = 0.6;
            this.ctx.strokeStyle = '#ffdd00';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#ffdd00';
            this.ctx.lineWidth = 2;
            
            for (let i = 0; i < 6; i++) {
                const lineY = y - 60 + i * 15;
                const offset = Math.sin(t * 10 + i) * 10;
                this.ctx.globalAlpha = 0.3 + (1 - i / 6) * 0.4;
                this.ctx.beginPath();
                this.ctx.moveTo(x - entity.facing * 50 + offset, lineY);
                this.ctx.lineTo(x - entity.facing * 100 + offset, lineY);
                this.ctx.stroke();
            }
            
            // Electric aura on self (positive effect)
            this.ctx.globalAlpha = 0.3;
            const boostGrad = this.ctx.createRadialGradient(x, y - 30, 10, x, y - 30, 50);
            boostGrad.addColorStop(0, 'rgba(255, 255, 150, 0.4)');
            boostGrad.addColorStop(1, 'transparent');
            this.ctx.fillStyle = boostGrad;
            this.ctx.beginPath();
            this.ctx.ellipse(x, y - 30, 50, 45, 0, 0, Math.PI * 2);
            this.ctx.fill();
            
            // +50% SPD text
            this.ctx.globalAlpha = 0.9;
            this.ctx.fillStyle = '#88ff88';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#00ff00';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('+50% SPD', x, y - 95);
            
            this.ctx.restore();
        }

        this.ctx.restore();
    }

    // Helper: Draw frost crystal shape
    drawFrostCrystal(x, y, size, rotation) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(rotation);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 1.5;
        
        // 6-pointed ice crystal
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(Math.cos(angle) * size, Math.sin(angle) * size);
            // Add small branches
            const branchLen = size * 0.4;
            const midX = Math.cos(angle) * size * 0.6;
            const midY = Math.sin(angle) * size * 0.6;
            this.ctx.moveTo(midX, midY);
            this.ctx.lineTo(midX + Math.cos(angle + 0.5) * branchLen, midY + Math.sin(angle + 0.5) * branchLen);
            this.ctx.moveTo(midX, midY);
            this.ctx.lineTo(midX + Math.cos(angle - 0.5) * branchLen, midY + Math.sin(angle - 0.5) * branchLen);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    // Helper: Draw ice crack pattern
    drawIceCrack(x, y, seed, depth) {
        if (depth <= 0) return;
        
        const angle = seed * 2.5;
        const length = 8 + Math.sin(seed * 3) * 5;
        const endX = x + Math.cos(angle) * length;
        const endY = y + Math.sin(angle) * length;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        
        // Branch out
        if (Math.random() > 0.4) {
            this.drawIceCrack(endX, endY, seed + 1, depth - 1);
        }
        if (Math.random() > 0.6) {
            this.drawIceCrack(endX, endY, seed - 1.5, depth - 1);
        }
    }

    // Helper: Draw lightning arc between two points
    drawLightningArc(x1, y1, x2, y2, segments) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        
        let prevX = x1;
        let prevY = y1;
        
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const midX = x1 + (x2 - x1) * t;
            const midY = y1 + (y2 - y1) * t;
            
            // Add randomness except for endpoints
            const jitter = i < segments ? (Math.random() - 0.5) * 15 : 0;
            const px = midX + jitter;
            const py = midY + jitter;
            
            this.ctx.lineTo(px, py);
            prevX = px;
            prevY = py;
        }
        
        this.ctx.stroke();
    }

    // Draw character-specific particles in the particle loop
    drawCharacterParticle(p) {
        if (p.kind === 'ice_shard') {
            p.life -= 0.04;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.rotation += p.rotSpeed * 0.05;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation);
            this.ctx.fillStyle = '#a0e8ff';
            this.ctx.shadowBlur = 6;
            this.ctx.shadowColor = '#00d4ff';

            // Diamond/crystal shape
            this.ctx.beginPath();
            this.ctx.moveTo(0, -p.size);
            this.ctx.lineTo(p.size * 0.5, 0);
            this.ctx.lineTo(0, p.size);
            this.ctx.lineTo(-p.size * 0.5, 0);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();

        } else if (p.kind === 'fire_spark' || p.kind === 'fire_trail') {
            p.life -= 0.05;
            p.x += p.vx;
            p.y += p.vy;
            p.vy -= 0.15; // rise
            p.size *= 0.95;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.3, '#ffaa00');
            gradient.addColorStop(1, 'rgba(255, 68, 0, 0)');
            
            this.ctx.fillStyle = gradient;
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = '#ff4400';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();

        } else if (p.kind === 'electric_spark' || p.kind === 'lightning_trail') {
            p.life -= 0.08;
            p.x += p.vx;
            p.y += p.vy;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = '#ffff88';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#ffdd00';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            this.ctx.fill();

            // Tiny lightning
            if (Math.random() > 0.5) {
                this.ctx.strokeStyle = '#ffdd00';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(p.x, p.y);
                this.ctx.lineTo(
                    p.x + (Math.random() - 0.5) * 10,
                    p.y + (Math.random() - 0.5) * 10
                );
                this.ctx.stroke();
            }
            this.ctx.restore();

        } else if (p.kind === 'ice_trail') {
            p.life -= 0.06;
            p.x += p.vx;
            p.y += p.vy;
            p.size *= 0.92;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life * 0.6;
            this.ctx.fillStyle = '#88ddff';
            this.ctx.shadowBlur = 5;
            this.ctx.shadowColor = '#00d4ff';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();

        // === SKILL HIT EFFECT PARTICLES ===
        } else if (p.kind === 'ice_crystal') {
            p.life -= 0.03;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15;
            p.vx *= 0.98;
            p.rotation += p.rotSpeed * 0.02;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation);
            this.ctx.fillStyle = '#a0e8ff';
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = '#00d4ff';

            // Crystal/diamond shape
            this.ctx.beginPath();
            this.ctx.moveTo(0, -p.size);
            this.ctx.lineTo(p.size * 0.6, 0);
            this.ctx.lineTo(0, p.size);
            this.ctx.lineTo(-p.size * 0.6, 0);
            this.ctx.closePath();
            this.ctx.fill();

            // Inner glow
            this.ctx.fillStyle = '#ffffff';
            this.ctx.globalAlpha = p.life * 0.5;
            this.ctx.beginPath();
            this.ctx.moveTo(0, -p.size * 0.5);
            this.ctx.lineTo(p.size * 0.3, 0);
            this.ctx.lineTo(0, p.size * 0.5);
            this.ctx.lineTo(-p.size * 0.3, 0);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();

        } else if (p.kind === 'frost_mist') {
            p.life -= 0.02;
            p.x += p.vx;
            p.y += p.vy;
            p.size += 0.5;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life * 0.3;
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gradient.addColorStop(0, 'rgba(150, 220, 255, 0.4)');
            gradient.addColorStop(1, 'transparent');
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();

        } else if (p.kind === 'fire_ember') {
            p.life -= 0.04;
            p.x += p.vx;
            p.y += p.vy;
            p.vy -= 0.2; // rise faster
            p.vx *= 0.98;
            p.size *= 0.97;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.2, '#ffff00');
            gradient.addColorStop(0.5, '#ff6600');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            this.ctx.fillStyle = gradient;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#ff4400';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();

        } else if (p.kind === 'flame_burst') {
            p.life -= 0.05;
            p.x += p.vx;
            p.y += p.vy;
            p.vy -= 0.3;
            p.size *= 0.95;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life * 0.8;
            this.ctx.translate(p.x, p.y);

            // Flame shape
            const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.2, '#ffcc00');
            gradient.addColorStop(0.6, '#ff4400');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');

            this.ctx.fillStyle = gradient;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#ff4400';

            // Flame-like shape
            this.ctx.beginPath();
            this.ctx.moveTo(0, p.size);
            this.ctx.quadraticCurveTo(-p.size * 0.8, 0, 0, -p.size * 1.5);
            this.ctx.quadraticCurveTo(p.size * 0.8, 0, 0, p.size);
            this.ctx.fill();
            this.ctx.restore();

        } else if (p.kind === 'electric_bolt') {
            p.life -= 0.08;

            if (p.life <= 0) return true;

            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2 + p.life;
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#ffdd00';

            this.drawLightningBolt(p.x, p.y, p.angle, p.length * p.life, p.branches);
            this.ctx.restore();
        }

        return false;
    }

    // Draw "YOU" indicator above the player's head
    drawYouIndicator(entities) {
        // Get game instance to check player role
        // P1 is always index 0, P2 is index 1
        // In single player: P1 is human
        // In multiplayer: depends on playerRole
        if (!entities || entities.length === 0) return;

        // Find the player entity (the one the human controls)
        let playerEntity = null;
        
        // Check if we're in the game context
        if (window.game) {
            if (window.game.gameMode === 'single') {
                // In single player, P1 (first entity) is always the player
                playerEntity = entities[0];
            } else if (window.game.gameMode === 'multi') {
                // In multiplayer, check playerRole
                if (window.game.playerRole === 'p1') {
                    playerEntity = entities[0];
                } else if (window.game.playerRole === 'p2') {
                    playerEntity = entities[1];
                }
            }
        } else {
            // Default to first entity if game instance not available
            playerEntity = entities[0];
        }

        if (!playerEntity || playerEntity.isDead) return;

        this.ctx.save();
        
        const x = playerEntity.x;
        const y = playerEntity.y - 120; // Position above head
        
        // Floating animation
        const floatOffset = Math.sin(Date.now() / 400) * 3;
        
        // Draw the "YOU" text with glow
        this.ctx.font = 'bold 16px Orbitron, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Glow effect
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = playerEntity.color || '#00ff88';
        
        // Background pill
        const textWidth = this.ctx.measureText('YOU').width;
        const pillWidth = textWidth + 16;
        const pillHeight = 22;
        
        // Draw pill background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.beginPath();
        this.ctx.roundRect(x - pillWidth/2, y + floatOffset - pillHeight/2, pillWidth, pillHeight, 8);
        this.ctx.fill();
        
        // Draw border
        this.ctx.strokeStyle = playerEntity.color || '#00ff88';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Draw text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowBlur = 0;
        this.ctx.fillText('YOU', x, y + floatOffset);
        
        // Draw arrow pointing down
        this.ctx.fillStyle = playerEntity.color || '#00ff88';
        this.ctx.beginPath();
        this.ctx.moveTo(x, y + floatOffset + pillHeight/2 + 2);
        this.ctx.lineTo(x - 6, y + floatOffset + pillHeight/2 + 2);
        this.ctx.lineTo(x, y + floatOffset + pillHeight/2 + 10);
        this.ctx.lineTo(x + 6, y + floatOffset + pillHeight/2 + 2);
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.restore();
    }
}