// Character definitions with unique abilities
// Effects ONLY apply when SKILL (special projectile) hits opponent
export const CHARACTERS = {
    ICE: {
        id: 'ice',
        name: 'FROST',
        element: 'ice',
        icon: '❄️',
        color: '#00d4ff',
        colorSecondary: '#0088cc',
        colorGlow: 'rgba(0, 212, 255, 0.6)',
        projectileColor: '#00d4ff',
        // Skill effect: Freeze opponent for 5 seconds (cannot move at all)
        // Complete ice encasement - opponent is FROZEN solid
        skillEffect: {
            type: 'freeze',
            freezeDuration: 5.0,  // Cannot move for 5 seconds - FROZEN SOLID
            slowDuration: 0,      // No slow after - just the freeze
            slowAmount: 0,
            attackSlowAmount: 0
        },
        description: 'Freezes enemies in solid ice for 5 seconds'
    },
    FIRE: {
        id: 'fire',
        name: 'BLAZE',
        element: 'fire',
        icon: '🔥',
        color: '#ff4400',
        colorSecondary: '#ff8800',
        colorGlow: 'rgba(255, 68, 0, 0.6)',
        projectileColor: '#ff4400',
        // Skill effect: Burn opponent for 5 seconds, -5 HP per second = 25 total damage!
        skillEffect: {
            type: 'burn',
            duration: 5.0,
            damagePerSecond: 5  // 5 HP loss per second for 5 seconds = 25 total
        },
        description: 'Burns enemies for 5 HP/sec for 5 seconds'
    },
    LIGHTNING: {
        id: 'lightning',
        name: 'VOLT',
        element: 'lightning',
        icon: '⚡',
        color: '#ffdd00',
        colorSecondary: '#ffff88',
        colorGlow: 'rgba(255, 221, 0, 0.6)',
        projectileColor: '#ffdd00',
        // Skill effect: Slow enemy 70% AND boost own speed 100% for 5 seconds
        skillEffect: {
            type: 'shock',
            duration: 5.0,
            enemySlowAmount: 0.3, // Enemy 70% slower (0.3 = 30% of normal speed)
            selfSpeedBoost: 2.0   // Self 100% faster (2x speed)
        },
        description: 'Shocks enemies -70% speed, self +100% speed'
    }
};


export const CHARACTER_LIST = [CHARACTERS.ICE, CHARACTERS.FIRE, CHARACTERS.LIGHTNING];

export function getRandomCharacter() {
    return CHARACTER_LIST[Math.floor(Math.random() * CHARACTER_LIST.length)];
}

export function getCharacterById(id) {
    return CHARACTER_LIST.find(c => c.id === id) || CHARACTERS.ICE;
}
