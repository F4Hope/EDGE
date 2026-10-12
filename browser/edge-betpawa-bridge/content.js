(() => {
  const STATE_KEY = "__edge_betpawa_bridge_state_v1";
  const OVERLAY_ID = "__edge_betpawa_bridge_overlay";
  const MAX_WAIT_MS = 12000;

  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const decodePayload = (encoded) => {
    const padded = encoded.replaceAll("-", "+").replaceAll("_", "/") +
      "=".repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  const currentState = () => {
    try {
      return JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
    } catch {
      return null;
    }
  };

  const saveState = (state) => {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  };

  const clearState = () => {
    sessionStorage.removeItem(STATE_KEY);
  };

  const renderOverlay = (state, message) => {
    let root = document.getElementById(OVERLAY_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = OVERLAY_ID;
      Object.assign(root.style, {
        position: "fixed",
        top: "12px",
        right: "12px",
        zIndex: "2147483647",
        width: "min(360px, calc(100vw - 24px))",
        background: "#0b1220",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: "14px",
        boxShadow: "0 12px 36px rgba(0,0,0,.4)",
        padding: "14px",
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        lineHeight: "1.4",
      });
      document.documentElement.appendChild(root);
    }

    const total = state?.ticket?.legs?.length ?? 0;
    const index = Math.min(state?.index ?? 0, total);
    const selected = state?.selected?.length ?? 0;
    const unmatched = state?.unmatched?.length ?? 0;

    root.innerHTML = `
      <div style="font-weight:800;letter-spacing:.08em;font-size:11px;opacity:.72">EDGE → BETPAWA CAMEROON</div>
      <div style="font-weight:800;font-size:15px;margin-top:4px">${message}</div>
      <div style="margin-top:8px;opacity:.82">Progress ${index}/${total} · selected ${selected} · unmatched ${unmatched}</div>
      <button id="__edge_bridge_stop" style="margin-top:10px;border:0;border-radius:999px;padding:8px 12px;font-weight:700;cursor:pointer">STOP BRIDGE</button>
    `;

    root.querySelector("#__edge_bridge_stop")?.addEventListener("click", () => {
      clearState();
      root.remove();
    });
  };

  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" &&
      style.display !== "none" &&
      rect.width > 0 &&
      rect.height > 0;
  };

  const participantParts = (matchup) =>
    String(matchup)
      .split(/\s+vs\s+/i)
      .map(normalize)
      .filter(Boolean);

  const scoreEventAnchor = (anchor, leg) => {
    const text = normalize(anchor.textContent);
    const participants = participantParts(leg.matchup);
    if (!text || participants.length < 2) return 0;

    let score = 0;
    for (const participant of participants) {
      const tokens = participant.split(" ").filter((token) => token.length >= 3);
      if (text.includes(participant)) score += 8;
      else score += Math.min(5, tokens.filter((token) => text.includes(token)).length);
    }
    return score;
  };

  const findEventAnchor = (leg) => {
    const anchors = [...document.querySelectorAll('a[href*="/event/"]')].filter(visible);
    return anchors
      .map((anchor) => ({ anchor, score: scoreEventAnchor(anchor, leg) }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
  };

  const selectionAliases = (leg) => {
    const aliases = new Set([
      normalize(leg.selectionName),
      normalize(leg.selectionKey),
    ]);
    const participants = participantParts(leg.matchup);

    if (leg.marketKey === "h2h") {
      if (leg.selectionKey === "home" && participants[0]) aliases.add(participants[0]);
      if (leg.selectionKey === "away" && participants[1]) aliases.add(participants[1]);
      if (leg.selectionKey === "draw") {
        aliases.add("draw");
        aliases.add("x");
      }
    }

    if (leg.marketKey === "double_chance") {
      if (["home/draw", "1x"].includes(String(leg.selectionKey).toLowerCase())) {
        aliases.add("1x");
        aliases.add("home draw");
      }
      if (["draw/away", "x2"].includes(String(leg.selectionKey).toLowerCase())) {
        aliases.add("x2");
        aliases.add("draw away");
      }
      if (["home/away", "12"].includes(String(leg.selectionKey).toLowerCase())) {
        aliases.add("12");
        aliases.add("home away");
      }
    }

    if (leg.point !== null && Number.isFinite(Number(leg.point))) {
      aliases.add(normalize(`${leg.selectionName} ${leg.point}`));
    }

    return [...aliases].filter(Boolean);
  };

  const clickableCandidates = () => [
    ...document.querySelectorAll(
      'button, [role="button"], .event-bet, [data-test-id], [class*="event-bet"]',
    ),
  ].filter(visible);

  const findSelectionElement = (leg) => {
    const aliases = selectionAliases(leg);
    const candidates = clickableCandidates();

    let best = null;
    let bestScore = 0;
    for (const element of candidates) {
      const text = normalize(element.textContent);
      if (!text) continue;

      let score = 0;
      for (const alias of aliases) {
        if (text === alias) score = Math.max(score, 20);
        else if (alias.length >= 2 && text.includes(alias)) {
          score = Math.max(score, 10 + Math.min(alias.length, 8));
        }
      }

      if (leg.marketKey === "totals" && /over|under/.test(text)) score += 2;
      if (leg.marketKey === "spreads" && /handicap|spread|[+-]\d/.test(text)) score += 2;
      if (leg.marketKey === "double_chance" && /1x|x2|12/.test(text)) score += 2;

      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    if (bestScore >= 10) return best;

    if (leg.marketKey === "h2h") {
      const h2h = [...document.querySelectorAll(".event-bet")].filter(visible);
      const key = String(leg.selectionKey).toLowerCase();
      if (h2h.length >= 3) {
        if (key === "home") return h2h[0];
        if (key === "draw") return h2h[1];
        if (key === "away") return h2h[2];
      }
    }

    return null;
  };

  const waitFor = async (finder, timeout = MAX_WAIT_MS) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = finder();
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    return null;
  };

  const nextLeg = (state, outcome, reason) => {
    const leg = state.ticket.legs[state.index];
    if (outcome === "selected") {
      state.selected.push(leg.matchup + " · " + leg.selectionName);
    } else {
      state.unmatched.push({
        matchup: leg.matchup,
        selectionName: leg.selectionName,
        reason,
      });
    }
    state.index += 1;
    state.phase = "search";
    state.attempt = 0;
    saveState(state);
    window.location.assign(
      "https://www.betpawa.cm/search?searchQuery=" +
        encodeURIComponent(participantParts(state.ticket.legs[state.index]?.matchup ?? "")[0] ?? ""),
    );
  };

  const finish = (state) => {
    state.phase = "complete";
    saveState(state);
    renderOverlay(
      state,
      state.unmatched.length === 0
        ? "Betslip loaded. Use BetPawa’s Booking code control."
        : "Finished with unmatched selections.",
    );

    const bookingCodeControl = clickableCandidates().find((element) =>
      normalize(element.textContent).includes("booking code"),
    );
    if (bookingCodeControl instanceof HTMLElement) {
      bookingCodeControl.style.outline = "4px solid #f5c542";
      bookingCodeControl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const run = async () => {
    const incoming = window.location.hash.match(/(?:^#|&)edgeTicket=([^&]+)/)?.[1];
    if (incoming) {
      try {
        const ticket = decodePayload(incoming);
        if (!ticket || ticket.version !== 1 || !Array.isArray(ticket.legs) || ticket.legs.length < 2) {
          throw new Error("Invalid EDGE ticket");
        }
        saveState({
          ticket,
          index: 0,
          phase: "search",
          selected: [],
          unmatched: [],
          attempt: 0,
        });
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        return;
      }
    }

    const state = currentState();
    if (!state?.ticket?.legs?.length) return;
    if (state.phase === "complete") {
      finish(state);
      return;
    }
    if (state.index >= state.ticket.legs.length) {
      finish(state);
      return;
    }

    const leg = state.ticket.legs[state.index];
    renderOverlay(state, "Loading " + leg.matchup);

    if (state.phase === "search") {
      if (!window.location.pathname.startsWith("/search")) {
        window.location.assign(
          "https://www.betpawa.cm/search?searchQuery=" +
            encodeURIComponent(participantParts(leg.matchup)[0] ?? leg.matchup),
        );
        return;
      }

      const match = await waitFor(() => {
        const candidate = findEventAnchor(leg);
        return candidate && candidate.score >= 6 ? candidate.anchor : null;
      });

      if (!match) {
        nextLeg(state, "unmatched", "Event not found in BetPawa search.");
        return;
      }

      state.phase = "event";
      saveState(state);
      window.location.assign(match.href);
      return;
    }

    if (state.phase === "event") {
      if (!window.location.pathname.startsWith("/event/")) {
        state.phase = "search";
        saveState(state);
        window.location.assign(
          "https://www.betpawa.cm/search?searchQuery=" +
            encodeURIComponent(participantParts(leg.matchup)[0] ?? leg.matchup),
        );
        return;
      }

      const selection = await waitFor(() => findSelectionElement(leg));
      if (!selection) {
        nextLeg(state, "unmatched", "Market selection not found on BetPawa event page.");
        return;
      }

      selection.scrollIntoView({ behavior: "smooth", block: "center" });
      selection.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      nextLeg(state, "selected");
    }
  };

  void run();
})();
