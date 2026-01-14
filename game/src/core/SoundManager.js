export class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterVolume = 0.6; // Master volume control
        this.musicVolume = 0.35; // Music volume (lower than SFX)
        
        // Music system
        this.currentMusic = null;
        this.musicNodes = [];
        this.musicIntervalId = null;
        this.isMusicPlaying = false;
        this.currentMusicType = null; // 'lobby' or 'battle'
        
        // Music tempo
        this.bpm = 120;
        this.beatDuration = 60 / this.bpm;
    }

    ensureContext() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    playTone(freq, type, duration, vol = 0.1) {
        this.ensureContext();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // Create noise buffer for impact sounds
    createNoiseBuffer(duration) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // Play noise with envelope
    playNoise(duration, vol, attack = 0.01, decay = 0.1, filterFreq = 1000) {
        this.ensureContext();
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(duration);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(vol * this.masterVolume, this.ctx.currentTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + decay);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    // ============== ATTACK SOUNDS ==============
    
    // Light punch - quick snap
    playPunch() {
        this.ensureContext();
        // Quick impact thud
        this.playTone(180, 'square', 0.05, 0.25);
        this.playTone(120, 'sawtooth', 0.08, 0.15);
        // Add slight noise for realism
        this.playNoise(0.1, 0.12, 0.005, 0.08, 800);
    }

    // Heavy kick - deeper thump with more bass
    playKick() {
        this.ensureContext();
        // Deep bass thump
        this.playTone(60, 'sine', 0.15, 0.3);
        this.playTone(100, 'sawtooth', 0.1, 0.2);
        // Mid impact
        this.playTone(200, 'square', 0.06, 0.15);
        // Noise layer for that meaty sound
        this.playNoise(0.12, 0.15, 0.005, 0.1, 600);
    }

    // Combo finisher punch (3rd hit) - powerful impact
    playComboFinisherPunch() {
        this.ensureContext();
        // Low end boom
        this.playTone(50, 'sine', 0.2, 0.35);
        this.playTone(80, 'sawtooth', 0.15, 0.25);
        // Sharp crack
        this.playTone(350, 'square', 0.04, 0.18);
        // Noise burst
        this.playNoise(0.15, 0.2, 0.005, 0.12, 1200);
    }

    // Combo finisher kick (3rd hit) - devastating blow
    playComboFinisherKick() {
        this.ensureContext();
        // Massive bass drop
        this.playTone(40, 'sine', 0.25, 0.4);
        this.playTone(70, 'sawtooth', 0.18, 0.3);
        // Sharp high crack
        this.playTone(400, 'square', 0.05, 0.2);
        this.playTone(600, 'triangle', 0.03, 0.1);
        // Heavy noise impact
        this.playNoise(0.18, 0.25, 0.005, 0.15, 1500);
    }

    // Legacy methods for compatibility
    playHit() {
        this.playPunch();
    }

    playHeavyHit() {
        this.playKick();
    }

    // ============== SKILL/SPECIAL SOUNDS ==============
    
    // Skill launch - energy projectile whoosh
    playSkillLaunch() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Rising energy charge
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(200, t);
        osc1.frequency.exponentialRampToValueAtTime(800, t + 0.15);
        
        const gain1 = this.ctx.createGain();
        gain1.gain.setValueAtTime(0, t);
        gain1.gain.linearRampToValueAtTime(0.2 * this.masterVolume, t + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        
        osc1.connect(gain1);
        gain1.connect(this.ctx.destination);
        osc1.start(t);
        osc1.stop(t + 0.3);
        
        // Whoosh layer
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(150, t);
        osc2.frequency.exponentialRampToValueAtTime(400, t + 0.1);
        
        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.15 * this.masterVolume, t);
        gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        
        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);
        osc2.start(t);
        osc2.stop(t + 0.2);
        
        // Noise burst for energy release
        this.playNoise(0.25, 0.12, 0.02, 0.2, 2000);
    }

    // Skill hit - when projectile connects
    playSkillHit() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Energy burst
        this.playTone(300, 'sine', 0.15, 0.25);
        this.playTone(450, 'triangle', 0.1, 0.2);
        
        // Electric crackle
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.setValueAtTime(400, t + 0.02);
        osc.frequency.setValueAtTime(700, t + 0.04);
        osc.frequency.setValueAtTime(300, t + 0.06);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18 * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
        
        // Impact noise
        this.playNoise(0.2, 0.18, 0.005, 0.15, 3000);
    }

    // ============== BLOCK SOUNDS ==============
    
    playBlock() {
        this.ensureContext();
        // Metallic clang
        this.playTone(450, 'triangle', 0.08, 0.12);
        this.playTone(600, 'sine', 0.06, 0.08);
        // Short noise for impact feel
        this.playNoise(0.08, 0.1, 0.005, 0.06, 1500);
    }

    // Perfect block - more satisfying sound
    playPerfectBlock() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Powerful shield activation
        this.playTone(800, 'sine', 0.1, 0.2);
        this.playTone(1000, 'triangle', 0.08, 0.15);
        this.playTone(600, 'sine', 0.15, 0.18);
        
        // Harmonic shimmer
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12 * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
    }

    // ============== MOVEMENT SOUNDS ==============
    
    playDash() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Quick whoosh
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.15);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15 * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
        
        // Wind noise
        this.playNoise(0.15, 0.08, 0.01, 0.12, 800);
    }

    playJump() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Rising tone for jump
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.1 * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
    }

    playLand() {
        this.ensureContext();
        // Soft thump on landing
        this.playTone(100, 'sine', 0.08, 0.12);
        this.playNoise(0.08, 0.08, 0.005, 0.06, 400);
    }

    // ============== VICTORY / DEFEAT SOUNDS ==============
    
    playVictory() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Triumphant fanfare - ascending arpeggio
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            const gain = this.ctx.createGain();
            const startTime = t + i * 0.12;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2 * this.masterVolume, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.4);
        });
        
        // Add harmonics for richness
        setTimeout(() => {
            this.playTone(1047, 'triangle', 0.5, 0.12);
            this.playTone(784, 'sine', 0.6, 0.1);
        }, 400);
    }

    playDefeat() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Sad descending tones
        const notes = [392, 349, 311, 262]; // G4, F4, Eb4, C4
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            const gain = this.ctx.createGain();
            const startTime = t + i * 0.2;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.15 * this.masterVolume, startTime + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.5);
        });
    }

    playMatchVictory() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Epic victory fanfare
        const melody = [
            { freq: 523, delay: 0 },     // C5
            { freq: 659, delay: 0.1 },   // E5
            { freq: 784, delay: 0.2 },   // G5
            { freq: 880, delay: 0.3 },   // A5
            { freq: 1047, delay: 0.5 },  // C6
            { freq: 1319, delay: 0.6 },  // E6
            { freq: 1568, delay: 0.7 },  // G6
        ];
        
        melody.forEach(note => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = note.freq;
            
            const gain = this.ctx.createGain();
            const startTime = t + note.delay;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.18 * this.masterVolume, startTime + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.35);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.4);
        });
        
        // Bass boom for emphasis
        setTimeout(() => {
            this.playTone(130, 'sine', 0.4, 0.25);
            this.playTone(262, 'triangle', 0.3, 0.15);
        }, 700);
    }

    playMatchDefeat() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Dramatic defeat sound
        const melody = [
            { freq: 392, delay: 0 },     // G4
            { freq: 330, delay: 0.25 },  // E4
            { freq: 262, delay: 0.5 },   // C4
            { freq: 196, delay: 0.75 },  // G3
        ];
        
        melody.forEach(note => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = note.freq;
            
            const gain = this.ctx.createGain();
            const startTime = t + note.delay;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.18 * this.masterVolume, startTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.6);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.65);
        });
    }

    // ============== ROUND SOUNDS ==============
    
    playRoundStart() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Energetic fight start
        this.playTone(523, 'sine', 0.1, 0.2);
        setTimeout(() => this.playTone(659, 'sine', 0.1, 0.2), 100);
        setTimeout(() => this.playTone(784, 'sine', 0.15, 0.25), 200);
        
        // Punch sound for "FIGHT!"
        setTimeout(() => {
            this.playNoise(0.1, 0.15, 0.01, 0.08, 1000);
            this.playTone(150, 'sawtooth', 0.1, 0.2);
        }, 300);
    }

    playCountdown() {
        this.ensureContext();
        // Tick sound for countdown
        this.playTone(800, 'sine', 0.08, 0.15);
        this.playTone(400, 'triangle', 0.05, 0.08);
    }

    // ============== STATUS EFFECT SOUNDS ==============
    
    playFreeze() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Icy crystallization sound
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2000, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12 * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.3);
        
        // Crackling ice
        this.playNoise(0.25, 0.1, 0.02, 0.2, 4000);
    }

    playBurn() {
        this.ensureContext();
        // Fire crackling
        this.playNoise(0.3, 0.12, 0.01, 0.25, 2500);
        this.playTone(200, 'sawtooth', 0.15, 0.1);
        this.playTone(150, 'square', 0.1, 0.08);
    }

    playShock() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Electric zap
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.setValueAtTime(1200, t + 0.02);
        osc.frequency.setValueAtTime(600, t + 0.04);
        osc.frequency.setValueAtTime(1000, t + 0.06);
        osc.frequency.setValueAtTime(400, t + 0.1);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15 * this.masterVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
        
        // Static noise
        this.playNoise(0.15, 0.1, 0.005, 0.12, 5000);
    }

    // ============== MISC SOUNDS ==============
    
    playGlitch() {
        this.ensureContext();
        // Random noise burst with filter sweep
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(3000, this.ctx.currentTime + 0.1);
        filter.Q.value = 5;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12 * this.masterVolume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playMenuSelect() {
        this.ensureContext();
        this.playTone(600, 'sine', 0.08, 0.12);
        this.playTone(800, 'sine', 0.06, 0.08);
    }

    playMenuHover() {
        this.ensureContext();
        this.playTone(500, 'sine', 0.04, 0.06);
    }

    // KO sound when player is knocked out
    playKO() {
        this.ensureContext();
        const t = this.ctx.currentTime;
        
        // Heavy impact
        this.playTone(50, 'sine', 0.3, 0.35);
        this.playTone(80, 'sawtooth', 0.2, 0.25);
        
        // Dramatic boom
        this.playNoise(0.3, 0.25, 0.01, 0.25, 500);
        
        // Falling tone
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, t + 0.1);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.5);
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2 * this.masterVolume, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t + 0.1);
        osc.stop(t + 0.6);
    }

    // ============== MUSIC SYSTEM ==============
    
    stopMusic() {
        this.isMusicPlaying = false;
        this.currentMusicType = null;
        
        if (this.musicIntervalId) {
            clearInterval(this.musicIntervalId);
            this.musicIntervalId = null;
        }
        
        // Stop and disconnect all music nodes
        this.musicNodes.forEach(node => {
            try {
                if (node.stop) node.stop();
                if (node.disconnect) node.disconnect();
            } catch (e) {}
        });
        this.musicNodes = [];
    }

    // ============== LOBBY MUSIC ==============
    // Chill rock vibe - groovy bass, rhythmic drums, melodic synth
    
    playLobbyMusic() {
        if (this.currentMusicType === 'lobby' && this.isMusicPlaying) return;
        
        this.stopMusic();
        this.ensureContext();
        this.currentMusicType = 'lobby';
        this.isMusicPlaying = true;
        this.bpm = 95; // Chill tempo
        this.beatDuration = 60 / this.bpm;
        
        let beat = 0;
        const barLength = 16; // 16 beats per loop
        
        // Chord progression: Am - F - C - G (classic rock)
        const chords = [
            { root: 220, third: 261.63, fifth: 329.63 },  // Am
            { root: 174.61, third: 220, fifth: 261.63 },  // F
            { root: 261.63, third: 329.63, fifth: 392 },  // C
            { root: 196, third: 246.94, fifth: 293.66 }   // G
        ];
        
        // Bass pattern (root notes, octave down)
        const bassPattern = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0];
        
        // Hi-hat pattern
        const hihatPattern = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        
        // Kick pattern (4 on the floor with variation)
        const kickPattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0];
        
        // Snare pattern
        const snarePattern = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
        
        // Melody pattern (scale degrees)
        const melodyPattern = [0, -1, 2, -1, 4, -1, 2, -1, 0, -1, 4, -1, 5, -1, 4, -1];
        
        const playBeat = () => {
            if (!this.isMusicPlaying) return;
            
            const chordIndex = Math.floor(beat / 4) % 4;
            const chord = chords[chordIndex];
            const t = this.ctx.currentTime;
            
            // Bass
            if (bassPattern[beat % barLength]) {
                this.playMusicNote(chord.root / 2, 'sawtooth', this.beatDuration * 0.8, 0.15);
            }
            
            // Hi-hat
            if (hihatPattern[beat % barLength]) {
                this.playMusicHihat(0.03 + (beat % 2 === 0 ? 0.02 : 0));
            }
            
            // Kick
            if (kickPattern[beat % barLength]) {
                this.playMusicKick();
            }
            
            // Snare
            if (snarePattern[beat % barLength]) {
                this.playMusicSnare();
            }
            
            // Melody (every 2 beats)
            const melodyDegree = melodyPattern[beat % barLength];
            if (melodyDegree !== -1 && beat % 2 === 0) {
                const melodyFreq = this.getScaleFreq(chord.root, melodyDegree);
                this.playMusicNote(melodyFreq * 2, 'triangle', this.beatDuration * 1.5, 0.08);
            }
            
            // Pad chord (every 4 beats)
            if (beat % 4 === 0) {
                this.playMusicPad([chord.root, chord.third, chord.fifth], this.beatDuration * 3.8, 0.04);
            }
            
            beat++;
        };
        
        // Start immediately
        playBeat();
        
        // Continue loop
        this.musicIntervalId = setInterval(playBeat, this.beatDuration * 1000);
    }

    // ============== BATTLE MUSIC ==============
    // Intense, aggressive - fast drums, heavy bass, distorted leads
    
    playBattleMusic() {
        if (this.currentMusicType === 'battle' && this.isMusicPlaying) return;
        
        this.stopMusic();
        this.ensureContext();
        this.currentMusicType = 'battle';
        this.isMusicPlaying = true;
        this.bpm = 150; // Fast and intense
        this.beatDuration = 60 / this.bpm;
        
        let beat = 0;
        const barLength = 16;
        
        // Aggressive chord progression: Em - C - D - B
        const chords = [
            { root: 164.81, third: 196, fifth: 246.94 },     // Em
            { root: 130.81, third: 164.81, fifth: 196 },     // C
            { root: 146.83, third: 185, fifth: 220 },        // D
            { root: 123.47, third: 155.56, fifth: 185 }      // B
        ];
        
        // Intense bass pattern
        const bassPattern = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0];
        
        // Double-time hi-hat
        const hihatPattern = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        
        // Driving kick pattern
        const kickPattern = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1];
        
        // Aggressive snare
        const snarePattern = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
        
        // Crash pattern
        const crashPattern = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        
        // Aggressive lead melody
        const leadPattern = [0, -1, 3, -1, 5, -1, 7, -1, 5, -1, 3, -1, 7, -1, 0, -1];
        
        const playBeat = () => {
            if (!this.isMusicPlaying) return;
            
            const chordIndex = Math.floor(beat / 4) % 4;
            const chord = chords[chordIndex];
            
            // Heavy bass
            if (bassPattern[beat % barLength]) {
                this.playMusicNote(chord.root / 2, 'sawtooth', this.beatDuration * 0.5, 0.2);
                // Add sub bass
                this.playMusicNote(chord.root / 4, 'sine', this.beatDuration * 0.6, 0.12);
            }
            
            // Hi-hat (faster, more aggressive)
            if (hihatPattern[beat % barLength]) {
                this.playMusicHihat(0.04);
            }
            
            // Kick (heavier)
            if (kickPattern[beat % barLength]) {
                this.playMusicKickHeavy();
            }
            
            // Snare
            if (snarePattern[beat % barLength]) {
                this.playMusicSnareHeavy();
            }
            
            // Crash cymbal
            if (crashPattern[beat % barLength] && beat % 16 === 0) {
                this.playMusicCrash();
            }
            
            // Aggressive lead
            const leadDegree = leadPattern[beat % barLength];
            if (leadDegree !== -1) {
                const leadFreq = this.getScaleFreq(chord.root, leadDegree);
                this.playMusicNoteBattle(leadFreq * 2, this.beatDuration * 0.4, 0.1);
            }
            
            // Power chord stabs (every 4 beats)
            if (beat % 4 === 0) {
                this.playPowerChord(chord.root, this.beatDuration * 0.3, 0.08);
            }
            
            // Rising tension (every 8 beats)
            if (beat % 8 === 7) {
                this.playRiser(0.3);
            }
            
            beat++;
        };
        
        playBeat();
        this.musicIntervalId = setInterval(playBeat, this.beatDuration * 1000);
    }

    // ============== MUSIC HELPER METHODS ==============
    
    getScaleFreq(root, degree) {
        // Minor pentatonic scale intervals
        const intervals = [0, 3, 5, 7, 10, 12, 15, 17, 19];
        const semitones = intervals[Math.abs(degree) % intervals.length];
        return root * Math.pow(2, semitones / 12);
    }

    playMusicNote(freq, type, duration, vol) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        
        osc.type = type;
        osc.frequency.value = freq;
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol * this.musicVolume, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + duration);
        
        this.musicNodes.push(osc);
    }

    playMusicNoteBattle(freq, duration, vol) {
        // Distorted lead sound
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const distortion = this.ctx.createWaveShaper();
        const t = this.ctx.currentTime;
        
        osc1.type = 'sawtooth';
        osc1.frequency.value = freq;
        osc2.type = 'square';
        osc2.frequency.value = freq * 1.01; // Slight detune for thickness
        
        // Create distortion curve
        distortion.curve = this.makeDistortionCurve(50);
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol * this.musicVolume, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        
        osc1.connect(distortion);
        osc2.connect(distortion);
        distortion.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + duration);
        osc2.stop(t + duration);
        
        this.musicNodes.push(osc1, osc2);
    }

    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    playMusicPad(freqs, duration, vol) {
        const t = this.ctx.currentTime;
        
        freqs.forEach(freq => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol * this.musicVolume, t + 0.3);
            gain.gain.setValueAtTime(vol * this.musicVolume, t + duration - 0.5);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
            
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + duration);
            
            this.musicNodes.push(osc);
        });
    }

    playPowerChord(root, duration, vol) {
        // Power chord = root + fifth
        const fifth = root * 1.5;
        const t = this.ctx.currentTime;
        
        [root, fifth, root * 2].forEach(freq => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(vol * this.musicVolume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + duration);
            
            this.musicNodes.push(osc);
        });
    }

    playMusicHihat(vol) {
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 7000;
        
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        gain.gain.setValueAtTime(vol * this.musicVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(t);
        
        this.musicNodes.push(noise);
    }

    playMusicKick() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        
        gain.gain.setValueAtTime(0.25 * this.musicVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
        
        this.musicNodes.push(osc);
    }

    playMusicKickHeavy() {
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(80, t);
        osc2.frequency.exponentialRampToValueAtTime(25, t + 0.1);
        
        gain.gain.setValueAtTime(0.35 * this.musicVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc2.start(t);
        osc.stop(t + 0.2);
        osc2.stop(t + 0.2);
        
        this.musicNodes.push(osc, osc2);
    }

    playMusicSnare() {
        const noise = this.ctx.createBufferSource();
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = buffer;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const t = this.ctx.currentTime;
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
        
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        
        gain.gain.setValueAtTime(0.2 * this.musicVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        
        noise.connect(filter);
        filter.connect(gain);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start(t);
        osc.start(t);
        osc.stop(t + 0.15);
        
        this.musicNodes.push(noise, osc);
    }

    playMusicSnareHeavy() {
        const noise = this.ctx.createBufferSource();
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = buffer;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(250, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
        
        gain.gain.setValueAtTime(0.28 * this.musicVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        
        noise.connect(gain);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start(t);
        osc.start(t);
        osc.stop(t + 0.2);
        
        this.musicNodes.push(noise, osc);
    }

    playMusicCrash() {
        const noise = this.ctx.createBufferSource();
        const bufferSize = this.ctx.sampleRate * 0.8;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = buffer;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;
        
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;
        gain.gain.setValueAtTime(0.15 * this.musicVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(t);
        
        this.musicNodes.push(noise);
    }

    playRiser(duration) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const t = this.ctx.currentTime;
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + duration);
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, t);
        filter.frequency.exponentialRampToValueAtTime(4000, t + duration);
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08 * this.musicVolume, t + duration * 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + duration);
        
        this.musicNodes.push(osc);
    }

    // Volume control
    setMusicVolume(vol) {
        this.musicVolume = Math.max(0, Math.min(1, vol));
    }

    toggleMusic() {
        if (this.isMusicPlaying) {
            this.stopMusic();
        } else if (this.currentMusicType === 'lobby') {
            this.playLobbyMusic();
        } else if (this.currentMusicType === 'battle') {
            this.playBattleMusic();
        }
    }
}