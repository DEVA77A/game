export class Entity {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = 20;
        this.color = color;
        this.speed = 600; // Max speed
        this.acceleration = 2000; // Acceleration
        this.friction = 1500; // Ground friction
        this.airFriction = 200; // Air friction
        this.health = 100;
        this.maxHealth = 100;
        this.isDead = false;
        
        // Physics
        this.gravity = 2000; // Tuned gravity
        this.jumpStrength = 850; // Tuned jump
        this.groundY = 420; // Platform level - raised up to show platform below
        this.isOnGround = false;
        
        // State
        this.state = 'stance_idle'; 
        this.facing = 1; 
        this.stateTimer = 0;
        
        // Combat
        this.hitbox = null; 
        this.specialCooldown = 0;
        this.maxSpecialCooldown = 7.0; // 7 seconds cooldown
        this.dashCooldown = 0;
        this.invulnerable = 0;
        this.knockdownTimer = 0;
        
        // Combo System
        this.comboStep = 0;
        this.comboTimer = 0;
        this.isBlocking = false;
        
        // Consecutive Hit System (for knockdown after multiple hits)
        this.consecutiveHits = 0;
        this.hitDecayTimer = 0;
        this.hitDecayTime = 2.0; // Reset hit count if not hit for 2 seconds
    }

    update(dt) {
        if (this.isDead) return;

        // Decay consecutive hit counter if not hit recently
        if (this.hitDecayTimer > 0) {
            this.hitDecayTimer -= dt;
            if (this.hitDecayTimer <= 0) {
                this.consecutiveHits = 0;
            }
        }

        // Apply Gravity
        this.vy += this.gravity * dt;

        // Apply Velocity
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Ground Collision
        if (this.y >= this.groundY) {
            this.y = this.groundY;
            this.vy = 0;
            this.isOnGround = true;
        } else {
            this.isOnGround = false;
        }

        // Arena Bounds Clamp
        const margin = 30;
        if (this.x < margin) {
            this.x = margin;
            if (this.vx < 0) this.vx = 0; // Only stop if moving into wall
        }
        if (this.x > 1024 - margin) {
            this.x = 1024 - margin;
            if (this.vx > 0) this.vx = 0; // Only stop if moving into wall
        }

        // Fix: Cancel dash if stopped by wall
        if (this.state === 'dash' && Math.abs(this.vx) < 10) {
            this.state = 'stance_idle';
            this.stateTimer = 0;
            this.dashCooldown = 0.5; // Small cooldown penalty
        }

        // Friction
        if (this.state !== 'move' && this.state !== 'dash' && this.state !== 'knockdown' && this.state !== 'hitstun' && this.state !== 'blockstun') {
            const f = this.isOnGround ? this.friction : this.airFriction;
            if (this.vx > 0) {
                this.vx -= f * dt;
                if (this.vx < 0) this.vx = 0;
            } else if (this.vx < 0) {
                this.vx += f * dt;
                if (this.vx > 0) this.vx = 0;
            }
        }

        // Cooldowns & Timers
        if (this.specialCooldown > 0) this.specialCooldown -= dt;
        if (this.dashCooldown > 0) this.dashCooldown -= dt;
        if (this.invulnerable > 0) this.invulnerable -= dt;
        if (this.stateTimer > 0) this.stateTimer -= dt;
        
        // Combo Timer
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) {
                this.comboStep = 0; // Reset combo if time runs out
            }
        }

        // State Transitions
        if (this.stateTimer <= 0) {
            // Standard attacks reset to idle. Special attacks are handled by Player.js
            if ((this.state.startsWith('attack_') && !this.state.includes('special')) || this.state === 'hitstun' || this.state === 'blockstun' || this.state === 'getting_up' || this.state === 'dash_clash_stun') {
                // If we were attacking, we go back to idle, but we might still be in a combo window
                // The comboStep is preserved until comboTimer runs out
                this.state = 'stance_idle';
                this.hitbox = null;
            } else if (this.state === 'knockdown') {
                this.state = 'getting_up';
                this.stateTimer = 0.4;
            } else if (this.state === 'perfect_block_shield') {
                // Perfect block shield expired, return to idle
                this.state = 'stance_idle';
            }
        }

        // Movement state check
        if (this.state === 'stance_idle' && Math.abs(this.vx) > 10) {
            this.state = 'move';
        } else if (this.state === 'move' && Math.abs(this.vx) <= 10) {
            this.state = 'stance_idle';
        }
        
        // Jump state check
        if (!this.isOnGround && (this.state === 'stance_idle' || this.state === 'move')) {
            this.state = 'jump';
        } else if (this.isOnGround && this.state === 'jump') {
            this.state = 'stance_idle';
        }
    }

    takeDamage(amount, knockbackX, knockbackY, type) {
        // Knockdown invulnerability
        // Prevent edge trapping
        // Stable recovery to standing
        if (this.invulnerable > 0 || this.isDead || this.state === 'knockdown' || this.state === 'getting_up') return;
        
        // Blocking Check
        if (this.state === 'blocking') {
            const hitFromFront = (this.facing === 1 && knockbackX < 0) || (this.facing === -1 && knockbackX > 0);
            if (hitFromFront) {
                // Block successful
                // NOTE: Healing is handled in Game.js resolveHit() for perfect block only
                
                amount = 0; // Negate damage
                this.vx = knockbackX * 0.5; // Pushback
                
                // Blockstun
                this.state = 'blockstun';
                this.stateTimer = 0.2;
                return; 
            }
        }

        this.health -= amount;
        this.vx = knockbackX;
        this.vy = knockbackY;
        
        // Track consecutive hits for knockdown system
        this.consecutiveHits++;
        this.hitDecayTimer = this.hitDecayTime; // Reset decay timer on each hit
        
        // Knockdown Logic
        // Special, Projectile, Dash Collision, Combo Finishers, or 4+ consecutive hits cause knockdown
        const forceKnockdown = this.consecutiveHits >= 4;
        
        if (type === 'special' || type === 'special_projectile' || type === 'dash_collision' || type === 'knockdown_hit' || forceKnockdown) {
            this.state = 'knockdown';
            this.stateTimer = type === 'dash_collision' ? 1.0 : 1.5;
            this.comboStep = 0; // Reset combo on knockdown
            this.consecutiveHits = 0; // Reset hit counter on knockdown
            this.hitDecayTimer = 0;
            
            // Add upward knockback for consecutive hit knockdown
            if (forceKnockdown && type !== 'special' && type !== 'special_projectile' && type !== 'dash_collision' && type !== 'knockdown_hit') {
                this.vy = -350; // Launch upward
            }
        } else {
            this.state = 'hitstun';
            this.stateTimer = type === 'kick' ? 0.4 : 0.25;
        }
        
        this.invulnerable = 0.2; 

        if (this.health <= 0) {
            this.health = 0;
            this.isDead = true;
            this.state = 'knockdown'; 
        }
    }
}