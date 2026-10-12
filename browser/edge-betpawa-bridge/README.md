# EDGE BetPawa Cameroon Bridge

This Chrome/Edge extension is the browser-side handoff for EDGE Daily and Weekly
Combo tickets.

What it does:
- accepts an EDGE ticket from the `OPEN BETPAWA WITH PICKS` button;
- opens/searches BetPawa Cameroon;
- walks through each EDGE matchup;
- adds the corresponding market selection to the BetPawa betslip when it can
  identify it;
- keeps a visible progress overlay;
- reports unmatched legs instead of silently substituting another market.

What it never does:
- it does not log in for you;
- it does not read or store your BetPawa PIN;
- it does not set a stake;
- it does not click Place Bet;
- it does not place a wager.

After the ticket is loaded, use BetPawa's own Booking code / Share betslip
control to generate the real booking code.

Install once in Chrome/Edge:
1. Download/extract this folder.
2. Open chrome://extensions (or edge://extensions).
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select this `browser/edge-betpawa-bridge` folder.
6. Return to EDGE and click OPEN BETPAWA WITH PICKS.

BetPawa's DOM can change. When that happens, unmatched legs are shown so the
bridge can be updated rather than clicking an uncertain selection.
