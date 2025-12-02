export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
        this.glitchTimer = 0;
        
        this.particles = [];
    }

    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    triggerShake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeTimer = duration;
    }

    triggerGlitch(duration) {
        this.glitchTimer = duration;
    }

    triggerParticles(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
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

    clear() {
        this.particles = [];
        this.shakeTimer = 0;
        this.glitchTimer = 0;
    }

    draw(entities, ghosts, projectiles = [], gameState = 'fighting', countdown = 0) {
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

        // Draw Projectiles
        projectiles.forEach(proj => {
            this.drawProjectile(proj);
        });

        // Draw Particles
        this.drawParticles();

        // Glitch Effect
        if (this.glitchTimer > 0) {
            this.drawGlitch();
            this.glitchTimer -= 0.016;
        }

        this.ctx.restore();

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

    drawBackground() {
        // Floor Glow
        const groundY = 480;
        
        const gradient = this.ctx.createLinearGradient(0, groundY, 0, this.height);
        gradient.addColorStop(0, 'rgba(0, 243, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 243, 255, 0)');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, groundY, this.width, this.height - groundY);

        // Floor Line
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 3;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#00f3ff';
        this.ctx.beginPath();
        this.ctx.moveTo(0, groundY);
        this.ctx.lineTo(this.width, groundY);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        // Subtle Grid (Background)
        this.ctx.strokeStyle = '#111';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let x = 0; x <= this.width; x += 100) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, groundY);
        }
        this.ctx.stroke();

        // Neon Border (Arena Bounds)
        this.ctx.strokeStyle = '#00f3ff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(20, 20, this.width - 40, groundY - 20);
        
        // Corner Accents
        this.ctx.strokeStyle = '#ff00ff';
        this.ctx.lineWidth = 4;
        const cornerSize = 30;
        // Top Left
        this.ctx.beginPath(); this.ctx.moveTo(20, 20 + cornerSize); this.ctx.lineTo(20, 20); this.ctx.lineTo(20 + cornerSize, 20); this.ctx.stroke();
        // Top Right
        this.ctx.beginPath(); this.ctx.moveTo(this.width - 20, 20 + cornerSize); this.ctx.lineTo(this.width - 20, 20); this.ctx.lineTo(this.width - 20 - cornerSize, 20); this.ctx.stroke();
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
            const progress = 1 - (entity.stateTimer / 0.2);
            const punch = Math.sin(progress * Math.PI);
            
            if (step === 1) {
                // Left Jab
                handLX = -10 + punch * 40;
                handLY = -35;
                this.ctx.rotate(punch * 0.1);
            } else if (step === 2) {
                // Right Cross
                handRX = 20 + punch * 40;
                handRY = -35;
                this.ctx.rotate(punch * 0.2);
            } else if (step === 3) {
                // Uppercut
                handRX = 20 + punch * 20;
                handRY = -35 - punch * 30;
                this.ctx.rotate(-0.2 + punch * 0.4);
            }
        } else if (entity.state.startsWith('attack_kick')) {
            const step = parseInt(entity.state.split('_')[2]) || 1;
            const duration = step === 3 ? 0.5 : 0.3;
            const progress = 1 - (entity.stateTimer / duration);
            const kick = Math.sin(progress * Math.PI);
            
            // Realistic kick leg motion
            if (step === 1) {
                // Right Mid Kick (MMA Style)
                // Pivot on left foot, right leg swings around
                footLX = -5; footLY = 30; // Pivot foot
                kneeLX = -5; kneeLY = 10;
                
                // Hip rotation
                torsoY += 2; 
                this.ctx.rotate(-0.2 + kick * 0.4); // Body lean

                // Kicking leg
                kneeRX = 10 + kick * 30;
                kneeRY = 10 - kick * 10;
                footRX = 20 + kick * 50;
                footRY = 30 - kick * 30;
            } else if (step === 2) {
                // Left High Kick
                // Pivot on right foot
                footRX = 5; footRY = 30;
                kneeRX = 5; kneeRY = 10;

                this.ctx.rotate(0.2 - kick * 0.4);

                kneeLX = 10 + kick * 30;
                kneeLY = 10 - kick * 20;
                footLX = 20 + kick * 60;
                footLY = 30 - kick * 40;
            } else if (step === 3) {
                // Rising Upperkick (Launch)
                footLX = -10; footLY = 30; // Planted foot
                
                // Vertical split
                kneeRX = 10 + kick * 10;
                kneeRY = 10 - kick * 40;
                footRX = 15 + kick * 20;
                footRY = 30 - kick * 90; // Very high
                
                this.ctx.rotate(-0.3 + kick * 0.6);
                headY += kick * 10; // Lean back
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
            handLX = 15; handLY = -45;
            handRX = 20; handRY = -45;
            elbowLX = 10; elbowLY = -30;
            elbowRX = 15; elbowRY = -30;
            if (entity.state === 'blockstun') {
                this.ctx.translate((Math.random()-0.5)*2, 0); // Shake
            }
        } else if (entity.state === 'hitstun') {
            this.ctx.rotate(-0.5);
            headY = -45;
            handLX = -10; handLY = -50;
            handRX = 10; handRY = -50;
            this.ctx.strokeStyle = '#ffffff';
        } else if (entity.state === 'knockdown') {
            this.ctx.rotate(-1.5);
            headY = -10;
            torsoY = 0;
        } else if (entity.state === 'getting_up') {
            this.ctx.rotate(-0.5);
        }

        this.ctx.beginPath();
        
        // Head
        this.ctx.moveTo(0, headY + 10);
        this.ctx.arc(0, headY, 10, Math.PI/2, Math.PI*2.5);
        
        // Spine
        this.ctx.moveTo(0, headY + 10);
        this.ctx.lineTo(0, torsoY);
        
        // Arms
        this.ctx.moveTo(0, headY + 15);
        this.ctx.lineTo(elbowLX, elbowLY);
        this.ctx.lineTo(handLX, handLY);
        
        this.ctx.moveTo(0, headY + 15);
        this.ctx.lineTo(elbowRX, elbowRY);
        this.ctx.lineTo(handRX, handRY);
        
        // Legs
        this.ctx.moveTo(0, torsoY);
        this.ctx.lineTo(kneeLX, kneeLY);
        this.ctx.lineTo(footLX, footLY);
        
        this.ctx.moveTo(0, torsoY);
        this.ctx.lineTo(kneeRX, kneeRY);
        this.ctx.lineTo(footRX, footRY);
        
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= 0.05;
            p.x += p.vx;
            p.y += p.vy;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
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
}