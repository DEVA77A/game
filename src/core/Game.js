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
        
        // Start loop
        requestAnimationFrame(this.loop.bind(this));
        
        window.addEventListener('resize', () => this.renderer.resize());
        this.renderer.resize();
    }

    setupDashboard() {
        // Dashboard Buttons
        const btnPve = document.getElementById('btn-pve');
        const btnPvp = document.getElementById('btn-pvp');
        
        if (btnPve) {
            btnPve.onclick = () => {
                this.startSinglePlayer();
            };
        }

        if (btnPvp) {
            btnPvp.onclick = () => {
                if (typeof io === 'undefined') {
                    alert("Socket.IO not loaded. Please run the server.");
                    return;
                }
                
                if (!this.socket) {
                    try {
                        this.socket = io();
                    } catch (e) {
                        console.error("Socket connection failed", e);
                        return;
                    }
                }
                
                if (!this.socket.connected) {
                    this.socket.connect();
                }

                this.setupSocketEvents();

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

        // Post Match Menu
        const btnRematch = document.getElementById('btn-rematch');
        if (btnRematch) {
            btnRematch.onclick = () => this.rematch();
        }

        const btnMenu = document.getElementById('btn-menu');
        if (btnMenu) {
            btnMenu.onclick = () => this.backToDashboard();
        }
    }

    setupSocketEvents() {
        // FIX: Prevent duplicate listeners
        this.socket.off('roomCreated');
        this.socket.off('gameStart');
        this.socket.off('remoteInput');
        this.socket.off('syncState');
        this.socket.off('roundResult');
        this.socket.off('playerDisconnected');
        this.socket.off('error');

        this.socket.on('roomCreated', (roomId) => {
            this.roomId = roomId;
            document.getElementById('multiplayer-menu').classList.add('hidden');
            document.getElementById('waiting-screen').classList.remove('hidden');
            document.getElementById('display-room-id').innerText = roomId;
        });

        this.socket.on('gameStart', (data) => {
            this.gameMode = 'multi';
            this.playerRole = data.role;
            this.roomId = this.roomId || document.getElementById('room-id-input').value.toUpperCase();
            
            // Hide all menus
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('multiplayer-menu').classList.add('hidden');
            document.getElementById('waiting-screen').classList.add('hidden');
            document.getElementById('post-match-menu').classList.add('hidden');
            document.getElementById('ui-layer').classList.remove('hidden');

            // Update UI labels
            if (this.playerRole === 'p1') {
                document.getElementById('p2-label').innerText = "OPPONENT";
            } else {
                document.getElementById('p2-label').innerText = "YOU (P2)";
            }

            this.initMatch();
            
            // Sync initial state if provided
            if (data.initialState) {
                this.applyState(data.initialState);
            }

            this.startPreFight();
        });

        this.socket.on('remoteInput', (inputState) => {
            if (this.gameMode !== 'multi') return;
            this.remoteInput.updateState(inputState);
        });

        this.socket.on('syncState', (state) => {
            if (this.gameMode !== 'multi') return;
            // Client (P2) accepts Host (P1) authority
            if (this.playerRole === 'p2' && this.gameState === 'fighting') {
                this.applyState(state);
            }
        });

        this.socket.on('roundResult', (data) => {
            // Force sync round result
            if (this.gameState !== 'round_over' && this.gameState !== 'match_over') {
                this.endRound(data.winner === 'p1' ? 'P1 WINS ROUND' : 'P2 WINS ROUND', true);
            }
        });

        this.socket.on('playerDisconnected', () => {
            alert('Opponent disconnected!');
            this.backToDashboard();
        });

        this.socket.on('error', (msg) => {
            alert(msg);
        });
    }

    applyState(state) {
        // Smoothly snap positions if deviation is too high (Anti-Desync)
        const threshold = 20; 
        
        if (Math.abs(this.p1.x - state.p1.x) > threshold) this.p1.x = state.p1.x;
        if (Math.abs(this.p1.y - state.p1.y) > threshold) this.p1.y = state.p1.y;
        
        if (Math.abs(this.p2.x - state.p2.x) > threshold) this.p2.x = state.p2.x;
        if (Math.abs(this.p2.y - state.p2.y) > threshold) this.p2.y = state.p2.y;

        // Sync Health & Timer
        this.p1.health = state.p1.health;
        this.p2.health = state.p2.health;
        
        // Sync State (Important for animations)
        // Only override if local state is idle/move to avoid interrupting attacks
        // Or if the server says we are in a stun state (hitstun, knockdown)
        if (state.p1.state === 'hitstun' || state.p1.state === 'knockdown' || state.p1.state === 'blockstun') {
             this.p1.state = state.p1.state;
        }
        if (state.p2.state === 'hitstun' || state.p2.state === 'knockdown' || state.p2.state === 'blockstun') {
             this.p2.state = state.p2.state;
        }

        if (Math.abs(this.timer - state.timer) > 1) this.timer = state.timer;
    }

    startSinglePlayer() {
        this.cleanupMultiplayer();
        this.gameMode = 'single';
        document.getElementById('dashboard').classList.add('hidden');
        document.getElementById('post-match-menu').classList.add('hidden');
        document.getElementById('ui-layer').classList.remove('hidden');
        
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
        this.entities = [];
        this.projectiles = [];
        this.renderer.clear(); // FIX: Clear particles/effects
        this.timer = 60;

        const spawnProjectile = (x, y, facing, owner) => {
            this.projectiles.push(new Projectile(x, y, facing, owner));
            this.sound.playGlitch(); 
        };

        let p1Input = null;
        let p2Input = null;
        let p2AI = null;

        if (this.gameMode === 'single') {
            p1Input = this.input;
            p2AI = this.ai;
        } else {
            if (this.playerRole === 'p1') {
                p1Input = this.input;
                p2Input = this.remoteInput; 
            } else {
                p1Input = this.remoteInput; 
                p2Input = this.input; 
            }
        }

        this.p1 = new Player(200, 480, '#00f3ff', false, p1Input, null, spawnProjectile);
        const isP2AI = this.gameMode === 'single';
        this.p2 = new Player(800, 480, '#ff00ff', isP2AI, p2Input, p2AI, spawnProjectile);
        this.p2.facing = -1;

        this.entities.push(this.p1, this.p2);
        
        if (this.gameMode === 'single') {
            this.ai.setDifficulty(this.round, this.lastRoundStats);
        }
        
        this.updateUI();
    }

    startPreFight() {
        this.gameState = 'pre_fight';
        document.getElementById('overlay').classList.add('hidden');
        this.countdownTimer = 3.0;
        
        // Reset positions
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

        if (this.gameState === 'pre_fight') {
            this.updatePreFight(dt);
        } else if (this.gameState === 'fighting') {
            this.update(dt);
        } else if (this.gameState === 'round_over') {
            this.updateRoundOver(dt);
        }
        
        if (this.gameState !== 'menu' && this.gameState !== 'waiting') {
            this.renderer.draw(this.entities, [], this.projectiles, this.gameState, this.countdownTimer);
        }
        
        this.input.update();
        
        // Multiplayer Logic
        if (this.gameMode === 'multi' && this.gameState === 'fighting') {
            // 1. Send Input (Input Relay)
            const relevantKeys = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'ShiftLeft', 'KeyJ', 'KeyK', 'KeyL', 'KeyI'];
            let hasInput = false;
            let isHolding = false;
            const justPressedMap = {};
            
            relevantKeys.forEach(k => {
                if (this.input.isJustPressed(k)) {
                    justPressedMap[k] = true;
                    hasInput = true;
                }
                if (this.input.keys[k] !== this.input.prevKeys[k]) {
                    hasInput = true;
                }
                if (this.input.keys[k]) {
                    isHolding = true;
                }
            });

            // FIX: Optimize network traffic - Send on change OR throttle hold
            // Send immediately if input changed (hasInput)
            // Send every 3 frames if holding keys (isHolding) to prevent packet loss issues
            // Send heartbeat every 60 frames
            const frame = Math.floor(this.timer * 60);
            
            if (hasInput || (isHolding && frame % 3 === 0) || frame % 60 === 0) {
                this.socket.emit('playerInput', {
                    roomId: this.roomId,
                    inputState: {
                        keys: this.input.keys,
                        justPressed: justPressedMap
                    }
                });
            }

            // 2. Host Authority (P1 Syncs State)
            // FIX: Increase sync frequency to 15Hz (every 4 frames) for smoother hits
            // Also trigger immediate sync if damage was dealt (needsSync flag)
            if (this.playerRole === 'p1') {
                if (this.needsSync || frame % 4 === 0) {
                    this.socket.emit('syncState', {
                        roomId: this.roomId,
                        state: {
                            p1: { x: this.p1.x, y: this.p1.y, health: this.p1.health, state: this.p1.state, facing: this.p1.facing },
                            p2: { x: this.p2.x, y: this.p2.y, health: this.p2.health, state: this.p2.state, facing: this.p2.facing },
                            timer: this.timer
                        }
                    });
                    this.needsSync = false;
                }
            }
        }

        requestAnimationFrame(this.loop.bind(this));
    }

    updatePreFight(dt) {
        this.countdownTimer -= dt;
        if (this.countdownTimer <= 0) {
            this.startGame();
        }
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
                // FIX: Ensure we only transition once
                if (this.gameState === 'round_over') {
                    this.round++;
                    this.resetRound();
                    this.startPreFight();
                }
            }
        }
    }

    update(dt) {
        this.timer -= dt;
        if (this.timer <= 0) {
            this.endRound('TIME UP');
        }

        this.entities.forEach(e => e.update(dt, e === this.p1 ? this.p2 : this.p1, true));
        this.projectiles.forEach(p => p.update(dt));
        this.projectiles = this.projectiles.filter(p => p.active);

        this.checkCollisions();
        this.resolveBodyCollisions();

        if (this.gameMode === 'single') {
            if (this.p1.state === 'attack_light' || this.p1.state === 'attack_heavy') {
                this.ai.observe(this.p1, this.p2, 'player_attack');
            }
            if (this.p1.state === 'dash') {
                this.ai.observe(this.p1, this.p2, 'player_dash');
            }
        }

        this.updateUI();

        // Check Death (Host Authority in Multi)
        if (this.gameMode === 'single' || this.playerRole === 'p1') {
            if (this.p1.isDead) this.endRound('P2 WINS ROUND');
            else if (this.p2.isDead) this.endRound('P1 WINS ROUND');
        }
    }

    resolveBodyCollisions() {
        const p1 = this.p1;
        const p2 = this.p2;
        const minDist = 40; 

        if (Math.abs(p1.x - p2.x) < minDist && Math.abs(p1.y - p2.y) < 100) {
            const overlap = minDist - Math.abs(p1.x - p2.x);
            const pushDir = p1.x < p2.x ? -1 : 1;
            
            if (!p1.isDead && p1.state !== 'knockdown') p1.x += pushDir * overlap * 0.5;
            if (!p2.isDead && p2.state !== 'knockdown') p2.x -= pushDir * overlap * 0.5;
            
            // Boundary Clamp
            p1.x = Math.max(30, Math.min(1024 - 30, p1.x));
            p2.x = Math.max(30, Math.min(1024 - 30, p2.x));
        }
    }

    checkCollisions() {
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

        this.projectiles.forEach(proj => {
            targets.forEach(target => {
                if (proj.owner === target) return; 
                
                const hb = proj.getHitbox();
                const tb = { x: target.x - 15, y: target.y - 60, w: 30, h: 60 };

                if (hb.x < tb.x + tb.w && hb.x + hb.w > tb.x && hb.y < tb.y + tb.h && hb.y + hb.h > tb.y) {
                    this.resolveHit(hb, target, proj.facing);
                    proj.active = false; 
                    this.renderer.triggerParticles(proj.x, proj.y, proj.color, 20);
                }
            });
        });

        // Dash Collisions
        this.entities.forEach(attacker => {
            if (attacker.state === 'dash') {
                this.entities.forEach(target => {
                    if (attacker === target) return;
                    
                    const ab = { x: attacker.x - 20, y: attacker.y - 50, w: 40, h: 50 };
                    const tb = { x: target.x - 20, y: target.y - 50, w: 40, h: 50 };

                    if (ab.x < tb.x + tb.w && ab.x + ab.w > tb.x && ab.y < tb.y + tb.h && ab.y + ab.h > tb.y) {
                        this.resolveDashHit(attacker, target);
                    }
                });
            }
        });
    }

    resolveDashHit(attacker, target) {
        if (target.state === 'dash') {
            // Clash
            attacker.vx = -attacker.facing * 400;
            attacker.state = 'dash_clash_stun'; 
            attacker.stateTimer = 0.5; 
            attacker.dashCooldown = 1.0;
            
            target.vx = -target.facing * 400;
            target.state = 'dash_clash_stun'; 
            target.stateTimer = 0.5; 
            target.dashCooldown = 1.0;
            
            this.sound.playHit(); 
            this.renderer.triggerShake(10, 0.3);
            this.renderer.triggerParticles((attacker.x + target.x)/2, target.y - 40, '#ffffff', 30);
            return;
        }

        const damage = 8; 
        const knockbackForce = 400;
        
        attacker.vx = -attacker.facing * 200;
        attacker.state = 'idle'; 
        attacker.dashCooldown = 1.0; 
        
        let actualDamage = damage;
        let actualKnockback = knockbackForce;
        
        if (target.state === 'blocking') {
            const hitFromFront = (attacker.facing === 1 && target.facing === -1) || (attacker.facing === -1 && target.facing === 1);
            if (hitFromFront) {
                if (Date.now() - target.blockStartTime < 200) {
                    actualDamage = 0;
                    actualKnockback = 0;
                    target.health = Math.min(100, target.health + 5); 
                    attacker.state = 'hitstun'; 
                    attacker.stateTimer = 0.5;
                    this.renderer.triggerParticles(target.x, target.y - 30, '#00ff00', 20); 
                    this.sound.playGlitch(); 
                    return;
                }
                actualDamage = 2;
                actualKnockback = 100;
                this.renderer.triggerParticles(target.x, target.y - 30, '#ffffff', 5);
            }
        }

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
             if (hitbox.x < tb.x + tb.w && hitbox.x + hitbox.w > tb.x && hitbox.y < tb.y + tb.h && hitbox.y + hitbox.h > tb.y) {
                hit = true;
            }
        }

        if (hit) {
            // FIX: Trigger immediate sync in multiplayer
            if (this.gameMode === 'multi' && this.playerRole === 'p1') {
                this.needsSync = true;
            }

            let damage = hitbox.damage;
            let knockbackX = attackerFacing * hitbox.knockback;
            let knockbackY = (hitbox.type === 'special' || hitbox.type === 'special_projectile' || hitbox.type === 'knockdown_hit') ? -400 : -100;

            if (target.state === 'blocking') {
                const hitFromFront = (attackerFacing === 1 && target.facing === -1) || (attackerFacing === -1 && target.facing === 1);
                if (hitFromFront) {
                    if (Date.now() - target.blockStartTime < 200) {
                        damage = 0;
                        knockbackX = attackerFacing * 50; 
                        knockbackY = 0;
                        target.health = Math.min(100, target.health + 5); 
                        this.renderer.triggerParticles(target.x, target.y - 30, '#00ff00', 20); 
                        this.sound.playGlitch();
                        return; 
                    } else {
                        damage = Math.ceil(damage * 0.1); 
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

    endRound(msg, fromServer = false) {
        if (this.gameState === 'round_over') return;
        
        // In multiplayer, only Host decides round end, unless msg comes from server
        if (this.gameMode === 'multi' && this.playerRole !== 'p1' && !fromServer) return;

        this.gameState = 'round_over';
        this.roundOverTimer = 3.0; 

        this.lastRoundStats = {
            playerWon: !this.p1.isDead && this.p2.isDead,
            playerHP: this.p1.health
        };

        let winner = 'DRAW';
        if (msg.includes('P1')) {
            this.p1Wins++;
            winner = 'P1 WINS ROUND';
        } else if (msg.includes('P2')) {
            this.p2Wins++;
            winner = 'P2 WINS ROUND';
        } else {
            // Calculate based on HP if time up
            if (this.p1.health > this.p2.health) {
                this.p1Wins++;
                winner = 'P1 WINS ROUND';
            } else if (this.p2.health > this.p1.health) {
                this.p2Wins++;
                winner = 'P2 WINS ROUND';
            }
        }

        // Notify server if Host
        if (this.gameMode === 'multi' && this.playerRole === 'p1') {
            this.socket.emit('roundResult', {
                roomId: this.roomId,
                winner: winner.includes('P1') ? 'p1' : 'p2'
            });
        }

        document.getElementById('overlay-title').innerText = winner;
        document.getElementById('overlay-subtitle').innerText = `SCORE: ${this.p1Wins} - ${this.p2Wins}`;
        document.getElementById('overlay').classList.remove('hidden');
    }

    endMatch() {
        this.gameState = 'match_over';
        const winner = this.p1Wins > this.p2Wins ? 'P1 WINS MATCH' : 'P2 WINS MATCH';
        document.getElementById('overlay-title').innerText = winner;
        document.getElementById('overlay-subtitle').innerText = '';
        document.getElementById('overlay').classList.remove('hidden');
        
        // FIX: Show Post Match Menu only for Single Player (Play with PC)
        if (this.gameMode === 'single') {
            document.getElementById('post-match-menu').classList.remove('hidden');
        }
    }

    rematch() {
        // FIX: Reset game state for rematch
        this.p1Wins = 0;
        this.p2Wins = 0;
        this.round = 1;
        this.initMatch();
        this.startPreFight();
        document.getElementById('post-match-menu').classList.add('hidden');
    }

    backToDashboard() {
        this.cleanupMultiplayer();
        this.gameState = 'menu';
        this.gameMode = 'single';
        this.roomId = null;
        
        // Reset UI
        document.getElementById('ui-layer').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('post-match-menu').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
    }

    cleanupMultiplayer() {
        if (this.socket) {
            this.socket.off('roomCreated');
            this.socket.off('gameStart');
            this.socket.off('remoteInput');
            this.socket.off('syncState');
            this.socket.off('roundResult');
            this.socket.off('playerDisconnected');
            this.socket.off('error');
            
            if (this.socket.connected) {
                this.socket.disconnect();
            }
            this.socket = null;
        }
        this.gameMode = 'single';
    }
}