# Achievement progression

The catalogue and tracking logic live in `achievements.js`.

Order: Bronze, Silver, Gold, Osmium, Morganite. Morganite uses the supplied
`Pink_*.svg` files. Numbered tracks have five ranks per material; star tracks
have one star per material. Existing unlock IDs, timestamps and requirements
through Gold remain unchanged.

## Numbered tracks

Ten milestones are appended after the existing Gold V target. Relative to
that target, Osmium I-V use 1.3, 1.7, 2.2, 2.8 and 3.5 times; Morganite I-V
use 4.5, 5.5, 7, 8.5 and 10 times. Targets round upwards to the next 25,
or the next 100 when the old Gold V target is at least 1,000.

For example, correct guesses extend from Gold V at 750 to Osmium at
975 / 1,275 / 1,650 / 2,100 / 2,625 and Morganite at
3,375 / 4,125 / 5,250 / 6,375 / 7,500.

## Additional stars

| Track | Osmium | Morganite |
| --- | --- | --- |
| 1 to 10 specialist | 250 correct guesses | 750 correct guesses |
| 1 to 100 specialist | 50 correct guesses | 150 correct guesses |
| Colours specialist | 150 correct guesses | 450 correct guesses |
| Word Search sizes / Sudoku difficulties | 25 completions of each | 50 completions of each |
| Beat Jaylin (Word Search / Sudoku) | 10 Hard wins | 50 Hard wins |
| Battleship fleet remaining | 5 wins with all ships afloat | 20 wins with all ships afloat |
| Connect 4 winning directions | 5 wins per direction | 20 wins per direction |
| Tic-Tac-Toe winning lines, per opponent mode | 3 wins per board line | 10 wins per board line |
| RPS every choice, per opponent mode | 25 wins per choice | 75 wins per choice |

Repeated fleet/line/direction counters begin with this release; previous
boolean collection flags cannot reconstruct historical counts. Existing
match event IDs prevent replayed results from awarding progress twice.
Existing numerical totals count towards the other new targets.

The coin is stored at `assets/currency/Coin.svg`. No balances, rewards or
purchases have been implemented. The SVG has transparent corners around
the circular coin.
