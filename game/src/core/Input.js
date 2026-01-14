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
        
        // Track active touches for multi-touch
        this.activeTouches = new Map();
        
        // Check if mobile controls are available
        this.hasMobileControls = false;
        
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Touch support (attach to canvas so menus/buttons still work)
        // Only use canvas touch if mobile controls are not available
        if (targetElement && targetElement !== window && targetElement.addEventListener) {
            const opts = { passive: false };
            targetElement.addEventListener('touchstart', (e) => {
                // Skip canvas touch handling if mobile controls are visible
                if (this.hasMobileControls) return;
                this.onTouchStart(e, targetElement);
            }, opts);
            targetElement.addEventListener('touchmove', (e) => {
                if (this.hasMobileControls) return;
                this.onTouchMove(e, targetElement);
            }, opts);
            targetElement.addEventListener('touchend', (e) => {
                if (this.hasMobileControls) return;
                this.onTouchEnd(e);
            }, opts);
            targetElement.addEventListener('touchcancel', (e) => {
                if (this.hasMobileControls) return;
                this.onTouchEnd(e);
            }, opts);
        }
        
        // Set up mobile button controls after DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupMobileControls());
        } else {
            this.setupMobileControls();
        }
    }

    setupMobileControls() {
        // Check if we're on a touch device
        const isTouchDevice = ('ontouchstart' in window) || 
                              (navigator.maxTouchPoints > 0) || 
                              window.matchMedia('(pointer: coarse)').matches;
        
        this.hasMobileControls = isTouchDevice;
        
        // Set up virtual joystick
        this.setupVirtualJoystick();
        
        // Find all mobile control buttons (action buttons + left action buttons)
        const mobileButtons = document.querySelectorAll('.action-btn, .left-action-btn');
        
        mobileButtons.forEach(btn => {
            const keyCode = btn.dataset.key;
            if (!keyCode) return;
            
            // Touch start - press the key
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setKey(keyCode, true);
                btn.classList.add('pressed');
            }, { passive: false });
            
            // Touch end - release the key
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.setKey(keyCode, false);
                btn.classList.remove('pressed');
            }, { passive: false });
            
            // Touch cancel - release the key
            btn.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                this.setKey(keyCode, false);
                btn.classList.remove('pressed');
            }, { passive: false });
            
            // Touch leave (finger moved off button)
            btn.addEventListener('touchmove', (e) => {
                const touch = e.touches[0];
                const rect = btn.getBoundingClientRect();
                const isInside = touch.clientX >= rect.left && 
                                 touch.clientX <= rect.right && 
                                 touch.clientY >= rect.top && 
                                 touch.clientY <= rect.bottom;
                
                if (!isInside) {
                    this.setKey(keyCode, false);
                    btn.classList.remove('pressed');
                }
            }, { passive: false });
            
            // Also support mouse for testing on desktop
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.setKey(keyCode, true);
                btn.classList.add('pressed');
            });
            
            btn.addEventListener('mouseup', (e) => {
                e.preventDefault();
                this.setKey(keyCode, false);
                btn.classList.remove('pressed');
            });
            
            btn.addEventListener('mouseleave', (e) => {
                this.setKey(keyCode, false);
                btn.classList.remove('pressed');
            });
        });
    }
    
    setupVirtualJoystick() {
        const joystickContainer = document.getElementById('joystick-container');
        const joystickStick = document.getElementById('joystick-stick');
        
        if (!joystickContainer || !joystickStick) return;
        
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let currentTouchId = null;
        
        const joystickBase = joystickContainer.querySelector('.joystick-base');
        const baseRadius = 80; // Half of joystick-base width (160px)
        const stickRadius = 40; // Half of joystick-stick width (80px)
        const maxDistance = baseRadius - stickRadius + 20; // Max stick travel distance
        const deadZone = 15; // Minimum movement before registering input
        
        const handleJoystickStart = (clientX, clientY, touchId = null) => {
            isDragging = true;
            currentTouchId = touchId;
            const rect = joystickBase.getBoundingClientRect();
            startX = rect.left + rect.width / 2;
            startY = rect.top + rect.height / 2;
            joystickStick.classList.add('active');
        };
        
        const handleJoystickMove = (clientX, clientY) => {
            if (!isDragging) return;
            
            let dx = clientX - startX;
            let dy = clientY - startY;
            
            // Calculate distance from center
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Clamp to max distance
            if (distance > maxDistance) {
                dx = (dx / distance) * maxDistance;
                dy = (dy / distance) * maxDistance;
            }
            
            // Move the stick visually
            joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
            
            // Set input based on joystick position
            if (distance > deadZone) {
                // Horizontal movement (left/right)
                this.setKey('KeyA', dx < -deadZone);
                this.setKey('KeyD', dx > deadZone);
                
                // Vertical movement - UP = Jump (dy is negative when moving up)
                this.setKey('Space', dy < -deadZone * 1.5);
            } else {
                this.setKey('KeyA', false);
                this.setKey('KeyD', false);
                this.setKey('Space', false);
            }
        };
        
        const handleJoystickEnd = () => {
            isDragging = false;
            currentTouchId = null;
            joystickStick.style.transform = 'translate(0, 0)';
            joystickStick.classList.remove('active');
            
            // Release movement keys
            this.setKey('KeyA', false);
            this.setKey('KeyD', false);
            this.setKey('Space', false);
        };
        
        // Touch events
        joystickContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const touch = e.changedTouches[0];
            handleJoystickStart(touch.clientX, touch.clientY, touch.identifier);
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            for (const touch of e.changedTouches) {
                if (touch.identifier === currentTouchId) {
                    handleJoystickMove(touch.clientX, touch.clientY);
                    break;
                }
            }
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            for (const touch of e.changedTouches) {
                if (touch.identifier === currentTouchId) {
                    handleJoystickEnd();
                    break;
                }
            }
        }, { passive: false });
        
        document.addEventListener('touchcancel', (e) => {
            for (const touch of e.changedTouches) {
                if (touch.identifier === currentTouchId) {
                    handleJoystickEnd();
                    break;
                }
            }
        }, { passive: false });
        
        // Mouse events (for desktop testing)
        joystickContainer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handleJoystickStart(e.clientX, e.clientY);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                handleJoystickMove(e.clientX, e.clientY);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                handleJoystickEnd();
            }
        });
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
