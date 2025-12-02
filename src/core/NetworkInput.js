export class NetworkInput {
    constructor() {
        this.keys = {};
        this.justPressed = {};
    }

    // Called when receiving data from socket
    updateState(state) {
        // state is { keys: {}, justPressed: {} }
        this.keys = state.keys || {};
        this.justPressed = state.justPressed || {};
    }

    isDown(code) {
        return !!this.keys[code];
    }

    isJustPressed(code) {
        const pressed = !!this.justPressed[code];
        // Auto-clear justPressed after reading (simulating frame consumption)
        // In a real network scenario, we might want to clear this at the end of the frame
        // But since we receive a snapshot, we can just return the snapshot value.
        return pressed;
    }

    // Helper to clear justPressed at end of frame if needed, 
    // but for network relay, we rely on the sender's state.
    update() {} 
}
