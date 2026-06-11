"use client";

import { useEffect, useMemo, useState } from "react";
import { matches } from "../lib/matches";

const storageKey = "quiniela-2026-state";
const nameKey = "quiniela-2026-player";
const adminKey = "quiniela-2026-admin-pin";
const emptyState = {
  players: {},
  predictions: {},
  results: {}
};

export default function QuinielaClient({ view = "player" }) {
  const [state, setState] = useState(emptyState);
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [playerInput, setPlayerInput] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [adminInput, setAdminInput] = useState("");
  const [status, setStatus] = useState({ text: "Iniciando", mode: "" });
  const [usingApi, setUsingApi] = useState(true);

  useEffect(() => {
    const savedPlayer = localStorage.getItem(nameKey) || "";
    const savedPin = sessionStorage.getItem(adminKey) || "";
    setCurrentPlayer(savedPlayer);
    setPlayerInput(savedPlayer);
    setAdminPin(savedPin);
    setAdminInput(savedPin);
    loadState();
  }, []);

  const leaderboard = useMemo(() => {
    return Object.keys(state.players)
      .map((name) => {
        const picks = state.predictions[name] || {};
        return {
          name,
          points: playerScore(name, state),
          picks: Object.keys(picks).length
        };
      })
      .sort((a, b) => b.points - a.points || b.picks - a.picks || a.name.localeCompare(b.name));
  }, [state]);

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
    setStatus({ text: "Sincronizando", mode: "loading" });
    try {
      const data = await apiFetch();
      const apiMode = data.storage === "kv";
      setUsingApi(apiMode);
      setState(apiMode ? normalizeState(data.state) : mergeState(data.state, hydrateLocal()));
      setStatus({ text: apiMode ? "En linea" : "Modo local", mode: apiMode ? "online" : "local" });
    } catch {
      setUsingApi(false);
      setState(hydrateLocal());
      setStatus({ text: "Modo local", mode: "local" });
    }
  }

  async function saveState(action, payload) {
    if (!usingApi) {
      try {
        setState((previous) => {
          const next = clone(previous);
          applyMutation(next, action, payload, adminPin);
          persistLocal(next);
          return next;
        });
      } catch (error) {
        setStatus({ text: error.message, mode: "error" });
      }
      return;
    }

    setStatus({ text: "Guardando", mode: "loading" });
    try {
      const data = await apiFetch({
        method: "POST",
        body: JSON.stringify({ action, payload })
      });
      setState(normalizeState(data.state));
      setStatus({ text: "En linea", mode: "online" });
    } catch (error) {
      setStatus({ text: error.message, mode: "error" });
    }
  }

  async function saveResult(matchId, home, away) {
    if (!usingApi) {
      return saveState("result", { matchId, home, away });
    }

    setStatus({ text: "Guardando", mode: "loading" });
    try {
      const data = await apiFetch({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": adminPin
        },
        body: JSON.stringify({ action: "result", payload: { matchId, home, away } })
      });
      setState(normalizeState(data.state));
      setStatus({ text: "En linea", mode: "online" });
    } catch (error) {
      setStatus({ text: error.message, mode: "error" });
    }
  }

  async function handlePlayerSubmit(event) {
    event.preventDefault();
    const name = normalizeName(playerInput);
    if (!name) return;
    setCurrentPlayer(name);
    localStorage.setItem(nameKey, name);
    await saveState("join", { name });
  }

  function handleAdminSubmit(event) {
    event.preventDefault();
    const pin = adminInput.trim();
    setAdminPin(pin);
    sessionStorage.setItem(adminKey, pin);
  }

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Mundial 2026</p>
          <h1>Quiniela familiar</h1>
        </div>
        <div className="header-actions">
          <nav className="view-nav" aria-label="Vistas">
            <a className={view === "player" ? "active" : ""} href="/">Participante</a>
            <a className={view === "admin" ? "active" : ""} href="/admin">Admin</a>
          </nav>
          <div className="status-pill" data-mode={status.mode}>
            {status.text}
          </div>
        </div>
      </header>

      <main className={view === "admin" ? "layout layout-admin" : "layout"}>
        {view === "player" && (
        <section className="panel player-panel" aria-labelledby="playerTitle">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Participante</p>
              <h2 id="playerTitle">Tus pronosticos</h2>
            </div>
            <button className="ghost-button" type="button" title="Actualizar datos" onClick={loadState}>
              Actualizar
            </button>
          </div>

          <form className="name-form" onSubmit={handlePlayerSubmit}>
            <label htmlFor="playerName">Nombre</label>
            <div className="inline-fields">
              <input
                id="playerName"
                name="playerName"
                autoComplete="name"
                placeholder="Ej. Tia Paty"
                required
                value={playerInput}
                onChange={(event) => setPlayerInput(event.target.value)}
              />
              <button type="submit">Entrar</button>
            </div>
          </form>

          <div className="notice">
            {currentPlayer ? `Listo, estas jugando como ${currentPlayer}.` : "Escribe tu nombre para guardar tus marcadores."}
          </div>
          <div className="match-list">
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                pick={(state.predictions[currentPlayer] || {})[match.id]}
                result={state.results[match.id]}
                onSave={(home, away) => saveState("prediction", { name: currentPlayer, matchId: match.id, home, away })}
                canSave={Boolean(currentPlayer)}
              />
            ))}
          </div>
        </section>
        )}

        <aside className="side-stack">
          {view === "player" && (
          <section className="panel" aria-labelledby="leaderboardTitle">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tabla</p>
                <h2 id="leaderboardTitle">Posiciones</h2>
              </div>
            </div>
            <div className="leaderboard">
              {leaderboard.length ? (
                leaderboard.map((row, index) => (
                  <div className="leader-row" key={row.name}>
                    <span className="leader-rank">{index + 1}</span>
                    <span>
                      <strong>{row.name}</strong>
                      <span className="leader-subtext">{row.picks} pronosticos</span>
                    </span>
                    <span className="leader-points">{row.points} pts</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Todavia no hay participantes.</div>
              )}
            </div>
          </section>
          )}

          {view === "admin" && (
          <section className="panel admin-panel" aria-labelledby="adminTitle">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Admin</p>
                <h2 id="adminTitle">Resultados</h2>
              </div>
              <button className="ghost-button" type="button" title="Actualizar datos" onClick={loadState}>
                Actualizar
              </button>
            </div>
            <form className="admin-login" onSubmit={handleAdminSubmit}>
              <label htmlFor="adminPin">PIN</label>
              <div className="inline-fields">
                <input
                  id="adminPin"
                  name="adminPin"
                  type="password"
                  inputMode="numeric"
                  placeholder="1234"
                  value={adminInput}
                  onChange={(event) => setAdminInput(event.target.value)}
                />
                <button type="submit">Abrir</button>
              </div>
            </form>
            <div className="admin-results">
              {adminPin ? (
                matches.map((match) => (
                  <AdminCard key={match.id} match={match} result={state.results[match.id]} onSave={saveResult} />
                ))
              ) : (
                <div className="empty-state">Ingresa el PIN para capturar marcadores reales.</div>
              )}
            </div>
          </section>
          )}
        </aside>
      </main>
    </>
  );
}

function MatchCard({ match, pick, result, onSave, canSave }) {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");

  useEffect(() => {
    setHome(pick ? pick.home : "");
    setAway(pick ? pick.away : "");
  }, [pick]);

  const locked = hasMatchStarted(match);

  function handleSave() {
    if (!canSave || locked || home === "" || away === "") return;
    onSave(home, away);
  }

  return (
    <article className="match-card">
      <div className="match-meta">{`${match.group} | ${formatMatchDate(match.date)} | ${match.venue}`}</div>
      <div className="score-row">
        <label className="team-pick">
          <span>{match.home}</span>
          <input
            type="number"
            min="0"
            max="20"
            inputMode="numeric"
            aria-label="Goles local"
            value={home}
            disabled={locked}
            onChange={(event) => setHome(event.target.value)}
          />
        </label>
        <span className="versus">vs</span>
        <label className="team-pick team-pick-away">
          <span>{match.away}</span>
          <input
            type="number"
            min="0"
            max="20"
            inputMode="numeric"
            aria-label="Goles visitante"
            value={away}
            disabled={locked}
            onChange={(event) => setAway(event.target.value)}
          />
        </label>
        <button className="save-pick" type="button" onClick={handleSave} disabled={locked}>
          {locked ? "Cerrado" : "Guardar"}
        </button>
      </div>
      <div className="result-line">
        {result
          ? `Resultado: ${result.home}-${result.away} | Tus puntos: ${scorePrediction(pick, result)}`
          : locked
            ? "Pronostico cerrado. Resultado pendiente"
            : "Resultado pendiente"}
      </div>
    </article>
  );
}

function AdminCard({ match, result, onSave }) {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");

  useEffect(() => {
    setHome(result ? result.home : "");
    setAway(result ? result.away : "");
  }, [result]);

  function handleSave() {
    if (home === "" || away === "") return;
    onSave(match.id, home, away);
  }

  return (
    <article className="admin-card">
      <h3>{match.home} vs {match.away}</h3>
      <div className="match-meta">{`${match.group} | ${formatMatchDate(match.date)}`}</div>
      <div className="admin-score-row">
        <input
          type="number"
          min="0"
          max="20"
          inputMode="numeric"
          value={home}
          aria-label="Resultado local"
          onChange={(event) => setHome(event.target.value)}
        />
        <span>-</span>
        <input
          type="number"
          min="0"
          max="20"
          inputMode="numeric"
          value={away}
          aria-label="Resultado visitante"
          onChange={(event) => setAway(event.target.value)}
        />
        <button type="button" onClick={handleSave}>Guardar</button>
      </div>
    </article>
  );
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

function hasMatchStarted(match) {
  return Date.now() >= new Date(match.date).getTime();
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

function playerScore(name, state) {
  const picks = state.predictions[name] || {};
  return matches.reduce((total, match) => total + scorePrediction(picks[match.id], state.results[match.id]), 0);
}

function hydrateLocal() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(storageKey) || "{}"));
  } catch {
    localStorage.removeItem(storageKey);
    return clone(emptyState);
  }
}

function persistLocal(state) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function normalizeState(state) {
  return {
    players: state?.players || {},
    predictions: state?.predictions || {},
    results: state?.results || {}
  };
}

function mergeState(apiState, localState) {
  return {
    players: { ...(apiState?.players || {}), ...(localState?.players || {}) },
    predictions: { ...(apiState?.predictions || {}), ...(localState?.predictions || {}) },
    results: { ...(apiState?.results || {}), ...(localState?.results || {}) }
  };
}

function applyMutation(state, action, payload, adminPin) {
  if (action === "join") {
    state.players[payload.name] = { name: payload.name, joinedAt: new Date().toISOString() };
    state.predictions[payload.name] = state.predictions[payload.name] || {};
  }

  if (action === "prediction") {
    const match = matches.find((item) => item.id === payload.matchId);
    if (!match) throw new Error("Partido no valido");
    if (hasMatchStarted(match)) throw new Error("El partido ya empezo");
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
