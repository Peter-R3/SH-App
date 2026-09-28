/* Geometry and state transitions are independent of rendering and Firebase. */
const JigsawModel = (() => {
    const sizes = [4, 5, 6, 7, 8];
    function random(seed) {
        let value = seed | 0 || 1;
        return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 4294967296; };
    }
    function create(image, size, seed, id, now) {
        if (!sizes.includes(size)) throw new Error('Invalid puzzle size');
        const rng = random(seed);
        const order = Array.from({ length: size * size }, (_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        return { id, image, size, seed, createdAt: now, elapsed: 0, usedGuide: false,
            pieces: Object.fromEntries(order.map((id, order) => [id, { tray: true, order, revision: 0 }])) };
    }
    function edges(size, seed) {
        const rng = random(seed);
        const horizontal = Array.from({ length: size - 1 }, () => Array.from({ length: size }, () => rng() < .5 ? -1 : 1));
        const vertical = Array.from({ length: size }, () => Array.from({ length: size - 1 }, () => rng() < .5 ? -1 : 1));
        return Array.from({ length: size * size }, (_, i) => {
            const r = Math.floor(i / size), c = i % size;
            return [r ? -horizontal[r - 1][c] : 0, c < size - 1 ? vertical[r][c] : 0, r < size - 1 ? horizontal[r][c] : 0, c ? -vertical[r][c - 1] : 0];
        });
    }
    function outline(sides) {
        let path = 'M0 0';
        const transforms = [(x,y)=>[x,y],(x,y)=>[100-y,x],(x,y)=>[100-x,100-y],(x,y)=>[y,100-x]];
        sides.forEach((sign, side) => {
            const p = (x,y) => transforms[side](x,y).join(' ');
            if (!sign) { path += ` L${p(100,0)}`; return; }
            const y = -sign;
            path += ` L${p(35,0)} C${p(45,0)} ${p(35,18*y)} ${p(50,18*y)} C${p(65,18*y)} ${p(55,0)} ${p(65,0)} L${p(100,0)}`;
        });
        return path + ' Z';
    }
    function drop(state, id, revision, destination, player, now) {
        const piece = state?.pieces?.[id];
        if (!piece || piece.locked || piece.revision !== revision || state.completedAt) return;
        const n = state.size, x = (id % n) / n, y = Math.floor(id / n) / n;
        const locked = !destination.tray && Math.hypot(destination.x - x, destination.y - y) < .28 / n;
        state.pieces[id] = { ...piece, revision: revision + 1, tray: Boolean(destination.tray),
            x: locked ? x : Math.max(0, Math.min(1 - 1/n, Number(destination.x) || 0)),
            y: locked ? y : Math.max(0, Math.min(1 - 1/n, Number(destination.y) || 0)),
            locked, movedAt: now, ...(locked ? { owner: player } : {}) };
        if (Object.values(state.pieces).every(p => p.locked)) state.completedAt = now;
        return state;
    }
    function heartbeat(state, player, active, now) {
        if (!state || state.completedAt) return state;
        const previous = Number(state.tickAt) || now;
        const live = Object.values(state.active || {}).some(time => Number(time) >= previous - 6000);
        if (live) state.elapsed = (Number(state.elapsed) || 0) + Math.min(6000, Math.max(0, now - previous));
        state.tickAt = now;
        state.active ||= {};
        if (active) state.active[player] = now; else delete state.active[player];
        return state;
    }
    function credit(stats, state, mode, player) {
        stats ||= {};
        stats.processed ||= {};
        if (stats.processed[state.id] || state.completedAt <= (stats.floor || 0)) return stats;
        const pieces = Object.values(state.pieces).filter(piece => piece.owner === player).length;
        // Shared completion is earned by contributors, not an absent second profile.
        if (!pieces) return stats;
        stats[mode] ||= {};
        const total = stats[mode][state.size] ||= { completed: 0, pieces: 0 };
        total.completed = (total.completed || 0) + 1;
        total.pieces = (total.pieces || 0) + pieces;
        stats.pictures ||= {}; stats.pictures[state.image] = true;
        stats.difficulties ||= {}; stats.difficulties[state.size] = true;
        total.times ||= {};
        const key = `${state.image}_${state.usedGuide ? 'guided' : 'regular'}`;
        total.times[key] = Math.min(total.times[key] ?? Infinity, state.elapsed);
        stats.processed[state.id] = state.completedAt;
        const keys = Object.keys(stats.processed).sort((a,b) => stats.processed[a] - stats.processed[b]);
        for (const key of keys.slice(0, -256)) { stats.floor = Math.max(stats.floor || 0, stats.processed[key]); delete stats.processed[key]; }
        return stats;
    }
    return { sizes, random, create, edges, outline, drop, heartbeat, credit };
})();
if (typeof module !== 'undefined') module.exports = JigsawModel;
