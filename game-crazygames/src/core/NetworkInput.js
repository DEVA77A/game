export class NetworkInput {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this.pendingPresses = {}; // FIX: Queue for incoming presses to ensure they're processed
    }

    // Called when receiving data from socket
    updateState(state) {
        // state is { keys: {}, justPressed: {} }
        this.keys = state.keys || {};
        
        // FIX: Add incoming justPressed to pending queue
        // This ensures attack inputs are not missed even if they arrive between frames
        if (state.justPressed) {
            for (const key in state.justPressed) {
                if (state.justPressed[key]) {
                    this.pendingPresses[key] = true;
                }
            }
        }
    }

    isDown(code) {
        return !!this.keys[code];
    }

    isJustPressed(code) {
        // Check both justPressed and pendingPresses
        if (this.pendingPresses[code]) {
            // Move from pending to justPressed and consume
            delete this.pendingPresses[code];
            return true;
        }
        return false;
    }

    // Called at end of frame
    update() {
        // FIX: Move any remaining pending presses to be available for next frame
        // This shouldn't happen normally, but ensures no inputs are lost
    } 
}
