# Tambola Host Console – Requirements and Test Notes

Status: **Implemented**. Page: `host.html`. Logic: `js/host-logic.js` (no DOM, unit-tested in `tests/host-logic.test.js`). UI: `js/host-app.js`, `css/host.css`.
It is a separate page; none of the ticket pages or their code were changed.

## Purpose
Help the host run the live game on Teams: call numbers at random without repeats, show the board, and verify claims.

## Layout: one screen, no page scrolling
- The page is exactly as tall as the window. The big number, the controls and the 1–90 board share the left column (the board's 9 rows stretch to use whatever height is left); **Check a claim** and **Prizes** share the right column. Presenter view uses the same full-height layout with the host tools hidden.
- Verified with no page scroll at 1920×1080, 1366×768, 1280×720 and 1024×700, in the idle state, with a numbers-claim result open (verdict, number chips, ticket match, winner field) and with the ticket-ID result open (ticket grid and all nine prizes complete), and in Presenter view.
- Narrow windows (under 980 px wide) or very short ones (under 540 px tall) fall back to a normal scrolling page so nothing is squeezed unreadably.

## Features
| Feature | Behaviour |
|---|---|
| Call next number | Button or **Space/Enter**. Draws uniformly from the numbers not yet called (crypto random). After 90 the button disables. |
| Big display | Current number (huge), its classic nickname (e.g. 22 – Two little ducks, 88 – Two fat ladies, 90 – Top of the shop; about 80 numbers have one), and the last five numbers as chips. |
| Board colours | 1–90 in 9 rows of 10, with a legend. **Current number = green** (glow, slightly larger), **last 5 calls = orange**, **earlier calls = grey**, not called = blank. When a new number is called the previous current number turns orange and the oldest orange one turns grey. |
| Undo last | Takes the last number back; it returns to the pool. |
| Auto-call | Optional, every 5–60 s (default 15). Pauses automatically when you verify a claim. |
| Read aloud | Optional browser speech: "Two and two, 22. Two little ducks". Off by default. |
| Presenter view | Button or **P**. Hides all host tools so the window can be shared on Teams. |
| Copy called numbers | Copies the called list in order. |
| New game | Asks for confirmation, then clears the called numbers and recorded winners. |
| Persistence | The game (called numbers, winners, auto-call seconds, read-aloud) is saved in the browser, so a refresh or accidental close does not lose it. A corrupt or invalid saved game is ignored. |

## Check a claim

### By numbers (default; needs no ticket to be loaded)
1. Choose the pattern (Early Five, Lucky Seven, Top/Middle/Bottom Line, Four Corners, Star / Centre, Full House, Second Full House) and type or paste the numbers the player reads out (any separators: `4 20 34 44 50`, `4, 20, 34…`).
2. **Verify** shows a verdict and every number with the call it was called at (or "not called"):
   - **Valid** – all numbers were called (Early Five: at least 5 of them; Lucky Seven: at least 7). Shows the call number and the number that completed it, and how many calls ago (so a claim typed a few calls late can still be judged fairly).
   - **Not valid** – lists exactly which numbers have not been called.
   - **Wrong count** – e.g. a row needs exactly 5 numbers, Four Corners 4, Star 1, Full House 15, Early Five at least 5, Lucky Seven at least 7.
   - Numbers outside 1–90 are ignored and repeated numbers counted once; both are reported.
3. **Optional ticket lookup:** if the ticket registry is available (saved by the ticket pages in the same browser, or loaded from the "Export registry (JSON)" file), the result also says whose ticket the numbers are ("#0013 — Arjun Nair (ticket 2 of 8)"). For rows, corners and full house the numbers must be exactly that part of the ticket (rows are unique across all tickets, so this normally names one ticket). If nothing matches it says "No ticket in the loaded registry has exactly these numbers. Ask for a snapshot of the ticket." Without a registry it says it only checked that the numbers were called.
4. **Record winner:** shown for a valid claim; the name is prefilled from the ticket lookup (or type it) and saved in the Prizes list.

### By ticket ID (secondary tab)
Type `#0042`, `0042` or `42`; needs the registry. Shows the ticket with called numbers highlighted and the progress and completion call of every pattern, with "Record" / "Replace".

### Definitions (as in the participants' email)
Nine prizes, in the order and wording of the participant email. Early Five - any 5 numbers marked on one ticket. Lucky Seven - any 7. Top / Middle / Bottom Line - all 5 numbers of row 1 / 2 / 3. Four Corners - first and last number of the top row and of the bottom row. Star / Centre - the 3rd of the 5 numbers in row 2. Full House - all 15 numbers. Second Full House - all 15 numbers on a different ticket from the Full House winner (the same person with another ticket is allowed); recording it on the Full House ticket shows a warning instead.

## Tests
- Unit (29): nicknames, no repeats over 90 draws, uniformity, undo, saved-call validation, ticket-ID parsing, pattern numbers, completion calls, Early Five, Lucky Seven, Star, Full House, Second Full House, the nine-prize list, parsing of typed numbers, claim verdicts (valid / not called / wrong count / early five / call positions), a property test that the numbers-based verdict agrees with the full-ticket check on 150 real tickets, ticket lookup by numbers (rows, corners, full house, early five, limit and counts), speech text.
- Browser (done): colour tiers after each call (1 green, 5 orange, the rest grey, correct colours), numbers check with no registry (valid, not called, too few numbers, junk and repeats, empty, Early Five, result hidden when the pattern changes), record winner needs a name, auto-call pauses on verify, ticket-ID tab, numbers check with the registry (row, corners, full house, early five matched to #0013; a made-up row flagged), winner prefilled, plus the earlier caller/undo/refresh/presenter checks.
- Manual before the event: a full rehearsal with the real registry, screen-sharing the Presenter view in Teams, and the Read-aloud voice on the host's PC.

