import { Entity } from './Entity.js';

export class Echo extends Entity {
    constructor(history, color) {
        // Start at the first recorded position
        const start = history[0] || {x:0, y:0};
        super(start.x, start.y, color);
        
        this.history = history;
        this.playbackIndex = 0;
        this.active = true;
        this.isGhost = true;
        this.invulnerable = 9999; // Ghosts can't be killed easily (or at all)
    }

    update(dt) {
        if (!this.active) return;

        // Replay history
        // We assume history is recorded at 60fps or similar, so we advance one frame per update
        // Or better, use time deltas if history has timestamps.
        // For simplicity, let's assume 1 frame per update if we record every frame.
        
        if (this.playbackIndex >= this.history.length) {
            this.active = false;
            return;
        }

        const frame = this.history[this.playbackIndex];
        this.x = frame.x;
        this.y = frame.y;
        this.state = frame.state;
        this.facing = frame.facing;
        
        // Reconstruct hitbox if attacking
        if (this.state === 'attack_light' || this.state === 'attack_heavy' || this.state === 'special') {
             const type = this.state === 'attack_light' ? 'light' : (this.state === 'special' ? 'special' : 'heavy');
             const reach = type === 'light' ? 40 : (type === 'special' ? 120 : 60);
             const width = type === 'light' ? 40 : (type === 'special' ? 120 : 60);
             
             // Center special, offset others
             let hx = this.x + (this.facing * 30);
             let hy = this.y - width/2;
             
             if (type === 'special') {
                 hx = this.x - 60;
                 hy = this.y - 60;
             }

             this.hitbox = {
                x: hx,
                y: hy,
                w: reach,
                h: width,
                damage: type === 'light' ? 5 : (type === 'special' ? 20 : 15),
                knockback: type === 'light' ? 5 : 15,
                type: type,
                isGhost: true
            };
        } else {
            this.hitbox = null;
        }

        this.playbackIndex++;
    }
}