import { Game } from './core/Game.js?v=13';

window.onload = () => {
    console.log('=== GAME STARTING ===');
    console.log('Socket.IO available?', typeof io !== 'undefined');
    if (typeof io !== 'undefined') {
        console.log('Socket.IO version:', io.version);
    } else {
        console.error('Socket.IO NOT LOADED!');
    }
    const game = new Game();
    // Expose game instance globally for Renderer access
    window.game = game;
    console.log('Combat to Death Initialized');
};