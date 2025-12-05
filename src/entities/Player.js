import { Entity } from './Entity.js';

export class Player extends Entity {
    constructor(x, y, color, isAI, input, aiController, spawnProjectile) {
        super(x, y, color);
        this.isAI = isAI;
        this.input = input;
        this.aiController = aiController;
        this.spawnProjectile = spawnProjectile;
        
        // Override Entity defaults if needed
        this.width = 40;
        this.height = 80;
        this.speed = 400; // Faster movement
        this.jumpForce = -850; // Match Entity.js jumpStrength
        
        // State Machine
        // Entity.js uses: stance_idle, move, jump, fall, etc.
        // We will use compatible states.
        
        // Combat
        this.comboCount = 0;
        this.lastAttackTime = 0;
        this.blockStartTime = 0;
        
        // Special Move
        this.specialCooldown = 0;
        this.maxSpecialCooldown = 5.0;

        // Dash
        this.dashCooldown = 0;
    }

    update(dt, opponent, isSimulation = true) {
        if (this.isDead) return;

        // Cooldowns
        if (this.specialCooldown > 0) this.specialCooldown -= dt;
        if (this.dashCooldown > 0) this.dashCooldown -= dt;

        // FIX: Dash hang safeguard - force reset if stuck in dash
        if (this.state === 'dash' && this.stateTimer <= 0) {
            this.endState();
        }
        
        // FIX: Special move hang safeguard
        if (this.state === 'attack_special_active' && this.stateTimer <= 0) {
            this.endState();
        }

        // Input / AI Handling (only if actionable AND simulation is running)
        // This prevents AI from fighting during countdown (pre_fight)
        if (this.isActionable() && isSimulation) {
            if (this.isAI) {
                this.handleAI(dt, opponent);
            } else {
                this.handleInput();
            }
        }

        // Physics & State (Handled by Entity.js)
        if (isSimulation) {
            super.update(dt);
            this.clampPosition();
        }

        // Animation / Facing
        // Always face opponent if idle/moving
        if (this.state === 'stance_idle' || this.state === 'move') {
            if (opponent && opponent.x > this.x) this.facing = 1;
            else if (opponent) this.facing = -1;
        }
    }

    clampPosition() {
        // Keep player within screen bounds (0 to 1024)
        if (this.x < 20) {
            this.x = 20;
            if (this.vx < 0) this.vx = 0;
            if (this.state === 'dash') this.endState();
        }
        if (this.x > 1004) {
            this.x = 1004;
            if (this.vx > 0) this.vx = 0;
            if (this.state === 'dash') this.endState();
        }
    }

    isActionable() {
        // Compatible with Entity.js states
        // Allow input during combo windows (when stateTimer is low)
        if (this.state.startsWith('attack_') && this.stateTimer < 0.1) return true;
        return ['stance_idle', 'move', 'jump', 'idle', 'run'].includes(this.state);
    }

    handleAI(dt, opponent) {
        if (!this.aiController) return;

        // Use decideMove as defined in AdaptiveAI.js
        const action = this.aiController.decideMove(this, opponent, dt);

        // Apply Movement
        if (action.dx !== 0) {
            this.vx = action.dx * this.speed;
            this.facing = action.dx;
            
            // FIX: Don't overwrite attack/stun states with move
            // This fixes the "gliding" AI bug where attacks were invisible
            if (!this.state.startsWith('attack_') && 
                !this.state.startsWith('hit') && 
                !this.state.startsWith('block') &&
                !this.state.startsWith('dash')) {
                this.state = 'move';
            }
        } else {
            this.vx = 0;
            if (this.state === 'move') this.state = 'stance_idle';
        }

        // Actions
        if (action.dash && this.dashCooldown <= 0 && this.isOnGround) {
            this.performDash();
        } else if (action.punch) {
            this.performAttack('light');
        } else if (action.kick) {
            this.performAttack('heavy');
        } else if (action.special) {
            this.performSpecial();
        } else if (action.block) {
            if (this.state !== 'blocking') {
                this.state = 'blocking';
                this.vx = 0;
                this.blockStartTime = Date.now();
            }
        }
        
        // Jump (AI returns dy < 0 for jump)
        if (action.dy < 0 && this.isOnGround) {
            this.vy = this.jumpForce;
            this.isOnGround = false;
            this.state = 'jump';
        }
    }

    handleInput() {
        if (!this.input) return;

        // Movement
        let moving = false;
        if (this.input.isDown('KeyA')) {
            this.vx = -this.speed;
            this.facing = -1;
            moving = true;
        } else if (this.input.isDown('KeyD')) {
            this.vx = this.speed;
            this.facing = 1;
            moving = true;
        }

        // FIX: Don't overwrite attack/stun states with move
        if (moving && !this.state.startsWith('attack_') && !this.state.startsWith('hit') && !this.state.startsWith('block')) {
            this.state = 'move';
        } else if (!moving && !this.state.startsWith('attack_') && !this.state.startsWith('hit') && !this.state.startsWith('block')) {
            this.vx = 0;
            if (this.state === 'move') this.state = 'stance_idle';
        }

        // Jump
        if (this.input.isJustPressed('Space') && this.isOnGround) {
            this.vy = this.jumpForce;
            this.isOnGround = false;
            this.state = 'jump';
        }

        // Dash
        if (this.input.isJustPressed('ShiftLeft') && this.dashCooldown <= 0 && this.isOnGround) {
            this.performDash();
            return;
        }

        // Attacks
        if (this.input.isJustPressed('KeyJ')) {
            this.performAttack('light');
        } else if (this.input.isJustPressed('KeyK')) {
            this.performAttack('heavy');
        } else if (this.input.isJustPressed('KeyL')) {
            this.performSpecial();
        }

        // Block
        if (this.input.isDown('KeyS') && this.isOnGround) {
            if (this.state !== 'blocking') {
                this.state = 'blocking';
                this.vx = 0;
                this.blockStartTime = Date.now();
            }
        } else if (this.state === 'blocking' && !this.input.isDown('KeyS')) {
            this.state = 'stance_idle';
        }
    }

    performDash() {
        this.state = 'dash';
        this.stateTimer = 0.2; // Fixed duration 200ms
        this.vx = this.facing * 800; // High speed
        this.vy = 0;
        this.dashCooldown = 1.0;
    }

    performAttack(type) {
        // Allow sliding attacks (don't zero velocity completely, just friction)
        // this.vx = 0; 
        
        if (type === 'light') {
            // Combo Logic
            // Check if we can continue combo
            // We can continue if we are in the previous attack state OR if we just finished it (comboTimer > 0)
            // But to keep it simple and responsive:
            // If state is idle/move -> Step 1
            // If state is attack_punch_1 -> Step 2
            // If state is attack_punch_2 -> Step 3
            
            let step = 1;
            if (this.state === 'attack_punch_1') step = 2;
            else if (this.state === 'attack_punch_2') step = 3;
            
            // Reset if too slow (handled by Entity.js comboTimer, but we enforce state check)
            if (this.comboTimer <= 0) step = 1;

            this.state = `attack_punch_${step}`;
            this.stateTimer = 0.25; // Slightly longer for visual clarity
            this.comboStep = step;
            this.comboTimer = 0.6; // Window to hit next button
            
            let damage = 5;
            let kb = 100;
            let kbY = 0;
            
            if (step === 2) { damage = 8; kb = 150; }
            if (step === 3) { damage = 15; kb = 50; kbY = -400; } // Uppercut launches
            
            this.hitbox = { 
                x: this.x + (this.facing * 30), 
                y: this.y - 40, 
                w: 40, 
                h: 40, 
                offsetX: 30,  // FIX: Store offset for dynamic recalculation
                offsetY: -40,
                damage: damage, 
                knockback: kb, 
                knockbackY: kbY,
                type: step === 3 ? 'knockdown_hit' : 'light' 
            };
        } else {
            // Kick Combo Logic
            let step = 1;
            if (this.state === 'attack_kick_1') step = 2;
            else if (this.state === 'attack_kick_2') step = 3;

            if (this.comboTimer <= 0) step = 1;

            this.state = `attack_kick_${step}`;
            this.stateTimer = 0.35;
            this.comboStep = step;
            this.comboTimer = 0.7;
            
            let damage = 10;
            let kb = 200;
            let kbY = 0;

            if (step === 2) { damage = 12; kb = 250; }
            if (step === 3) { damage = 20; kb = 100; kbY = -500; } // Upperkick launches high

            this.hitbox = { 
                x: this.x + (this.facing * 40), 
                y: this.y - 50, 
                w: 50, 
                h: 50, 
                offsetX: 40,  // FIX: Store offset for dynamic recalculation
                offsetY: -50,
                damage: damage, 
                knockback: kb, 
                knockbackY: kbY,
                type: step === 3 ? 'knockdown_hit' : 'heavy' 
            };
        }
    }

    performSpecial() {
        if (this.specialCooldown > 0) return;
        
        // FIX: Use correct state name for Renderer
        this.state = 'attack_special_active';
        this.stateTimer = 0.5;
        this.vx = 0;
        this.specialCooldown = this.maxSpecialCooldown;
        
        // Spawn Projectile
        if (this.spawnProjectile) {
            this.spawnProjectile(this.x + (this.facing * 40), this.y - 40, this.facing, this);
        }
    }

    endState() {
        this.state = 'stance_idle';
        this.hitbox = null;
        this.stateTimer = 0;
        
        // Reset velocity if coming out of dash
        if (Math.abs(this.vx) > this.speed) {
            this.vx = 0;
        }
    }

    // Override Entity.takeDamage to handle death state properly if needed
    // But Entity.js takeDamage is pretty good. We just need to ensure 'die' is handled.
    // Entity.js sets isDead = true.
}