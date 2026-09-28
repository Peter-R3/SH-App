# Jigsaw

Solo and co-op, with 16/25/36/49/64 interlocking pieces and 15 supplied 720px pictures.
Pieces do not rotate. Correct drops within 28% of a cell snap and lock; other drops
stay on the board. Dropping into the tray returns a loose piece. Drops outside
both surfaces, interrupted gestures and stale co-op moves restore the saved state.
The picture preview and reference use the unmodified supplied images.

## Persistence

- Solo slots: `jigsaw/solo/{profile}/{picture}_{sideLength}` (75 bounded slots/profile).
- Co-op: `jigsaw/coop/current`; one pending replacement at `jigsaw/coop/request`.
- Stats: `stats/jigsaw/{profile}`; completion credits deduplicated by puzzle ID.
- History: `history/games/jigsaw/{profile}`, capped at seven records.
- Settings are remembered per profile on the device. No image data is in Firebase.

Each drop is a Firebase transaction checking puzzle ID and piece revision.
Concurrent writes to different pieces merge; the first accepted write to the same
revision wins. Completed pieces cannot move. Replacement requires the recipient's
approval and verifies the old puzzle ID. An older request cannot replace a newer grid.

Elapsed time is the union of active play intervals, not the sum of both players'
time. A five-second heartbeat stops accruing when everyone pauses or leaves. A
lost connection can contribute at most six seconds beyond its last heartbeat.
Opening menus stops that player's active contribution. A reference picture is
available during play; the optional faint guide marks the puzzle as guided for
both players' best-time category. Best times are per picture, size, mode and guide.

Completion rewards and piece counts are credited to actual contributors. Pieces
placed is the number personally locked in completed puzzles, not abandoned ones.
Statistics finalization retries on subsequent puzzle state updates/reopening and
cannot double-count a completion. The deduplication ledger is bounded at 256 IDs
with an older-event cutoff. Management changes preserve that ledger.

## Achievements

- Solo completions and Co-op completions: independent 25-tier tracks.
- Pieces placed: 25 tiers, credited on completion.
- Picture collection stars: 1, 3, 5, 10, 15 distinct pictures.
- Difficulty collection stars: 1, 2, 3, 4, 5 distinct piece counts.

The shared tier builder adds Osmium and Morganite milestones to each 15-tier
Bronze/Silver/Gold base. Existing achievement-management controls include Jigsaw;
the dedicated Jigsaw score controls support both profiles, modes, sizes and best
times. No currency is awarded yet.

## Verification

`node --test tests/jigsaw-model.test.cjs` verifies generation, complementary edges,
wrong placements, snapping, stale writes, scoring, timing and image dimensions.
`tests/jigsaw-ui.test.cjs` uses mocked Firebase and real local images to exercise
dragging, persistence, co-op approval, remote locking, completion, integration and
responsive layouts. No production data is modified by either test.
