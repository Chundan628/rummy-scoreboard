(() => {
  const STORAGE_KEY = "rummy-scoreboard-v1";
  const SUITS = ["♠", "♥", "♦", "♣"];
  const COLORS = ["#e8c547", "#e85d4c", "#4ecdc4", "#a78bfa", "#60a5fa", "#f472b6", "#34d399", "#fb923c", "#94a3b8", "#f0abfc"];
  const MAX_PLAYERS = 10;
  const MIN_PLAYERS = 2;
  const TARGETS = [
    [0, "None"],
    [320, "320"],
    [520, "520"],
    [720, "720"],
  ];

  const uid = () => Math.random().toString(36).slice(2, 10);

  const defaultPlayers = () =>
    Array.from({ length: 7 }, (_, i) => ({
      id: uid(),
      name: i === 0 ? "You" : `Friend ${i}`,
    }));

  const blankState = () => ({
    screen: "home",
    started: false,
    players: defaultPlayers(),
    rounds: [],
    target: 0,
    draft: {},
    toast: "",
    resultOpen: false,
    resultShownFor: "",
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
        started: Boolean(data.started || data.screen === "game" || (Array.isArray(data.rounds) && data.rounds.length)),
        screen: (data.started || (Array.isArray(data.rounds) && data.rounds.length))
          ? (data.screen || "game")
          : "home",
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

  function renderTargetChips(compact = false) {
    return `
      <div class="chips ${compact ? "compact" : ""}">
        ${TARGETS.map(([value, label]) => `
          <button type="button" class="chip ${Number(state.target) === value ? "active" : ""}" data-action="target" data-value="${value}">${label}</button>
        `).join("")}
      </div>
    `;
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

  function standingsFrom(rounds) {
    const sums = totalsFrom(rounds);
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

  function standings() {
    return standingsFrom(state.rounds);
  }

  function outKeyFrom(rounds) {
    return standingsFrom(rounds)
      .filter((player) => player.out)
      .map((player) => player.id)
      .sort()
      .join(",");
  }

  function gameResultFrom(rounds) {
    const ranked = standingsFrom(rounds);
    const losers = ranked.filter((player) => player.out).sort((a, b) => b.total - a.total);
    if (!losers.length) return null;
    const safe = ranked.filter((player) => !player.out);
    const winner = safe[0] || [...ranked].sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      return a.index - b.index;
    })[0];
    return {
      winner,
      losers: losers.filter((player) => player.id !== winner.id),
      safe: safe.filter((player) => player.id !== winner.id),
      allOut: safe.length === 0,
    };
  }

  function withResult(rounds, extra = {}) {
    const key = outKeyFrom(rounds);
    const opened = Boolean(key) && key !== state.resultShownFor;
    return {
      rounds,
      resultShownFor: key,
      resultOpen: opened ? true : key ? state.resultOpen : false,
      ...extra,
    };
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
    const over = Number(state.target) > 0 && totalsFrom(rounds)[playerId] >= Number(state.target);
    setState(withResult(rounds, {
      draft,
      toast: over
        ? `${name} reached ${state.target}.`
        : finished
          ? `${name} ${replacing ? "updated to" : "+"} ${value}. Round ${index + 1} complete.`
          : `${name} ${replacing ? "updated to" : "+"} ${value}. Total is now ${totalsFrom(rounds)[playerId]}.`,
    }));
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
    setState(withResult(rounds, {
      draft: {},
      toast: "Round added. Totals updated.",
    }));
  }

  function undoRound() {
    if (!state.rounds.length) return;
    const rounds = state.rounds.slice(0, -1);
    setState(withResult(rounds, { toast: "Last round removed." }));
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

  function scoreValue(round, playerId) {
    const raw = round?.scores?.[playerId];
    if (raw === "" || raw == null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function copyScoreboard() {
    const ranked = standings();
    const lines = [
      `Rummy scoreboard — ${state.rounds.length} round${state.rounds.length === 1 ? "" : "s"}`,
      ...ranked.map((p, i) => `${i + 1}. ${p.name}  ${p.total}${p.out ? "  OUT" : ""}`),
      "",
      "Each player's scores",
    ];
    state.players.forEach((player, playerIndex) => {
      const scores = state.rounds.map((round) => {
        const value = scoreValue(round, player.id);
        return value == null ? "—" : String(value);
      });
      lines.push(`${playerName(player, playerIndex)}: ${scores.join(", ")}`);
    });
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

  function renderHome() {
    const inProgress = Boolean(state.started || state.rounds.length);
    return `
      <header class="home-hero">
        <div class="brand-mark home-mark">♠</div>
        <p class="home-kicker">Table scoreboard</p>
        <h1>Rummy</h1>
        <p class="home-sub">Keep score with your friends. Type each hand, and each person's total adds up by itself.</p>
      </header>
      <section class="panel">
        <h2>How it works</h2>
        <ol class="basics">
          <li><strong>Add players</strong> — put in everyone's name. You can add or remove people anytime.</li>
          <li><strong>Pick a drop-out</strong> — 320, 520, or 720. First person to reach it loses.</li>
          <li><strong>Enter each score</strong> — after a hand, type that person's points and tap +. Only their total goes up.</li>
          <li><strong>Check history</strong> — every individual score stays listed under that person's name.</li>
        </ol>
      </section>
      <section class="panel">
        <h2>Scoring basics</h2>
        <ul class="basics-list">
          <li>Winner of the hand gets <strong>0</strong>.</li>
          <li>Everyone else gets the points from that hand.</li>
          <li>Lowest total is leading.</li>
          <li>When someone hits the drop-out, the lowest remaining score wins.</li>
        </ul>
      </section>
      <div class="actions home-actions">
        <button class="btn btn-primary" data-action="goto-setup">${inProgress ? "Edit players" : "Set up players"}</button>
        ${inProgress ? `<button class="btn btn-ghost" data-action="start">Continue game</button>` : ""}
        ${inProgress ? `<button class="btn btn-danger" data-action="home-new">New game</button>` : ""}
      </div>
    `;
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
      <button type="button" class="back-btn" data-action="${state.started ? "start" : "home"}">${state.started ? "← Back to scoreboard" : "← Home"}</button>
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">♠</div>
          <div>
            <h1>Rummy</h1>
            <p>Players &amp; drop-out</p>
          </div>
        </div>
        <div class="suit-row" aria-hidden="true"><span>♠</span><span class="red-suit">♥</span><span class="red-suit">♦</span><span>♣</span></div>
      </header>
      <section class="panel">
        <h2>Players — ${state.players.length} at the table</h2>
        <p class="hint">Add or remove people and edit names. Scores for the same names stay saved.</p>
        <div class="setup-list">${rows}</div>
        <div class="actions">
          <button class="btn btn-ghost" data-action="add-player" ${state.players.length >= MAX_PLAYERS ? "disabled" : ""}>+ Add player</button>
        </div>
        <div class="target-row">
          <p class="hint">Drop-out score — first to reach this loses</p>
          ${renderTargetChips()}
        </div>
        <div class="actions">
          <button class="btn btn-primary" data-action="start">${state.started ? "Back to scoreboard" : "Start game"}</button>
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
            ? (player.out ? `<div class="pending">Reached ${state.target}</div>` : "")
            : `<div class="pending">${savedThisRound == null ? "+" : ""}${pending} → ${projected}</div>`;
        return `
          <article class="player-row ${place === 0 && !player.out ? "winning" : ""} ${player.out ? "out" : ""}" data-player-id="${player.id}">
            <span class="suit ${red}">${suit}</span>
            <div>
              <div class="pname">${escapeHtml(player.name)}</div>
              ${pendingHtml}
            </div>
            <div class="ptotal">${player.total}</div>
            <span class="place">${player.out ? "Lost" : place === 0 ? "Lead" : `${place + 1}${["st", "nd", "rd"][place] || "th"}`}</span>
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
            <div class="round-head">
              <div class="who">${escapeHtml(name)}</div>
              <div class="next">${escapeHtml(nextLabel)}</div>
            </div>
            <div class="round-controls">
              <button class="won-btn" data-action="won" data-id="${player.id}" title="Set 0 — this player won the round">0</button>
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
            </div>
          </div>
        `;
      })
      .join("");

    const historyHtml = renderHistory();

    return `
      <button type="button" class="back-btn" data-action="setup">← Back</button>
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
        </div>
      </header>
      ${gameResultFrom(state.rounds) && !state.resultOpen ? `
        <div class="result-banner">
          <span>Someone dropped out</span>
          <button type="button" data-action="show-result">See winner</button>
        </div>
      ` : `<p class="leader">${leader ? `${escapeHtml(leader.name)} is leading · ${leader.total}` : "Everyone is out."}</p>`}
      <section class="panel target-panel">
        <h2>Drop-out ${Number(state.target) ? `· ${state.target}` : "· off"}</h2>
        ${renderTargetChips(true)}
      </section>
      <section class="standings">${cards}</section>
      <section class="panel">
        <h2>This round</h2>
        <p class="hint">Type their points, then tap + . That person's total updates. Tap 0 if they won the hand.</p>
        <div class="round-grid">${rows}</div>
        <div class="actions">
          <button class="btn btn-primary" data-action="add-round">Add to scoreboard</button>
          <button class="btn btn-ghost" data-action="undo" ${state.rounds.length ? "" : "disabled"}>Undo last round</button>
          <button class="btn btn-danger" data-action="new-game">New game</button>
        </div>
      </section>
      ${historyHtml}
    `;
  }

  function renderHistory() {
    if (!state.rounds.length) {
      return `
        <section class="panel">
          <h2>Round history</h2>
          <p class="empty">No scores yet. Each person's individual scores will show here.</p>
        </section>
      `;
    }

    const people = state.players.map((player, playerIndex) => {
      const chips = state.rounds.map((round, index) => {
        const value = scoreValue(round, player.id);
        return `
          <div class="score-chip ${value == null ? "empty" : ""}">
            <span class="score-chip-round">R${index + 1}</span>
            <span class="score-chip-pts">${value == null ? "—" : value}</span>
          </div>
        `;
      }).join("");
      return `
        <article class="history-person">
          <h3>${escapeHtml(playerName(player, playerIndex))}</h3>
          <div class="score-chips">${chips}</div>
        </article>
      `;
    }).join("");

    return `
      <section class="panel">
        <h2>Round history</h2>
        <p class="hint">Each person's scores, one by one — not added together.</p>
        <div class="history-list">${people}</div>
      </section>
    `;
  }

  function renderResult() {
    const result = gameResultFrom(state.rounds);
    if (!state.resultOpen || !result) return "";
    const suits = ["♠", "♥", "♦", "♣", "♠", "♥", "♦", "♣"];
    const burst = suits
      .map((suit, i) => {
        const left = 6 + i * 12;
        const delay = (i * 0.12).toFixed(2);
        const red = suit === "♥" || suit === "♦" ? "red-suit" : "";
        return `<span class="float-suit ${red}" style="left:${left}%; animation-delay:${delay}s">${suit}</span>`;
      })
      .join("");
    const losers = result.losers
      .map((player) => `
        <div class="loser-row">
          <div>
            <div class="name">${escapeHtml(player.name)}</div>
            <div class="pts">${player.total} pts · reached ${state.target}</div>
          </div>
          <span class="stamp">LOST</span>
        </div>
      `)
      .join("");
    const safe = result.safe
      .map((player) => `
        <div class="safe-row">
          <span>${escapeHtml(player.name)}</span>
          <span>${player.total}</span>
        </div>
      `)
      .join("");
    return `
      <div class="result-overlay" role="dialog" aria-label="Game result">
        <div class="burst" aria-hidden="true">${burst}</div>
        <div class="result-sheet">
          <p class="result-kicker">${result.allOut ? "Everyone dropped" : "Drop-out reached"}</p>
          <h2 class="result-title">Game over</h2>
          <article class="winner-card">
            <div class="crown" aria-hidden="true">👑</div>
            <div class="tag">Winner</div>
            <h2>${escapeHtml(result.winner.name)}</h2>
            <p class="score">${result.winner.total} points${result.allOut ? " · lowest score" : ""}</p>
          </article>
          ${result.losers.length ? `<section class="lost-block"><h3>Lost</h3>${losers}</section>` : ""}
          ${result.safe.length ? `<section class="safe-block"><h3>Still under ${state.target}</h3>${safe}</section>` : ""}
          <div class="result-actions">
            <button class="btn btn-primary" data-action="new-game">Play again</button>
            <button class="btn btn-ghost" data-action="close-result">Keep this board</button>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.getElementById("app");
    const toast = state.toast
      ? `<div class="toast show">${escapeHtml(state.toast)}</div>`
      : `<div class="toast"></div>`;
    document.body.classList.toggle("locked", Boolean(state.resultOpen));
    const page = state.screen === "home"
      ? renderHome()
      : state.screen === "setup"
        ? renderSetup()
        : renderGame();
    root.innerHTML = page + renderResult() + toast;

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
      const card = document.querySelector(`.player-row[data-player-id="${el.dataset.id}"]`);
      if (card) {
        const nameBox = card.querySelector(".pname")?.parentElement;
        let chip = card.querySelector(".pending");
        if (pending == null) {
          chip?.remove();
        } else if (nameBox) {
          if (!chip) {
            chip = document.createElement("div");
            chip.className = "pending";
            nameBox.appendChild(chip);
          }
          chip.textContent = `${saved == null ? "+" : ""}${pending} → ${projected}`;
        }
      }
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
    if (action === "target") {
      const target = Number(el.dataset.value) || 0;
      if (target === Number(state.target)) return;
      state = { ...state, target };
      setState(withResult(state.rounds, {
        target,
        toast: target ? `Drop-out is now ${target}.` : "No drop-out limit.",
      }));
      return;
    }
    if (action === "home") {
      setState({ screen: "home", resultOpen: false });
      return;
    }
    if (action === "goto-setup") {
      setState({ screen: "setup" });
      return;
    }
    if (action === "home-new") {
      if (!state.rounds.length || window.confirm("Start a new game? Current scores will be cleared.")) {
        setState({
          screen: "setup",
          started: false,
          rounds: [],
          draft: {},
          resultOpen: false,
          resultShownFor: "",
          toast: "New game. Add names and pick a drop-out.",
        });
      }
      return;
    }
    if (action === "start") {
      setState(withResult(state.rounds, { screen: "game", started: true, draft: {} }));
      return;
    }
    if (action === "show-result") {
      setState({ resultOpen: true });
      return;
    }
    if (action === "close-result") {
      setState({ resultOpen: false });
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
      const fromOverlay = Boolean(state.resultOpen);
      if (fromOverlay || !state.rounds.length || window.confirm("Clear all rounds and start a new game with the same players?")) {
        setState({
          screen: "game",
          rounds: [],
          draft: {},
          resultOpen: false,
          resultShownFor: "",
          toast: "New game started.",
        });
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
