export class AdaptiveAI {
    constructor() {
        // Profile of the opponent (Player)
        this.profile = {
            aggression: 0.5, // 0 = defensive, 1 = aggressive
            dashTendency: 0.5, // 0 = rarely dashes, 1 = dashes often
            attackRangePreference: 'close', // 'close' or 'far'
            reactionTime: 0.3 // seconds
        };

        // Difficulty Parameters
        this.difficultyLevel = 1;
        this.baseReactionTime = 0.4;
        this.baseAggression = 0.3;
        this.blockChance = 0.2;
        this.specialChance = 0.05;
        this.dodgeChance = 0.1;

        // Learning weights
        this.learningRate = 0.1;
        
        // Internal state
        this.state = 'neutral'; // neutral, chase, retreat, attack
        this.decisionTimer = 0;
        this.targetDistance = 100;
    }

    setDifficulty(level, stats) {
        this.difficultyLevel = level;
        
        // Scale parameters based on round number (1, 2, 3)
        // Level 1: Standard
        // Level 2: Aggressive & Faster
        // Level 3: Boss Mode
        
        this.baseReactionTime = Math.max(0.1, 0.5 - (level * 0.12)); // 0.38 -> 0.26 -> 0.14
        this.baseAggression = Math.min(0.9, 0.3 + (level * 0.15));   // 0.45 -> 0.60 -> 0.75
        this.blockChance = Math.min(0.9, 0.2 + (level * 0.2));       // 0.4 -> 0.6 -> 0.8
        this.specialChance = Math.min(0.5, 0.02 + (level * 0.05));   // 0.07 -> 0.12 -> 0.17
        this.dodgeChance = Math.min(0.8, 0.1 + (level * 0.2));       // 0.3 -> 0.5 -> 0.7

        // Dynamic Adjustment: If player dominated last round, boost AI further
        if (stats && stats.playerWon && stats.playerHP > 60) {
            this.baseReactionTime -= 0.05;
            this.baseAggression += 0.1;
            this.blockChance += 0.1;
            console.log("AI Enraged: Player dominated previous round.");
        }

        console.log(`AI Difficulty Lvl ${level}: React=${this.baseReactionTime.toFixed(2)}s, Aggr=${this.baseAggression.toFixed(2)}`);
    }

    observe(player, opponent, event) {
        // Update profile based on events
        if (event === 'player_attack') {
            this.profile.aggression = Math.min(1, this.profile.aggression + 0.05);
        } else if (event === 'player_dash') {
            this.profile.dashTendency = Math.min(1, this.profile.dashTendency + 0.1);
        } else if (event === 'player_hit') {
            this.profile.aggression += 0.02;
        } else if (event === 'player_retreat') {
            this.profile.aggression = Math.max(0, this.profile.aggression - 0.05);
        }
    }

    decideMove(ai, player, dt) {
        this.decisionTimer -= dt;
        
        // AI respect knockdown recovery
        // If player is down or getting up, back off
        if (player.state === 'knockdown' || player.state === 'getting_up' || player.invulnerable > 0) {
            const dx = player.x - ai.x;
            // Retreat slightly to give space
            if (Math.abs(dx) < 150) {
                return { dx: dx > 0 ? -1 : 1, dy: 0, dash: false, punch: false, kick: false, special: false, block: true };
            } else {
                // Stand guard
                return { dx: 0, dy: 0, dash: false, punch: false, kick: false, special: false, block: true };
            }
        }

        const dist = Math.sqrt(Math.pow(player.x - ai.x, 2) + Math.pow(player.y - ai.y, 2));
        const dx = player.x - ai.x;
        const dy = player.y - ai.y;

        // Default output
        let output = { dx: 0, dy: 0, dash: false, punch: false, kick: false, special: false, block: false };

        // High level strategy update
        if (this.decisionTimer <= 0) {
            // Reaction time decreases with difficulty
            this.decisionTimer = this.baseReactionTime + Math.random() * 0.1;
            
            // Adapt strategy based on profile & difficulty
            // Higher difficulty = AI cares less about player aggression and forces its own game
            const effectiveAggression = (this.profile.aggression + this.baseAggression) / 2;
            
            if (effectiveAggression > 0.6) {
                this.targetDistance = 60; // Pressure
            } else {
                this.targetDistance = 150; // Defensive
            }
        }

        // Movement Logic
        if (dist > this.targetDistance + 20) {
            // Chase
            output.dx = dx > 0 ? 1 : -1;
            output.dy = dy > 0 ? 1 : -1; 
            
            // Dash to close gap (More likely at higher difficulty)
            // AI uses dash aggressively to pressure the player
            let dashChance = this.profile.dashTendency * 0.1 + (this.difficultyLevel * 0.08);
            if (dist > 250) dashChance += 0.05; // Dash if far
            
            if (Math.random() < dashChance && ai.dashCooldown <= 0) {
                output.dash = true;
            }
        } else if (dist < this.targetDistance - 20) {
            // Retreat
            output.dx = dx > 0 ? -1 : 1;
            output.dy = dy > 0 ? -1 : 1;
        } else {
            // In range
            output.dx = 0;
            
            // Block Logic (Scaled by difficulty)
            // AI blocks if player is attacking or dashing in close
            if ((player.state.startsWith('attack_') || player.state === 'dash') && dist < 200) {
                let blockProb = this.blockChance;
                // Increase block chance for combo finishers or specials
                if (player.state.endsWith('_3') || player.state.includes('special')) blockProb += 0.3;
                
                if (Math.random() < blockProb) {
                    output.block = true;
                    
                    // Attempt Perfect Block (Release block occasionally to re-trigger)
                    // If AI is already blocking, sometimes release it to try and time the next hit
                    if (ai.state === 'blocking' && Math.random() < 0.1 * this.difficultyLevel) {
                        output.block = false; 
                    }
                }
            }
        }

        // React to Projectiles / Specials
        if (player.state === 'attack_special_windup' || player.state === 'attack_special_active') {
            if (Math.random() < this.dodgeChance) { 
                if (ai.isOnGround) output.dy = -1; // Jump
            } else if (Math.random() < this.blockChance + 0.2) {
                output.block = true; // Block special
            }
        }

        // Attack Logic
        if (!output.block) {
            // AI combo decision logic
            // If already in a combo, try to continue it
            if (ai.state.startsWith('attack_') && ai.comboTimer > 0) {
                // Continue combo based on aggression and difficulty
                let continueChance = 0.5 + (this.difficultyLevel * 0.15);
                if (this.profile.aggression > 0.7) continueChance += 0.2;
                
                if (Math.random() < continueChance) {
                    if (ai.state.includes('punch')) output.punch = true;
                    if (ai.state.includes('kick')) output.kick = true;
                }
            }

            // AI special attack decision
            // Use special when opportunity detected
            if (ai.specialCooldown <= 0 && dist > 200) {
                 // Check alignment (roughly same height)
                 if (Math.abs(dy) < 50) {
                     // Check difficulty probability
                     let chance = this.specialChance; // Base chance
                     
                     // Increase chance if player is doing something punishable or AI is high level
                     if (player.state === 'attack_special_windup' || player.state === 'dash' || player.state === 'attack_punch') {
                         chance += 0.2;
                     }
                     
                     // Difficulty multiplier
                     if (this.difficultyLevel >= 2) chance *= 1.5;
                     if (this.difficultyLevel >= 3) chance *= 2.0;

                     const facingPlayer = (dx > 0 && ai.facing === 1) || (dx < 0 && ai.facing === -1);
                     
                     if (facingPlayer && Math.random() < chance) {
                         output.special = true;
                     }
                 }
            }

            if (dist < 60) {
                // Close range: Punch
                if (Math.random() < 0.1 + (this.baseAggression * 0.5)) {
                    output.punch = true;
                }
            } else if (dist < 100) {
                // Mid range: Kick
                if (Math.random() < 0.1 + (this.baseAggression * 0.4)) {
                    output.kick = true;
                }
            } else if (dist > 200 && ai.specialCooldown <= 0) {
                // Fallback random special (kept for unpredictability but reduced chance)
                const facingPlayer = (dx > 0 && ai.facing === 1) || (dx < 0 && ai.facing === -1);
                if (facingPlayer && Math.random() < this.specialChance * 0.5) { 
                    output.special = true;
                }
            }
        }

        return output;
    }
}