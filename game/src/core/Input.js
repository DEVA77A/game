export class Input {
    constructor(targetElement = window) {
        this.keys = {};
        this.prevKeys = {};

        // Touch state (for mobile)
        this.touchMoveId = null;
        this.touchMoveStartX = 0;
        this.touchMoveStartY = 0;
        this.touchActionId = null;
        this.lastActionTapAt = 0;
        
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Touch support (attach to canvas so menus/buttons still work)
        if (targetElement && targetElement !== window && targetElement.addEventListener) {
            const opts = { passive: false };
            targetElement.addEventListener('touchstart', (e) => this.onTouchStart(e, targetElement), opts);
            targetElement.addEventListener('touchmove', (e) => this.onTouchMove(e, targetElement), opts);
            targetElement.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
            targetElement.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opts);
        }
    }

    setKey(code, isDown) {
        this.keys[code] = !!isDown;
    }

    onTouchStart(e, el) {
        // Prevent browser scroll/zoom while playing
        e.preventDefault();

        const rect = el.getBoundingClientRect();
        for (const t of Array.from(e.changedTouches)) {
            const x = t.clientX - rect.left;
            const y = t.clientY - rect.top;
            const isLeftSide = x < rect.width * 0.45;

            // First touch on left side becomes movement/block
            if (isLeftSide && this.touchMoveId === null) {
                this.touchMoveId = t.identifier;
                this.touchMoveStartX = x;
                this.touchMoveStartY = y;
                continue;
            }

            // First touch on right side becomes actions
            if (!isLeftSide && this.touchActionId === null) {
                this.touchActionId = t.identifier;

                // Simple action mapping by vertical zone
                // Top: Jump, Middle: Punch, Bottom: Kick
                const ny = y / Math.max(1, rect.height);
                if (ny < 0.33) this.setKey('Space', true);
                else if (ny < 0.66) this.setKey('KeyJ', true);
                else this.setKey('KeyK', true);
                continue;
            }
        }
    }

    onTouchMove(e, el) {
        e.preventDefault();

        const rect = el.getBoundingClientRect();
        for (const t of Array.from(e.changedTouches)) {
            if (t.identifier !== this.touchMoveId) continue;

            const x = t.clientX - rect.left;
            const y = t.clientY - rect.top;
            const dx = x - this.touchMoveStartX;
            const ny = y / Math.max(1, rect.height);

            // Horizontal drag controls movement
            const threshold = Math.max(18, rect.width * 0.04);
            this.setKey('KeyA', dx < -threshold);
            this.setKey('KeyD', dx > threshold);

            // Bottom-left hold blocks
            this.setKey('KeyS', ny > 0.72 && Math.abs(dx) < threshold);
        }
    }

    onTouchEnd(e) {
        e.preventDefault();

        for (const t of Array.from(e.changedTouches)) {
            if (t.identifier === this.touchMoveId) {
                this.touchMoveId = null;
                this.setKey('KeyA', false);
                this.setKey('KeyD', false);
                this.setKey('KeyS', false);
            }

            if (t.identifier === this.touchActionId) {
                this.touchActionId = null;
                // Release all action keys triggered by touch
                this.setKey('Space', false);
                this.setKey('KeyJ', false);
                this.setKey('KeyK', false);
            }
        }
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
