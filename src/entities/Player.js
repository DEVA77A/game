import { Entity } from './Entity.js';

export class Player extends Entity {
    constructor(x, y, color, isAI = false, input = null, aiSystem = null, onProjectile = null) {
        super(x, y, color);
        this.isAI = isAI;
        this.input = input;
        this.aiSystem = aiSystem;
        this.onProjectile = onProjectile; // Callback to spawn projectile
        this.dashSpeed = 1200; 
        this.comboCount = 0;
        this.lastAttackTime = 0;
        this.blockStartTime = 0; // For perfect block timing
    }

    update(dt, opponent, canControl = true) {
        // 1. Capture previous state for transition checks
        const prevState = this.state;

        // 2. Always face opponent (unless incapacitated)
        if (opponent && !this.isDead && this.state !== 'knockdown' && this.state !== 'getting_up' && this.state !== 'dash' && this.state !== 'dash_clash_stun' && !this.state.includes('special')) {
            this.facing = opponent.x > this.x ? 1 : -1;
        }

        // 3. Run Physics & State Timers (Entity.update)
        super.update(dt);
        
        // 4. Special Attack State Machine
        // Handle transitions that Entity.js ignores
        if (this.state === 'attack_special_windup' && this.stateTimer <= 0) {
            this.state = 'attack_special_active';
            this.stateTimer = 0.2; // Active frame for spawning
            
            // Spawn Projectile
            if (this.onProjectile) {
                this.onProjectile(this.x + (this.facing * 60), this.y - 45, this.facing, this);
            }
        } else if (this.state === 'attack_special_active' && this.stateTimer <= 0) {
            this.state = 'attack_special_recover';
            this.stateTimer = 0.5; // Recovery time
        } else if (this.state === 'attack_special_recover' && this.stateTimer <= 0) {
            this.state = 'stance_idle';
        }

        if (this.isDead || !canControl) return;

        // 5. Input Handling
        // Cannot move/act during attacks, hitstun, knockdown, etc.
        const canAct = this.state === 'stance_idle' || this.state === 'move' || this.state === 'jump';
        
        // Blocking allows releasing the block
        if (!canAct && this.state !== 'blocking') return; 

        let dx = 0;
        let jump = false;
        let dash = false;
        let punch = false;
        let kick = false;
        let special = false;
        let block = false;

        if (!this.isAI) {
            // Human Input
            if (this.input.isDown('KeyA')) dx = -1;
            if (this.input.isDown('KeyD')) dx = 1;
            
            if (this.input.isJustPressed('Space') && this.isOnGround) {
                jump = true;
            }
            
            dash = this.input.isJustPressed('ShiftLeft') || this.input.isJustPressed('ShiftRight');
            
            punch = this.input.isJustPressed('KeyJ');
            kick = this.input.isJustPressed('KeyK');
            special = this.input.isJustPressed('KeyL');
            block = this.input.isDown('KeyI');
        } else {
            // AI Input
            const action = this.aiSystem.decideMove(this, opponent, dt);
            dx = action.dx;
            
            if (action.dy < -0.5 && this.isOnGround) {
                jump = true;
            }

            dash = action.dash;
            punch = action.punch;
            kick = action.kick;
            special = action.special;
            block = action.block;
        }

        // 6. Execute Actions
        
        // Blocking Logic
        if (block && this.isOnGround) {
            if (this.state !== 'blocking') {
                this.state = 'blocking';
                this.blockStartTime = Date.now(); // Start timing for perfect block
            }
        } else if (this.state === 'blocking' && !block) {
            this.state = 'stance_idle'; 
        }

        // Jump
        if (jump && this.state !== 'blocking') {
            this.vy = -this.jumpStrength;
            this.isOnGround = false;
        }

        // Dash
        if (dash && this.dashCooldown <= 0 && this.state !== 'blocking') {
            this.performDash(dx);
        } 
        // Special Skill Trigger Fix
        // Ensure clean state check and cooldown
        else if (special && this.specialCooldown <= 0 && this.isOnGround && this.state !== 'blocking' && !this.state.startsWith('attack_')) {
             this.performSpecial();
        } 
        // Kick Combo
        else if (kick && this.state !== 'blocking') {
            if (this.state === 'stance_idle' || this.state === 'move') {
                this.performAttack('kick', 1);
            } else if (this.state === 'attack_kick_1' && this.comboTimer > 0 && this.stateTimer < 0.15) {
                this.performAttack('kick', 2);
            } else if (this.state === 'attack_kick_2' && this.comboTimer > 0 && this.stateTimer < 0.15) {
                this.performAttack('kick', 3);
            }
        } 
        // Punch Combo
        else if (punch && this.state !== 'blocking') {
            if (this.state === 'stance_idle' || this.state === 'move') {
                this.performAttack('punch', 1);
            } else if (this.state === 'attack_punch_1' && this.comboTimer > 0 && this.stateTimer < 0.1) {
                this.performAttack('punch', 2);
            } else if (this.state === 'attack_punch_2' && this.comboTimer > 0 && this.stateTimer < 0.1) {
                this.performAttack('punch', 3);
            }
        } 
        // Move
        else if (this.state !== 'dash' && !this.state.startsWith('attack_') && this.state !== 'blockstun') {
            let moveSpeed = this.speed;
            
            if (this.state === 'blocking') {
                moveSpeed *= 0.5; // Slower movement while blocking
            }

            if (dx !== 0) {
                // Acceleration
                this.vx += dx * this.acceleration * dt;
                if (Math.abs(this.vx) > moveSpeed) {
                    this.vx = Math.sign(this.vx) * moveSpeed;
                }
            }
        }
    }

    performDash(dx) {
        this.state = 'dash';
        this.stateTimer = 0.2;
        this.dashCooldown = 2.0;
        this.invulnerable = 0.2;
        if (dx === 0) dx = this.facing;
        this.vx = dx * this.dashSpeed;
        this.vy = 0; 
    }

    performAttack(type, step) {
        this.state = `attack_${type}_${step}`;
        this.comboStep = step;
        this.comboTimer = 0.6; // Window to continue combo
        
        // Hitbox generation
        let reach = 50;
        let width = 30;
        let damage = 5;
        let knockback = 200;
        let hitType = 'normal';
        let duration = 0.2;

        if (type === 'punch') {
            // Punch combo: left -> right -> uppercut
            if (step === 1) {
                reach = 50; damage = 4; knockback = 100; duration = 0.2;
            } else if (step === 2) {
                reach = 50; damage = 6; knockback = 150; duration = 0.2;
            } else if (step === 3) {
                reach = 40; damage = 12; knockback = 400; duration = 0.4; hitType = 'knockdown_hit';
                this.vx = this.facing * 100; // Step forward
            }
        } else {
            // Kick combo: right -> left -> upperkick
            if (step === 1) {
                reach = 70; damage = 6; knockback = 150; duration = 0.3;
            } else if (step === 2) {
                reach = 70; damage = 8; knockback = 200; duration = 0.3;
            } else if (step === 3) {
                reach = 60; damage = 15; knockback = 450; duration = 0.5; hitType = 'knockdown_hit';
                this.vx = this.facing * 150; // Step forward
            }
        }

        this.stateTimer = duration;
        
        this.hitbox = {
            x: this.x + (this.facing * 30),
            y: this.y - 50, // Chest/Head height
            w: reach,
            h: width,
            damage: damage,
            knockback: knockback,
            type: hitType
        };

        // Adjust hitbox for Upperkick
        if (type === 'kick' && step === 3) {
            this.hitbox.y = this.y - 80; // Higher hit
            this.hitbox.h = 60; // Taller hitbox
        }
        
        // Slight lunge for all attacks
        if (step < 3) this.vx = this.facing * 50;
    }

    performSpecial() {
        // Special: Windup -> Active -> Recover
        this.state = 'attack_special_windup';
        this.stateTimer = 0.6; // Windup time
        this.specialCooldown = this.maxSpecialCooldown;
        this.vx = 0;
    }
}