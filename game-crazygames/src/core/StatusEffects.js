// Status Effect System for character abilities
export class StatusEffect {
    constructor(type, duration, data = {}) {
        this.type = type; // 'freeze', 'burn', 'shock', 'slow', 'speedBoost'
        this.duration = duration;
        this.maxDuration = duration;
        this.data = data;
        this.tickTimer = 0;
        this.tickInterval = 1.0; // For burn damage ticks
    }

    update(dt) {
        this.duration -= dt;
        this.tickTimer += dt;
        return this.duration > 0;
    }

    shouldTick() {
        if (this.tickTimer >= this.tickInterval) {
            this.tickTimer = 0;
            return true;
        }
        return false;
    }

    getProgress() {
        return Math.max(0, this.duration / this.maxDuration);
    }
}

export class StatusEffectManager {
    constructor(entity) {
        this.entity = entity;
        this.effects = [];
    }

    addEffect(type, duration, data = {}) {
        // Remove existing effect of same type
        this.effects = this.effects.filter(e => e.type !== type);
        this.effects.push(new StatusEffect(type, duration, data));
    }

    hasEffect(type) {
        return this.effects.some(e => e.type === type);
    }

    getEffect(type) {
        return this.effects.find(e => e.type === type);
    }

    update(dt, entity) {
        const expiredEffects = [];
        
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            
            // Apply effect logic
            switch (effect.type) {
                case 'freeze':
                    // Entity cannot move or attack while frozen
                    entity.isFrozen = true;
                    entity.vx = 0;
                    break;
                    
                case 'burn':
                    // Damage over time - 5 HP per second
                    if (effect.shouldTick()) {
                        const damage = effect.data.damagePerSecond || 5;
                        entity.health -= damage;
                        if (entity.health <= 0) {
                            entity.health = 0;
                            entity.isDead = true;
                        }
                    }
                    break;
                    
                case 'slow':
                    // Applied in Player.js movement calculations
                    entity.speedModifier = effect.data.amount || 0.5;
                    entity.attackSpeedModifier = effect.data.attackSlowAmount || 1.0;
                    break;
                    
                case 'shock':
                    // Enemy slow effect
                    entity.speedModifier = effect.data.slowAmount || 0.5;
                    break;
                    
                case 'speedBoost':
                    // Self speed boost
                    entity.speedModifier = effect.data.boostAmount || 1.5;
                    break;
            }
            
            // Update effect timer
            if (!effect.update(dt)) {
                expiredEffects.push(effect);
                this.effects.splice(i, 1);
            }
        }
        
        // Clean up expired effects
        for (const effect of expiredEffects) {
            switch (effect.type) {
                case 'freeze':
                    entity.isFrozen = false;
                    break;
                case 'slow':
                case 'shock':
                case 'speedBoost':
                    entity.speedModifier = 1.0;
                    entity.attackSpeedModifier = 1.0;
                    break;
            }
        }
        
        // Reset modifiers if no active effects
        if (!this.hasEffect('slow') && !this.hasEffect('shock') && !this.hasEffect('speedBoost')) {
            entity.speedModifier = 1.0;
        }
        if (!this.hasEffect('slow')) {
            entity.attackSpeedModifier = 1.0;
        }
        if (!this.hasEffect('freeze')) {
            entity.isFrozen = false;
        }
    }

    clear() {
        this.effects = [];
        if (this.entity) {
            this.entity.isFrozen = false;
            this.entity.speedModifier = 1.0;
            this.entity.attackSpeedModifier = 1.0;
        }
    }

    getActiveEffects() {
        return this.effects.map(e => ({
            type: e.type,
            progress: e.getProgress(),
            duration: e.duration
        }));
    }
}
