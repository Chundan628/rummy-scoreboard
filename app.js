(() => {
  const STORAGE_KEY = "rummy-scoreboard-v1";
  const SUITS = ["♠", "♥", "♦", "♣"];
  const COLORS = ["#e8c547", "#e85d4c", "#4ecdc4", "#a78bfa", "#60a5fa", "#f472b6", "#34d399", "#fb923c", "#94a3b8", "#f0abfc"];
  const MAX_PLAYERS = 10;
  const MIN_PLAYERS = 2;

  const uid = () => Math.random().toString(36).slice(2, 10);

  const defaultPlayers = () =>
    Array.from({ length: 7 }, (_, i) => ({
      id: uid(),
      name: i === 0 ? "You" : `Friend ${i}`,
    }));

  const blankState = () => ({
    screen: "setup",
    players: defaultPlayers(),
    rounds: [],
    target: 0,
    draft: {},
    toast: "",
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      const data = JSON.parse(raw);
      if (!Array.isArray(data.players) || data.players.length < MIN_PLAYERS) return blankState();
      return {
        ...blankState(),
        ...data,
        toast: "",
        draft: data.draft && typeof data.draft === "object" ? data.draft : {},
      };
    } catch {
      return blankState();
    }
  }

  let state = loadState();

  function save() {
    const { toast, ...persist } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persist));
  }

  function setState(patch) {
    state = { ...state, ...patch };
    save();
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  function playerName(player, index) {
    const name = (player.name || "").trim();
    return name || `Player ${index + 1}`;
  }

  function totalsFrom(rounds) {
    const sums = Object.fromEntries(state.players.map((p) => [p.id, 0]));
    for (const round of rounds) {
      for (const player of state.players) {
        const value = Number(round.scores[player.id]);
        if (Number.isFinite(value)) sums[player.id] += value;
      }
    }
    return sums;
  }

  function totals() {
    return totalsFrom(state.rounds);
  }

  function standings() {
    const sums = totals();
    const target = Number(state.target) || 0;
    return state.players
      .map((player, index) => {
        const total = sums[player.id];
        return {
          ...player,
          index,
          total,
          name: playerName(player, index),
          out: target > 0 && total >= target,
        };
      })
      .sort((a, b) => {
        if (a.out !== b.out) return a.out ? 1 : -1;
        if (a.total !== b.total) return a.total - b.total;
        return a.index - b.index;
      });
  }

  function parseScore(raw) {
    if (raw === "" || raw == null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }

  function roundComplete(round) {
    return state.players.every((player) => Number.isFinite(Number(round?.scores?.[player.id])));
  }

  function openRoundIndex(rounds = state.rounds) {
    if (!rounds.length) return -1;
    const last = rounds.length - 1;
    return roundComplete(rounds[last]) ? -1 : last;
  }

  function withOpenRound(rounds) {
    const next = rounds.map((round) => ({ ...round, scores: { ...round.scores } }));
    let index = openRoundIndex(next);
    if (index < 0) {
      next.push({ id: uid(), scores: {} });
      index = next.length - 1;
    }
    return { rounds: next, index };
  }

  function addPlayerScore(playerId, raw) {
    const value = parseScore(raw);
    if (value == null) {
      showToast("Type that player's score first.");
      return false;
    }
    const { rounds, index } = withOpenRound(state.rounds);
    const replacing = Number.isFinite(Number(rounds[index].scores[playerId]));
    rounds[index].scores[playerId] = value;
    const draft = { ...state.draft };
    delete draft[playerId];
    const player = state.players.find((p) => p.id === playerId);
    const name = player ? playerName(player, state.players.indexOf(player)) : "Player";
    const finished = roundComplete(rounds[index]);
    setState({
      rounds,
      draft,
      toast: finished
        ? `${name} ${replacing ? "updated to" : "+"} ${value}. Round ${index + 1} complete.`
        : `${name} ${replacing ? "updated to" : "+"} ${value}. Total is now ${totalsFrom(rounds)[playerId]}.`,
    });
    return true;
  }

  function addRound() {
    const { rounds, index } = withOpenRound(state.rounds);
    for (const player of state.players) {
      if (Number.isFinite(Number(rounds[index].scores[player.id]))) continue;
      const value = parseScore(state.draft[player.id]);
      if (value == null) {
        showToast("Enter a score for every player. Use 0 for the winner.");
        return;
      }
      rounds[index].scores[player.id] = value;
    }
    setState({
      rounds,
      draft: {},
      toast: "Round added. Totals updated.",
    });
  }

  function undoRound() {
    if (!state.rounds.length) return;
    setState({
      rounds: state.rounds.slice(0, -1),
      toast: "Last round removed.",
    });
  }

  function showToast(message) {
    state.toast = message;
    render();
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      state.toast = "";
      render();
    }, 2200);
  }

  function copyScoreboard() {
    const ranked = standings();
    const lines = [
      `Rummy scoreboard — ${state.rounds.length} round${state.rounds.length === 1 ? "" : "s"}`,
      ...ranked.map((p, i) => `${i + 1}. ${p.name}  ${p.total}${p.out ? "  OUT" : ""}`),
    ];
    const text = lines.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("Scoreboard copied."),
        () => showToast("Could not copy."),
      );
    } else {
      showToast("Copy is not available here.");
    }
  }

  function renderSetup() {
    const rows = state.players
      .map((player, index) => {
        const color = COLORS[index % COLORS.length];
        const initial = playerName(player, index).slice(0, 1).toUpperCase();
        return `
          <div class="setup-row">
            <div class="avatar" style="background:${color}">${escapeHtml(initial)}</div>
            <input
              type="text"
              data-action="rename"
              data-id="${player.id}"
              maxlength="18"
              value="${escapeHtml(player.name)}"
              placeholder="Player ${index + 1}"
            />
            <button class="icon-btn" data-action="remove-player" data-id="${player.id}" ${state.players.length <= MIN_PLAYERS ? "disabled" : ""} aria-label="Remove player">×</button>
          </div>
        `;
      })
      .join("");

    return `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">♠</div>
          <div>
            <h1>Rummy</h1>
            <p>Scoreboard</p>
          </div>
        </div>
        <div class="suit-row" aria-hidden="true"><span>♠</span><span class="red-suit">♥</span><span class="red-suit">♦</span><span>♣</span></div>
      </header>
      <section class="panel">
        <h2>Players — you + friends</h2>
        <p class="hint">Add names for everyone at the table. You can change these later.</p>
        <div class="setup-list">${rows}</div>
        <div class="target-row">
          <div>
            <label class="hint" for="target">Drop-out score</label>
            <select id="target" data-action="target">
              <option value="0" ${state.target === 0 ? "selected" : ""}>No limit</option>
              <option value="101" ${state.target === 101 ? "selected" : ""}>101 points</option>
              <option value="201" ${state.target === 201 ? "selected" : ""}>201 points</option>
            </select>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-action="add-player" ${state.players.length >= MAX_PLAYERS ? "disabled" : ""}>+ Add player</button>
          <button class="btn btn-primary" data-action="start">Start game</button>
        </div>
      </section>
    `;
  }

  function renderGame() {
    const ranked = standings();
    const sums = totals();
    const leader = ranked.find((p) => !p.out);
    const cards = ranked
      .map((player, place) => {
        const suit = SUITS[player.index % SUITS.length];
        const red = suit === "♥" || suit === "♦" ? "red-suit" : "";
        const pending = parseScore(state.draft[player.id]);
        const open = openRoundIndex();
        const savedThisRound = open >= 0 && Number.isFinite(Number(state.rounds[open].scores[player.id]))
          ? Number(state.rounds[open].scores[player.id])
          : null;
        const projected = pending == null
          ? null
          : savedThisRound == null
            ? player.total + pending
            : player.total - savedThisRound + pending;
        const pendingHtml =
          pending == null
            ? ""
            : `<div class="pending">${savedThisRound == null ? "+" : ""}${pending} → ${projected}</div>`;
        return `
          <article class="player-card ${place === 0 && !player.out ? "winning" : ""} ${player.out ? "out" : ""}" data-player-id="${player.id}">
            <span class="corner tl ${red}">${suit}</span>
            <span class="corner br ${red}">${suit}</span>
            <span class="place">${player.out ? "Out" : place === 0 ? "Lead" : `${place + 1}${["st", "nd", "rd"][place] || "th"}`}</span>
            <div class="pname">${escapeHtml(player.name)}</div>
            <div class="ptotal">${player.total}</div>
            <div class="plabel">total</div>
            ${pendingHtml}
            ${player.out ? `<span class="out-tag">Reached ${state.target}</span>` : ""}
          </article>
        `;
      })
      .join("");

    const openIndex = openRoundIndex();
    const openRound = openIndex >= 0 ? state.rounds[openIndex] : null;
    const rows = state.players
      .map((player, index) => {
        const name = playerName(player, index);
        const current = sums[player.id];
        const saved = openRound && Number.isFinite(Number(openRound.scores[player.id]))
          ? Number(openRound.scores[player.id])
          : null;
        const pending = parseScore(state.draft[player.id]);
        let nextLabel = String(current);
        if (pending != null) {
          const projected = saved == null ? current + pending : current - saved + pending;
          nextLabel = `${current} → ${projected}`;
        } else if (saved != null) {
          nextLabel = `+${saved}`;
        }
        return `
          <div class="round-row ${saved == null ? "" : "saved"}">
            <button class="won-btn" data-action="won" data-id="${player.id}" title="Set 0 — this player won the round">0</button>
            <div class="who">${escapeHtml(name)}</div>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              step="1"
              autocomplete="off"
              enterkeyhint="done"
              data-action="draft"
              data-id="${player.id}"
              value="${state.draft[player.id] ?? ""}"
              placeholder="${saved == null ? "pts" : String(saved)}"
            />
            <button class="add-one" data-action="add-one" data-id="${player.id}" title="Add this player's score">+</button>
            <div class="next">${escapeHtml(nextLabel)}</div>
          </div>
        `;
      })
      .join("");

    const historyHead = `
      <tr>
        <th>Round</th>
        ${state.players.map((p, i) => `<th>${escapeHtml(playerName(p, i))}</th>`).join("")}
      </tr>
    `;
    const historyBody = state.rounds.length
      ? state.rounds
          .map((round, index) => `
            <tr>
              <td>${index + 1}</td>
              ${state.players.map((p) => `<td>${round.scores[p.id] ?? "—"}</td>`).join("")}
            </tr>
          `)
          .join("")
      : `<tr><td colspan="${state.players.length + 1}" class="empty">No rounds yet. Enter this hand’s scores below.</td></tr>`;

    return `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">♥</div>
          <div>
            <h1>Rummy</h1>
            <p>${state.rounds.length} round${state.rounds.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-action="copy">Copy</button>
          <button class="btn btn-ghost" data-action="setup">Players</button>
        </div>
      </header>
      <p class="leader">${leader ? `${escapeHtml(leader.name)} is leading with ${leader.total}` : "Everyone is out."}</p>
      <section class="standings">${cards}</section>
      <section class="panel">
        <h2>This round</h2>
        <p class="hint">Type one person's points and tap + or press Enter. That total updates immediately. Tap 0 for the winner.</p>
        <div class="round-grid">${rows}</div>
        <div class="actions">
          <button class="btn btn-primary" data-action="add-round">Add to scoreboard</button>
          <button class="btn btn-ghost" data-action="undo" ${state.rounds.length ? "" : "disabled"}>Undo last round</button>
          <button class="btn btn-danger" data-action="new-game">New game</button>
        </div>
      </section>
      <section class="panel">
        <h2>Round history</h2>
        <div class="history-wrap">
          <table>
            <thead>${historyHead}</thead>
            <tbody>${historyBody}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function render() {
    const root = document.getElementById("app");
    const toast = state.toast
      ? `<div class="toast show">${escapeHtml(state.toast)}</div>`
      : `<div class="toast"></div>`;
    root.innerHTML = (state.screen === "setup" ? renderSetup() : renderGame()) + toast;

    if (state.toast) {
      window.clearTimeout(render.timer);
      render.timer = window.setTimeout(() => {
        if (!state.toast) return;
        state.toast = "";
        const el = document.querySelector(".toast");
        if (el) el.classList.remove("show");
      }, 2200);
    }
  }

  document.getElementById("app").addEventListener("input", (event) => {
    const el = event.target;
    const action = el.dataset.action;
    if (action === "rename") {
      state.players = state.players.map((p) => (p.id === el.dataset.id ? { ...p, name: el.value } : p));
      save();
      return;
    }
    if (action === "draft") {
      state.draft = { ...state.draft, [el.dataset.id]: el.value };
      save();
      const current = totals()[el.dataset.id] || 0;
      const pending = parseScore(el.value);
      const open = openRoundIndex();
      const saved = open >= 0 && Number.isFinite(Number(state.rounds[open].scores[el.dataset.id]))
        ? Number(state.rounds[open].scores[el.dataset.id])
        : null;
      const projected = pending == null ? current : saved == null ? current + pending : current - saved + pending;
      const next = el.closest(".round-row")?.querySelector(".next");
      if (next) next.textContent = pending == null ? (saved == null ? String(current) : `+${saved}`) : `${current} → ${projected}`;
      const card = document.querySelector(`.player-card[data-player-id="${el.dataset.id}"]`);
      if (card) {
        let chip = card.querySelector(".pending");
        if (pending == null) {
          chip?.remove();
        } else {
          if (!chip) {
            chip = document.createElement("div");
            chip.className = "pending";
            card.appendChild(chip);
          }
          chip.textContent = `${saved == null ? "+" : ""}${pending} → ${projected}`;
        }
      }
    }
  });

  document.getElementById("app").addEventListener("change", (event) => {
    const el = event.target;
    if (el.dataset.action === "target") {
      setState({ target: Number(el.value) || 0 });
    }
  });

  document.getElementById("app").addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "add-player") {
      if (state.players.length >= MAX_PLAYERS) return;
      setState({
        players: [...state.players, { id: uid(), name: `Friend ${state.players.length}` }],
      });
      return;
    }
    if (action === "remove-player") {
      if (state.players.length <= MIN_PLAYERS) return;
      setState({ players: state.players.filter((p) => p.id !== el.dataset.id) });
      return;
    }
    if (action === "start") {
      setState({ screen: "game", draft: {} });
      return;
    }
    if (action === "setup") {
      setState({ screen: "setup" });
      return;
    }
    if (action === "won") {
      addPlayerScore(el.dataset.id, "0");
      return;
    }
    if (action === "add-one") {
      addPlayerScore(el.dataset.id, state.draft[el.dataset.id]);
      return;
    }
    if (action === "add-round") {
      addRound();
      return;
    }
    if (action === "undo") {
      undoRound();
      return;
    }
    if (action === "copy") {
      copyScoreboard();
      return;
    }
    if (action === "new-game") {
      if (!state.rounds.length || window.confirm("Clear all rounds and start a new game with the same players?")) {
        setState({ rounds: [], draft: {}, toast: "New game started." });
      }
    }
  });

  document.getElementById("app").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const el = event.target;
    if (el.dataset.action !== "draft") return;
    event.preventDefault();
    const inputs = [...document.querySelectorAll('input[data-action="draft"]')];
    const index = inputs.indexOf(el);
    const added = addPlayerScore(el.dataset.id, el.value);
    if (!added) return;
    requestAnimationFrame(() => {
      const nextInputs = [...document.querySelectorAll('input[data-action="draft"]')];
      const next = nextInputs[index + 1] || nextInputs[0];
      next?.focus();
    });
  });

  render();
})();
