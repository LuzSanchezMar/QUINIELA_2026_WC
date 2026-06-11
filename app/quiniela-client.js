"use client";

import { useEffect, useMemo, useState } from "react";
import { matches } from "../lib/matches";
import { flagForTeam } from "../lib/team-assets";

const storageKey = "quiniela-2026-state";
const nameKey = "quiniela-2026-player";
const sessionKey = "quiniela-2026-session";
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
  const [passwordInput, setPasswordInput] = useState("");
  const [playerSession, setPlayerSession] = useState(null);
  const [adminPin, setAdminPin] = useState("");
  const [adminInput, setAdminInput] = useState("");
  const [status, setStatus] = useState({ text: "Iniciando", mode: "" });
  const [usingApi, setUsingApi] = useState(true);

  useEffect(() => {
    const savedPlayer = localStorage.getItem(nameKey) || "";
    const savedSession = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
    const savedPin = sessionStorage.getItem(adminKey) || "";
    if (savedSession?.token && savedSession?.name) {
      setCurrentPlayer(savedSession.name);
      setPlayerInput(savedSession.name);
      setPlayerSession(savedSession);
    } else {
      setCurrentPlayer(savedPlayer);
      setPlayerInput(savedPlayer);
    }
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

  const prizeAmount = Object.keys(state.players).length * 100;

  async function apiFetch(options = {}) {
    const { headers: optionHeaders, ...rest } = options;
    const response = await fetch("/api/state", {
      headers: { "Content-Type": "application/json", ...optionHeaders },
      ...rest
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
      setUsingApi(true);
      setState(normalizeState(data.state));
      setStatus({ text: data.storage === "kv" ? "En linea" : "Servidor local", mode: data.storage === "kv" ? "online" : "local" });
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
        headers: playerSession?.token ? { Authorization: `Bearer ${playerSession.token}` } : {},
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
    const action = event.nativeEvent.submitter?.value || "login";
    const name = normalizeName(playerInput);
    if (!name || !passwordInput) return;
    setStatus({ text: action === "register" ? "Creando cuenta" : "Entrando", mode: "loading" });
    try {
      const data = await apiFetch({
        method: "POST",
        body: JSON.stringify({ action, payload: { name, password: passwordInput } })
      });
      setCurrentPlayer(data.session.name);
      setPlayerSession(data.session);
      setPasswordInput("");
      setState(normalizeState(data.state));
      localStorage.setItem(nameKey, data.session.name);
      sessionStorage.setItem(sessionKey, JSON.stringify(data.session));
      setStatus({ text: "En sesion", mode: "online" });
    } catch (error) {
      setStatus({ text: error.message, mode: "error" });
    }
  }

  function handlePlayerLogout() {
    setCurrentPlayer("");
    setPlayerSession(null);
    sessionStorage.removeItem(sessionKey);
  }

  function handleAdminSubmit(event) {
    event.preventDefault();
    const pin = adminInput.trim();
    setAdminPin(pin);
    sessionStorage.setItem(adminKey, pin);
  }

  const adminUnlocked = view !== "admin" || adminPin === "180799";

  return (
    <>
      <header className="app-header">
        <div>
          <div className="brand-line">
            <img
              className="wc-logo"
              src="https://upload.wikimedia.org/wikipedia/en/thumb/1/17/2026_FIFA_World_Cup_emblem.svg/250px-2026_FIFA_World_Cup_emblem.svg.png"
              alt="FIFA World Cup 2026"
            />
            <div>
              <p className="eyebrow">Mundial 2026</p>
              <h1>Quiniela familiar</h1>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <nav className="view-nav" aria-label="Vistas">
            <a className={view === "player" ? "active" : ""} href="/">Participante</a>
            <a className={view === "standings" ? "active" : ""} href="/posiciones">Posiciones</a>
            <a className={view === "admin" ? "active" : ""} href="/admin">Admin</a>
          </nav>
          <div className="status-pill" data-mode={status.mode}>
            {status.text}
          </div>
        </div>
      </header>

      <main className={view === "admin" || view === "standings" ? "layout layout-admin" : "layout"}>
        {view === "player" && (
        <section className="panel player-panel" aria-labelledby="playerTitle">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Participante</p>
              <h2 id="playerTitle">Tus pronosticos</h2>
            </div>
          </div>

          {currentPlayer && playerSession?.token ? (
            <div className="session-bar">
              <span>Jugando como <strong>{currentPlayer}</strong></span>
              <button className="ghost-button" type="button" onClick={handlePlayerLogout}>Salir</button>
            </div>
          ) : (
            <>
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
                </div>
                <label htmlFor="playerPassword">Contrasena</label>
                <div className="inline-fields">
                  <input
                    id="playerPassword"
                    name="playerPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                  />
                  <div className="auth-actions">
                    <button type="submit" value="login">Entrar</button>
                    <button className="ghost-button" type="submit" value="register">Crear cuenta</button>
                  </div>
                </div>
              </form>

              <div className="notice">Entra o crea tu cuenta para guardar tus marcadores.</div>
            </>
          )}
          <section className="rules-panel" aria-label="Sistema de puntos">
            <h3>Sistema de puntos</h3>
            <div className="rules-grid">
              <span><strong>3 pts</strong> marcador exacto</span>
              <span><strong>1 pt</strong> ganador o empate correcto</span>
              <span><strong>0 pts</strong> sin coincidencia</span>
            </div>
          </section>
          <div className="match-list">
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                pick={(state.predictions[currentPlayer] || {})[match.id]}
                result={state.results[match.id]}
                onSave={(home, away) => saveState("prediction", { name: currentPlayer, matchId: match.id, home, away })}
                canSave={Boolean(currentPlayer && playerSession?.token)}
              />
            ))}
          </div>
        </section>
        )}

        <aside className="side-stack">
          {(view === "player" || view === "standings") && (
          <section className="panel" aria-labelledby="leaderboardTitle">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Tabla</p>
                <h2 id="leaderboardTitle">Posiciones</h2>
              </div>
            </div>
            {view === "standings" && <Podium rows={leaderboard} />}
            {view === "standings" && <PrizeBanner amount={prizeAmount} players={Object.keys(state.players).length} />}
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
            </div>
            {!adminUnlocked ? (
              <form className="admin-login admin-gate" onSubmit={handleAdminSubmit}>
                <label htmlFor="adminPin">PIN de administrador</label>
                <div className="inline-fields">
                  <input
                    id="adminPin"
                    name="adminPin"
                    type="password"
                    inputMode="numeric"
                    value={adminInput}
                    onChange={(event) => setAdminInput(event.target.value)}
                    autoFocus
                  />
                  <button type="submit">Entrar</button>
                </div>
                {adminPin && <div className="empty-state">PIN incorrecto.</div>}
              </form>
            ) : (
              <div className="admin-results">
                {matches.map((match) => (
                  <AdminCard key={match.id} match={match} result={state.results[match.id]} onSave={saveResult} />
                ))}
              </div>
            )}
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

  const teamsPending = match.teamsConfirmed === false;
  const locked = hasMatchStarted(match) || teamsPending;

  function handleSave() {
    if (!canSave || locked || home === "" || away === "") return;
    onSave(home, away);
  }

  return (
    <article className="match-card">
      <div className="match-meta">{`${match.group} | ${formatMatchDate(match.date)} | ${match.venue}`}</div>
      <div className="score-row">
        <label className="team-pick">
          <span><span className="flag-icon">{flagForTeam(match.home)}</span>{match.home}</span>
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
          <span><span className="flag-icon">{flagForTeam(match.away)}</span>{match.away}</span>
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
          {teamsPending ? "Por definir" : locked ? "Cerrado" : "Guardar"}
        </button>
      </div>
      <div className="result-line">
        {result
          ? `Resultado: ${result.home}-${result.away} | Tus puntos: ${scorePrediction(pick, result)}`
          : teamsPending
            ? "Equipos por definir. Pronostico pendiente"
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
      <h3><span className="flag-icon">{flagForTeam(match.home)}</span>{match.home} vs <span className="flag-icon">{flagForTeam(match.away)}</span>{match.away}</h3>
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

function Podium({ rows }) {
  const topThree = rows.slice(0, 3);
  if (!topThree.length) return <div className="empty-state podium-empty">El podio aparecera cuando haya participantes.</div>;

  const slots = [topThree[1], topThree[0], topThree[2]];
  const places = [2, 1, 3];

  return (
    <div className="celebration-board" aria-label="Podio de ganadores">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => <span key={index} />)}
      </div>
      <div className="podium">
        {slots.map((row, index) => row ? (
          <div className={`podium-place place-${places[index]}`} key={row.name}>
            <span className="medal">{places[index]}</span>
            <strong>{row.name}</strong>
            <span>{row.points} pts</span>
          </div>
        ) : <div className="podium-place podium-placeholder" key={places[index]} />)}
      </div>
    </div>
  );
}

function PrizeBanner({ amount, players }) {
  return (
    <div className="prize-banner" aria-label="Premio acumulado">
      <span>Premio a ganar</span>
      <strong>{formatCurrency(amount)}</strong>
      <small>{players} participante{players === 1 ? "" : "s"} x $100</small>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(value);
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
    if (match.teamsConfirmed === false) throw new Error("Los equipos aun no estan definidos");
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
    if (adminPin !== "180799") throw new Error("PIN incorrecto en modo local");
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
