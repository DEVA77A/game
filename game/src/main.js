import { Game } from './core/Game.js?v=13';

// ==================== CRAZYGAMES SDK WRAPPER ====================
// Safe wrapper for CrazyGames SDK - game continues normally if SDK fails
window.CrazyAds = {
    initialized: false,
    adInProgress: false,
    
    // Initialize SDK safely
    init() {
        try {
            if (typeof CrazyGames !== 'undefined' && CrazyGames.SDK) {
                CrazyGames.SDK.init().then(() => {
                    this.initialized = true;
                    console.log('[CrazyGames] SDK initialized successfully');
                }).catch(err => {
                    console.warn('[CrazyGames] SDK init failed:', err);
                });
            } else {
                console.log('[CrazyGames] SDK not available (local development)');
            }
        } catch (e) {
            console.warn('[CrazyGames] SDK init error:', e);
        }
    },
    
    // Show interstitial ad (midgame) - for round/match end
    showInterstitial(onComplete) {
        if (this.adInProgress) {
            if (onComplete) onComplete();
            return;
        }
        
        if (!this.initialized || typeof CrazyGames === 'undefined') {
            console.log('[CrazyGames] Skipping ad - SDK not ready');
            if (onComplete) onComplete();
            return;
        }
        
        this.adInProgress = true;
        
        // Pause game before ad (including for both players in multiplayer)
        this._pauseForAd();
        
        try {
            CrazyGames.SDK.ad.requestAd('midgame', {
                adStarted: () => {
                    console.log('[CrazyGames] Ad started');
                },
                adFinished: () => {
                    console.log('[CrazyGames] Ad finished');
                    this.adInProgress = false;
                    this._resumeAfterAd();
                    if (onComplete) onComplete();
                },
                adError: (err) => {
                    console.warn('[CrazyGames] Ad error:', err);
                    this.adInProgress = false;
                    this._resumeAfterAd();
                    if (onComplete) onComplete();
                }
            });
        } catch (e) {
            console.warn('[CrazyGames] Ad request failed:', e);
            this.adInProgress = false;
            this._resumeAfterAd();
            if (onComplete) onComplete();
        }
    },
    
    // Show rewarded ad - for optional rewards
    showRewarded(onReward, onSkip) {
        if (this.adInProgress) {
            if (onSkip) onSkip();
            return;
        }
        
        if (!this.initialized || typeof CrazyGames === 'undefined') {
            console.log('[CrazyGames] Skipping rewarded ad - SDK not ready');
            if (onSkip) onSkip();
            return;
        }
        
        this.adInProgress = true;
        
        // Pause game before ad (including for both players in multiplayer)
        this._pauseForAd();
        
        try {
            CrazyGames.SDK.ad.requestAd('rewarded', {
                adStarted: () => {
                    console.log('[CrazyGames] Rewarded ad started');
                },
                adFinished: () => {
                    console.log('[CrazyGames] Rewarded ad finished - granting reward');
                    this.adInProgress = false;
                    this._resumeAfterAd();
                    if (onReward) onReward();
                },
                adError: (err) => {
                    console.warn('[CrazyGames] Rewarded ad error:', err);
                    this.adInProgress = false;
                    this._resumeAfterAd();
                    if (onSkip) onSkip();
                }
            });
        } catch (e) {
            console.warn('[CrazyGames] Rewarded ad request failed:', e);
            this.adInProgress = false;
            this._resumeAfterAd();
            if (onSkip) onSkip();
        }
    },
    
    // Pause game before ad (works for both players in multiplayer)
    _pauseForAd() {
        if (window.game) {
            // Store current state
            window.game._adWasMusicPlaying = window.game.sound && window.game.sound.isMusicPlaying;
            window.game._adPreviousState = window.game.gameState;
            window.game._adWasPaused = window.game.isPaused;
            
            // Stop music
            if (window.game.sound) {
                window.game.sound.stopMusic();
            }
            
            // Pause the game (this also syncs to P2 in multiplayer via socket)
            if (!window.game.isPaused && window.game.gameState !== 'menu' && 
                window.game.gameState !== 'match_over' && window.game.gameState !== 'waiting') {
                window.game.pauseGame();
            }
        }
    },
    
    // Resume game after ad
    _resumeAfterAd() {
        if (window.game) {
            // Resume game if we paused it for the ad
            if (window.game.isPaused && !window.game._adWasPaused) {
                window.game.resumeGame();
            }
            
            // Resume music if it was playing
            if (window.game._adWasMusicPlaying && window.game.sound) {
                const state = window.game.gameState;
                if (state === 'fighting' || state === 'pre_fight' || state === 'round_over') {
                    window.game.sound.playBattleMusic();
                } else if (state === 'menu' || state === 'waiting') {
                    window.game.sound.playLobbyMusic();
                }
            }
            
            // Clear ad state
            window.game._adWasPaused = false;
            window.game._adWasMusicPlaying = false;
            window.game._adPreviousState = null;
        }
    }
};
// ==================== END CRAZYGAMES SDK ====================

window.onload = () => {
    console.log('=== GAME STARTING ===');
    
    // Initialize CrazyGames SDK
    window.CrazyAds.init();
    
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