(() => {
  const STORAGE_KEY = "rummy-scoreboard-v2";
  const SUITS = ["♠", "♥", "♦", "♣"];
  const COLORS = ["#e8c547", "#e85d4c", "#4ecdc4", "#a78bfa", "#60a5fa", "#f472b6", "#34d399", "#fb923c", "#94a3b8", "#f0abfc"];
  const MAX_PLAYERS = 10;
  const MIN_PLAYERS = 2;
  const ROULETTE_MS = 3200;
  const ROULETTE_RANDOM_MS = 4000;
  const TARGETS = [
    [0, "None"],
    [320, "320"],
    [520, "520"],
    [720, "720"],
  ];

  const uid = () => Math.random().toString(36).slice(2, 10);

  const FIXED_ROSTER = [
    { id: "navaneeth", name: "Navaneeth", photo: "photos/navaneeth.jpg", laugh: "photos/navaneeth-laugh.jpg", lose: "photos/navaneeth-lose.jpg", jump3d: "photos/3d/navaneeth-jump.jpg", cry3d: "photos/3d/navaneeth-cry.jpg" },
    { id: "sharan", name: "Sharan", photo: "photos/sharan.jpg", laugh: "photos/sharan-laugh.jpg", lose: "photos/sharan-lose.jpg", jump3d: "photos/3d/sharan-jump.jpg", cry3d: "photos/3d/sharan-cry.jpg" },
    { id: "muthus", name: "Muthus", photo: "photos/muthus.jpg?v=19", laugh: "photos/muthus-laugh.jpg?v=19", lose: "photos/muthus-lose.jpg?v=19", jump3d: "photos/3d/muthus-jump.jpg", cry3d: "photos/3d/muthus-cry.jpg" },
    { id: "sreenath", name: "Sreenath", photo: "photos/sreenath.jpg", laugh: "photos/sreenath-laugh.jpg", lose: "photos/sreenath-lose.jpg", jump3d: "photos/3d/sreenath-jump.jpg", cry3d: "photos/3d/sreenath-cry.jpg" },
    { id: "kiran", name: "Kiran", photo: "photos/kiran.jpg", laugh: "photos/kiran-laugh.jpg", lose: "photos/kiran-lose.jpg", jump3d: "photos/3d/kiran-jump.jpg", cry3d: "photos/3d/kiran-cry.jpg" },
  ];

  const defaultPlayers = () => FIXED_ROSTER.map((person) => ({ ...person }));

  const blankState = () => ({
    screen: "home",
    started: false,
    extras: [],
    selectedIds: FIXED_ROSTER.map((person) => person.id),
    players: defaultPlayers(),
    rounds: [],
    target: 0,
    draft: {},
    toast: "",
    resultOpen: false,
    resultShownFor: "",
    jokerChooserId: null,
    dealAnim: "",
    dealFrom: 0,
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      const data = JSON.parse(raw);
      if (!Array.isArray(data.players) || data.players.length < 1) return blankState();
      const started = Boolean(data.started || data.screen === "game" || (Array.isArray(data.rounds) && data.rounds.length));
      const extras = Array.isArray(data.extras) ? data.extras : [];
      const selectedIds = Array.isArray(data.selectedIds) && data.selectedIds.length
        ? data.selectedIds
        : (data.players || []).map((player) => player.id);
      const players = data.players;
      const savedJoker = players.some((player) => player.id === data.jokerChooserId)
        ? data.jokerChooserId
        : null;
      return {
        ...blankState(),
        ...data,
        toast: "",
        extras,
        selectedIds,
        started,
        screen: started ? (data.screen || "game") : "home",
        jokerChooserId: savedJoker || (started ? players[Math.floor(Math.random() * players.length)].id : null),
        draft: data.draft && typeof data.draft === "object" ? data.draft : {},
      };
    } catch {
      return blankState();
    }
  }

  let state = loadState();

  function save() {
    const { toast, dealAnim, dealFrom, ...persist } = state;
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

  function rosterAll() {
    return [...FIXED_ROSTER, ...(state.extras || [])];
  }

  function faceHtml(person, kind, className) {
    const art = FIXED_ROSTER.find((item) => item.id === person.id) || person;
    const src = (kind && art[kind]) || art.photo || "";
    if (src) return `<img class="${className || "face"}" src="${src}" alt="${escapeHtml(person.name || art.name || "")}">`;
    const initial = (person.name || "?").slice(0, 1).toUpperCase();
    return `<div class="${className || "face"} face-fallback">${escapeHtml(initial)}</div>`;
  }

  function playersFromSelection(ids) {
    const chosen = ids && ids.length ? ids : FIXED_ROSTER.map((person) => person.id);
    return chosen
      .map((id) => rosterAll().find((person) => person.id === id))
      .filter(Boolean)
      .map((person) => ({ ...person }));
  }

  function pickRandomJoker() {
    return state.players[Math.floor(Math.random() * state.players.length)].id;
  }

  function jokerIndex(chooserId = state.jokerChooserId) {
    const index = state.players.findIndex((player) => player.id === chooserId);
    return index < 0 ? 0 : index;
  }

  function starterIndex(chooserId = state.jokerChooserId) {
    const count = state.players.length;
    return (jokerIndex(chooserId) - 1 + count) % count;
  }

  function dealRoles(chooserId = state.jokerChooserId) {
    const jokerI = jokerIndex(chooserId);
    const startI = starterIndex(chooserId);
    return {
      joker: playerName(state.players[jokerI], jokerI),
      starter: playerName(state.players[startI], startI),
      jokerId: state.players[jokerI].id,
      starterId: state.players[startI].id,
    };
  }

  function withJoker(extra = {}) {
    const list = extra.players || state.players;
    const current = extra.jokerChooserId || state.jokerChooserId;
    const valid = current && list.some((player) => player.id === current);
    if (valid) return { ...extra, jokerChooserId: current };
    const jokerChooserId = list[Math.floor(Math.random() * list.length)].id;
    const prior = state.players;
    state.players = list;
    const roles = dealRoles(jokerChooserId);
    state.players = prior;
    return {
      ...extra,
      jokerChooserId,
      toast: extra.toast || `${roles.joker} chooses the joker. ${roles.starter} starts by picking the open card.`,
    };
  }

  function nextJokerId() {
    const index = (jokerIndex() + 1) % state.players.length;
    return state.players[index].id;
  }

  function prevJokerId() {
    const index = (jokerIndex() - 1 + state.players.length) % state.players.length;
    return state.players[index].id;
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
    const last = rounds[rounds.length - 1];
    const complete = Boolean(last && roundComplete(last));
    const opened = complete && Boolean(key) && key !== state.resultShownFor;
    return {
      rounds,
      resultShownFor: complete ? key : state.resultShownFor,
      resultOpen: opened ? true : complete && key ? state.resultOpen : false,
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
    const gameOver = finished && Boolean(gameResultFrom(rounds));
    const nextDeal = finished && !gameOver ? nextJokerId() : state.jokerChooserId;
    const nextRoles = finished && !gameOver ? dealRoles(nextDeal) : null;
    setState(withResult(rounds, {
      draft,
      jokerChooserId: nextDeal,
      toast: gameOver
        ? ""
        : finished
          ? `Round ${index + 1} done. ${nextRoles.joker} chooses joker. ${nextRoles.starter} starts.`
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
    const gameOver = Boolean(gameResultFrom(rounds));
    const nextDeal = gameOver ? state.jokerChooserId : nextJokerId();
    const nextRoles = gameOver ? null : dealRoles(nextDeal);
    setState(withResult(rounds, {
      draft: {},
      jokerChooserId: nextDeal,
      toast: gameOver ? "" : `Round added. ${nextRoles.joker} chooses joker. ${nextRoles.starter} starts.`,
    }));
  }

  function undoRound() {
    if (!state.rounds.length) return;
    const last = state.rounds[state.rounds.length - 1];
    const wasComplete = roundComplete(last);
    const rounds = state.rounds.slice(0, -1);
    setState(withResult(rounds, {
      jokerChooserId: wasComplete ? prevJokerId() : state.jokerChooserId,
      toast: "Last round removed.",
    }));
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
    const selected = new Set(state.selectedIds || []);
    const people = rosterAll().map((person) => {
      const on = selected.has(person.id);
      const fixed = FIXED_ROSTER.some((item) => item.id === person.id);
      return `
        <label class="pick-card ${on ? "on" : ""}">
          <input type="checkbox" data-action="toggle-player" data-id="${person.id}" ${on ? "checked" : ""}>
          ${faceHtml(person, "photo", "pick-face")}
          <span class="pick-name">${escapeHtml(person.name)}</span>
          ${fixed ? "" : `<button type="button" class="pick-remove" data-action="remove-extra" data-id="${person.id}" aria-label="Remove">×</button>`}
        </label>
      `;
    }).join("");
    return `
      <header class="home-hero">
        <div class="brand-mark home-mark">♠</div>
        <p class="home-kicker">Table scoreboard</p>
        <h1>Rummy</h1>
        <p class="home-sub">The regulars stay here. Tick who is playing this game, then start.</p>
      </header>
      <section class="panel">
        <h2>Who's playing</h2>
        <p class="hint">Navaneeth, Sharan, Muthus, Sreenath and Kiran are always on the list. Add a person only if someone new sits down.</p>
        <div class="pick-grid">${people}</div>
        <div class="add-row">
          <input type="text" data-role="new-name" maxlength="18" placeholder="New player name">
          <button class="btn btn-ghost" data-action="add-extra">Add person</button>
        </div>
        <div class="target-row">
          <p class="hint">Drop-out score</p>
          ${renderTargetChips()}
        </div>
        <div class="actions home-actions">
          <button class="btn btn-primary" data-action="start">${inProgress ? "Continue with this table" : "Start game"}</button>
          ${inProgress ? `<button class="btn btn-danger" data-action="home-new">New game</button>` : ""}
        </div>
      </section>
    `;
  }

  function renderSetup() {
    return renderHome();
  }

  function renderSetupUnused() {
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
      <button type="button" class="back-btn" data-action="${state.started ? "tab-board" : "home"}">${state.started ? "← Back to scoreboard" : "← Home"}</button>
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

  function writeCell(roundIndex, playerId, raw) {
    const value = parseScore(raw);
    const rounds = state.rounds.map((round) => ({ ...round, scores: { ...round.scores } }));
    while (rounds.length <= roundIndex) {
      rounds.push({ id: uid(), scores: {} });
    }
    if (value == null) delete rounds[roundIndex].scores[playerId];
    else rounds[roundIndex].scores[playerId] = value;
    while (rounds.length && Object.keys(rounds[rounds.length - 1].scores).length === 0) {
      rounds.pop();
    }
    state.rounds = rounds;
    save();
  }

  function paintSheetTotals() {
    const sums = totals();
    const ranked = standings();
    state.players.forEach((player) => {
      const cell = document.querySelector(`[data-total="${player.id}"]`);
      if (cell) cell.textContent = String(sums[player.id] || 0);
      document.querySelectorAll(`[data-col="${player.id}"]`).forEach((node) => {
        node.classList.toggle("out", ranked.some((row) => row.id === player.id && row.out));
        node.classList.toggle("lead-col", ranked[0] && ranked[0].id === player.id && !ranked[0].out);
      });
    });
    const leader = ranked.find((player) => !player.out);
    const lead = document.querySelector(".leader");
    if (lead) {
      lead.textContent = leader ? `${leader.name} is leading · ${leader.total}` : "Everyone is out.";
    }
  }

  function commitCell(roundIndex, playerId, raw) {
    const existed = Boolean(state.rounds[roundIndex]);
    const wasComplete = existed && roundComplete(state.rounds[roundIndex]);
    writeCell(roundIndex, playerId, raw);
    paintSheetTotals();
    const nowExists = Boolean(state.rounds[roundIndex]);
    const nowComplete = nowExists && roundComplete(state.rounds[roundIndex]);
    if (nowComplete && !wasComplete) {
      const gameOver = Boolean(gameResultFrom(state.rounds));
      if (gameOver) {
        window.setTimeout(() => {
          setState(withResult(state.rounds, { toast: "" }));
        }, 350);
        return;
      }
      const nextDeal = nextJokerId();
      const nextRoles = dealRoles(nextDeal);
      setState(withResult(state.rounds, {
        jokerChooserId: nextDeal,
        toast: `Round ${roundIndex + 1} done. ${nextRoles.joker} chooses joker. ${nextRoles.starter} starts.`,
      }));
    }
  }

  function renderSheet() {
    const sums = totals();
    const ranked = standings();
    const leaderId = ranked[0] && !ranked[0].out ? ranked[0].id : "";
    const outIds = new Set(ranked.filter((player) => player.out).map((player) => player.id));
    const rows = [...state.rounds];
    if (!rows.length || roundComplete(rows[rows.length - 1])) {
      rows.push({ id: "next", scores: {} });
    }
    const head = `
      <tr>
        <th class="sheet-corner">Hand</th>
        ${state.players.map((player, index) => `
          <th data-col="${player.id}" class="${player.id === leaderId ? "lead-col" : ""} ${outIds.has(player.id) ? "out" : ""}">
              ${faceHtml(player, "photo", "sheet-face")}
              <div>${escapeHtml(playerName(player, index))}</div>
            </th>
        `).join("")}
      </tr>
    `;
    const body = rows.map((round, roundIndex) => `
      <tr>
        <th class="round-lab">${round.id === "next" ? roundIndex + 1 : roundIndex + 1}</th>
        ${state.players.map((player) => {
          const value = scoreValue(round, player.id);
          return `
            <td data-col="${player.id}" class="${player.id === leaderId ? "lead-col" : ""} ${outIds.has(player.id) ? "out" : ""}">
              <input
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                autocomplete="off"
                enterkeyhint="next"
                data-action="cell"
                data-id="${player.id}"
                data-round="${roundIndex}"
                value="${value == null ? "" : value}"
                placeholder="—"
              />
            </td>
          `;
        }).join("")}
      </tr>
    `).join("");
    const foot = `
      <tr>
        <th class="round-lab">TOTAL</th>
        ${state.players.map((player) => `
          <td data-col="${player.id}" data-total="${player.id}" class="total-cell ${player.id === leaderId ? "lead-col" : ""} ${outIds.has(player.id) ? "out" : ""}">${sums[player.id] || 0}</td>
        `).join("")}
      </tr>
    `;
    return `
      <section class="panel sheet-panel">
        <h2>Score sheet</h2>
        <p class="hint">Type each person's points. The TOTAL row adds up by itself.</p>
        <div class="sheet-wrap">
          <table class="sheet">
            <thead>${head}</thead>
            <tbody>${body}</tbody>
            <tfoot>${foot}</tfoot>
          </table>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-action="undo" ${state.rounds.length ? "" : "disabled"}>Undo last hand</button>
          <button class="btn btn-danger" data-action="new-game">New game</button>
        </div>
      </section>
    `;
  }

  function renderGame() {
    const ranked = standings();
    const leader = ranked.find((p) => !p.out);
    const dealHtml = renderDealCircle();
    const sheetHtml = renderSheet();

    return `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">♥</div>
          <div>
            <h1>Scoreboard</h1>
            <p>${state.rounds.length} round${state.rounds.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-action="goto-setup">Players</button>
          <button class="btn btn-ghost" data-action="copy">Copy</button>
        </div>
      </header>
      ${dealHtml}
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
      ${sheetHtml}
    `;
  }

  function renderDealCircle() {
    const spinning = Boolean(state.dealAnim);
    const chooserId = state.jokerChooserId && state.players.some((p) => p.id === state.jokerChooserId)
      ? state.jokerChooserId
      : state.players[0].id;
    const roles = dealRoles(chooserId);
    const count = state.players.length;
    const toIndex = jokerIndex(chooserId);
    const fromIndex = Number.isFinite(Number(state.dealFrom)) ? Number(state.dealFrom) : toIndex;
    const extraTurns = state.dealAnim === "random" ? 7 : 5;
    const spinFrom = -((360 * fromIndex) / count);
    let spinTo = -((360 * toIndex) / count) - 360 * extraTurns;
    if (spinTo >= spinFrom) spinTo -= 360;
    const slice = 360 / count;
    const pockets = state.players.map((_, index) => {
      const color = COLORS[index % COLORS.length];
      return `${color} ${index * slice}deg ${(index + 1) * slice}deg`;
    }).join(", ");
    const seats = state.players.map((player, index) => {
      const isJoker = !spinning && player.id === roles.jokerId;
      const isStart = !spinning && player.id === roles.starterId;
      const label = isJoker ? "Joker" : isStart ? "Start" : "";
      return `
        <div class="seat ${isJoker ? "joker" : ""} ${isStart ? "start" : ""}" style="--i:${index}; --n:${count}">
          <div class="seat-face">
            ${faceHtml(player, "photo", "seat-pic")}
            <span class="seat-name">${escapeHtml(playerName(player, index))}</span>
            ${label ? `<span class="seat-tag">${label}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
    const animClass = state.dealAnim === "random" ? "dealing dealing-random" : spinning ? "dealing" : "";
    return `
      <section class="panel table-panel">
        <h2>This hand</h2>
        <p class="hint">${spinning
          ? "Spinning… the wheel will stop on who chooses the joker."
          : `<strong>${escapeHtml(roles.joker)}</strong> chooses the joker. The player before — <strong>${escapeHtml(roles.starter)}</strong> — picks the open card and starts.`}</p>
        <div
          class="table-wrap ${animClass}"
          style="--n:${count}; --land:${toIndex}; --spin-from:${spinFrom}deg; --spin-to:${spinTo}deg; --pockets: conic-gradient(from ${-90 - slice / 2}deg, ${pockets})"
        >
          <div class="roulette-pointer" aria-hidden="true"></div>
          <div class="roulette-wheel">
            <div class="roulette-pockets" aria-hidden="true"></div>
            ${seats}
          </div>
          <div class="table-core">
            <span class="core-kicker">${spinning ? "Spinning" : "Table"}</span>
            ${spinning
              ? `<span class="core-line">Who chooses joker?</span>`
              : `<span class="core-line">${escapeHtml(roles.joker)} → joker</span><span class="core-line">${escapeHtml(roles.starter)} → start</span>`}
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-action="next-deal" ${spinning ? "disabled" : ""}>Next deal</button>
          <button class="btn btn-ghost" data-action="random-deal" ${spinning ? "disabled" : ""}>Random first player</button>
        </div>
      </section>
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
    const roastLoser = result.losers[0] || null;
    const winnerFull = state.players.find((player) => player.id === result.winner.id) || result.winner;
    const loserFull = roastLoser
      ? (state.players.find((player) => player.id === roastLoser.id) || roastLoser)
      : null;
    const poppers = Array.from({ length: 52 }, (_, i) => {
      const bits = ["🎉", "🎊", "✨", "💥", "🎈"];
      return `<span class="popper" style="--x:${(i * 7.3) % 100}%; --d:${((i % 10) * 0.08).toFixed(2)}s; --t:${(1.8 + (i % 5) * 0.2).toFixed(2)}s">${bits[i % 5]}</span>`;
    }).join("");
    const tears = Array.from({ length: 8 }, (_, i) =>
      `<span class="tear" style="--tx:${-18 + i * 6}px; --d:${(0.1 * i).toFixed(2)}s"></span>`
    ).join("");
    return `
      <div class="result-overlay roast" role="dialog" aria-label="Game result">
        <div class="popper-layer" aria-hidden="true">${poppers}</div>
        <button type="button" class="roast-close" data-action="close-result">Close</button>
        <div class="roast-stage">
          <p class="result-kicker">Hand complete</p>
          <div class="stage-3d" aria-hidden="false">
            <div class="stage-floor"></div>
            <figure class="actor winner">
              <div class="actor-body">
                ${faceHtml(winnerFull, "jump3d", "roast-face body3d")}
              </div>
              <div class="actor-shadow"></div>
              <figcaption>${escapeHtml(result.winner.name)} wins</figcaption>
            </figure>
            ${loserFull ? `
              <figure class="actor loser">
                <div class="actor-body">
                  ${faceHtml(loserFull, "cry3d", "roast-face body3d")}
                  <div class="tear-box">${tears}</div>
                </div>
                <div class="actor-shadow sad"></div>
                <figcaption>${escapeHtml(loserFull.name)} lost · ${loserFull.total}</figcaption>
              </figure>
            ` : ""}
          </div>
          <p class="roast-line">${loserFull
            ? `${escapeHtml(result.winner.name)} jumps. ${escapeHtml(loserFull.name)} is out.`
            : `${escapeHtml(result.winner.name)} takes it with ${result.winner.total} points.`}</p>
          <div class="result-actions">
            <button class="btn btn-primary" data-action="new-game">Play again</button>
            <button class="btn btn-ghost" data-action="close-result">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderNav() {
    const onHome = state.screen === "home";
    return `
      <nav class="tabbar" aria-label="Main">
        <button type="button" class="tab ${onHome ? "active" : ""}" data-action="home">Home</button>
        <button type="button" class="tab ${onHome ? "" : "active"}" data-action="tab-board">Scoreboard</button>
      </nav>
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
    root.innerHTML = renderNav() + page + renderResult() + toast;

    if (state.toast) {
      window.clearTimeout(render.timer);
      render.timer = window.setTimeout(() => {
        if (!state.toast) return;
        state.toast = "";
        const el = document.querySelector(".toast");
        if (el) el.classList.remove("show");
      }, 2200);
    }
    if (state.dealAnim) {
      const wait = state.dealAnim === "random" ? ROULETTE_RANDOM_MS : ROULETTE_MS;
      window.clearTimeout(render.dealTimer);
      render.dealTimer = window.setTimeout(() => {
        if (!state.dealAnim) return;
        const roles = dealRoles();
        setState({
          dealAnim: "",
          toast: `${roles.joker} chooses the joker. ${roles.starter} starts by picking the open card.`,
        });
      }, wait);
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
    if (action === "cell") {
      const sums = Object.fromEntries(state.players.map((player) => [player.id, 0]));
      document.querySelectorAll('input[data-action="cell"]').forEach((input) => {
        const value = parseScore(input.value);
        if (value != null) sums[input.dataset.id] += value;
      });
      state.players.forEach((player) => {
        const cell = document.querySelector(`[data-total="${player.id}"]`);
        if (cell) cell.textContent = String(sums[player.id] || 0);
      });
      const ranked = [...state.players]
        .map((player, index) => ({ id: player.id, name: playerName(player, index), total: sums[player.id] || 0 }))
        .sort((a, b) => a.total - b.total);
      const lead = document.querySelector(".leader");
      if (lead && ranked[0]) lead.textContent = `${ranked[0].name} is leading · ${ranked[0].total}`;
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

  document.getElementById("app").addEventListener("change", (event) => {
    const el = event.target;
    if (el.dataset.action === "toggle-player") {
      const selected = new Set(state.selectedIds || []);
      if (el.checked) selected.add(el.dataset.id);
      else selected.delete(el.dataset.id);
      setState({ selectedIds: [...selected] });
      return;
    }
    if (el.dataset.action !== "cell") return;
    commitCell(Number(el.dataset.round), el.dataset.id, el.value);
  });

  document.getElementById("app").addEventListener("click", (event) => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "add-extra") {
      const field = document.querySelector("[data-role='new-name']");
      const name = (field && field.value ? field.value : "").trim();
      if (!name) {
        showToast("Type the new person's name first.");
        return;
      }
      const id = uid();
      setState({
        extras: [...(state.extras || []), { id, name }],
        selectedIds: [...(state.selectedIds || []), id],
      });
      return;
    }
    if (action === "remove-extra") {
      event.preventDefault();
      event.stopPropagation();
      const id = el.dataset.id;
      setState({
        extras: (state.extras || []).filter((person) => person.id !== id),
        selectedIds: (state.selectedIds || []).filter((item) => item !== id),
      });
      return;
    }
    if (action === "add-player") {
      return;
    }
    if (action === "remove-player") {
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
    if (action === "tab-board") {
      const selected = state.selectedIds || [];
      if (selected.length < MIN_PLAYERS) {
        showToast("Tick at least two people who are playing.");
        setState({ screen: "home", resultOpen: false });
        return;
      }
      const patch = {
        screen: "game",
        started: true,
        draft: state.draft,
        resultOpen: false,
      };
      if (!state.rounds.length) patch.players = playersFromSelection(selected);
      setState(withResult(state.rounds, withJoker(patch)));
      return;
    }
    if (action === "goto-setup") {
      setState({ screen: "setup" });
      return;
    }
    if (action === "home-new") {
      if (!state.rounds.length || window.confirm("Start a new game? Current scores will be cleared.")) {
        setState({
          screen: "home",
          started: false,
          rounds: [],
          draft: {},
          resultOpen: false,
          resultShownFor: "",
          jokerChooserId: null,
          toast: "New game. Tick who is playing.",
        });
      }
      return;
    }
    if (action === "start") {
      const selected = state.selectedIds || [];
      if (selected.length < MIN_PLAYERS) {
        showToast("Tick at least two people who are playing.");
        return;
      }
      const players = playersFromSelection(selected);
      setState(withResult(state.rounds, withJoker({
        screen: "game",
        started: true,
        players,
        draft: {},
      })));
      return;
    }
    if (action === "next-deal") {
      if (state.dealAnim) return;
      const dealFrom = jokerIndex();
      const jokerChooserId = nextJokerId();
      setState({
        jokerChooserId,
        dealAnim: "next",
        dealFrom,
        toast: "",
      });
      return;
    }
    if (action === "random-deal") {
      if (state.dealAnim) return;
      const dealFrom = jokerIndex();
      const jokerChooserId = pickRandomJoker();
      setState({
        jokerChooserId,
        dealAnim: "random",
        dealFrom,
        toast: "",
      });
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
      if (fromOverlay || !state.rounds.length || window.confirm("Clear scores and pick who is playing?")) {
        setState({
          screen: "home",
          started: false,
          rounds: [],
          draft: {},
          resultOpen: false,
          resultShownFor: "",
          jokerChooserId: null,
          toast: "New game. Tick who is playing.",
        });
      }
    }
  });

  document.getElementById("app").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const el = event.target;
    if (el.dataset.action === "cell") {
      event.preventDefault();
      const inputs = [...document.querySelectorAll('input[data-action="cell"]')];
      const index = inputs.indexOf(el);
      commitCell(Number(el.dataset.round), el.dataset.id, el.value);
      requestAnimationFrame(() => {
        const nextInputs = [...document.querySelectorAll('input[data-action="cell"]')];
        const next = nextInputs[index + 1] || nextInputs.find((input) => input.value === "");
        next?.focus();
        next?.select();
      });
      return;
    }
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
