// Deterministic course randomness is separate from cosmetic particles.
function createCourse(seed, level, cfg) {
  let state = ((seed + level * 2654435761) >>> 0) || 1;
  function rand() {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  }
  const groups = [];
  for (let i = 0; i < cfg.groups; i++) {
    const lane = Math.floor(rand() * 3);
    let kind = ['cone', 'barrier', 'oil'][Math.floor(rand() * 3)];
    if (cfg.moving && rand() < .4) kind = rand() < .7 ? 'car' : 'truck';
    const second = cfg.double && rand() < .25 ? (lane + 1) % 3 : null;
    const bonus = i % 3 === 1 ? 'star' : i % 8 === 5 ? 'shield' : i % 8 === 7 ? 'slow' : null;
    groups.push({id: i, lane, kind, second, bonus, bonusLane: (lane + 2) % 3,
                 balloon: i % 2 === 0, balloonLane: (lane + 1) % 3,
                 spawn: 1 + i * cfg.interval});
  }
  return groups;
}
