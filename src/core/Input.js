export class Input {
    constructor() {
        this.keys = {};
        this.prevKeys = {};
        
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    update() {
        this.prevKeys = { ...this.keys };
    }

    isDown(code) {
        return !!this.keys[code];
    }

    isJustPressed(code) {
        return !!this.keys[code] && !this.prevKeys[code];
    }
}
