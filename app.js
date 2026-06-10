(function () {
  const matches = window.QUINIELA_MATCHES || [];
  const storageKey = "quiniela-2026-state";
  const nameKey = "quiniela-2026-player";
  const adminKey = "quiniela-2026-admin-pin";

  const state = {
    players: {},
    predictions: {},
    results: {}
  };

  let currentPlayer = localStorage.getItem(nameKey) || "";
  let adminPin = sessionStorage.getItem(adminKey) || "";
  let usingApi = true;

  const syncStatus = document.querySelector("#syncStatus");
  const nameForm = document.querySelector("#nameForm");
  const playerName = document.querySelector("#playerName");
  const playerNotice = document.querySelector("#playerNotice");
  const matchList = document.querySelector("#matchList");
  const leaderboard = document.querySelector("#leaderboard");
  const refreshButton = document.querySelector("#refreshButton");
  const adminLogin = document.querySelector("#adminLogin");
  const adminPinInput = document.querySelector("#adminPin");
  const adminResults = document.querySelector("#adminResults");
  const template = document.querySelector("#matchTemplate");

  playerName.value = currentPlayer;

  function setStatus(text, mode) {
    syncStatus.textContent = text;
    syncStatus.dataset.mode = mode || "";
  }

  function normalizeName(name) {
    return name.trim().replace(/\s+/g, " ");
  }

  function formatMatchDate(value) {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function winner(score) {
    if (!score) return null;
    if (Number(score.home) > Number(score.away)) return "home";
    if (Number(score.home) < Number(score.away)) return "away";
    return "draw";
  }

  function scorePrediction(prediction, result) {
    if (!prediction || !result) return 0;
    const pickHome = Number(prediction.home);
    const pickAway = Number(prediction.away);
    const realHome = Number(result.home);
    const realAway = Number(result.away);

    if (pickHome === realHome && pickAway === realAway) return 3;
    if (winner(prediction) === winner(result)) return 1;
    return 0;
  }

  function playerScore(name) {
    const picks = state.predictions[name] || {};
    return matches.reduce((total, match) => total + scorePrediction(picks[match.id], state.results[match.id]), 0);
  }

  function hydrateLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      Object.assign(state.players, saved.players || {});
      Object.assign(state.predictions, saved.predictions || {});
      Object.assign(state.results, saved.results || {});
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  function persistLocal() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  async function apiFetch(options) {
    const response = await fetch("/api/state", {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "No se pudo sincronizar");
    }
    return response.json();
  }

  async function loadState() {
    setStatus("Sincronizando", "loading");
    try {
      const data = await apiFetch();
      usingApi = data.storage === "kv";
      Object.assign(state.players, data.state.players || {});
      Object.assign(state.predictions, data.state.predictions || {});
      Object.assign(state.results, data.state.results || {});
      if (!usingApi) hydrateLocal();
      setStatus(usingApi ? "En linea" : "Modo local", usingApi ? "online" : "local");
    } catch {
      usingApi = false;
      hydrateLocal();
      setStatus("Modo local", "local");
    }
    render();
  }

  async function saveState(action, payload) {
    if (!usingApi) {
      applyMutation(action, payload);
      persistLocal();
      render();
      return;
    }

    setStatus("Guardando", "loading");
    try {
      const data = await apiFetch({
        method: "POST",
        body: JSON.stringify({ action, payload })
      });
      state.players = data.state.players || {};
      state.predictions = data.state.predictions || {};
      state.results = data.state.results || {};
      setStatus("En linea", "online");
      render();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function applyMutation(action, payload) {
    if (action === "join") {
      state.players[payload.name] = { name: payload.name, joinedAt: new Date().toISOString() };
      state.predictions[payload.name] = state.predictions[payload.name] || {};
    }

    if (action === "prediction") {
      state.players[payload.name] = state.players[payload.name] || { name: payload.name, joinedAt: new Date().toISOString() };
      state.predictions[payload.name] = state.predictions[payload.name] || {};
      state.predictions[payload.name][payload.matchId] = {
        home: Number(payload.home),
        away: Number(payload.away),
        updatedAt: new Date().toISOString()
      };
    }

    if (action === "result") {
      if (adminPin !== "1234") throw new Error("PIN incorrecto en modo local");
      state.results[payload.matchId] = {
        home: Number(payload.home),
        away: Number(payload.away),
        updatedAt: new Date().toISOString()
      };
    }
  }

  function render() {
    renderPlayer();
    renderMatches();
    renderLeaderboard();
    renderAdmin();
  }

  function renderPlayer() {
    if (currentPlayer) {
      playerNotice.textContent = "Listo, estas jugando como " + currentPlayer + ".";
      return;
    }
    playerNotice.textContent = "Escribe tu nombre para guardar tus marcadores.";
  }

  function renderMatches() {
    matchList.textContent = "";
    const picks = state.predictions[currentPlayer] || {};

    matches.forEach((match) => {
      const node = template.content.firstElementChild.cloneNode(true);
      const pick = picks[match.id];
      const result = state.results[match.id];

      node.querySelector(".match-meta").textContent = `${match.group} | ${formatMatchDate(match.date)} | ${match.venue}`;
      node.querySelector(".home-team").textContent = match.home;
      node.querySelector(".away-team").textContent = match.away;

      const homeInput = node.querySelector(".home-score");
      const awayInput = node.querySelector(".away-score");
      homeInput.value = pick ? pick.home : "";
      awayInput.value = pick ? pick.away : "";

      node.querySelector(".save-pick").addEventListener("click", async () => {
        if (!currentPlayer) {
          playerName.focus();
          return;
        }
        if (homeInput.value === "" || awayInput.value === "") return;
        await saveState("prediction", {
          name: currentPlayer,
          matchId: match.id,
          home: homeInput.value,
          away: awayInput.value
        });
      });

      node.querySelector(".result-line").textContent = result
        ? `Resultado: ${result.home}-${result.away} | Tus puntos: ${scorePrediction(pick, result)}`
        : "Resultado pendiente";

      matchList.appendChild(node);
    });
  }

  function renderLeaderboard() {
    const rows = Object.keys(state.players)
      .map((name) => {
        const picks = state.predictions[name] || {};
        return {
          name,
          points: playerScore(name),
          picks: Object.keys(picks).length
        };
      })
      .sort((a, b) => b.points - a.points || b.picks - a.picks || a.name.localeCompare(b.name));

    leaderboard.textContent = "";

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Todavia no hay participantes.";
      leaderboard.appendChild(empty);
      return;
    }

    rows.forEach((row, index) => {
      const item = document.createElement("div");
      item.className = "leader-row";
      item.innerHTML = `
        <span class="leader-rank">${index + 1}</span>
        <span>
          <strong>${escapeHtml(row.name)}</strong>
          <span class="leader-subtext">${row.picks} pronosticos</span>
        </span>
        <span class="leader-points">${row.points} pts</span>
      `;
      leaderboard.appendChild(item);
    });
  }

  function renderAdmin() {
    adminResults.textContent = "";
    if (!adminPin) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Ingresa el PIN para capturar marcadores reales.";
      adminResults.appendChild(empty);
      return;
    }

    matches.forEach((match) => {
      const result = state.results[match.id] || {};
      const card = document.createElement("article");
      card.className = "admin-card";
      card.innerHTML = `
        <h3>${escapeHtml(match.home)} vs ${escapeHtml(match.away)}</h3>
        <div class="match-meta">${escapeHtml(match.group)} | ${formatMatchDate(match.date)}</div>
        <div class="admin-score-row">
          <input type="number" min="0" max="20" inputmode="numeric" value="${result.home ?? ""}" aria-label="Resultado local">
          <span>-</span>
          <input type="number" min="0" max="20" inputmode="numeric" value="${result.away ?? ""}" aria-label="Resultado visitante">
          <button type="button">Guardar</button>
        </div>
      `;
      const inputs = card.querySelectorAll("input");
      card.querySelector("button").addEventListener("click", async () => {
        if (inputs[0].value === "" || inputs[1].value === "") return;
        await saveResult(match.id, inputs[0].value, inputs[1].value);
      });
      adminResults.appendChild(card);
    });
  }

  async function saveResult(matchId, home, away) {
    if (!usingApi) {
      applyMutation("result", { matchId, home, away });
      persistLocal();
      render();
      return;
    }

    setStatus("Guardando", "loading");
    try {
      const data = await apiFetch({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": adminPin
        },
        body: JSON.stringify({ action: "result", payload: { matchId, home, away } })
      });
      state.results = data.state.results || {};
      state.players = data.state.players || {};
      state.predictions = data.state.predictions || {};
      setStatus("En linea", "online");
      render();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  nameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = normalizeName(playerName.value);
    if (!name) return;
    currentPlayer = name;
    localStorage.setItem(nameKey, name);
    await saveState("join", { name });
  });

  adminLogin.addEventListener("submit", (event) => {
    event.preventDefault();
    adminPin = adminPinInput.value.trim();
    sessionStorage.setItem(adminKey, adminPin);
    renderAdmin();
  });

  refreshButton.addEventListener("click", loadState);

  loadState();
})();
