import { Entity } from './Entity.js';
import { CHARACTERS, getCharacterById } from '../core/Characters.js';
import { StatusEffectManager } from '../core/StatusEffects.js';

export class Player extends Entity {
    constructor(x, y, color, isAI, input, aiController, spawnProjectile, characterId = 'ice') {
        super(x, y, color);
        this.isAI = isAI;
        this.input = input;
        this.aiController = aiController;
        this.spawnProjectile = spawnProjectile;
        
        // Character System
        this.characterId = characterId;
        this.character = getCharacterById(characterId);
        this.color = this.character.color;
        this.projectileColor = this.character.projectileColor || this.character.color;
        
        // Status Effects
        this.statusEffects = new StatusEffectManager(this);
        this.isFrozen = false;
        this.speedModifier = 1.0;
        this.attackSpeedModifier = 1.0;
        
        // Override Entity defaults if needed
        this.width = 40;
        this.height = 80;
        this.baseSpeed = 400;
        this.speed = this.baseSpeed;
        this.jumpForce = -850;
        
        // State Machine
        this.comboCount = 0;
        this.lastAttackTime = 0;
        this.blockStartTime = 0;
        
        // Special Move
        this.specialCooldown = 0;
        this.maxSpecialCooldown = 10.0;

        // Perfect Block System
        this.perfectBlockCooldown = 0;
        this.maxPerfectBlockCooldown = 5.0;
        this.perfectBlockActive = false;
        this.perfectBlockTimer = 0;
        this.perfectBlockShieldDuration = 1.0;
        this.canPerfectBlock = true;

        // Dash
        this.dashCooldown = 0;
    }

    setCharacter(characterId) {
        this.characterId = characterId;
        this.character = getCharacterById(characterId);
        this.color = this.character.color;
        this.projectileColor = this.character.projectileColor || this.character.color;
    }

    update(dt, opponent, isSimulation = true) {
        if (this.isDead) return;
        
        // Update status effects
        this.statusEffects.update(dt, this);
        
        // Apply speed modifier from status effects
        this.speed = this.baseSpeed * this.speedModifier;
        
        // Frozen check - can't do anything while frozen
        if (this.isFrozen) {
            this.vx = 0;
            if (isSimulation) {
                super.update(dt);
            }
            return;
        }

        // Cooldowns
        if (this.specialCooldown > 0) this.specialCooldown -= dt;
        if (this.dashCooldown > 0) this.dashCooldown -= dt;
        if (this.perfectBlockCooldown > 0) this.perfectBlockCooldown -= dt;
        
        // Perfect Block Shield Timer
        if (this.perfectBlockActive) {
            this.perfectBlockTimer -= dt;
            if (this.perfectBlockTimer <= 0) {
                this.perfectBlockActive = false;
                this.perfectBlockTimer = 0;
                if (this.state === 'perfect_block_shield') {
                    this.state = 'stance_idle';
                    this.stateTimer = 0;
                }
            }
        }

        // Safeguards
        if (this.state === 'perfect_block_shield' && !this.perfectBlockActive) {
            this.state = 'stance_idle';
            this.stateTimer = 0;
        }
        if (this.state === 'dash' && this.stateTimer <= 0) {
            this.endState();
        }
        if (this.state === 'attack_special_active' && this.stateTimer <= 0) {
            this.endState();
        }

        // Input / AI Handling
        if (this.isActionable() && isSimulation) {
            if (this.isAI) {
                this.handleAI(dt, opponent);
            } else {
                this.handleInput();
            }
        }

        // Physics & State
        if (isSimulation) {
            super.update(dt);
            this.clampPosition();
        }

        // Face opponent
        if (this.state === 'stance_idle' || this.state === 'move') {
            if (opponent && opponent.x > this.x) this.facing = 1;
            else if (opponent) this.facing = -1;
        }
    }

    // Apply skill effect when SKILL (special projectile) hits opponent
    applySkillEffect(target) {
        if (!this.character || !this.character.skillEffect) return;
        if (!target || !target.statusEffects) return;
        
        const effect = this.character.skillEffect;
        
        switch (effect.type) {
            case 'freeze':
                // Freeze for 5 seconds - FROZEN SOLID IN ICE, cannot move at all
                target.statusEffects.addEffect('freeze', effect.freezeDuration || 5.0, {});
                break;
                
            case 'burn':
                // Burn for 5 seconds, -5 HP per second = 25 total damage
                target.statusEffects.addEffect('burn', effect.duration || 5.0, {
                    damagePerSecond: effect.damagePerSecond || 5
                });
                break;
                
            case 'shock':
                // Slow enemy 50% for 5 seconds
                target.statusEffects.addEffect('shock', effect.duration || 5.0, {
                    slowAmount: effect.enemySlowAmount || 0.5
                });
                // Boost self speed 50% for 5 seconds
                if (this.statusEffects) {
                    this.statusEffects.addEffect('speedBoost', effect.duration || 5.0, {
                        boostAmount: effect.selfSpeedBoost || 1.5
                    });
                }
                break;
        }
    }

    clampPosition() {
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
        if (this.isFrozen) return false;
        if (this.state.startsWith('attack_punch') && this.stateTimer < 0.275) return true;
        if (this.state.startsWith('attack_kick') && this.stateTimer < 0.21) return true;
        if (this.state.startsWith('attack_') && this.stateTimer < 0.1) return true;
        if (this.state === 'blocking') return true;
        return ['stance_idle', 'move', 'jump', 'idle', 'run'].includes(this.state);
    }

    handleAI(dt, opponent) {
        if (!this.aiController) return;
        const action = this.aiController.decideMove(this, opponent, dt);

        if (action.dx !== 0) {
            this.vx = action.dx * this.speed;
            this.facing = action.dx;
            
            const isInBlockingState = this.state === 'blocking' || this.state === 'blockstun';
            const isInShieldState = this.state === 'perfect_block_shield';
            if (!this.state.startsWith('attack_') && 
                !this.state.startsWith('hit') && 
                !isInBlockingState &&
                !isInShieldState &&
                !this.state.startsWith('dash')) {
                this.state = 'move';
            }
        } else {
            this.vx = 0;
            if (this.state === 'move') this.state = 'stance_idle';
        }

        if (action.dash && this.dashCooldown <= 0 && this.isOnGround) {
            this.performDash();
        } else if (action.punch) {
            this.performAttack('light');
        } else if (action.kick) {
            this.performAttack('heavy');
        } else if (action.special) {
            this.performSpecial();
        } else if (action.block && !this.perfectBlockActive && this.perfectBlockCooldown <= 0) {
            if (this.state !== 'blocking') {
                this.state = 'blocking';
                this.vx = 0;
                this.blockStartTime = Date.now();
                this.canPerfectBlock = true;
                this.perfectBlockCooldown = this.maxPerfectBlockCooldown;
            }
        } else if (this.state === 'blocking') {
            this.state = 'stance_idle';
        }
        
        if (action.dy < 0 && this.isOnGround) {
            this.vy = this.jumpForce;
            this.isOnGround = false;
            this.state = 'jump';
        }
    }

    handleInput() {
        if (!this.input) return;

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

        const isInBlockingState = this.state === 'blocking' || this.state === 'blockstun';
        const isInShieldState = this.state === 'perfect_block_shield';
        
        if (moving && !this.state.startsWith('attack_') && !this.state.startsWith('hit') && !isInBlockingState && !isInShieldState) {
            this.state = 'move';
        } else if (!moving && !this.state.startsWith('attack_') && !this.state.startsWith('hit') && !isInBlockingState && !isInShieldState) {
            this.vx = 0;
            if (this.state === 'move') this.state = 'stance_idle';
        }

        if (this.input.isJustPressed('Space') && this.isOnGround) {
            this.vy = this.jumpForce;
            this.isOnGround = false;
            this.state = 'jump';
        }

        if (this.input.isJustPressed('ShiftLeft') && this.dashCooldown <= 0 && this.isOnGround) {
            this.performDash();
            return;
        }

        if (this.input.isJustPressed('KeyJ')) {
            this.performAttack('light');
        } else if (this.input.isJustPressed('KeyK')) {
            this.performAttack('heavy');
        } else if (this.input.isJustPressed('KeyL')) {
            this.performSpecial();
        }

        if (this.input.isDown('KeyS') && this.isOnGround && !this.perfectBlockActive && this.perfectBlockCooldown <= 0) {
            if (this.state !== 'blocking') {
                this.state = 'blocking';
                this.vx = 0;
                this.blockStartTime = Date.now();
                this.canPerfectBlock = true;
                this.perfectBlockCooldown = this.maxPerfectBlockCooldown;
            }
        } else if (this.state === 'blocking' && !this.input.isDown('KeyS')) {
            this.state = 'stance_idle';
        }
    }

    performDash() {
        this.state = 'dash';
        this.stateTimer = 0.2;
        this.vx = this.facing * 800;
        this.vy = 0;
        this.dashCooldown = 1.0;
    }

    performAttack(type) {
        // Apply attack speed modifier
        const attackMod = this.attackSpeedModifier;
        
        if (type === 'light') {
            let step = 1;
            if (this.state === 'attack_punch_1') step = 2;
            else if (this.state === 'attack_punch_2') step = 3;
            else if (this.state === 'attack_punch_3') step = 1;
            
            if (this.comboTimer <= 0 && !this.state.startsWith('attack_punch')) step = 1;

            this.state = `attack_punch_${step}`;
            this.stateTimer = 0.55 * attackMod;
            this.comboStep = step;
            this.comboTimer = 1.0;
            
            let damage = 5;
            let kb = 100;
            let kbY = 0;
            
            if (step === 2) { damage = 8; kb = 150; }
            if (step === 3) { damage = 15; kb = 50; kbY = -400; }
            
            this.hitbox = { 
                x: this.x + (this.facing * 30), 
                y: this.y - 40, 
                w: 40, h: 40, 
                offsetX: 30, offsetY: -40,
                damage, knockback: kb, knockbackY: kbY,
                type: step === 3 ? 'knockdown_hit' : 'light' 
            };
        } else {
            let step = 1;
            if (this.state === 'attack_kick_1') step = 2;
            else if (this.state === 'attack_kick_2') step = 3;
            else if (this.state === 'attack_kick_3') step = 1;

            if (this.comboTimer <= 0 && !this.state.startsWith('attack_kick')) step = 1;

            this.state = `attack_kick_${step}`;
            this.stateTimer = 0.42 * attackMod;
            this.comboStep = step;
            this.comboTimer = 0.8;
            
            let damage = 10;
            let kb = 200;
            let kbY = 0;

            if (step === 2) { damage = 12; kb = 250; }
            if (step === 3) { damage = 20; kb = 100; kbY = -500; }

            this.hitbox = { 
                x: this.x + (this.facing * 40), 
                y: this.y - 50, 
                w: 50, h: 50, 
                offsetX: 40, offsetY: -50,
                damage, knockback: kb, knockbackY: kbY,
                type: step === 3 ? 'knockdown_hit' : 'heavy' 
            };
        }
    }

    performSpecial() {
        if (this.specialCooldown > 0) return;
        
        this.state = 'attack_special_active';
        this.stateTimer = 0.5;
        this.vx = 0;
        this.specialCooldown = this.maxSpecialCooldown;
        
        if (this.spawnProjectile) {
            this.spawnProjectile(this.x + (this.facing * 40), this.y - 40, this.facing, this);
        }
    }

    endState() {
        this.state = 'stance_idle';
        this.hitbox = null;
        this.stateTimer = 0;
        
        if (Math.abs(this.vx) > this.speed) {
            this.vx = 0;
        }
    }
    
    resetStatusEffects() {
        this.statusEffects.clear();
        this.isFrozen = false;
        this.speedModifier = 1.0;
        this.attackSpeedModifier = 1.0;
        this.speed = this.baseSpeed;
    }
}