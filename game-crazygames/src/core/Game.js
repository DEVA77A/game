import { Input } from './Input.js';
import { SoundManager } from './SoundManager.js';
import { Player } from '../entities/Player.js';
import { Projectile } from '../entities/Projectile.js';
import { Renderer } from '../systems/Renderer.js';
import { AdaptiveAI } from '../ai/AdaptiveAI.js';
import { NetworkInput } from './NetworkInput.js';
import { CHARACTERS, getRandomCharacter, getCharacterById } from './Characters.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);
        this.input = new Input(this.canvas);
        this.sound = new SoundManager();
        this.ai = new AdaptiveAI();
        
        // Multiplayer
        this.socket = null;
        if (typeof io !== 'undefined') {
            try {
                // FIX: Robust connection settings - always stay connected
                this.socket = io({
                    // Use both websocket and polling for maximum compatibility
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: Infinity, // Never stop trying
                    reconnectionDelay: 500,
                    reconnectionDelayMax: 2000,
                    timeout: 20000,
                    autoConnect: true,
                    forceNew: false
                });
                console.log("Socket.IO initializing...");
                
                // Update status immediately if already connected
                if (this.socket.connected) {
                    const el = document.getElementById('status-text');
                    if(el) { el.innerText = "ONLINE"; el.style.color = "#00ff00"; }
                }
                
                this.socket.on('connect', () => {
                    console.log("Socket connected!");
                    const el = document.getElementById('status-text');
                    if(el) { el.innerText = "ONLINE"; el.style.color = "#00ff00"; }
                });

                this.socket.on('disconnect', (reason) => {
                    console.log("Socket disconnected:", reason);
                    const el = document.getElementById('status-text');
                    if(el) { el.innerText = "RECONNECTING..."; el.style.color = "#ffaa00"; }
                    // Force reconnect if server disconnected us
                    if (reason === 'io server disconnect') {
                        this.socket.connect();
                    }
                });

                this.socket.on('reconnect', (attemptNumber) => {
                    console.log("Socket reconnected after", attemptNumber, "attempts");
                    const el = document.getElementById('status-text');
                    if(el) { el.innerText = "ONLINE"; el.style.color = "#00ff00"; }
                });

                this.socket.on('reconnect_attempt', (attemptNumber) => {
                    const el = document.getElementById('status-text');
                    if(el) { el.innerText = `RECONNECTING (${attemptNumber})...`; el.style.color = "#ffaa00"; }
                });

                this.socket.on('connect_error', (err) => {
                    console.error("Connection Error:", err.message);
                    const el = document.getElementById('status-text');
                    if(el) { el.innerText = "CONNECTING..."; el.style.color = "#ffaa00"; }
                });
                
                // Ensure connection on page load
                if (!this.socket.connected) {
                    this.socket.connect();
                }
            } catch (e) {
                console.error("Socket.IO connection failed:", e);
            }
        } else {
            // Socket.IO not loaded - show error
            const el = document.getElementById('status-text');
            if(el) { el.innerText = "NO SOCKET.IO"; el.style.color = "#ff0000"; }
        }

        this.gameMode = 'single'; // 'single' or 'multi'
        this.roomId = null;
        this.playerRole = 'p1'; // 'p1' or 'p2'
        this.remoteInput = new NetworkInput();

        // Character Selection - load from localStorage if saved
        const savedChar = localStorage.getItem('selectedCharacter');
        this.selectedCharacter = savedChar || 'ice'; // Default character for player
        this.p2Character = null; // Will be random for AI, synced for multiplayer

        // Multiplayer: identify the current match so we can ignore late packets from the previous one
        this.matchId = 0;

        // Net smoothing (used by P2 to smooth host snapshots)
        this.netStateBuffer = [];
        this.netInterpolationDelayMs = 12; // very low for responsiveness
        this.netMaxBufferMs = 250;
        this.syncAccumulator = 0;
        this.syncHz = 45; // Higher host snapshot rate for smoother sync

        // Velocity prediction for P1 on P2's view (reduces perceived latency)
        this.p1PredictedVx = 0;
        this.p1PredictedVy = 0;
        this.lastP1SnapshotX = 0;
        this.lastP1SnapshotY = 0;
        this.lastP1SnapshotTime = 0;
        this.p1LastState = null; // Track P1 state changes for instant updates

        this.clientStateAccumulator = 0;
        this.clientStateHz = 45; // Match host rate for smooth P2 movement on host view

        this.inputSendAccumulator = 0;
        this.inputSendHz = 30; // resend held movement keys to avoid stuck states

        // P2 smoothing for host view (prevents frame shake when P2 moves + attacks)
        // Initialize to P2's actual starting position (800, 420) to prevent auto-movement
        this.p2TargetX = 800;
        this.p2TargetY = 420;
        this.p2VelocityX = 0;
        this.p2VelocityY = 0;
        this.p2LastSnapshotX = 800;
        this.p2LastSnapshotY = 420;
        this.p2LastSnapshotTime = 0;
        this.p2InterpolatedX = 800;
        this.p2InterpolatedY = 420;
        this.p2FirstStateReceived = false; // Flag to prevent interpolation before first state

        // Map system for random backgrounds per round
        this.currentMapIndex = 0;

        // Estimate server time offset for consistent interpolation timing.
        this.serverTimeOffsetMs = 0;
        this.serverTimeOffsetInit = false;

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

        // Hit-stop (freeze frames) - purely for feel, no rules changes
        this.hitStopTimer = 0;

        // Time scale for slow motion effects
        this.timeScale = 1.0;
        this.slowMotionTimer = 0;

        // Multiplayer: used by P2 to synthesize hit feedback from host snapshots
        this._lastNetFeedback = null;

        // Multiplayer: rematch handshake UI
        this.rematchPending = false;
        this.rematchSecondsLeft = 0;

        // Pause System
        this.isPaused = false;

        // Rage/Encouragement Sentences
        this.rageSentences = [
            "😤 IS THAT ALL YOU GOT?!",
            "💀 YOU'RE GETTING DESTROYED!",
            "🔥 COME ON, FIGHT BACK!",
            "😈 PATHETIC PERFORMANCE!",
            "💢 YOU CALL THAT FIGHTING?!",
            "🤡 MY GRANDMA FIGHTS BETTER!",
            "😡 GET UP AND TRY AGAIN!",
            "💀 THAT WAS EMBARRASSING!",
            "🎭 WHAT A CLOWN SHOW!",
            "😤 DO YOU EVEN KNOW THE CONTROLS?!"
        ];
        this.encouragementSentences = [
            "🔥 UNSTOPPABLE! KEEP IT UP!",
            "⚡ LIGHTNING FAST VICTORY!",
            "💪 YOU'RE ON FIRE!",
            "🏆 DOMINATING THE BATTLEFIELD!",
            "✨ FLAWLESS EXECUTION!",
            "👑 THE CHAMPION RISES!",
            "🎯 PERFECT! ABSOLUTELY PERFECT!",
            "💎 LEGENDARY PERFORMANCE!",
            "🚀 NOTHING CAN STOP YOU!",
            "⭐ SUPERSTAR IN THE MAKING!"
        ];

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

    applyInterpolatedNetState() {
        if (!this.p1 || !this.p2) return;
        if (!this.netStateBuffer || this.netStateBuffer.length === 0) return;

        const localNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        
        // Get the latest snapshot directly for instant state sync
        const latest = this.netStateBuffer[this.netStateBuffer.length - 1];
        if (!latest || !latest.s) return;

        const lerp = (a, b, t) => a + (b - a) * t;

        // === P1 POSITION SYNC (for P2's view) ===
        // Use latest position directly with velocity-based extrapolation
        let p1x = latest.s.p1.x;
        let p1y = latest.s.p1.y;

        // Calculate velocity from position changes
        if (this.lastP1SnapshotTime > 0) {
            const snapshotDt = (latest.t - this.lastP1SnapshotTime) / 1000;
            if (snapshotDt > 0.005 && snapshotDt < 0.2) {
                const dx = latest.s.p1.x - this.lastP1SnapshotX;
                const dy = latest.s.p1.y - this.lastP1SnapshotY;
                this.p1PredictedVx = dx / snapshotDt;
                this.p1PredictedVy = dy / snapshotDt;
            }
        }
        
        // Time since this snapshot was taken
        const timeSinceSnapshot = (localNow - latest.t) / 1000;
        
        // Extrapolate P1 position forward based on velocity
        // This compensates for network delay
        const gravity = 2000;
        if (timeSinceSnapshot > 0 && timeSinceSnapshot < 0.15) {
            p1x += this.p1PredictedVx * timeSinceSnapshot;
            
            // Apply gravity extrapolation if P1 is in the air
            if (latest.s.p1.y < 480) {
                // Full physics extrapolation: position + velocity*t + 0.5*gravity*t^2
                p1y += this.p1PredictedVy * timeSinceSnapshot;
                p1y += 0.5 * gravity * timeSinceSnapshot * timeSinceSnapshot;
            } else {
                // On ground - just use the position directly
                p1y = latest.s.p1.y;
            }
        }

        // Predict landing - if extrapolated Y goes past ground, snap to ground
        // This makes landing appear instant rather than delayed
        const groundY = 420;
        if (p1y >= groundY) {
            p1y = groundY;
            // Also reset vertical velocity prediction when landed
            if (this.p1PredictedVy > 0) {
                this.p1PredictedVy = 0;
            }
        }
        
        // Clamp X to screen bounds
        if (p1x < 20) p1x = 20;
        if (p1x > 1004) p1x = 1004;

        // Store for next frame's velocity calculation
        this.lastP1SnapshotX = latest.s.p1.x;
        this.lastP1SnapshotY = latest.s.p1.y;
        this.lastP1SnapshotTime = latest.t;

        // Apply P1 position - use direct snap for Y when near ground for instant landing
        const snapThreshold = 40;
        const isNearGround = p1y >= groundY - 15;
        
        // X position - smooth interpolation
        if (Math.abs(this.p1.x - p1x) > snapThreshold) {
            this.p1.x = p1x;
        } else {
            this.p1.x = lerp(this.p1.x, p1x, 0.85);
        }
        
        // Y position - snap instantly when landing, otherwise smooth
        if (isNearGround && this.p1.y < groundY) {
            // Landing - snap to ground instantly
            this.p1.y = groundY;
        } else if (Math.abs(this.p1.y - p1y) > snapThreshold) {
            this.p1.y = p1y;
        } else {
            // Use higher lerp factor for Y to reduce landing delay
            this.p1.y = lerp(this.p1.y, p1y, 0.92);
        }

        // IMPORTANT: Normally we do NOT override P2's local position here.
        // P2 must be able to move responsively.
        // HOWEVER, when the host puts P2 into a hard state (hitstun/knockdown/etc),
        // we need to accept authoritative position so knockback is actually felt.

        // Non-positional authoritative fields: take the newest snapshot
        const latestState = this.netStateBuffer[this.netStateBuffer.length - 1].s;
        if (latestState) {
            // Health/timer are safe to hard-apply
            this.p1.health = latestState.p1.health;
            this.p2.health = latestState.p2.health;
            if (typeof latestState.timer === 'number' && Math.abs(this.timer - latestState.timer) > 1) {
                this.timer = latestState.timer;
            }
            
            // CRITICAL: Sync isDead state from host - prevents invisible players after round reset
            if (typeof latestState.p1.isDead === 'boolean') {
                this.p1.isDead = latestState.p1.isDead;
            }
            if (typeof latestState.p2.isDead === 'boolean') {
                this.p2.isDead = latestState.p2.isDead;
            }

            // States/facing: accept the latest but avoid cancelling P2 local attacks
            const isAttackState = (st) => typeof st === 'string' && st.startsWith('attack_');
            const isHardState = (st) => ['hitstun', 'knockdown', 'blockstun', 'dash_clash_stun', 'perfect_block_shield'].includes(st);

            // P1 is remote for P2: always accept
            this.p1.state = latestState.p1.state;
            this.p1.facing = latestState.p1.facing;

            // Sync P1's character info (so P2 sees correct colors AND skill effects work)
            if (latestState.p1.characterId && this.p1.characterId !== latestState.p1.characterId) {
                this.p1.characterId = latestState.p1.characterId;
                const char = getCharacterById(latestState.p1.characterId);
                if (char) {
                    this.p1.character = char;  // CRITICAL for skill effects!
                    this.p1.color = char.color;
                    this.p1.projectileColor = char.projectileColor || char.color;
                }
            }

            // IMPORTANT: Remote entities need a state timer, otherwise Entity.update()
            // will immediately pop attack_* back to stance_idle.
            if (typeof latestState.p1.stateTimer === 'number') {
                this.p1.stateTimer = latestState.p1.stateTimer;
            }
            if (isAttackState(this.p1.state)) {
                // Ensure the attack is visible even if the snapshot arrives near the end.
                if (!(typeof this.p1.stateTimer === 'number') || this.p1.stateTimer < 0.08) {
                    this.p1.stateTimer = 0.12;
                }
            }

            // P2 is local: don't override normal movement/attacks.
            // But we MUST accept authoritative hard states AND also accept when the host clears them,
            // otherwise P2 can get stuck knocked down forever.
            const localHard = isHardState(this.p2.state);
            const hostHard = isHardState(latestState.p2.state);

            // If host says we're in a hard state, accept authoritative position (knockback).
            if (hostHard) {
                const snapThreshold = 80;
                const p2x = latestState.p2.x;
                const p2y = latestState.p2.y;
                if (typeof p2x === 'number') {
                    if (Math.abs(this.p2.x - p2x) > snapThreshold) this.p2.x = p2x;
                    else this.p2.x = lerp(this.p2.x, p2x, 0.55);
                }
                if (typeof p2y === 'number') {
                    if (Math.abs(this.p2.y - p2y) > snapThreshold) this.p2.y = p2y;
                    else this.p2.y = lerp(this.p2.y, p2y, 0.55);
                }
            }

            if (hostHard) {
                this.p2.state = latestState.p2.state;
            } else if (localHard && !hostHard) {
                // Host says we recovered; accept the recovery state.
                this.p2.state = latestState.p2.state;
            }

            if (typeof latestState.p2.stateTimer === 'number' && isHardState(this.p2.state)) {
                this.p2.stateTimer = latestState.p2.stateTimer;
            }

            // Sync perfect block state for both players
            if (typeof latestState.p1.perfectBlockActive === 'boolean') {
                this.p1.perfectBlockActive = latestState.p1.perfectBlockActive;
            }
            if (typeof latestState.p1.perfectBlockTimer === 'number') {
                this.p1.perfectBlockTimer = latestState.p1.perfectBlockTimer;
            }
            if (typeof latestState.p1.perfectBlockCooldown === 'number') {
                this.p1.perfectBlockCooldown = latestState.p1.perfectBlockCooldown;
            }
            if (typeof latestState.p1.specialCooldown === 'number') {
                this.p1.specialCooldown = latestState.p1.specialCooldown;
            }
            if (typeof latestState.p1.canPerfectBlock === 'boolean') {
                this.p1.canPerfectBlock = latestState.p1.canPerfectBlock;
            }

            // For P2, accept perfect block state from host (authoritative)
            // But don't reduce cooldown - local P2 may have started their own block
            if (typeof latestState.p2.perfectBlockActive === 'boolean') {
                this.p2.perfectBlockActive = latestState.p2.perfectBlockActive;
            }
            if (typeof latestState.p2.perfectBlockTimer === 'number') {
                this.p2.perfectBlockTimer = latestState.p2.perfectBlockTimer;
            }
            if (typeof latestState.p2.perfectBlockCooldown === 'number') {
                // Only accept higher cooldown values from host (don't reset P2's local cooldown)
                if (latestState.p2.perfectBlockCooldown > this.p2.perfectBlockCooldown) {
                    this.p2.perfectBlockCooldown = latestState.p2.perfectBlockCooldown;
                }
            }
            if (typeof latestState.p2.specialCooldown === 'number') {
                this.p2.specialCooldown = latestState.p2.specialCooldown;
            }
            if (typeof latestState.p2.canPerfectBlock === 'boolean') {
                this.p2.canPerfectBlock = latestState.p2.canPerfectBlock;
            }
            
            // Sync status effects for visual display on P2's view
            // P1's status effects (so P2 can see when P1 is frozen/burning/shocked)
            if (typeof latestState.p1.isFrozen === 'boolean') {
                this.p1.isFrozen = latestState.p1.isFrozen;
            }
            if (typeof latestState.p1.speedModifier === 'number') {
                this.p1.speedModifier = latestState.p1.speedModifier;
            }
            if (latestState.p1.statusEffects && Array.isArray(latestState.p1.statusEffects)) {
                this.syncStatusEffects(this.p1, latestState.p1.statusEffects);
            }
            
            // P2's status effects (so P2 can see their own status effects from host authority)
            if (typeof latestState.p2.isFrozen === 'boolean') {
                this.p2.isFrozen = latestState.p2.isFrozen;
            }
            if (typeof latestState.p2.speedModifier === 'number') {
                this.p2.speedModifier = latestState.p2.speedModifier;
            }
            if (latestState.p2.statusEffects && Array.isArray(latestState.p2.statusEffects)) {
                this.syncStatusEffects(this.p2, latestState.p2.statusEffects);
            }
        }
    }
    
    // Sync status effects from host to client for visual display
    syncStatusEffects(player, effectsData) {
        if (!player || !player.statusEffects) return;
        
        // Clear existing effects and apply synced ones
        // This ensures P2 sees the correct visual effects
        for (const effectData of effectsData) {
            if (!player.statusEffects.hasEffect(effectData.type)) {
                // Add effect if not already present
                player.statusEffects.addEffect(effectData.type, effectData.duration, {});
            }
        }
        
        // Remove effects that are no longer active on host
        const activeTypes = effectsData.map(e => e.type);
        const currentEffects = player.statusEffects.effects || [];
        for (let i = currentEffects.length - 1; i >= 0; i--) {
            if (!activeTypes.includes(currentEffects[i].type)) {
                currentEffects.splice(i, 1);
            }
        }
    }

    // Apply smooth interpolation for P2's position on host (P1) view
    // This prevents frame shake/jitter when P2 moves fast and attacks simultaneously
    applyP2Interpolation(dt) {
        if (!this.p2) return;
        
        // CRITICAL: Don't interpolate until we've received the first P2 state from network
        // This prevents P2 from moving at game start before any client state arrives
        if (!this.p2FirstStateReceived) return;
        
        // Skip interpolation if P2 is in a hard state (host controls knockback)
        const isHardState = (st) => ['hitstun', 'knockdown', 'blockstun', 'dash_clash_stun'].includes(st);
        if (isHardState(this.p2.state)) {
            // Reset interpolation state when in hard state to avoid snap-back after recovery
            this.p2InterpolatedX = this.p2.x;
            this.p2InterpolatedY = this.p2.y;
            this.p2VelocityX = 0;
            this.p2VelocityY = 0;
            return;
        }

        // Only interpolate if we have a valid target from network
        if (this.p2LastSnapshotTime === 0) return;

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const timeSinceSnapshot = (now - this.p2LastSnapshotTime) / 1000;

        // Calculate predicted position based on velocity extrapolation
        let predictedX = this.p2TargetX;
        let predictedY = this.p2TargetY;

        // Apply velocity prediction to reduce perceived latency (but limit extrapolation time)
        if (timeSinceSnapshot > 0 && timeSinceSnapshot < 0.1) {
            predictedX += this.p2VelocityX * timeSinceSnapshot;
            predictedY += this.p2VelocityY * timeSinceSnapshot;
            
            // Apply gravity if in the air
            if (this.p2TargetY < 420) {
                predictedY += 0.5 * 2000 * timeSinceSnapshot * timeSinceSnapshot;
            }
        }

        // Clamp predicted position to game bounds
        if (predictedY > 420) predictedY = 420;
        if (predictedX < 20) predictedX = 20;
        if (predictedX > 1004) predictedX = 1004;

        // Smooth interpolation to predicted position
        // Use higher lerp factor for fast convergence while maintaining smoothness
        const snapThreshold = 80;
        const lerpFactor = 0.7; // Higher = faster convergence, smoother feel during attacks
        
        const lerp = (a, b, t) => a + (b - a) * t;

        if (Math.abs(this.p2.x - predictedX) > snapThreshold) {
            this.p2.x = predictedX;
        } else {
            this.p2.x = lerp(this.p2.x, predictedX, lerpFactor);
        }

        if (Math.abs(this.p2.y - predictedY) > snapThreshold) {
            this.p2.y = predictedY;
        } else {
            this.p2.y = lerp(this.p2.y, predictedY, lerpFactor);
        }
    }

    setupDashboard() {
        // Start lobby music when dashboard loads
        this.sound.playLobbyMusic();
        
        // Character Selection
        this.setupCharacterSelection();

        // Controls Modal
        this.setupControlsModal();

        // Pause Menu Setup
        this.setupPauseMenu();

        // Music Toggle Setup
        this.setupMusicToggle();
        
        // Fullscreen Setup (Mobile)
        this.setupFullscreen();

        // Dashboard Buttons
        const btnPve = document.getElementById('btn-pve');
        const btnPvp = document.getElementById('btn-pvp');
        
        if (btnPve) {
            btnPve.onclick = () => {
                // Show single player menu instead of starting directly
                document.getElementById('dashboard').classList.add('hidden');
                document.getElementById('singleplayer-menu').classList.remove('hidden');
            };
        }

        // Single Player Menu
        const btnStartSp = document.getElementById('btn-start-sp');
        if (btnStartSp) {
            btnStartSp.onclick = () => {
                // Get selected rounds
                const selectedRoundBtn = document.querySelector('.sp-round-btn.selected');
                this.maxWins = selectedRoundBtn ? parseInt(selectedRoundBtn.dataset.rounds) : 2;
                document.getElementById('singleplayer-menu').classList.add('hidden');
                this.startSinglePlayer();
            };
        }

        const btnBackSp = document.getElementById('btn-back-sp');
        if (btnBackSp) {
            btnBackSp.onclick = () => {
                document.getElementById('singleplayer-menu').classList.add('hidden');
                document.getElementById('dashboard').classList.remove('hidden');
            };
        }

        // Single Player Round Selection Buttons
        const spRoundBtns = document.querySelectorAll('.sp-round-btn');
        spRoundBtns.forEach(btn => {
            btn.onclick = () => {
                spRoundBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
        });

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
                if (this.socket) {
                    // Get selected rounds
                    const selectedRoundBtn = document.querySelector('.round-btn.selected');
                    const maxWins = selectedRoundBtn ? parseInt(selectedRoundBtn.dataset.rounds) : 2;
                    // Send character selection with room creation
                    this.socket.emit('createRoom', { maxWins, characterId: this.selectedCharacter || 'ice' });
                }
            };
        }

        // Round selection buttons
        const roundBtns = document.querySelectorAll('.round-btn');
        roundBtns.forEach(btn => {
            btn.onclick = () => {
                roundBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
        });

        // Play vs PC from multiplayer lobby / waiting screens
        const btnPveMulti = document.getElementById('btn-pve-multi');
        if (btnPveMulti) {
            btnPveMulti.onclick = () => this.startSinglePlayerFromMultiplayer();
        }

        const btnWaitPve = document.getElementById('btn-wait-pve');
        if (btnWaitPve) {
            btnWaitPve.onclick = () => this.startSinglePlayerFromMultiplayer();
        }

        const btnJoin = document.getElementById('btn-join-room');
        if (btnJoin) {
            btnJoin.onclick = () => {
                const roomIdInput = document.getElementById('room-id-input');
                const roomId = roomIdInput ? roomIdInput.value.trim().toUpperCase() : '';
                console.log('Attempting to join room:', roomId, 'Length:', roomId.length);
                
                if (!roomId || roomId.length === 0) {
                    alert('Please enter a room code');
                    return;
                }
                
                if (!this.socket) {
                    alert('Not connected to server. Please refresh the page.');
                    return;
                }
                
                if (!this.socket.connected) {
                    alert('Connection lost. Please wait for reconnection.');
                    return;
                }
                
                // Send character selection with room join
                console.log('Emitting joinRoom with:', { roomId: roomId, characterId: this.selectedCharacter || 'ice' });
                this.socket.emit('joinRoom', { roomId: roomId, characterId: this.selectedCharacter || 'ice' });
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
            btnMenu.onclick = () => {
                // CrazyGames: Show interstitial ad when going to Main Menu after match
                if (window.CrazyAds && !window.CrazyAds.adInProgress) {
                    window.CrazyAds.showInterstitial(() => {
                        this.backToDashboard();
                    });
                } else {
                    this.backToDashboard();
                }
            };
        }
    }

    setupCharacterSelection() {
        const charCards = document.querySelectorAll('.char-card');
        const showcaseGlow = document.querySelector('.character-glow');
        const showcaseSilhouette = document.querySelector('.character-silhouette');
        const charName = document.querySelector('.character-name');
        const charElement = document.querySelector('.character-element');
        const charDesc = document.querySelector('.character-desc');

        const updateShowcase = (charId) => {
            const char = getCharacterById(charId);
            if (!char) return;

            // Update showcase elements
            if (showcaseGlow) {
                showcaseGlow.className = 'character-glow ' + charId;
            }
            if (showcaseSilhouette) {
                showcaseSilhouette.className = 'character-silhouette ' + charId;
            }
            if (charName) {
                charName.textContent = char.name.toUpperCase();
                charName.className = 'character-name ' + charId;
            }
            if (charElement) {
                charElement.textContent = char.element.toUpperCase();
            }
            if (charDesc) {
                charDesc.textContent = char.description;
            }

            // Update card selection state
            charCards.forEach(card => {
                if (card.dataset.char === charId) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        };

        // Set initial selection
        updateShowcase(this.selectedCharacter);

        // Add click handlers to character cards
        charCards.forEach(card => {
            card.addEventListener('click', () => {
                const charId = card.dataset.char;
                if (charId) {
                    // Show confirmation modal instead of selecting directly
                    this.showCharacterConfirmation(charId, () => {
                        this.selectedCharacter = charId;
                        localStorage.setItem('selectedCharacter', charId);
                        updateShowcase(charId);
                    });
                }
            });
        });
    }

    showCharacterConfirmation(charId, onConfirm) {
        const modal = document.getElementById('character-confirm-modal');
        if (!modal) return;

        const char = getCharacterById(charId);
        if (!char) return;

        // Update modal content
        const confirmPanel = modal.querySelector('.confirm-panel');
        const confirmIcon = modal.querySelector('.confirm-icon');
        const confirmName = modal.querySelector('.confirm-name');
        const confirmElement = modal.querySelector('.confirm-element');
        const traitDesc = modal.querySelector('.trait-desc');

        // Set element-specific styling
        if (confirmPanel) {
            confirmPanel.className = 'confirm-panel ' + charId;
        }
        if (confirmIcon) {
            confirmIcon.textContent = char.icon;
        }
        if (confirmName) {
            confirmName.textContent = char.name.toUpperCase();
            confirmName.className = 'confirm-name ' + charId;
        }
        if (confirmElement) {
            confirmElement.textContent = char.element.toUpperCase() + ' ELEMENT';
        }
        if (traitDesc) {
            // Generate trait description based on character
            let traits = char.description + '\n\n';
            if (charId === 'ice') {
                traits += '❄️ Skill Effect: Freezes enemy for 5 seconds, completely stopping their movement.';
            } else if (charId === 'fire') {
                traits += '🔥 Skill Effect: Burns enemy for 5 seconds, dealing 5 damage per second (25 total damage).';
            } else if (charId === 'lightning') {
                traits += '⚡ Skill Effect: Shocks enemy for 5 seconds, slowing them by 70% while boosting your speed by 100%.';
            }
            traitDesc.textContent = traits;
        }

        // Show modal
        modal.classList.remove('hidden');

        // Setup button handlers
        const btnConfirm = document.getElementById('btn-confirm-char');
        const btnCancel = document.getElementById('btn-cancel-char');

        const closeModal = () => {
            modal.classList.add('hidden');
            if (btnConfirm) btnConfirm.onclick = null;
            if (btnCancel) btnCancel.onclick = null;
        };

        if (btnConfirm) {
            btnConfirm.onclick = () => {
                closeModal();
                if (onConfirm) onConfirm();
            };
        }

        if (btnCancel) {
            btnCancel.onclick = () => {
                closeModal();
            };
        }
    }

    setupMusicToggle() {
        const btnMusic = document.getElementById('btn-music-toggle');
        this.isMusicEnabled = true;
        
        if (btnMusic) {
            btnMusic.onclick = () => {
                this.isMusicEnabled = !this.isMusicEnabled;
                
                if (this.isMusicEnabled) {
                    btnMusic.classList.remove('muted');
                    // Resume the appropriate music
                    if (this.gameState === 'menu') {
                        this.sound.playLobbyMusic();
                    } else if (this.gameState === 'fighting' || this.gameState === 'pre_fight') {
                        this.sound.playBattleMusic();
                    }
                } else {
                    btnMusic.classList.add('muted');
                    this.sound.stopMusic();
                }
            };
        }
    }
    
    setupFullscreen() {
        const btnFullscreen = document.getElementById('btn-fullscreen');
        
        if (btnFullscreen) {
            btnFullscreen.onclick = () => {
                this.toggleFullscreen();
            };
        }
        
        // Update button icon based on fullscreen state
        document.addEventListener('fullscreenchange', () => this.updateFullscreenButton());
        document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenButton());
        
        // Auto-request fullscreen on game start for mobile
        this.autoRequestFullscreen();
    }
    
    toggleFullscreen() {
        const elem = document.documentElement;
        
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            // Enter fullscreen
            if (elem.requestFullscreen) {
                elem.requestFullscreen({ navigationUI: 'hide' }).catch(err => {
                    console.log('Fullscreen request failed:', err);
                });
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }
            
            // Lock to landscape on mobile if supported
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }
    
    updateFullscreenButton() {
        const btnFullscreen = document.getElementById('btn-fullscreen');
        if (btnFullscreen) {
            const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
            btnFullscreen.textContent = isFullscreen ? '⛶' : '⛶';
            btnFullscreen.style.display = isFullscreen ? 'none' : 'flex';
        }
    }
    
    autoRequestFullscreen() {
        // Check if mobile/touch device
        const isTouchDevice = ('ontouchstart' in window) || 
                              (navigator.maxTouchPoints > 0) || 
                              window.matchMedia('(pointer: coarse)').matches;
        
        if (isTouchDevice) {
            // Create fullscreen prompt overlay
            this.createFullscreenPrompt();
        }
    }
    
    createFullscreenPrompt() {
        // Check if already in fullscreen
        if (document.fullscreenElement || document.webkitFullscreenElement) return;
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'fullscreen-prompt';
        overlay.innerHTML = `
            <div class="fullscreen-prompt-content">
                <div class="fullscreen-icon">⛶</div>
                <div class="fullscreen-text">TAP TO ENTER FULLSCREEN</div>
                <div class="fullscreen-subtext">For the best experience</div>
            </div>
        `;
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            cursor: pointer;
            touch-action: manipulation;
        `;
        
        const content = overlay.querySelector('.fullscreen-prompt-content');
        content.style.cssText = `
            text-align: center;
            color: white;
            font-family: 'Orbitron', sans-serif;
        `;
        
        const icon = overlay.querySelector('.fullscreen-icon');
        icon.style.cssText = `
            font-size: 80px;
            margin-bottom: 20px;
            animation: pulse 1.5s infinite;
        `;
        
        const text = overlay.querySelector('.fullscreen-text');
        text.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #00d4ff;
        `;
        
        const subtext = overlay.querySelector('.fullscreen-subtext');
        subtext.style.cssText = `
            font-size: 14px;
            color: #888;
        `;
        
        document.body.appendChild(overlay);
        
        // Handle tap to enter fullscreen
        const enterFullscreen = () => {
            overlay.remove();
            this.toggleFullscreen();
        };
        
        overlay.addEventListener('click', enterFullscreen);
        overlay.addEventListener('touchstart', (e) => {
            e.preventDefault();
            enterFullscreen();
        }, { passive: false });
    }

    setupControlsModal() {
        const btnControls = document.getElementById('btn-controls');
        const modal = document.getElementById('controls-modal');
        const btnClose = document.getElementById('btn-close-controls');

        if (btnControls && modal) {
            btnControls.onclick = () => {
                modal.classList.remove('hidden');
            };
        }

        if (btnClose && modal) {
            btnClose.onclick = () => {
                modal.classList.add('hidden');
            };
        }

        // Close on overlay click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('controls-overlay')) {
                    modal.classList.add('hidden');
                }
            });
        }
    }

    setupPauseMenu() {
        const btnPause = document.getElementById('btn-pause');
        const pauseMenu = document.getElementById('pause-menu');
        const btnResume = document.getElementById('btn-resume');
        const btnQuit = document.getElementById('btn-quit-game');

        if (btnPause) {
            btnPause.onclick = () => this.togglePause();
        }

        if (btnResume) {
            btnResume.onclick = () => this.resumeGame();
        }

        if (btnQuit) {
            btnQuit.onclick = () => this.quitToMenu();
        }

        // ESC key to pause/unpause
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.gameState !== 'menu' && this.gameState !== 'match_over') {
                this.togglePause();
            }
        });
    }

    togglePause() {
        if (this.isPaused) {
            this.resumeGame();
        } else {
            this.pauseGame();
        }
    }

    pauseGame(fromSocket = false) {
        // Don't pause if already paused or in menu states
        if (this.isPaused) return;
        if (this.gameState === 'menu' || this.gameState === 'match_over' || this.gameState === 'waiting') return;
        
        this.isPaused = true;
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.remove('hidden');
        
        // Pause music
        if (this.sound && this.sound.stopMusic) {
            this._wasMusicPlaying = this.sound.isMusicPlaying;
            this.sound.stopMusic();
        }
        
        // Sync pause to remote player in multiplayer (only if this isn't from socket)
        if (!fromSocket && this.gameMode === 'multi' && this.socket && this.roomId) {
            this.socket.emit('pause', { roomId: this.roomId, paused: true });
        }
    }

    resumeGame(fromSocket = false) {
        if (!this.isPaused) return;
        
        this.isPaused = false;
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden');
        
        // Resume music if it was playing
        if (this._wasMusicPlaying && this.sound) {
            if (this.gameState === 'fighting' || this.gameState === 'pre_fight' || this.gameState === 'round_over') {
                this.sound.playBattleMusic();
            }
        }
        
        // Sync resume to remote player in multiplayer (only if this isn't from socket)
        if (!fromSocket && this.gameMode === 'multi' && this.socket && this.roomId) {
            this.socket.emit('pause', { roomId: this.roomId, paused: false });
        }
    }

    quitToMenu() {
        this.isPaused = false;
        document.getElementById('pause-menu').classList.add('hidden');
        
        // CrazyGames: Show interstitial ad when quitting mid-game
        if (window.CrazyAds && !window.CrazyAds.adInProgress) {
            window.CrazyAds.showInterstitial(() => {
                this.backToDashboard();
            });
        } else {
            this.backToDashboard();
        }
    }

    setupSocketEvents() {
        // FIX: Prevent duplicate listeners
        this.socket.off('roomCreated');
        this.socket.off('gameStart');
        this.socket.off('remoteInput');
        this.socket.off('syncState');
        this.socket.off('clientState');
        this.socket.off('spawnProjectile');
        this.socket.off('projectileClash');
        this.socket.off('pause');
        this.socket.off('roundResult');
        this.socket.off('rematchStatus');
        this.socket.off('rematchStart');
        this.socket.off('rematchCancelled');
        this.socket.off('playerDisconnected');
        this.socket.off('opponentLeft');
        this.socket.off('error');

        this.socket.on('roomCreated', (data) => {
            // Handle both old format (string) and new format (object)
            const roomId = typeof data === 'string' ? data : data.roomId;
            const maxWins = typeof data === 'object' && data.maxWins ? data.maxWins : 2;
            
            this.roomId = roomId;
            this.maxWins = maxWins; // Store for match
            document.getElementById('multiplayer-menu').classList.add('hidden');
            document.getElementById('waiting-screen').classList.remove('hidden');
            document.getElementById('display-room-id').innerText = roomId;
        });

        this.socket.on('gameStart', (data) => {
            console.log('[GAME START] Received gameStart event:', data);
            this.gameMode = 'multi';
            this.playerRole = data.role;
            this.roomId = this.roomId || document.getElementById('room-id-input').value.toUpperCase();

            // Sync match id from server (prevents stale packet jitter)
            if (typeof data.matchId === 'number') {
                this.matchId = data.matchId;
            } else {
                this.matchId = (this.matchId || 0) + 1;
            }
            
            // Sync maxWins from server (custom rounds)
            if (typeof data.maxWins === 'number') {
                this.maxWins = data.maxWins;
            }
            
            // Store character IDs from server (so both players see correct characters)
            if (data.p1CharId) {
                this.p1CharacterFromServer = data.p1CharId;
            }
            if (data.p2CharId) {
                this.p2CharacterFromServer = data.p2CharId;
            }
            
            // Hide all menus
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('multiplayer-menu').classList.add('hidden');
            document.getElementById('waiting-screen').classList.add('hidden');
            document.getElementById('post-match-menu').classList.add('hidden');
            document.getElementById('ui-layer').classList.remove('hidden');

            // Switch to battle music for multiplayer
            this.sound.playBattleMusic();

            // Update UI labels
            const p1LabelEl = document.querySelector('.health-container.p1 .bar-label');
            const p2LabelEl = document.getElementById('p2-label');
            if (this.playerRole === 'p1') {
                if (p1LabelEl) p1LabelEl.innerText = 'YOU (P1)';
                if (p2LabelEl) p2LabelEl.innerText = 'OPPONENT';
            } else {
                if (p1LabelEl) p1LabelEl.innerText = 'OPPONENT';
                if (p2LabelEl) p2LabelEl.innerText = 'YOU (P2)';
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

        this.socket.on('syncState', (payload) => {
            if (this.gameMode !== 'multi') return;
            // Client (P2) accepts Host (P1) authority.
            // Buffer snapshots and interpolate for smoothness.
            if (this.playerRole === 'p2' && (this.gameState === 'fighting' || this.gameState === 'pre_fight')) {
                if (payload && typeof payload.matchId === 'number' && payload.matchId !== this.matchId) return;
                // Backwards compatible: server may send raw state
                const state = (payload && payload.state) ? payload.state : payload;
                const serverTime = (payload && typeof payload.serverTime === 'number') ? payload.serverTime : null;
                
                // Sync map index from host
                if (typeof payload.mapIndex === 'number') {
                    this.currentMapIndex = payload.mapIndex;
                    this.renderer.setMap(this.currentMapIndex);
                }

                // Trigger hit feedback from authoritative deltas (prevents "damage goes back")
                this.applyNetHitFeedback(state);

                const localNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());

                if (serverTime !== null) {
                    const measuredOffset = serverTime - localNow;
                    if (!this.serverTimeOffsetInit) {
                        this.serverTimeOffsetMs = measuredOffset;
                        this.serverTimeOffsetInit = true;
                    } else {
                        // Smooth offset to reduce jitter
                        this.serverTimeOffsetMs = this.serverTimeOffsetMs * 0.9 + measuredOffset * 0.1;
                    }
                }

                const t = (serverTime !== null) ? serverTime : localNow;
                this.netStateBuffer.push({
                    t,
                    s: state
                });
                const cutoff = t - this.netMaxBufferMs;
                while (this.netStateBuffer.length && this.netStateBuffer[0].t < cutoff) {
                    this.netStateBuffer.shift();
                }
            }
        });

        // Host (P1) receives P2 snapshots to keep remote position accurate.
        this.socket.on('clientState', (payload) => {
            if (this.gameMode !== 'multi') return;
            if (this.playerRole !== 'p1') return;
            if (!payload || !payload.state) return;
            if (!this.p2) return;
            if (typeof payload.matchId === 'number' && payload.matchId !== this.matchId) return;

            const s = payload.state;
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

            // Host authority: if P2 is in hitstun/knockdown/etc, do NOT let client snapshots
            // overwrite the knockback movement. This was causing jitter/"frame shake" and
            // making knockback feel like it wasn't working for the host.
            const isHardState = (st) => ['hitstun', 'knockdown', 'blockstun', 'dash_clash_stun'].includes(st);
            if (isHardState(this.p2.state)) {
                if (typeof s.facing === 'number') this.p2.facing = s.facing;
                return;
            }

            // Calculate P2's velocity from position changes for smooth interpolation
            if (typeof s.x === 'number' && typeof s.y === 'number') {
                // Mark that we've received first P2 state - safe to start interpolation
                this.p2FirstStateReceived = true;
                
                if (this.p2LastSnapshotTime > 0) {
                    const dt = (now - this.p2LastSnapshotTime) / 1000;
                    if (dt > 0.005 && dt < 0.2) {
                        // Calculate velocity
                        const newVx = (s.x - this.p2LastSnapshotX) / dt;
                        const newVy = (s.y - this.p2LastSnapshotY) / dt;
                        // Smooth velocity to prevent sudden changes causing jitter
                        this.p2VelocityX = this.p2VelocityX * 0.3 + newVx * 0.7;
                        this.p2VelocityY = this.p2VelocityY * 0.3 + newVy * 0.7;
                    }
                } else {
                    // First snapshot - initialize to current position
                    this.p2InterpolatedX = s.x;
                    this.p2InterpolatedY = s.y;
                }

                // Store snapshot for next velocity calculation
                this.p2LastSnapshotX = s.x;
                this.p2LastSnapshotY = s.y;
                this.p2LastSnapshotTime = now;
                
                // Set target position
                this.p2TargetX = s.x;
                this.p2TargetY = s.y;
            }
            
            if (typeof s.facing === 'number') this.p2.facing = s.facing;
            
            // Sync P2's character info (so P1 sees correct colors AND skill effects work)
            if (s.characterId && this.p2.characterId !== s.characterId) {
                this.p2.characterId = s.characterId;
                const char = getCharacterById(s.characterId);
                if (char) {
                    this.p2.character = char;  // CRITICAL for skill effects!
                    this.p2.color = char.color;
                    this.p2.projectileColor = char.projectileColor || char.color;
                }
            }
            
            // Accept P2's block cooldown (take the higher value to prevent spam)
            if (typeof s.perfectBlockCooldown === 'number' && s.perfectBlockCooldown > this.p2.perfectBlockCooldown) {
                this.p2.perfectBlockCooldown = s.perfectBlockCooldown;
            }
            if (typeof s.canPerfectBlock === 'boolean') {
                this.p2.canPerfectBlock = s.canPerfectBlock;
            }
            // FIX: Accept P2's perfect block shield state for skill attack immunity
            if (typeof s.perfectBlockActive === 'boolean') {
                this.p2.perfectBlockActive = s.perfectBlockActive;
            }
            if (typeof s.perfectBlockTimer === 'number') {
                this.p2.perfectBlockTimer = s.perfectBlockTimer;
            }
            if (typeof s.blockStartTime === 'number') {
                this.p2.blockStartTime = s.blockStartTime;
            }
            // Sync blocking state for perfect block detection
            if (s.state === 'blocking') {
                this.p2.state = 'blocking';
            }
        });

        // Host -> P2: replicate projectile spawns for visuals
        this.socket.on('spawnProjectile', (data) => {
            if (this.gameMode !== 'multi') return;
            if (!data) return;
            if (!this.p1 || !this.p2) return;
            const owner = data.owner === 'p2' ? this.p2 : this.p1;
            this.projectiles.push(new Projectile(data.x, data.y, data.facing, owner));
        });

        // Host -> P2: replicate projectile clash effect
        this.socket.on('projectileClash', (data) => {
            if (this.gameMode !== 'multi') return;
            if (!data) return;
            if (typeof data.matchId === 'number' && data.matchId !== this.matchId) return;
            if (!this.p1 || !this.p2) return;

            // Trigger the epic visual effect
            this.renderer.triggerProjectileClash(data.x, data.y, data.color1, data.color2);
            
            // Apply knockdown to both players (P2 client side)
            this.applyClashKnockdown(this.p1, data.x);
            this.applyClashKnockdown(this.p2, data.x);
            
            // Clear local projectiles that may still be active
            this.projectiles = this.projectiles.filter(p => !p.active);
        });

        this.socket.on('roundResult', (data) => {
            // Force sync round result
            if (this.gameState !== 'round_over' && this.gameState !== 'match_over') {
                this.endRound(data.winner === 'p1' ? 'P1 WINS ROUND' : 'P2 WINS ROUND', true);
            }
        });

        // Rematch handshake (both players must confirm)
        this.socket.on('rematchStatus', (payload) => {
            if (!payload) return;
            const readyIds = Array.isArray(payload.readyIds) ? payload.readyIds : [];
            const secondsLeft = typeof payload.secondsLeft === 'number' ? payload.secondsLeft : 0;
            const youReady = (this.socket && this.socket.id) ? readyIds.includes(this.socket.id) : false;
            const bothReady = readyIds.length >= 2;
            this.updateRematchUI(true, secondsLeft, youReady, bothReady);
        });

        this.socket.on('rematchStart', (payload) => {
            const nextMatchId = payload && typeof payload.matchId === 'number' ? payload.matchId : null;
            this.rematch(true, nextMatchId);
        });

        this.socket.on('rematchCancelled', () => {
            this.updateRematchUI(false, 0, false, false);
        });

        // Opponent left intentionally or disconnected
        const onOpponentLeft = () => {
            alert('Opponent left the match.');
            this.handleOpponentLeft();
        };

        this.socket.on('opponentLeft', onOpponentLeft);

        // Backwards compatibility (older server event name)
        this.socket.on('playerDisconnected', onOpponentLeft);

        this.socket.on('error', (msg) => {
            console.log('[SOCKET ERROR]', msg);
            alert(msg);
        });
        
        // Pause sync for multiplayer - when either player pauses/resumes
        this.socket.on('pause', (data) => {
            if (data.paused) {
                this.pauseGame(true); // fromSocket = true to prevent echo
            } else {
                this.resumeGame(true); // fromSocket = true to prevent echo
            }
        });
    }

    updateRematchUI(visible, secondsLeft = 0, youReady = false, bothReady = false) {
        this.rematchPending = visible;
        this.rematchSecondsLeft = secondsLeft;

        const info = document.getElementById('rematch-info');
        const status = document.getElementById('rematch-status');
        const timer = document.getElementById('rematch-timer');
        const btn = document.getElementById('btn-rematch');

        if (info) info.classList.toggle('hidden', !visible);
        if (timer) timer.innerText = `${Math.max(0, Math.floor(secondsLeft))}`;

        if (status) {
            if (bothReady) status.innerText = 'STARTING REMATCH...';
            else if (youReady) status.innerText = 'WAITING FOR OPPONENT...';
            else status.innerText = 'WAITING FOR BOTH PLAYERS...';
        }

        if (btn) {
            // Once you click rematch, lock the button until it starts/cancels.
            btn.disabled = visible && youReady;
            btn.style.opacity = btn.disabled ? '0.65' : '1';
        }
    }

    handleOpponentLeft() {
        // Stop simulation and return the remaining player to multiplayer lobby (not dashboard).
        this.gameState = 'menu';
        this.entities = [];
        this.projectiles = [];
        this.renderer.clear();

        // Hide in-game UI
        const ui = document.getElementById('ui-layer');
        const overlay = document.getElementById('overlay');
        const post = document.getElementById('post-match-menu');
        if (ui) ui.classList.add('hidden');
        if (overlay) overlay.classList.add('hidden');
        if (post) post.classList.add('hidden');
        this.updateRematchUI(false, 0, false, false);

        // Show multiplayer lobby so they can create/join again
        const dash = document.getElementById('dashboard');
        const lobby = document.getElementById('multiplayer-menu');
        const waiting = document.getElementById('waiting-screen');
        if (dash) dash.classList.add('hidden');
        if (waiting) waiting.classList.add('hidden');
        if (lobby) lobby.classList.remove('hidden');

        // Clear room id so user doesn't accidentally rematch into a dead room
        this.roomId = null;
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
        // FIX: Only override state if it's a "hard" state (stun, knockdown)
        // OR if the server state is an attack and we are idle (started late)
        // NEVER override a local attack with an idle state (prevents cancelling animations)
        
        const isHardState = (s) => ['hitstun', 'knockdown', 'blockstun', 'dash_clash_stun'].includes(s);
        const isAttackState = (s) => s.startsWith('attack_');

        // P1 State Sync
        if (isHardState(state.p1.state)) {
             this.p1.state = state.p1.state;
        } else if (isAttackState(state.p1.state)) {
             // Always accept attacks from server to ensure we see them
             this.p1.state = state.p1.state;
             // FIX: Force timer reset to ensure animation plays fully
             if (this.p1.stateTimer <= 0) this.p1.stateTimer = 0.2;
        } else if (this.playerRole === 'p2' && isAttackState(this.p1.state)) {
             // If we are P2, and P1 (remote) is attacking locally but server says idle,
             // we might want to keep it? No, P1 is remote authority. Trust server for P1.
             this.p1.state = state.p1.state;
        } else {
             this.p1.state = state.p1.state;
        }

        // P2 State Sync
        if (isHardState(state.p2.state)) {
             this.p2.state = state.p2.state;
        } else if (isAttackState(state.p2.state)) {
             this.p2.state = state.p2.state;
             // FIX: Force timer reset to ensure animation plays fully
             if (this.p2.stateTimer <= 0) this.p2.stateTimer = 0.2;
        } else if (this.playerRole === 'p2' && isAttackState(this.p2.state)) {
             // WE ARE P2. We are attacking locally. Server says 'idle' or 'move'.
             // IGNORE server to prevent animation cancelling (Lag Compensation)
             // Keep local state.
        } else {
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
        
        // Switch to battle music
        this.sound.playBattleMusic();
        
        this.initMatch();
        this.startPreFight();
    }

    initMatch() {
        this.p1Wins = 0;
        this.p2Wins = 0;
        this.round = 1;
        this.lastRoundStats = null;
        
        // Reset velocity prediction to prevent P1 auto-movement
        this.p1PredictedVx = 0;
        this.p1PredictedVy = 0;
        this.lastP1SnapshotX = 0;
        this.lastP1SnapshotY = 0;
        this.lastP1SnapshotTime = 0;
        
        // Reset P2 smoothing for host view
        this.p2TargetX = 800;
        this.p2TargetY = 420;
        this.p2VelocityX = 0;
        this.p2VelocityY = 0;
        this.p2LastSnapshotX = 800;
        this.p2LastSnapshotY = 420;
        this.p2LastSnapshotTime = 0;
        this.p2InterpolatedX = 800;
        this.p2InterpolatedY = 420;
        this.p2FirstStateReceived = false; // Reset flag for new match
        
        this.resetRound();
        this.updateUI();
    }

    resetRound() {
        this.entities = [];
        this.projectiles = [];
        this.renderer.clear(); // FIX: Clear particles/effects
        this.timer = 60;
        
        // Reset velocity prediction to prevent auto-movement between rounds
        this.p1PredictedVx = 0;
        this.p1PredictedVy = 0;
        
        // CRITICAL: Initialize P2 smoothing to P2's actual starting position (800) to prevent auto-movement
        this.p2TargetX = 800;
        this.p2TargetY = 420;
        this.p2VelocityX = 0;
        this.p2VelocityY = 0;
        this.p2LastSnapshotX = 800;
        this.p2LastSnapshotY = 420;
        this.p2LastSnapshotTime = 0;
        // Note: Don't reset p2FirstStateReceived here - only reset on new match, not new round

        // Randomize map for this round (host decides, will sync to P2)
        if (this.gameMode !== 'multi' || this.playerRole === 'p1') {
            this.currentMapIndex = this.renderer.getRandomMapIndex();
            this.renderer.setMap(this.currentMapIndex);
        }

        const spawnProjectile = (x, y, facing, owner) => {
            // In multiplayer, only the host should be authoritative for spawning projectiles.
            // The host will replicate spawns to P2 for visuals.
            if (this.gameMode === 'multi' && this.playerRole !== 'p1') {
                return;
            }

            this.projectiles.push(new Projectile(x, y, facing, owner));

            if (this.gameMode === 'multi' && this.playerRole === 'p1' && this.socket && this.roomId) {
                const ownerRole = owner === this.p2 ? 'p2' : 'p1';
                this.socket.emit('spawnProjectile', {
                    roomId: this.roomId,
                    x,
                    y,
                    facing,
                    owner: ownerRole
                });
            }
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
                // FIX: P2 (Client) does not receive P1 inputs, only State.
                // So we set p1Input to null to prevent local prediction from overwriting server state.
                p1Input = null; 
                p2Input = this.input; 
            }
        }

        this.p1 = new Player(200, 480, '#00f3ff', false, p1Input, null, spawnProjectile, 'ice', this.sound);
        const isP2AI = this.gameMode === 'single';
        this.p2 = new Player(800, 480, '#ff00ff', isP2AI, p2Input, p2AI, spawnProjectile, 'ice', this.sound);
        this.p2.facing = -1;

        // Assign characters
        let p1CharId, p2CharId;
        
        if (this.gameMode === 'single') {
            // Player uses selected character, AI gets random
            p1CharId = this.selectedCharacter || 'ice';
            p2CharId = getRandomCharacter().id;
        } else {
            // Multiplayer - use characters synced from server
            // Server provides p1CharId and p2CharId for both players
            p1CharId = this.p1CharacterFromServer || this.selectedCharacter || 'ice';
            p2CharId = this.p2CharacterFromServer || 'ice';
        }
        
        // Apply character properties - MUST update the character object for skill effects!
        const p1Char = getCharacterById(p1CharId);
        const p2Char = getCharacterById(p2CharId);
        
        // P1 character - update ALL properties including the character object
        this.p1.characterId = p1Char.id;
        this.p1.character = p1Char;  // THIS IS CRITICAL for skill effects!
        this.p1.color = p1Char.color;
        this.p1.projectileColor = p1Char.projectileColor;
        
        // P2 character - update ALL properties including the character object
        this.p2.characterId = p2Char.id;
        this.p2.character = p2Char;  // THIS IS CRITICAL for skill effects!
        this.p2.color = p2Char.color;
        this.p2.projectileColor = p2Char.projectileColor;
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
        
        // CRITICAL: Clear stale network state buffer to prevent old isDead state from being applied
        this.netStateBuffer = [];
        this.serverTimeOffsetInit = false;
        
        // Reset velocity predictions
        this.p1PredictedVx = 0;
        this.p1PredictedVy = 0;
        this.lastP1SnapshotX = 200; // P1 starting position
        this.lastP1SnapshotY = 420;
        this.lastP1SnapshotTime = 0;
        
        // CRITICAL: Initialize P2 smoothing to P2's actual starting position to prevent auto-movement
        this.p2TargetX = 800;
        this.p2TargetY = 420;
        this.p2VelocityX = 0;
        this.p2VelocityY = 0;
        this.p2LastSnapshotX = 800;
        this.p2LastSnapshotY = 420;
        this.p2LastSnapshotTime = 0;
        this.p2InterpolatedX = 800;
        this.p2InterpolatedY = 420;
        
        // Reset positions and stats
        this.p1.x = 200; this.p1.y = 420; this.p1.health = 100; this.p1.isDead = false; this.p1.state = 'stance_idle';
        this.p2.x = 800; this.p2.y = 420; this.p2.health = 100; this.p2.isDead = false; this.p2.state = 'stance_idle';
        this.p2.facing = -1;
        this.projectiles = [];
        
        // Reset consecutive hit counters
        this.p1.consecutiveHits = 0;
        this.p1.hitDecayTimer = 0;
        this.p2.consecutiveHits = 0;
        this.p2.hitDecayTimer = 0;
        
        // Send initial sync to P2 so they see correct character colors and map during countdown
        if (this.gameMode === 'multi' && this.playerRole === 'p1' && this.socket && this.roomId) {
            this.socket.emit('syncState', {
                roomId: this.roomId,
                matchId: this.matchId,
                mapIndex: this.currentMapIndex, // Sync map to P2
                state: {
                    p1: { 
                        x: Math.round(this.p1.x), 
                        y: Math.round(this.p1.y), 
                        health: this.p1.health, 
                        state: this.p1.state,
                        facing: this.p1.facing,
                        characterId: this.p1.characterId,
                        color: this.p1.color
                    },
                    p2: { 
                        x: Math.round(this.p2.x), 
                        y: Math.round(this.p2.y), 
                        health: this.p2.health, 
                        state: this.p2.state,
                        facing: this.p2.facing,
                        characterId: this.p2.characterId,
                        color: this.p2.color
                    },
                    timer: this.timer
                }
            });
        }
    }

    startGame() {
        this.gameState = 'fighting';
        // NOTE: Do not trigger big glitch/shake on round start.
        // It reads like blur/lag for some users and can hitch on slower devices.
        
        // Play fight start sound
        this.sound.playRoundStart();
    }

    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); 
        this.lastTime = timestamp;

        // Skip update if paused (but still render)
        if (this.isPaused) {
            if (this.gameState !== 'menu' && this.gameState !== 'waiting') {
                this.renderer.draw(this.entities, [], this.projectiles, this.gameState, this.countdownTimer);
            }
            requestAnimationFrame(this.loop.bind(this));
            return;
        }

        // Apply time scale for slow motion effects
        let simDt = dt * this.timeScale;
        
        // Apply hit-stop only during fighting (freezes simulation + timer)
        if (this.gameState === 'fighting' && this.hitStopTimer > 0) {
            this.hitStopTimer -= dt;
            // In multiplayer, hit-stop reads like jitter/lag when both players trade hits.
            // Keep the VFX but do not freeze simulation.
            if (this.gameMode === 'single') simDt = 0;
        }

        // Multiplayer: apply remote snapshots BEFORE simulation/render.
        // This prevents remote P1 state from getting overwritten by local state transitions.
        // Also apply during pre_fight so character colors are synced during countdown
        if (this.gameMode === 'multi' && this.playerRole === 'p2' && (this.gameState === 'fighting' || this.gameState === 'pre_fight')) {
            this.applyInterpolatedNetState();
        }

        // Host (P1): Apply smooth interpolation for P2's position
        // This prevents frame shake/jitter when P2 moves fast and attacks
        if (this.gameMode === 'multi' && this.playerRole === 'p1' && this.p2 && (this.gameState === 'fighting' || this.gameState === 'pre_fight')) {
            this.applyP2Interpolation(dt);
        }

        if (this.gameState === 'pre_fight') {
            this.updatePreFight(dt);
        } else if (this.gameState === 'fighting') {
            this.update(simDt);
        } else if (this.gameState === 'round_over') {
            this.updateRoundOver(dt);
        }
        
        if (this.gameState !== 'menu' && this.gameState !== 'waiting') {
            this.renderer.draw(this.entities, [], this.projectiles, this.gameState, this.countdownTimer);
        }

        // Multiplayer Logic
        if (this.gameMode === 'multi' && this.gameState === 'fighting') {
            // 1. Send Input (Input Relay) - Only send when there's actual input change
            const relevantKeys = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'ShiftLeft', 'KeyJ', 'KeyK', 'KeyL', 'KeyI'];
            const justPressedMap = {};
            let hasChange = false;

            const keysPayload = {};
            
            relevantKeys.forEach(k => {
                if (this.input.isJustPressed(k)) {
                    justPressedMap[k] = true;
                    hasChange = true;
                }
                // Detect key state changes
                if (this.input.keys[k] !== this.input.prevKeys[k]) {
                    hasChange = true;
                }

                // Send only relevant keys (smaller payload, less GC)
                keysPayload[k] = !!this.input.keys[k];
            });

            // Reduced network traffic, but MUST be reliable enough that a dropped packet
            // doesn't cause "stuck" movement on the host.
            const hasAttackInput = justPressedMap['KeyJ'] || justPressedMap['KeyK'] || justPressedMap['KeyL'];
            const movementHeld = !!(keysPayload['KeyA'] || keysPayload['KeyD'] || keysPayload['Space'] || keysPayload['ShiftLeft'] || keysPayload['KeyS']);

            this.inputSendAccumulator += dt;
            const inputInterval = 1 / Math.max(1, this.inputSendHz);
            const shouldResendHeld = movementHeld && this.inputSendAccumulator >= inputInterval;

            if (hasChange || hasAttackInput || shouldResendHeld) {
                // Always use reliable emit for this game (2 players, low bandwidth).
                // This prevents missing the keydown that starts movement.
                this.socket.emit('playerInput', {
                    roomId: this.roomId,
                    inputState: {
                        keys: keysPayload,
                        justPressed: justPressedMap
                    }
                });
                this.inputSendAccumulator = 0;
            }

            // 2. Host Authority (P1 Syncs State)
            // Sync at a steady rate (Hz) for smoothness.
            // Use non-volatile emit so snapshots aren't randomly dropped (dropping = stutter).
            if (this.playerRole === 'p1') {
                this.syncAccumulator += simDt;
                const syncInterval = 1 / Math.max(1, this.syncHz);
                const shouldSync = this.needsSync || this.syncAccumulator >= syncInterval;

                if (shouldSync) {
                    this.socket.emit('syncState', {
                        roomId: this.roomId,
                        matchId: this.matchId,
                        mapIndex: this.currentMapIndex, // Sync map to P2
                        state: {
                            p1: { 
                                x: Math.round(this.p1.x), 
                                y: Math.round(this.p1.y), 
                                health: this.p1.health, 
                                state: this.p1.state, 
                                facing: this.p1.facing, 
                                stateTimer: Math.round((this.p1.stateTimer || 0) * 1000) / 1000,
                                isDead: this.p1.isDead, // CRITICAL: sync dead state for round transitions
                                perfectBlockActive: this.p1.perfectBlockActive,
                                perfectBlockTimer: Math.round((this.p1.perfectBlockTimer || 0) * 1000) / 1000,
                                perfectBlockCooldown: Math.round((this.p1.perfectBlockCooldown || 0) * 1000) / 1000,
                                specialCooldown: Math.round((this.p1.specialCooldown || 0) * 1000) / 1000,
                                canPerfectBlock: this.p1.canPerfectBlock,
                                characterId: this.p1.characterId,
                                color: this.p1.color,
                                // Status effects for visual sync
                                isFrozen: this.p1.isFrozen,
                                speedModifier: this.p1.speedModifier,
                                statusEffects: this.p1.statusEffects ? this.p1.statusEffects.getActiveEffects() : []
                            },
                            p2: { 
                                x: Math.round(this.p2.x), 
                                y: Math.round(this.p2.y), 
                                health: this.p2.health, 
                                state: this.p2.state, 
                                facing: this.p2.facing, 
                                stateTimer: Math.round((this.p2.stateTimer || 0) * 1000) / 1000,
                                isDead: this.p2.isDead, // CRITICAL: sync dead state for round transitions
                                perfectBlockActive: this.p2.perfectBlockActive,
                                perfectBlockTimer: Math.round((this.p2.perfectBlockTimer || 0) * 1000) / 1000,
                                perfectBlockCooldown: Math.round((this.p2.perfectBlockCooldown || 0) * 1000) / 1000,
                                specialCooldown: Math.round((this.p2.specialCooldown || 0) * 1000) / 1000,
                                canPerfectBlock: this.p2.canPerfectBlock,
                                characterId: this.p2.characterId,
                                color: this.p2.color,
                                // Status effects for visual sync
                                isFrozen: this.p2.isFrozen,
                                speedModifier: this.p2.speedModifier,
                                statusEffects: this.p2.statusEffects ? this.p2.statusEffects.getActiveEffects() : []
                            },
                            timer: Math.round(this.timer * 10) / 10
                        }
                    });
                    this.needsSync = false;
                    this.syncAccumulator = 0;
                }
            }

            // 3. Client snapshots (P2 sends its current position/state to host)
            if (this.playerRole === 'p2') {
                this.clientStateAccumulator += simDt;
                const interval = 1 / Math.max(1, this.clientStateHz);
                if (this.clientStateAccumulator >= interval) {
                    this.socket.emit('clientState', {
                        roomId: this.roomId,
                        matchId: this.matchId,
                        state: {
                            x: Math.round(this.p2.x),
                            y: Math.round(this.p2.y),
                            facing: this.p2.facing,
                            state: this.p2.state,
                            perfectBlockCooldown: this.p2.perfectBlockCooldown,
                            canPerfectBlock: this.p2.canPerfectBlock,
                            perfectBlockActive: this.p2.perfectBlockActive,
                            perfectBlockTimer: this.p2.perfectBlockTimer,
                            blockStartTime: this.p2.blockStartTime,
                            characterId: this.p2.characterId
                        }
                    });
                    this.clientStateAccumulator = 0;
                }
            }
        }

        // Input snapshots MUST be updated at end-of-frame.
        // Otherwise multiplayer networking will never see justPressed / changes.
        this.input.update();

        // Keep NetworkInput in sync at end of frame too.
        if (this.gameMode === 'multi') {
            this.remoteInput.update();
        }

        requestAnimationFrame(this.loop.bind(this));
    }

    updatePreFight(dt) {
        // Track previous countdown second for sound
        const prevSecond = Math.ceil(this.countdownTimer);
        
        this.countdownTimer -= dt;
        
        // Play countdown tick when second changes
        const currentSecond = Math.ceil(this.countdownTimer);
        if (currentSecond !== prevSecond && currentSecond > 0 && currentSecond <= 3) {
            this.sound.playCountdown();
        }
        
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

        if (this.gameMode === 'multi' && this.playerRole === 'p2') {
            // P2 client: P1 is remote/authoritative. Do not run local physics/state machine for P1,
            // otherwise movement/attacks get overwritten and appear invisible.
            if (this.p1) this.p1.update(dt, this.p2, false);
            if (this.p2) this.p2.update(dt, this.p1, true);
        } else {
            this.entities.forEach(e => e.update(dt, e === this.p1 ? this.p2 : this.p1, true));
        }
        this.projectiles.forEach(p => p.update(dt));
        
        // Check projectile-vs-projectile collisions (BEFORE filtering inactive)
        this.checkProjectileVsProjectileCollisions();
        
        this.projectiles = this.projectiles.filter(p => p.active);

        // Multiplayer authority rules:
        // - Only Host (P1) resolves damage/hits to prevent double-processing and "snap back".
        // - P2 still runs projectile VISUAL collision so projectiles disappear on contact.
        if (this.gameMode === 'single' || this.playerRole === 'p1') {
            this.checkCollisions();
        } else {
            this.checkProjectileVisualCollisions();
        }

        // Body collisions are purely positional; keep them local for responsiveness.
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
                // FIX: Recalculate hitbox position based on attacker's CURRENT position
                // This fixes the issue where P2's attacks don't hit P1 in multiplayer
                // ALSO FIX: Make hitbox placement symmetric for left/right facing.
                // Offsets are authored as "forward distance" from the attacker.
                // For left-facing, we need to subtract the hitbox width so the box stays in front.
                const offsetX = (attacker.hitbox.offsetX ?? 30);
                const offsetY = (attacker.hitbox.offsetY ?? -40);
                const hitboxX = attacker.facing === 1
                    ? attacker.x + offsetX
                    : attacker.x - offsetX - attacker.hitbox.w;

                const hitbox = {
                    ...attacker.hitbox,
                    x: hitboxX,
                    y: attacker.y + offsetY
                };
                
                targets.forEach(target => {
                    if (attacker === target) return; 
                    this.resolveHit(hitbox, target, attacker.facing, attacker);
                });
            }
        });

        this.projectiles.forEach(proj => {
            targets.forEach(target => {
                if (proj.owner === target) return; 
                
                const hb = proj.getHitbox();
                const tb = { x: target.x - 15, y: target.y - 60, w: 30, h: 60 };

                if (hb.x < tb.x + tb.w && hb.x + hb.w > tb.x && hb.y < tb.y + tb.h && hb.y + hb.h > tb.y) {
                    // IMPORTANT: Pass proj.owner so skill effects can be applied!
                    this.resolveHit(hb, target, proj.facing, proj.owner);
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

    checkProjectileVisualCollisions() {
        // P2 client: do NOT apply damage, but DO remove projectiles on contact
        // so visuals stay sane (projectiles aren't synced for destruction).
        const targets = this.entities;
        this.projectiles.forEach(proj => {
            targets.forEach(target => {
                if (!proj.active) return;
                if (proj.owner === target) return;

                const hb = proj.getHitbox();
                const tb = { x: target.x - 15, y: target.y - 60, w: 30, h: 60 };

                if (hb.x < tb.x + tb.w && hb.x + hb.w > tb.x && hb.y < tb.y + tb.h && hb.y + hb.h > tb.y) {
                    proj.active = false;
                    this.renderer.triggerParticles(proj.x, proj.y, proj.color, 20);
                }
            });
        });
    }

    // ==========================================
    // PROJECTILE VS PROJECTILE COLLISION
    // Epic clash when both players' skills collide!
    // ==========================================
    checkProjectileVsProjectileCollisions() {
        // Need at least 2 projectiles for a clash
        if (this.projectiles.length < 2) return;

        for (let i = 0; i < this.projectiles.length; i++) {
            const proj1 = this.projectiles[i];
            if (!proj1.active) continue;

            for (let j = i + 1; j < this.projectiles.length; j++) {
                const proj2 = this.projectiles[j];
                if (!proj2.active) continue;

                // Only clash if projectiles are from DIFFERENT owners
                if (proj1.owner === proj2.owner) continue;

                // Get hitboxes
                const hb1 = proj1.getHitbox();
                const hb2 = proj2.getHitbox();

                // Check collision (AABB)
                const colliding = 
                    hb1.x < hb2.x + hb2.w &&
                    hb1.x + hb1.w > hb2.x &&
                    hb1.y < hb2.y + hb2.h &&
                    hb1.y + hb1.h > hb2.y;

                if (colliding) {
                    // EPIC CLASH!
                    this.triggerProjectileClash(proj1, proj2);
                    
                    // Deactivate both projectiles
                    proj1.active = false;
                    proj2.active = false;
                    
                    // Break inner loop as proj1 is now inactive
                    break;
                }
            }
        }
    }

    triggerProjectileClash(proj1, proj2) {
        // Calculate collision point (midpoint between the two projectiles)
        const clashX = (proj1.x + proj2.x) / 2;
        const clashY = (proj1.y + proj2.y) / 2;

        // Get colors from both projectiles
        const color1 = proj1.color || '#00ffff';
        const color2 = proj2.color || '#ff00ff';

        // Trigger the god-tier visual effect
        this.renderer.triggerProjectileClash(clashX, clashY, color1, color2);

        // Apply knockdown to BOTH players (no HP loss)
        this.applyClashKnockdown(this.p1, clashX);
        this.applyClashKnockdown(this.p2, clashX);

        // Extra hit-stop for dramatic effect
        this.hitStopTimer = Math.max(this.hitStopTimer, 0.15);

        // Broadcast clash event in multiplayer
        if (this.gameMode === 'multi' && this.socket && this.playerRole === 'p1') {
            this.socket.emit('projectileClash', {
                roomId: this.roomId,
                x: clashX,
                y: clashY,
                color1: color1,
                color2: color2,
                matchId: this.matchId
            });
        }
    }

    applyClashKnockdown(player, clashX) {
        if (!player || player.isDead) return;
        
        // Skip if already in knockdown or getting up
        if (player.state === 'knockdown' || player.state === 'getting_up') return;

        // Determine knockback direction based on position relative to clash point
        const knockbackDir = player.x < clashX ? -1 : 1;
        
        // Apply knockback velocity (sent flying away from clash point)
        player.vx = knockbackDir * 450;
        player.vy = -350; // Launch upward
        
        // Set knockdown state (shorter duration since no damage taken)
        player.state = 'knockdown';
        player.stateTimer = 1.0; // Slightly shorter knockdown for clash
        
        // Reset combo
        player.comboStep = 0;
        player.consecutiveHits = 0;
        player.hitDecayTimer = 0;
        
        // Give brief invulnerability
        player.invulnerable = 0.5;
    }

    applyNetHitFeedback(state) {
        // Only relevant for P2 client.
        if (this.gameMode !== 'multi' || this.playerRole !== 'p2') return;
        if (!state || !state.p1 || !state.p2) return;

        // Don't spam feedback if state is identical
        const prev = this._lastNetFeedback;
        const prevP1H = prev ? prev.p1Health : null;
        const prevP2H = prev ? prev.p2Health : null;

        const p1Health = state.p1.health;
        const p2Health = state.p2.health;

        const deltas = [];
        if (typeof prevP1H === 'number' && typeof p1Health === 'number' && p1Health < prevP1H) {
            deltas.push({ victim: 'p1', dmg: prevP1H - p1Health });
        }
        if (typeof prevP2H === 'number' && typeof p2Health === 'number' && p2Health < prevP2H) {
            deltas.push({ victim: 'p2', dmg: prevP2H - p2Health });
        }

        // Update cache early to avoid double-triggering if something throws
        this._lastNetFeedback = {
            p1Health,
            p2Health,
            p1State: state.p1.state,
            p2State: state.p2.state
        };

        if (!this.p1 || !this.p2) return;
        if (deltas.length === 0) return;

        const doFeedback = (victimRole, damageAmount) => {
            const victim = victimRole === 'p2' ? this.p2 : this.p1;
            const attacker = victimRole === 'p2' ? this.p1 : this.p2;
            const attackerFacing = (victimRole === 'p2') ? (state.p1.facing ?? attacker.facing) : (state.p2.facing ?? attacker.facing);

            const isHeavy = damageAmount >= 15;

            const flashStrength = isHeavy ? 0.32 : 0.22;
            this.renderer.triggerImpactFlash('rgba(255,255,255,0.35)', flashStrength, 0.05);
            this.renderer.triggerHitSparks(victim.x, victim.y - 30, isHeavy ? '#ffcc00' : '#ffffff', attackerFacing, isHeavy ? 22 : 14, isHeavy ? 1.2 : 0.85);
            this.renderer.triggerParticles(victim.x, victim.y - 30, victim.color, 10);

            // Screen shake ONLY for the locally-hit player (reduced intensity)
            const localVictim = (victimRole === 'p2');
            if (localVictim) {
                const intensity = Math.min(4, 1 + (damageAmount * 0.1));
                this.renderer.triggerShake(intensity, 0.1);
            }
        };

        deltas.forEach(d => doFeedback(d.victim, d.dmg));
    }

    resolveDashHit(attacker, target) {
        // Perfect Block Shield Immunity - target is invulnerable during shield
        if (target.perfectBlockActive) {
            // Deflect the attacker
            attacker.vx = -attacker.facing * 300;
            attacker.state = 'hitstun';
            attacker.stateTimer = 0.3;
            this.renderer.triggerParticles(target.x, target.y - 30, '#00ffff', 15);
            this.sound.playBlock();
            return;
        }
        
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
            
            if (this.gameMode === 'single') this.renderer.triggerShake(3, 0.12);
            this.renderer.triggerImpactFlash('rgba(255,255,255,0.35)', 0.35, 0.05);
            this.renderer.triggerHitSparks((attacker.x + target.x)/2, target.y - 40, '#ffffff', attacker.facing, 22, 1.2);
            this.hitStopTimer = Math.max(this.hitStopTimer, 0.05);
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
                // Perfect Block: within 200ms of block start AND this block attempt can be perfect
                if (Date.now() - target.blockStartTime < 200 && target.canPerfectBlock) {
                    actualDamage = 0;
                    actualKnockback = 0;
                    target.health = Math.min(100, target.health + 20); 
                    
                    // Activate perfect block shield (1 second immunity)
                    target.perfectBlockActive = true;
                    target.perfectBlockTimer = target.perfectBlockShieldDuration;
                    target.canPerfectBlock = false; // Can't perfect block again until cooldown resets
                    target.state = 'perfect_block_shield';
                    target.stateTimer = target.perfectBlockShieldDuration;
                    
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
               // Screen shake should only hit the locally-hit player in multiplayer (reduced).
               if (this.gameMode === 'single') this.renderer.triggerShake(2, 0.1);
               if (this.gameMode === 'multi') {
                   const localPlayer = this.playerRole === 'p1' ? this.p1 : this.p2;
                   if (target === localPlayer) this.renderer.triggerShake(2, 0.1);
               }
               this.renderer.triggerImpactFlash('rgba(255,255,255,0.3)', 0.3, 0.05);
               this.renderer.triggerHitSparks((attacker.x + target.x)/2, target.y - 30, '#ffcc00', attacker.facing, 18, 1.0);
               this.hitStopTimer = Math.max(this.hitStopTimer, 0.045);
             this.renderer.triggerParticles((attacker.x + target.x)/2, target.y - 30, '#ffaa00', 15);
        }
    }

    resolveHit(hitbox, target, attackerFacing, attacker = null) {
        // Perfect Block Shield Immunity - target is invulnerable during shield
        if (target.perfectBlockActive) {
            // Deflect the attack - visual feedback only
            if (attacker && attacker.hitbox) {
                attacker.hitbox = null;
            }
            this.renderer.triggerParticles(target.x, target.y - 30, '#00ffff', 10);
            this.sound.playBlock();
            return;
        }
        
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
            // FIX: Clear hitbox after successful hit to prevent multiple damage
            if (attacker && attacker.hitbox) {
                attacker.hitbox = null;
            }
            
            // FIX: Trigger immediate sync in multiplayer
            if (this.gameMode === 'multi' && this.playerRole === 'p1') {
                this.needsSync = true;
            }

            let damage = hitbox.damage;
            let knockbackX = attackerFacing * hitbox.knockback;
            let knockbackY = (hitbox.type === 'special' || hitbox.type === 'special_projectile' || hitbox.type === 'knockdown_hit') ? -400 : -100;

            const isProjectile = hitbox.type === 'special_projectile';
            const isSpecial = hitbox.type === 'special' || isProjectile;
            const isKnockdown = hitbox.type === 'knockdown_hit';
            const isHeavy = hitbox.type === 'heavy' || isKnockdown || isSpecial;

            if (target.state === 'blocking') {
                const hitFromFront = (attackerFacing === 1 && target.facing === -1) || (attackerFacing === -1 && target.facing === 1);
                if (hitFromFront) {
                    // Perfect Block: within 200ms of block start AND this block attempt can be perfect
                    if (Date.now() - target.blockStartTime < 200 && target.canPerfectBlock) {
                        damage = 0;
                        knockbackX = attackerFacing * 50; 
                        knockbackY = 0;
                        target.health = Math.min(100, target.health + 20); 
                        
                        // Activate perfect block shield (1 second immunity)
                        target.perfectBlockActive = true;
                        target.perfectBlockTimer = target.perfectBlockShieldDuration;
                        target.canPerfectBlock = false; // Can't perfect block again until cooldown resets
                        target.state = 'perfect_block_shield'; // New state for visual
                        target.stateTimer = target.perfectBlockShieldDuration;
                        
                        this.sound.playPerfectBlock();
                        this.renderer.triggerImpactFlash('rgba(0,243,255,0.25)', 0.25, 0.04);
                        this.renderer.triggerHitSparks(target.x, target.y - 30, '#ffffff', -attackerFacing, 14, 0.7);
                        this.hitStopTimer = Math.max(this.hitStopTimer, 0.02);
                        this.renderer.triggerParticles(target.x, target.y - 30, '#00ff00', 20); 
                        return; 
                    } else {
                        damage = Math.ceil(damage * 0.1); 
                        knockbackX *= 0.5;
                        knockbackY = 0;
                        target.state = 'blockstun';
                        target.stateTimer = 0.2;
                        this.sound.playBlock();
                        this.renderer.triggerImpactFlash('rgba(255,255,255,0.18)', 0.18, 0.04);
                        this.renderer.triggerHitSparks(target.x, target.y - 30, '#ffffff', -attackerFacing, 10, 0.6);
                        this.hitStopTimer = Math.max(this.hitStopTimer, 0.02);
                        this.renderer.triggerParticles(target.x, target.y - 30, '#ffffff', 5); 
                    }
                }
            }

            target.takeDamage(damage, knockbackX, knockbackY, hitbox.type);

            // Apply character skill effects ONLY on SKILL (special projectile) hit
            if (isProjectile && attacker && attacker.characterId && attacker.applySkillEffect) {
                attacker.applySkillEffect(target);
                
                // Trigger character-specific skill hit visual effects
                const charId = attacker.characterId;
                if (charId === 'ice') {
                    // Ice freeze effect - blue flash and ice particles
                    this.renderer.triggerImpactFlash('rgba(0, 212, 255, 0.5)', 0.5, 0.15);
                    this.renderer.triggerSkillHitEffect(target.x, target.y - 30, 'ice');
                } else if (charId === 'fire') {
                    // Fire burn effect - orange flash and fire particles
                    this.renderer.triggerImpactFlash('rgba(255, 68, 0, 0.5)', 0.5, 0.15);
                    this.renderer.triggerSkillHitEffect(target.x, target.y - 30, 'fire');
                } else if (charId === 'lightning') {
                    // Lightning shock effect - yellow flash and electric sparks
                    this.renderer.triggerImpactFlash('rgba(255, 221, 0, 0.5)', 0.5, 0.15);
                    this.renderer.triggerSkillHitEffect(target.x, target.y - 30, 'lightning');
                }
            }
            
            if (target.state !== 'blocking' && target.state !== 'blockstun') {
                // Tekken-ish impact feel: hit-stop + flash + sparks
                const hitStop = isSpecial ? 0.075 : (isHeavy ? 0.055 : 0.035);
                this.hitStopTimer = Math.max(this.hitStopTimer, hitStop);

                const flashStrength = isSpecial ? 0.45 : (isHeavy ? 0.32 : 0.22);
                this.renderer.triggerImpactFlash('rgba(255,255,255,0.35)', flashStrength, Math.min(0.06, hitStop));

                const sparkColor = isSpecial ? '#ffffff' : (isHeavy ? '#ffcc00' : '#ffffff');
                this.renderer.triggerHitSparks(target.x, target.y - 30, sparkColor, attackerFacing, isHeavy ? 22 : 14, isHeavy ? 1.2 : 0.85);

                // Screen shake (reduced intensity):
                // - Singleplayer: always (arcade feel)
                // - Multiplayer: ONLY if the local player is the one being hit
                if (this.gameMode === 'single') {
                    this.renderer.triggerShake(hitbox.damage / 5, 0.1);
                } else if (this.gameMode === 'multi') {
                    const localPlayer = this.playerRole === 'p1' ? this.p1 : this.p2;
                    if (target === localPlayer) this.renderer.triggerShake(hitbox.damage / 5, 0.1);
                }
                this.renderer.triggerParticles(target.x, target.y - 30, target.color, 12);
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

        // Update character icons in HUD
        const p1Char = getCharacterById(this.p1.characterId);
        const p2Char = getCharacterById(this.p2.characterId);
        
        const p1CharIcon = document.getElementById('p1-char-icon');
        const p2CharIcon = document.getElementById('p2-char-icon');
        
        if (p1CharIcon && p1Char) {
            p1CharIcon.textContent = p1Char.icon;
            p1CharIcon.style.color = p1Char.color;
        }
        if (p2CharIcon && p2Char) {
            p2CharIcon.textContent = p2Char.icon;
            p2CharIcon.style.color = p2Char.color;
        }

        // Update health bar colors based on character
        const p1HealthBar = document.getElementById('p1-health');
        const p2HealthBar = document.getElementById('p2-health');
        
        if (p1HealthBar && p1Char) {
            p1HealthBar.style.background = `linear-gradient(90deg, ${p1Char.color}88, ${p1Char.color})`;
            p1HealthBar.style.boxShadow = `0 0 15px ${p1Char.color}`;
        }
        if (p2HealthBar && p2Char) {
            p2HealthBar.style.background = `linear-gradient(90deg, ${p2Char.color}, ${p2Char.color}88)`;
            p2HealthBar.style.boxShadow = `0 0 15px ${p2Char.color}`;
        }

        // Purely visual: Tekken-style low-health "rage" glow
        const p1Hud = document.querySelector('.health-container.p1');
        const p2Hud = document.querySelector('.health-container.p2');
        if (p1Hud) p1Hud.classList.toggle('is-rage', this.p1.health <= 25);
        if (p2Hud) p2Hud.classList.toggle('is-rage', this.p2.health <= 25);

        // Update status effect icons
        this.updateStatusEffectUI('p1', this.p1);
        this.updateStatusEffectUI('p2', this.p2);

        // Update skill cooldown icons for both players
        this.updateSkillCooldownUI('p1', this.p1);
        this.updateSkillCooldownUI('p2', this.p2);

        const aiStats = document.getElementById('ai-stats');
        if (aiStats) {
            if (this.gameMode === 'single') {
                aiStats.innerHTML = `
                    Aggression: ${(this.ai.profile.aggression * 100).toFixed(0)}%<br>
                    Dash Tendency: ${(this.ai.profile.dashTendency * 100).toFixed(0)}%<br>
                    Strategy: ${this.ai.targetDistance > 100 ? 'Defensive' : 'Aggressive'}
                `;
            } else {
                aiStats.innerHTML = `MULTIPLAYER MODE<br>Room: ${this.roomId}`;
            }
        }
    }

    updateSkillCooldownUI(playerPrefix, player) {
        // SVG circle circumference for r=16 is approximately 100.53
        const circumference = 100.53;

        // Special skill icon
        const specialIcon = document.getElementById(`${playerPrefix}-special-icon`);
        const specialProgress = document.getElementById(`${playerPrefix}-special-progress`);
        const specialText = document.getElementById(`${playerPrefix}-special-text`);

        if (specialIcon && specialProgress && specialText) {
            const specialCooldown = player.specialCooldown;
            const maxSpecialCooldown = player.maxSpecialCooldown;

            if (specialCooldown > 0) {
                // On cooldown - progress goes from 0 (just used) to 1 (ready)
                // strokeDashoffset = circumference means fully hidden (0% progress)
                // strokeDashoffset = 0 means fully shown (100% progress)
                const progress = 1 - (specialCooldown / maxSpecialCooldown);
                const dashOffset = circumference * (1 - progress);
                specialProgress.style.strokeDashoffset = String(dashOffset);
                specialText.innerText = specialCooldown.toFixed(1) + 's';
                specialIcon.classList.remove('ready', 'active');
                specialIcon.classList.add('on-cooldown');
            } else {
                // Ready - show full ring
                specialProgress.style.strokeDashoffset = '0';
                specialText.innerText = '';
                specialIcon.classList.remove('on-cooldown', 'active');
                specialIcon.classList.add('ready');
            }
        }

        // Perfect block icon
        const blockIcon = document.getElementById(`${playerPrefix}-block-icon`);
        const blockProgress = document.getElementById(`${playerPrefix}-block-progress`);
        const blockText = document.getElementById(`${playerPrefix}-block-text`);

        if (blockIcon && blockProgress && blockText) {
            const blockCooldown = player.perfectBlockCooldown;
            const maxBlockCooldown = player.maxPerfectBlockCooldown;
            const blockActive = player.perfectBlockActive;

            if (blockActive) {
                // Shield is active - progress counts down
                const shieldProgress = player.perfectBlockTimer / player.perfectBlockShieldDuration;
                const dashOffset = circumference * (1 - shieldProgress);
                blockProgress.style.strokeDashoffset = String(dashOffset);
                blockProgress.style.stroke = '#00ff00'; // Green when active
                blockText.innerText = 'SHIELD';
                blockIcon.classList.remove('ready', 'on-cooldown');
                blockIcon.classList.add('active');
            } else if (blockCooldown > 0) {
                // On cooldown - progress goes from 0 (just used) to 1 (ready)
                const progress = 1 - (blockCooldown / maxBlockCooldown);
                const dashOffset = circumference * (1 - progress);
                blockProgress.style.strokeDashoffset = String(dashOffset);
                blockProgress.style.stroke = ''; // Reset to default color
                blockText.innerText = blockCooldown.toFixed(1) + 's';
                blockIcon.classList.remove('ready', 'active');
                blockIcon.classList.add('on-cooldown');
            } else {
                // Ready - show full ring
                blockProgress.style.strokeDashoffset = '0';
                blockProgress.style.stroke = ''; // Reset to default color
                blockText.innerText = '';
                blockIcon.classList.remove('on-cooldown', 'active');
                blockIcon.classList.add('ready');
            }
        }
    }

    updateStatusEffectUI(playerPrefix, player) {
        const container = document.getElementById(`${playerPrefix}-status-effects`);
        if (!container || !player.statusEffects) return;

        const activeEffects = player.statusEffects.getActiveEffects();
        
        // Clear existing icons
        container.innerHTML = '';

        // Add icons for each active effect
        activeEffects.forEach(effect => {
            const icon = document.createElement('div');
            icon.className = `status-effect-icon ${effect.type}`;
            
            switch (effect.type) {
                case 'freeze':
                    icon.textContent = '❄️';
                    icon.title = `Frozen (${effect.duration.toFixed(1)}s)`;
                    break;
                case 'burn':
                    icon.textContent = '🔥';
                    icon.title = `Burning (${effect.duration.toFixed(1)}s)`;
                    break;
                case 'shock':
                    icon.textContent = '⚡';
                    icon.title = `Shocked (${effect.duration.toFixed(1)}s)`;
                    break;
                case 'slow':
                    icon.textContent = '🐌';
                    icon.title = `Slowed (${effect.duration.toFixed(1)}s)`;
                    break;
                case 'speedBoost':
                    icon.textContent = '💨';
                    icon.title = `Speed Boost (${effect.duration.toFixed(1)}s)`;
                    break;
            }
            
            container.appendChild(icon);
        });
    }

    triggerFinalShotEffect() {
        const container = document.getElementById('game-container');
        const canvas = document.getElementById('gameCanvas');
        if (!container || !canvas) return;

        // Create final shot overlay
        let overlay = document.querySelector('.final-shot-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'final-shot-overlay';
            container.appendChild(overlay);
        }
        overlay.innerHTML = ''; // Clear previous content

        // === PHASE 1: FREEZE FRAME + REPLAY LABEL ===
        this.timeScale = 0; // Complete freeze
        
        // Add cinematic black bars
        const topBar = document.createElement('div');
        topBar.className = 'cinematic-bar top';
        overlay.appendChild(topBar);
        
        const bottomBar = document.createElement('div');
        bottomBar.className = 'cinematic-bar bottom';
        overlay.appendChild(bottomBar);

        // Add "FINAL BLOW" replay label
        const replayLabel = document.createElement('div');
        replayLabel.className = 'replay-label';
        replayLabel.innerHTML = '<span class="replay-icon">▶</span> FINAL BLOW';
        overlay.appendChild(replayLabel);

        // Add replay border effect
        overlay.classList.add('replay-mode');

        // Screen flash
        const flash = document.createElement('div');
        flash.className = 'impact-flash';
        overlay.appendChild(flash);

        // Camera shake (reduced intensity)
        if (this.renderer) {
            this.renderer.triggerShake(6, 0.2);
        }

        // === PHASE 2: SLOW MOTION REPLAY (after 300ms) ===
        setTimeout(() => {
            this.timeScale = 0.15; // Very slow replay
            replayLabel.classList.add('playing');
            
            // Zoom effect on canvas
            canvas.classList.add('final-shot-zoom');
        }, 300);

        // === PHASE 3: IMPACT + K.O. (after 1200ms) ===
        setTimeout(() => {
            // Remove replay elements
            replayLabel.classList.add('fade-out');
            canvas.classList.remove('final-shot-zoom');
            canvas.classList.add('final-shot-impact');
            
            // Big impact shake (reduced intensity)
            if (this.renderer) {
                this.renderer.triggerShake(8, 0.3);
            }

            // Add K.O. text
            const koText = document.createElement('div');
            koText.className = 'ko-text';
            koText.innerHTML = `
                <div class="ko-impact-ring"></div>
                <div class="ko-letters">
                    <span class="ko-k">K</span>
                    <span class="ko-dot">.</span>
                    <span class="ko-o">O</span>
                    <span class="ko-dot">.</span>
                </div>
                <div class="ko-subtitle">KNOCKOUT</div>
            `;
            overlay.appendChild(koText);

            // Return to normal speed
            this.timeScale = 1.0;
        }, 1200);

        // === PHASE 4: CLEANUP (after 2500ms) ===
        setTimeout(() => {
            overlay.classList.remove('replay-mode');
            overlay.classList.add('fade-out');
            canvas.classList.remove('final-shot-impact');
            
            // Full cleanup after fade
            setTimeout(() => {
                overlay.innerHTML = '';
                overlay.classList.remove('fade-out');
            }, 500);
        }, 2500);
    }

    endRound(msg, fromServer = false) {
        if (this.gameState === 'round_over') return;
        
        // In multiplayer, only Host decides round end, unless msg comes from server
        if (this.gameMode === 'multi' && this.playerRole !== 'p1' && !fromServer) return;

        // Trigger final shot effect
        this.triggerFinalShotEffect();

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

        // Play KO sound for the loser
        this.sound.playKO();

        // Play victory/defeat sound based on player perspective
        const playerWonRound = (this.gameMode === 'single' && winner.includes('P1')) ||
            (this.gameMode === 'multi' && this.playerRole === 'p1' && winner.includes('P1')) ||
            (this.gameMode === 'multi' && this.playerRole === 'p2' && winner.includes('P2'));
        
        setTimeout(() => {
            if (playerWonRound) {
                this.sound.playVictory();
            } else if (winner !== 'DRAW') {
                this.sound.playDefeat();
            }
        }, 300);

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

        // Show rage or encouragement sentence
        this.showRoundSentence(winner);
    }

    showRoundSentence(winner) {
        const sentenceEl = document.getElementById('round-sentence');
        const textEl = document.getElementById('sentence-text');
        if (!sentenceEl || !textEl) return;

        // Determine if player (P1) won or lost
        // In single player, P1 is always the human player
        // In multiplayer, check playerRole
        let playerWon = false;
        if (this.gameMode === 'single') {
            playerWon = winner.includes('P1');
        } else {
            playerWon = (this.playerRole === 'p1' && winner.includes('P1')) || 
                       (this.playerRole === 'p2' && winner.includes('P2'));
        }

        // Pick a random sentence
        const sentences = playerWon ? this.encouragementSentences : this.rageSentences;
        const sentence = sentences[Math.floor(Math.random() * sentences.length)];

        // Update text and style
        textEl.textContent = sentence;
        textEl.className = 'sentence-text ' + (playerWon ? 'win' : 'lose');

        // Show the sentence
        sentenceEl.classList.remove('hidden');

        // Hide after a delay
        setTimeout(() => {
            sentenceEl.classList.add('hidden');
        }, 2500);
    }

    endMatch() {
        this.gameState = 'match_over';
        const winner = this.p1Wins > this.p2Wins ? 'P1 WINS MATCH' : 'P2 WINS MATCH';
        document.getElementById('overlay-title').innerText = winner;
        document.getElementById('overlay-subtitle').innerText = '';
        document.getElementById('overlay').classList.remove('hidden');

        // Play match victory/defeat sound based on player perspective
        const playerWonMatch = (this.gameMode === 'single' && winner.includes('P1')) ||
            (this.gameMode === 'multi' && this.playerRole === 'p1' && winner.includes('P1')) ||
            (this.gameMode === 'multi' && this.playerRole === 'p2' && winner.includes('P2'));
        
        setTimeout(() => {
            if (playerWonMatch) {
                this.sound.playMatchVictory();
            } else {
                this.sound.playMatchDefeat();
            }
        }, 200);

        // Show post-match menu for both singleplayer and multiplayer
        document.getElementById('post-match-menu').classList.remove('hidden');

        // Reset rematch UI state
        this.updateRematchUI(false, 0, false, false);
        
        // CrazyGames: Show interstitial ad when match ends
        if (window.CrazyAds && !window.CrazyAds.adInProgress) {
            setTimeout(() => {
                window.CrazyAds.showInterstitial();
            }, 1500);
        }
    }

    rematch(fromServer = false, nextMatchId = null) {
        // Multiplayer: BOTH players must confirm within 10 seconds
        if (this.gameMode === 'multi' && !fromServer) {
            if (this.socket && this.roomId) {
                this.socket.emit('rematchReady', { roomId: this.roomId });
                // UI will be updated by server via rematchStatus
                return;
            }
        }

        // Update match id (server provides it in multiplayer; otherwise locally increment)
        if (this.gameMode === 'multi') {
            if (typeof nextMatchId === 'number') this.matchId = nextMatchId;
            else this.matchId = (this.matchId || 0) + 1;
        }

        // Reset game state for rematch
        this.p1Wins = 0;
        this.p2Wins = 0;
        this.round = 1;

        // Clear net smoothing/feedback caches
        this.netStateBuffer = [];
        this.serverTimeOffsetMs = 0;
        this.serverTimeOffsetInit = false;
        this._lastNetFeedback = null;

        this.initMatch();
        this.startPreFight();
        document.getElementById('post-match-menu').classList.add('hidden');

        // Clear rematch UI
        this.updateRematchUI(false, 0, false, false);
    }

    startSinglePlayerFromMultiplayer() {
        // Leave any lobby/waiting screens and start an AI match.
        const lobby = document.getElementById('multiplayer-menu');
        const waiting = document.getElementById('waiting-screen');
        if (lobby) lobby.classList.add('hidden');
        if (waiting) waiting.classList.add('hidden');
        this.startSinglePlayer();
    }

    backToDashboard() {
        // In multiplayer, leave room gracefully so the opponent isn't forced to dashboard.
        if (this.gameMode === 'multi' && this.socket && this.roomId) {
            try {
                this.socket.emit('leaveRoom', { roomId: this.roomId });
            } catch (e) {
                // ignore
            }
        }
        this.cleanupMultiplayer();
        this.gameState = 'menu';
        this.gameMode = 'single';
        this.roomId = null;
        
        // Switch back to lobby music
        this.sound.playLobbyMusic();
        
        // Reset UI
        document.getElementById('ui-layer').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('post-match-menu').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        
        // Update character showcase to show currently selected character
        this.refreshCharacterShowcase();
        
        // Ensure status shows ONLINE if socket is connected
        this.updateConnectionStatus();
    }
    
    refreshCharacterShowcase() {
        const charCards = document.querySelectorAll('.char-card');
        const showcaseGlow = document.querySelector('.character-glow');
        const showcaseSilhouette = document.querySelector('.character-silhouette');
        const charName = document.querySelector('.character-name');
        const charElement = document.querySelector('.character-element');
        const charDesc = document.querySelector('.character-desc');
        
        const char = getCharacterById(this.selectedCharacter);
        if (!char) return;
        
        // Update showcase elements
        if (showcaseGlow) {
            showcaseGlow.className = 'character-glow ' + this.selectedCharacter;
        }
        if (showcaseSilhouette) {
            showcaseSilhouette.className = 'character-silhouette ' + this.selectedCharacter;
        }
        if (charName) {
            charName.textContent = char.name.toUpperCase();
            charName.className = 'character-name ' + this.selectedCharacter;
        }
        if (charElement) {
            charElement.textContent = char.element.toUpperCase();
        }
        if (charDesc) {
            charDesc.textContent = char.description;
        }
        
        // Update card selection state
        charCards.forEach(card => {
            if (card.dataset.char === this.selectedCharacter) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });
    }

    cleanupMultiplayer() {
        // Remove game-specific event listeners but keep socket connected
        if (this.socket) {
            this.socket.off('roomCreated');
            this.socket.off('gameStart');
            this.socket.off('remoteInput');
            this.socket.off('syncState');
            this.socket.off('roundResult');
            this.socket.off('rematchStatus');
            this.socket.off('rematchStart');
            this.socket.off('rematchCancelled');
            this.socket.off('playerDisconnected');
            this.socket.off('opponentLeft');
            this.socket.off('error');
            // DO NOT disconnect or null the socket - keep it alive for status display
        }
        this.gameMode = 'single';
    }
    
    updateConnectionStatus() {
        const el = document.getElementById('status-text');
        if (!el) return;
        if (this.socket && this.socket.connected) {
            el.innerText = "ONLINE";
            el.style.color = "#00ff00";
        } else if (this.socket) {
            el.innerText = "CONNECTING...";
            el.style.color = "#ffaa00";
            this.socket.connect();
        } else {
            el.innerText = "DISCONNECTED";
            el.style.color = "#ff0000";
        }
    }
}