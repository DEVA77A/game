import { Input } from './Input.js';
import { SoundManager } from './SoundManager.js';
import { Player } from '../entities/Player.js';
import { Projectile } from '../entities/Projectile.js';
import { Renderer } from '../systems/Renderer.js';
import { AdaptiveAI } from '../ai/AdaptiveAI.js';
import { NetworkInput } from './NetworkInput.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);
        this.input = new Input();
        this.sound = new SoundManager();
        this.ai = new AdaptiveAI();
        
        // Multiplayer
        this.socket = null;
        if (typeof io !== 'undefined') {
            try {
                this.socket = io();
                console.log("Socket.IO connected!");
            } catch (e) {
                console.error("Socket.IO connection failed:", e);
            }
        } else {
            console.warn('Socket.IO library not found. Are you running via run_game.bat?');
        }

        this.gameMode = 'single'; // 'single' or 'multi'
        this.roomId = null;
        this.playerRole = 'p1'; // 'p1' or 'p2'
        this.remoteInput = new NetworkInput();

        this.lastTime = 0;
        this.timer = 60;
        this.gameState = 'menu'; // menu, waiting, start, pre_fight, fighting, round_over, match_over

        this.entities = [];
        this.projectiles = [];
        
        this.p1 = null;
        this.p2 = null;
        
        // Round System
        this.p1Wins = 0;
        this.p2Wins = 0;
        this.round = 1;
        this.maxWins = 2; // Best of 3
        
        this.countdownTimer = 0;
        this.roundOverTimer = 0;
        this.lastRoundStats = null;

        // Ensure DOM is ready before attaching listeners
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupDashboard());
        } else {
            this.setupDashboard();
        }

        if (this.socket) {
            this.setupSocketEvents();
        }
        
        // Start loop but it will just render menu/waiting until game starts
        requestAnimationFrame(this.loop.bind(this));
        
        window.addEventListener('resize', () => this.renderer.resize());
        this.renderer.resize();
    }

    setupDashboard() {
        const btnPve = document.getElementById('btn-pve');
        const btnPvp = document.getElementById('btn-pvp');
        
        if (btnPve) {
            btnPve.onclick = () => {
                console.log('Starting Single Player');
                this.startSinglePlayer();
            };
        }

        if (btnPvp) {
            btnPvp.onclick = () => {
                if (!this.socket) {
                    let msg = "Multiplayer unavailable.\n\n";
                    if (window.location.protocol === 'file:') {
                        msg += "REASON: You opened the file directly.\nSOLUTION: Run 'run_game.bat' to start the server.";
                    } else if (!window.location.host.includes('3000')) {
                        msg += `REASON: You are on ${window.location.host}, but the server is on port 3000.\nSOLUTION: Close this tab and go to http://localhost:3000`;
                    } else {
                        msg += "REASON: Server connection failed.\nSOLUTION: Check the terminal window for errors.";
                    }
                    alert(msg);
                    return;
                }
                console.log('Opening Multiplayer Menu');
                document.getElementById('dashboard').classList.add('hidden');
                document.getElementById('multiplayer-menu').classList.remove('hidden');
            };
        }

        // Multiplayer Menu
        const btnCreate = document.getElementById('btn-create-room');
        if (btnCreate) {
            btnCreate.onclick = () => {
                if (this.socket) this.socket.emit('createRoom');
            };
        }

        const btnJoin = document.getElementById('btn-join-room');
        if (btnJoin) {
            btnJoin.onclick = () => {
                const roomId = document.getElementById('room-id-input').value.toUpperCase();
                if (roomId && this.socket) this.socket.emit('joinRoom', roomId);
            };
        }

        const btnBack = document.getElementById('btn-back');
        if (btnBack) {
            btnBack.onclick = () => {
                document.getElementById('multiplayer-menu').classList.add('hidden');
                document.getElementById('dashboard').classList.remove('hidden');
            };
        }
    }

    setupSocketEvents() {
        this.socket.on('roomCreated', (roomId) => {
            this.roomId = roomId;
            document.getElementById('multiplayer-menu').classList.add('hidden');
            document.getElementById('waiting-screen').classList.remove('hidden');
            document.getElementById('display-room-id').innerText = roomId;
        });

        this.socket.on('gameStart', (data) => {
            // data: { role: 'p1' or 'p2', opponent: socketId }
            this.gameMode = 'multi';
            this.playerRole = data.role;
            this.roomId = this.roomId || document.getElementById('room-id-input').value.toUpperCase();
            
            // Hide all menus
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('multiplayer-menu').classList.add('hidden');
            document.getElementById('waiting-screen').classList.add('hidden');
            document.getElementById('ui-layer').classList.remove('hidden');

            // Update UI labels
            if (this.playerRole === 'p1') {
                document.getElementById('p2-label').innerText = "OPPONENT";
            } else {
                // If I am P2, swap UI labels visually or just keep standard?
                // Standard: Left is always P1 (Blue), Right is P2 (Pink).
                // If I am P2, I control the Pink character.
                document.getElementById('p2-label').innerText = "YOU (P2)";
                // Maybe indicate P1 is opponent
            }

            this.initMatch();
            this.startPreFight();
        });

        this.socket.on('remoteInput', (inputState) => {
            this.remoteInput.updateState(inputState);
        });

        this.socket.on('syncState', (state) => {
            // If I am P2, I accept P1's authority on positions to prevent desync
            if (this.playerRole === 'p2' && this.gameState === 'fighting') {
                // Smoothly interpolate or snap? Snapping is safer for now to fix "stuck" states.
                const threshold = 50; // Only snap if deviation is large
                
                if (Math.abs(this.p1.x - state.p1.x) > threshold) this.p1.x = state.p1.x;
                if (Math.abs(this.p1.y - state.p1.y) > threshold) this.p1.y = state.p1.y;
                
                if (Math.abs(this.p2.x - state.p2.x) > threshold) this.p2.x = state.p2.x;
                if (Math.abs(this.p2.y - state.p2.y) > threshold) this.p2.y = state.p2.y;

                // Sync Health
                this.p1.health = state.p1.health;
                this.p2.health = state.p2.health;
                
                // Sync Timer
                if (Math.abs(this.timer - state.timer) > 2) this.timer = state.timer;
            }
        });

        this.socket.on('syncRound', (data) => {
            // data: { winner: 'p1' | 'p2' }
            // Force sync round result if needed
        });

        this.socket.on('playerDisconnected', () => {
            alert('Opponent disconnected!');
            location.reload(); 
        });

        this.socket.on('error', (msg) => {
            alert(msg);
        });
    }

    startSinglePlayer() {
        this.gameMode = 'single';
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('ui-layer').classList.remove('hidden');
        
        // UI Listeners for restart
        window.addEventListener('keydown', (e) => {
            if ((this.gameState === 'start' || this.gameState === 'match_over') && e.code === 'Space') {
                this.initMatch();
                this.startPreFight();
            }
        });

        this.initMatch();
        this.startPreFight();
    }

    initMatch() {
        this.p1Wins = 0;
        this.p2Wins = 0;
        this.round = 1;
        this.lastRoundStats = null;
        this.resetRound();
        this.updateUI();
    }

    resetRound() {
        // Reset Entities
        this.entities = [];
        this.projectiles = [];
        this.timer = 60;

        // Create Players
        const spawnProjectile = (x, y, facing, owner) => {
            this.projectiles.push(new Projectile(x, y, facing, owner));
            this.sound.playGlitch(); 
        };

        // P1 is always Blue, P2 is always Pink
        // In Single Player: P1 = Human, P2 = AI
        // In Multiplayer: 
        //   If role == p1: P1 = Human, P2 = Remote
        //   If role == p2: P1 = Remote, P2 = Human

        let p1Input = null;
        let p2Input = null;
        let p2AI = null;

        if (this.gameMode === 'single') {
            p1Input = this.input;
            p2AI = this.ai;
        } else {
            if (this.playerRole === 'p1') {
                p1Input = this.input;
                p2Input = this.remoteInput; // Remote controls P2
            } else {
                p1Input = this.remoteInput; // Remote controls P1
                p2Input = this.input; // I control P2
            }
        }

        this.p1 = new Player(200, 480, '#00f3ff', false, p1Input, null, spawnProjectile);
        
        // P2 is AI only if single player
        const isP2AI = this.gameMode === 'single';
        this.p2 = new Player(800, 480, '#ff00ff', isP2AI, p2Input, p2AI, spawnProjectile);
        this.p2.facing = -1;

        this.entities.push(this.p1, this.p2);
        
        // Set AI Difficulty based on round and previous performance
        if (this.gameMode === 'single') {
            this.ai.setDifficulty(this.round, this.lastRoundStats);
        }
        
        this.updateUI();
    }

    startPreFight() {
        this.gameState = 'pre_fight';
        document.getElementById('overlay').classList.add('hidden');
        this.countdownTimer = 3.0;
        // Ensure positions are reset if coming from a previous round
        this.p1.x = 200; this.p1.y = 480; this.p1.health = 100; this.p1.isDead = false; this.p1.state = 'idle';
        this.p2.x = 800; this.p2.y = 480; this.p2.health = 100; this.p2.isDead = false; this.p2.state = 'idle';
        this.p2.facing = -1;
        this.projectiles = [];
    }

    startGame() {
        this.gameState = 'fighting';
        this.sound.playGlitch();
        this.renderer.triggerGlitch(1.0);
        this.renderer.triggerShake(10, 0.5);
    }

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); 
        this.lastTime = timestamp;

        if (this.gameState === 'menu' || this.gameState === 'waiting') {
            // Just render background or idle animation
            // this.renderer.draw(...) could be called here for a menu bg
        } else if (this.gameState === 'pre_fight') {
            this.updatePreFight(dt);
        } else if (this.gameState === 'fighting') {
            this.update(dt);
        } else if (this.gameState === 'round_over') {
            this.updateRoundOver(dt);
        }
        
        // Pass round info to renderer if needed, or just draw
        if (this.gameState !== 'menu' && this.gameState !== 'waiting') {
            this.renderer.draw(this.entities, [], this.projectiles, this.gameState, this.countdownTimer);
        }
        
        this.input.update();
        
        // Multiplayer Input Sync
        if (this.gameMode === 'multi' && this.gameState === 'fighting') {
            const relevantKeys = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'ShiftLeft', 'KeyJ', 'KeyK', 'KeyL'];
            let hasInput = false;
            const justPressedMap = {};
            
            // Check if any key changed state or was just pressed
            relevantKeys.forEach(k => {
                if (this.input.isJustPressed(k)) {
                    justPressedMap[k] = true;
                    hasInput = true;
                }
                if (this.input.keys[k] !== this.input.prevKeys[k]) {
                    hasInput = true;
                }
            });

            // Optimization: Only send packet if input CHANGED or every 10 frames (heartbeat)
            // This reduces lag significantly
            if (hasInput || this.timer * 60 % 10 === 0) {
                this.socket.emit('playerInput', {
                    roomId: this.roomId,
                    inputState: {
                        keys: this.input.keys,
                        justPressed: justPressedMap
                    }
                });
            }

            // Host Authority (P1 Syncs State)
            // P1 sends game state every 30 frames (0.5s) to fix desync
            if (this.playerRole === 'p1' && Math.floor(this.timer * 60) % 30 === 0) {
                this.socket.emit('syncState', {
                    roomId: this.roomId,
                    state: {
                        p1: { x: this.p1.x, y: this.p1.y, health: this.p1.health },
                        p2: { x: this.p2.x, y: this.p2.y, health: this.p2.health },
                        timer: this.timer
                    }
                });
            }
        }

        requestAnimationFrame(this.loop.bind(this));
    }

    updatePreFight(dt) {
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 0) {
            this.startGame();
        }
        // Force stance_idle and disable control
        this.entities.forEach(e => {
            e.state = 'stance_idle';
            e.update(dt, e === this.p1 ? this.p2 : this.p1, false);
        });
    }

    updateRoundOver(dt) {
        this.roundOverTimer -= dt;
        if (this.roundOverTimer <= 0) {
            if (this.p1Wins >= this.maxWins || this.p2Wins >= this.maxWins) {
                this.endMatch();
            } else {
                this.round++;
                this.resetRound();
                this.startPreFight();
            }
        }
    }

    update(dt) {
        // Timer
        this.timer -= dt;
        if (this.timer <= 0) {
            this.endRound('TIME UP');
        }

        // Update Entities
        this.entities.forEach(e => e.update(dt, e === this.p1 ? this.p2 : this.p1, true));
        this.projectiles.forEach(p => p.update(dt));

        // Cleanup
        this.projectiles = this.projectiles.filter(p => p.active);

        // Collision Detection
        this.checkCollisions();
        this.resolveBodyCollisions();

        // AI Observation (Only in Single Player)
        if (this.gameMode === 'single') {
            if (this.p1.state === 'attack_light' || this.p1.state === 'attack_heavy') {
                this.ai.observe(this.p1, this.p2, 'player_attack');
            }
            if (this.p1.state === 'dash') {
                this.ai.observe(this.p1, this.p2, 'player_dash');
            }
        }

        // UI Update
        this.updateUI();

        // Check Death
        if (this.p1.isDead) this.endRound('P2 WINS ROUND');
        if (this.p2.isDead) this.endRound('P1 WINS ROUND');
    }

    resolveBodyCollisions() {
        // Prevent edge trapping and overlapping
        const p1 = this.p1;
        const p2 = this.p2;
        const minDist = 40; // Minimum distance between centers

        if (Math.abs(p1.x - p2.x) < minDist && Math.abs(p1.y - p2.y) < 100) {
            const overlap = minDist - Math.abs(p1.x - p2.x);
            const pushDir = p1.x < p2.x ? -1 : 1;
            
            // Push apart
            if (!p1.isDead && p1.state !== 'knockdown') p1.x += pushDir * overlap * 0.5;
            if (!p2.isDead && p2.state !== 'knockdown') p2.x -= pushDir * overlap * 0.5;
            
            // If one is pinned against wall, push the other more
            if (p1.x < 30) p2.x += overlap;
            if (p2.x > 1024 - 30) p1.x -= overlap;
        }
    }

    checkCollisions() {
        // 1. Melee Attacks
        const meleeAttackers = this.entities;
        const targets = this.entities; 

        meleeAttackers.forEach(attacker => {
            if (attacker.hitbox && attacker.hitbox.type !== 'special_projectile') {
                targets.forEach(target => {
                    if (attacker === target) return; 
                    this.resolveHit(attacker.hitbox, target, attacker.facing);
                });
            }
        });

        // 2. Projectiles
        this.projectiles.forEach(proj => {
            targets.forEach(target => {
                if (proj.owner === target) return; 
                
                const hb = proj.getHitbox();
                const tb = { x: target.x - 15, y: target.y - 60, w: 30, h: 60 };

                if (hb.x < tb.x + tb.w &&
                    hb.x + hb.w > tb.x &&
                    hb.y < tb.y + tb.h &&
                    hb.y + hb.h > tb.y) {
                    
                    this.resolveHit(hb, target, proj.facing);
                    proj.active = false; 
                    this.renderer.triggerParticles(proj.x, proj.y, proj.color, 20);
                }
            });
        });

        // 3. Dash Collisions
        // Dash collision detection
        this.entities.forEach(attacker => {
            if (attacker.state === 'dash') {
                this.entities.forEach(target => {
                    if (attacker === target) return;
                    
                    // Dash hitbox is roughly the body size
                    const ab = { x: attacker.x - 20, y: attacker.y - 50, w: 40, h: 50 };
                    const tb = { x: target.x - 20, y: target.y - 50, w: 40, h: 50 };

                    if (ab.x < tb.x + tb.w &&
                        ab.x + ab.w > tb.x &&
                        ab.y < tb.y + tb.h &&
                        ab.y + ab.h > tb.y) {
                        
                        this.resolveDashHit(attacker, target);
                    }
                });
            }
        });
    }

    resolveDashHit(attacker, target) {
        // Dash vs dash collision resolution
        if (target.state === 'dash') {
            // Clash Effect: Both bounce back
            attacker.vx = -attacker.facing * 400;
            attacker.state = 'dash_clash_stun'; // New stun state
            attacker.stateTimer = 0.5; // Stun duration
            attacker.dashCooldown = 1.0;
            
            target.vx = -target.facing * 400;
            target.state = 'dash_clash_stun'; // New stun state
            target.stateTimer = 0.5; // Stun duration
            target.dashCooldown = 1.0;
            
            this.sound.playHit(); 
            this.renderer.triggerShake(10, 0.3);
            this.renderer.triggerParticles((attacker.x + target.x)/2, target.y - 40, '#ffffff', 30);
            return;
        }

        // Dash collision knockdown
        // Dash HP damage
        // Dash recovery

        const damage = 8; // Base dash damage
        const knockbackForce = 400;
        
        // Attacker bounces back slightly and stops
        attacker.vx = -attacker.facing * 200;
        attacker.state = 'idle'; 
        attacker.dashCooldown = 1.0; // Prevent spam
        
        // Target takes hit
        let actualDamage = damage;
        let actualKnockback = knockbackForce;
        
        // Blocking reduces dash damage
        if (target.state === 'blocking') {
            const hitFromFront = (attacker.facing === 1 && target.facing === -1) || (attacker.facing === -1 && target.facing === 1);
            if (hitFromFront) {
                // Perfect block timing check
                if (Date.now() - target.blockStartTime < 200) {
                    // Perfect Block!
                    actualDamage = 0;
                    actualKnockback = 0;
                    target.health = Math.min(100, target.health + 5); // HP gain on perfect block
                    attacker.state = 'hitstun'; // Stun attacker
                    attacker.stateTimer = 0.5;
                    this.renderer.triggerParticles(target.x, target.y - 30, '#00ff00', 20); // Green flash
                    this.sound.playGlitch(); // Distinct sound
                    return;
                }

                actualDamage = 2;
                actualKnockback = 100;
                this.renderer.triggerParticles(target.x, target.y - 30, '#ffffff', 5);
            }
        }

        // Apply damage if not fully blocked or if we want chip damage
        target.takeDamage(actualDamage, attacker.facing * actualKnockback, -200, 'dash_collision');
        
        if (target.state !== 'blocking') {
             this.sound.playHit();
             this.renderer.triggerShake(5, 0.2);
             this.renderer.triggerParticles((attacker.x + target.x)/2, target.y - 30, '#ffaa00', 15);
        }
    }

    resolveHit(hitbox, target, attackerFacing) {
        const tb = { x: target.x - 15, y: target.y - 60, w: 30, h: 60 };
        
        let hit = false;
        if (hitbox.type === 'special_projectile') {
            hit = true; 
        } else {
             if (hitbox.x < tb.x + tb.w &&
                hitbox.x + hitbox.w > tb.x &&
                hitbox.y < tb.y + tb.h &&
                hitbox.y + hitbox.h > tb.y) {
                hit = true;
            }
        }

        if (hit) {
            let damage = hitbox.damage;
            let knockbackX = attackerFacing * hitbox.knockback;
            let knockbackY = (hitbox.type === 'special' || hitbox.type === 'special_projectile' || hitbox.type === 'knockdown_hit') ? -400 : -100;

            // Check Block
            if (target.state === 'blocking') {
                const hitFromFront = (attackerFacing === 1 && target.facing === -1) || (attackerFacing === -1 && target.facing === 1);
                if (hitFromFront) {
                    // Perfect block timing check
                    if (Date.now() - target.blockStartTime < 200) {
                        // Perfect Block!
                        damage = 0;
                        knockbackX = attackerFacing * 50; // Minimal pushback
                        knockbackY = 0;
                        target.health = Math.min(100, target.health + 5); // HP gain on perfect block
                        
                        // Stun attacker if melee
                        if (hitbox.type !== 'special_projectile') {
                            // Find attacker (hacky way since we don't pass attacker ref here, but we can infer or just skip stun for now)
                            // Ideally we'd stun the attacker. For now, let's just give advantage.
                        }
                        
                        this.renderer.triggerParticles(target.x, target.y - 30, '#00ff00', 20); // Green flash
                        this.sound.playGlitch();
                        return; // No damage taken
                    } else {
                        // Normal Block
                        damage = Math.ceil(damage * 0.1); // Chip damage
                        knockbackX *= 0.5;
                        knockbackY = 0;
                        target.state = 'blockstun';
                        target.stateTimer = 0.2;
                        this.renderer.triggerParticles(target.x, target.y - 30, '#ffffff', 5); 
                    }
                }
            }

            target.takeDamage(damage, knockbackX, knockbackY, hitbox.type);
            
            if (target.state !== 'blocking' && target.state !== 'blockstun') {
                this.sound.playHit();
                this.renderer.triggerShake(hitbox.damage / 2, 0.2);
                this.renderer.triggerParticles(target.x, target.y - 30, target.color, 15);
            }
            
            if (target === this.p2) {
                this.ai.observe(this.p1, this.p2, 'player_hit');
            }
        }
    }

    updateUI() {
        document.getElementById('p1-health').style.width = `${this.p1.health}%`;
        document.getElementById('p2-health').style.width = `${this.p2.health}%`;
        document.getElementById('timer').innerText = Math.ceil(this.timer);
        
        // Round UI
        document.getElementById('round-display').innerText = `ROUND ${this.round}`;
        document.getElementById('p1-wins').innerText = `WINS: ${this.p1Wins}`;
        document.getElementById('p2-wins').innerText = `WINS: ${this.p2Wins}`;

        const cooldownEl = document.getElementById('special-cooldown');
        if (cooldownEl) {
            if (this.p1.specialCooldown > 0) {
                cooldownEl.innerText = `SPECIAL: ${this.p1.specialCooldown.toFixed(1)}s`;
                cooldownEl.style.color = '#555';
                cooldownEl.style.textShadow = 'none';
            } else {
                cooldownEl.innerText = 'SPECIAL READY';
                cooldownEl.style.color = '#00f3ff';
                cooldownEl.style.textShadow = '0 0 10px #00f3ff';
            }
        }

        if (this.gameMode === 'single') {
            document.getElementById('ai-stats').innerHTML = `
                Aggression: ${(this.ai.profile.aggression * 100).toFixed(0)}%<br>
                Dash Tendency: ${(this.ai.profile.dashTendency * 100).toFixed(0)}%<br>
                Strategy: ${this.ai.targetDistance > 100 ? 'Defensive' : 'Aggressive'}
            `;
        } else {
            document.getElementById('ai-stats').innerHTML = `MULTIPLAYER MODE<br>Room: ${this.roomId}`;
        }
    }

    endRound(msg) {
        if (this.gameState === 'round_over') return;
        
        this.gameState = 'round_over';
        this.roundOverTimer = 3.0; // 3 seconds before next round

        // Store stats for next round difficulty adjustment
        this.lastRoundStats = {
            playerWon: !this.p1.isDead && this.p2.isDead,
            playerHP: this.p1.health
        };

        // Determine winner
        let winner = 'DRAW';
        if (this.p1.isDead && !this.p2.isDead) {
            this.p2Wins++;
            winner = 'P2 WINS ROUND';
        } else if (this.p2.isDead && !this.p1.isDead) {
            this.p1Wins++;
            winner = 'P1 WINS ROUND';
        } else {
            // Time up or double KO
            if (this.p1.health > this.p2.health) {
                this.p1Wins++;
                winner = 'P1 WINS ROUND';
                this.lastRoundStats.playerWon = true;
            } else if (this.p2.health > this.p1.health) {
                this.p2Wins++;
                winner = 'P2 WINS ROUND';
                this.lastRoundStats.playerWon = false;
            } else {
                winner = 'DRAW ROUND';
                this.lastRoundStats.playerWon = false;
            }
        }

        document.getElementById('overlay-title').innerText = winner;
        document.getElementById('overlay-subtitle').innerText = `SCORE: ${this.p1Wins} - ${this.p2Wins}`;
        document.getElementById('overlay').classList.remove('hidden');
    }

    endMatch() {
        this.gameState = 'match_over';
        const winner = this.p1Wins > this.p2Wins ? 'P1 WINS MATCH' : 'P2 WINS MATCH';
        document.getElementById('overlay-title').innerText = winner;
        
        if (this.gameMode === 'single') {
            document.getElementById('overlay-subtitle').innerText = 'Press SPACE to Restart';
        } else {
            document.getElementById('overlay-subtitle').innerText = 'Refresh to Play Again';
        }
        
        document.getElementById('overlay').classList.remove('hidden');
    }
}