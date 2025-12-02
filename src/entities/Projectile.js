export class Projectile {
    constructor(x, y, facing, owner) {
        this.x = x;
        this.y = y;
        this.facing = facing;
        this.owner = owner; // 'p1' or 'p2' to avoid self-hit
        this.vx = facing * 800; // Fast speed
        this.vy = 0;
        this.width = 60;
        this.height = 40;
        this.color = owner.color;
        this.damage = 25;
        this.active = true;
        this.life = 2.0; // 2 seconds max life
        
        // Visual trail
        this.trail = [];
    }

    update(dt) {
        this.x += this.vx * dt;
        this.life -= dt;
        
        if (this.life <= 0) {
            this.active = false;
        }

        // Add trail point
        this.trail.push({x: this.x, y: this.y, alpha: 1.0});
        if (this.trail.length > 10) this.trail.shift();
        
        // Fade trail
        this.trail.forEach(t => t.alpha -= dt * 2);
    }

    getHitbox() {
        return {
            x: this.x - this.width/2,
            y: this.y - this.height/2,
            w: this.width,
            h: this.height,
            damage: this.damage,
            knockback: 400,
            type: 'special_projectile'
        };
    }
}
