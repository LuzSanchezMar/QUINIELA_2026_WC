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
  results: {},
  matches: [],
  meta: {
    phase: "groups",
    previousWinner: null
  }
};

export default function QuinielaClient({ view = "player" }) {
  const [state, setState] = useState(emptyState);
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [playerInput, setPlayerInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [playerSession, setPlayerSession] = useState(null);
  const [adminPin, setAdminPin] = useState("");
  const [adminInput, setAdminInput] = useState("");
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [status, setStatus] = useState({ text: "Iniciando", mode: "" });
  const [usingApi, setUsingApi] = useState(true);
  const [toast, setToast] = useState(null);
  const activeMatches = useMemo(() => getActiveMatches(state), [state]);

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
    if (savedPin) {
      verifyAdminPin(savedPin);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const leaderboard = useMemo(() => {
    return Object.keys(state.players)
      .map((name) => {
        const picks = state.predictions[name] || {};
        return {
          name,
          points: playerScore(name, state, activeMatches),
          picks: Object.keys(picks).length
        };
      })
      .sort((a, b) => b.points - a.points || b.picks - a.picks || a.name.localeCompare(b.name));
  }, [state, activeMatches]);

  const prizeAmount = Object.keys(state.players).length * 100;
  const currentSessionActive = Boolean(currentPlayer && playerSession?.token && state.players[currentPlayer]);
  const previousWinner = state.meta?.previousWinner;

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
      setStatus({ text: data.storage === "kv" ? "En línea" : "Servidor local", mode: data.storage === "kv" ? "online" : "local" });
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
        if (action === "prediction") {
          setStatus({ text: "Pronóstico guardado", mode: "online" });
        }
        return true;
      } catch (error) {
        setStatus({ text: error.message, mode: "error" });
        return false;
      }
    }

    setStatus({ text: "Guardando", mode: "loading" });
    try {
      const data = await apiFetch({
        method: "POST",
        headers: playerSession?.token ? { Authorization: `Bearer ${playerSession.token}` } : {},
        body: JSON.stringify({ action, payload })
      });
      setState(normalizeState(data.state));
      setStatus({ text: action === "prediction" ? "Pronóstico guardado" : "En línea", mode: "online" });
      return true;
    } catch (error) {
      setStatus({ text: error.message, mode: "error" });
      return false;
    }
  }

  async function savePrediction(match, home, away, advances) {
    const saved = await saveState("prediction", { name: currentPlayer, matchId: match.id, home, away, advances });
    if (!saved) return;
    setToast({
      title: "Pronóstico guardado",
      message: `${match.home} ${home}-${away} ${match.away}${advances ? ` | Clasifica ${teamNameBySide(match, advances)}` : ""}`,
      detail: "Guardado exitosamente."
    });
  }

  async function saveResult(matchId, home, away, advances) {
    return saveAdminAction("result", { matchId, home, away, advances });
  }

  async function saveMatchTeams(matchId, home, away) {
    return saveAdminAction("match", { matchId, home, away });
  }

  async function saveAdminAction(action, payload) {
    if (!usingApi) {
      return saveState(action, payload);
    }

    setStatus({ text: "Guardando", mode: "loading" });
    try {
      const data = await apiFetch({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Pin": adminPin
        },
        body: JSON.stringify({ action, payload })
      });
      setState(normalizeState(data.state));
      setStatus({ text: "En línea", mode: "online" });
    } catch (error) {
      setStatus({ text: error.message, mode: "error" });
    }
  }

  async function handlePlayerSubmit(event) {
    event.preventDefault();
    await handlePlayerAuth("login");
  }

  async function handlePlayerAuth(action) {
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
      setStatus({ text: "En sesión", mode: "online" });
    } catch (error) {
      setStatus({ text: error.message, mode: "error" });
    }
  }

  function handlePlayerLogout() {
    setCurrentPlayer("");
    setPlayerSession(null);
    sessionStorage.removeItem(sessionKey);
  }

  async function handleCloseQuiniela(winnerName) {
    await saveAdminAction("close-current", { winnerName });
  }

  function handleAdminSubmit(event) {
    event.preventDefault();
    const pin = adminInput.trim();
    verifyAdminPin(pin);
  }

  async function verifyAdminPin(pin) {
    const cleanPin = pin.trim();
    if (!cleanPin) return;

    if (!usingApi) {
      const allowed = cleanPin === "180799";
      setAdminAuthorized(allowed);
      setAdminPin(allowed ? cleanPin : "");
      if (allowed) {
        setAdminError("");
        sessionStorage.setItem(adminKey, cleanPin);
      } else {
        setAdminError("PIN incorrecto");
        sessionStorage.removeItem(adminKey);
        setStatus({ text: "PIN incorrecto", mode: "error" });
      }
      return;
    }

    setStatus({ text: "Validando PIN", mode: "loading" });
    setAdminError("");
    try {
      await apiFetch({
        method: "POST",
        headers: { "X-Admin-Pin": cleanPin },
        body: JSON.stringify({ action: "admin-login" })
      });
      setAdminAuthorized(true);
      setAdminPin(cleanPin);
      setAdminError("");
      sessionStorage.setItem(adminKey, cleanPin);
      setStatus({ text: "Admin autorizado", mode: "online" });
    } catch (error) {
      setAdminAuthorized(false);
      setAdminPin("");
      setAdminError(error.message);
      sessionStorage.removeItem(adminKey);
      setStatus({ text: error.message, mode: "error" });
    }
  }

  const adminUnlocked = view !== "admin" || adminAuthorized;

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
              <h2 id="playerTitle">Tus pronósticos</h2>
            </div>
          </div>

          {currentPlayer && playerSession?.token ? (
            <div className="session-bar">
              {currentSessionActive ? (
                <>
                  <span>Jugando como <strong>{currentPlayer}</strong></span>
                  <button className="ghost-button" type="button" onClick={handlePlayerLogout}>Salir</button>
                </>
              ) : (
                <>
                  <span>Tu cuenta anterior pertenece a la quiniela cerrada.</span>
                  <button className="ghost-button" type="button" onClick={handlePlayerLogout}>Entrar de nuevo</button>
                </>
              )}
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
                <label htmlFor="playerPassword">Contraseña</label>
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
                    <button type="submit">Entrar</button>
                    <button className="ghost-button" type="button" onClick={() => handlePlayerAuth("register")}>Crear cuenta</button>
                  </div>
                </div>
              </form>

              <div className="notice">Entra o crea tu cuenta para guardar tus marcadores.</div>
            </>
          )}
          {previousWinner && <WinnerBanner winner={previousWinner} />}
          <section className="rules-panel" aria-label="Sistema de puntos">
            <h3>Sistema de puntos</h3>
            <div className="rules-grid">
              <span><strong>3 pts</strong> marcador exacto</span>
              <span><strong>1 pt</strong> ganador, clasificado o empate correcto</span>
              <span><strong>+1 pt</strong> clasificado por penales correcto</span>
              <span><strong>0 pts</strong> sin coincidencia</span>
            </div>
            <p className="rules-note">Máximo por partido: 4 pts.</p>
          </section>
          <div className="match-list">
            {activeMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                pick={(state.predictions[currentPlayer] || {})[match.id]}
                result={state.results[match.id]}
                onSave={(home, away, advances) => savePrediction(match, home, away, advances)}
                canSave={currentSessionActive}
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
            {previousWinner && <WinnerBanner winner={previousWinner} />}
            {view === "standings" && <Podium rows={leaderboard} />}
            {view === "standings" && <PrizeBanner amount={prizeAmount} players={Object.keys(state.players).length} />}
            <div className="leaderboard">
              {leaderboard.length ? (
                leaderboard.map((row, index) => (
                  <div className="leader-row" key={row.name}>
                    <span className="leader-rank">{index + 1}</span>
                    <span>
                      <strong>{row.name}</strong>
                      <span className="leader-subtext">{row.picks} pronósticos</span>
                    </span>
                    <span className="leader-points">{row.points} pts</span>
                  </div>
                ))
              ) : (
                <div className="empty-state">Todavía no hay participantes.</div>
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
                    onChange={(event) => {
                      setAdminInput(event.target.value);
                      setAdminError("");
                    }}
                    autoFocus
                  />
                  <button type="submit">Entrar</button>
                </div>
                {adminError && <div className="empty-state">{adminError}</div>}
              </form>
            ) : (
              <>
                <AdminQuinielaControl
                  phase={state.meta?.phase}
                  winner={previousWinner}
                  leaderboard={leaderboard}
                  onClose={handleCloseQuiniela}
                />
                <div className="admin-results">
                  {activeMatches.map((match) => (
                    <AdminCard
                      key={match.id}
                      match={match}
                      result={state.results[match.id]}
                      canEditTeams={state.meta?.phase === "knockout"}
                      onSave={saveResult}
                      onSaveTeams={saveMatchTeams}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
          )}
        </aside>
      </main>
      {toast && (
        <div className="toast-region" role="status" aria-live="polite">
          <div className="save-toast">
            <span>{toast.title}</span>
            <strong>{toast.message}</strong>
            <small>{toast.detail}</small>
            <button className="toast-close" type="button" aria-label="Cerrar notificación" onClick={() => setToast(null)}>
              x
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MatchCard({ match, pick, result, onSave, canSave }) {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [advances, setAdvances] = useState("");

  useEffect(() => {
    setHome(pick ? pick.home : "");
    setAway(pick ? pick.away : "");
    setAdvances(pick?.advances || "");
  }, [pick]);

  const teamsPending = match.teamsConfirmed === false;
  const loginRequired = !canSave;
  const locked = hasMatchStarted(match) || teamsPending || loginRequired;
  const predictedDraw = home !== "" && away !== "" && Number(home) === Number(away);
  const showPenaltySelector = predictedDraw && !locked;
  const saveButtonText = loginRequired ? "Inicia sesión" : teamsPending ? "Por definir" : locked ? "Cerrado" : "Guardar";

  function handleSave() {
    if (!canSave || locked || home === "" || away === "") return;
    if (predictedDraw && !advances) return;
    onSave(home, away, predictedDraw ? advances : "");
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
        {!showPenaltySelector && (
          <button className="save-pick" type="button" onClick={handleSave} disabled={locked}>
            {saveButtonText}
          </button>
        )}
      </div>
      {showPenaltySelector && (
        <>
          <PenaltySelector
            label="Si empatan, ¿quién clasifica por penales?"
            match={match}
            value={advances}
            onChange={setAdvances}
          />
          <button className="save-pick save-pick-after-penalties" type="button" onClick={handleSave}>
            {saveButtonText}
          </button>
        </>
      )}
      <div className="result-line">
        {result
          ? `Resultado: ${result.home}-${result.away}${result.advances ? ` | Clasificó ${teamNameBySide(match, result.advances)} por penales` : ""} | Tus puntos: ${scorePrediction(pick, result)}`
          : predictedDraw && !advances && !locked
            ? "Selecciona quién clasifica por penales para guardar este empate."
          : loginRequired
            ? "Debes iniciar sesión antes de meter pronósticos."
          : teamsPending
            ? "Equipos por definir. Pronóstico pendiente"
          : locked
            ? "Pronóstico cerrado. Resultado pendiente"
            : "Resultado pendiente"}
      </div>
    </article>
  );
}

function AdminQuinielaControl({ phase, winner, leaderboard, onClose }) {
  const leader = leaderboard[0];
  const [winnerName, setWinnerName] = useState("");

  useEffect(() => {
    setWinnerName(leader?.name || "");
  }, [leader?.name]);

  function handleClose() {
    const name = normalizeName(winnerName || leader?.name || "");
    if (!name) return;
    onClose(name);
  }

  return (
    <section className="admin-control" aria-label="Control de quiniela">
      <div>
        <h3>{phase === "knockout" ? "Quiniela de eliminatoria activa" : "Cerrar quiniela actual"}</h3>
        <p className="empty-state">
          {phase === "knockout"
            ? "Ya puedes capturar manualmente los cruces de la eliminatoria a la final."
            : "Guarda el ganador actual e inicia una nueva quiniela desde la fase eliminatoria."}
        </p>
      </div>
      {winner ? (
        <WinnerBanner winner={winner} compact />
      ) : (
        <div className="close-quiniela-form">
          <label htmlFor="winnerName">Ganador de esta quiniela</label>
          <div className="inline-fields">
            <input
              id="winnerName"
              value={winnerName}
              onChange={(event) => setWinnerName(event.target.value)}
              placeholder="Nombre del ganador"
            />
            <button type="button" onClick={handleClose}>Cerrar e iniciar eliminatoria</button>
          </div>
        </div>
      )}
    </section>
  );
}

function WinnerBanner({ winner, compact = false }) {
  return (
    <div className={compact ? "winner-banner winner-banner-compact" : "winner-banner"}>
      <span>Ganador de la quiniela anterior</span>
      <strong>{winner.name}</strong>
      <small>Tuvieron 59 puntos</small>
    </div>
  );
}

function AdminCard({ match, result, canEditTeams, onSave, onSaveTeams }) {
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [advances, setAdvances] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");

  useEffect(() => {
    setHome(result ? result.home : "");
    setAway(result ? result.away : "");
    setAdvances(result?.advances || "");
  }, [result]);

  useEffect(() => {
    setHomeTeam(match.home || "");
    setAwayTeam(match.away || "");
  }, [match.home, match.away]);

  function handleSave() {
    if (home === "" || away === "") return;
    if (resultDraw && !advances) return;
    onSave(match.id, home, away, resultDraw ? advances : "");
  }

  function handleSaveTeams() {
    if (!canEditTeams || !homeTeam.trim() || !awayTeam.trim()) return;
    onSaveTeams(match.id, homeTeam, awayTeam);
  }

  const resultDraw = home !== "" && away !== "" && Number(home) === Number(away);

  return (
    <article className="admin-card">
      <h3><span className="flag-icon">{flagForTeam(match.home)}</span>{match.home} vs <span className="flag-icon">{flagForTeam(match.away)}</span>{match.away}</h3>
      <div className="match-meta">{`${match.group} | ${formatMatchDate(match.date)}`}</div>
      {canEditTeams && (
        <div className="admin-teams-row">
          <label>
            <span><span className="flag-icon">{flagForTeam(homeTeam)}</span>Equipo local</span>
            <input value={homeTeam} onChange={(event) => setHomeTeam(event.target.value)} />
          </label>
          <label>
            <span><span className="flag-icon">{flagForTeam(awayTeam)}</span>Equipo visitante</span>
            <input value={awayTeam} onChange={(event) => setAwayTeam(event.target.value)} />
          </label>
          <button type="button" onClick={handleSaveTeams}>Guardar equipos</button>
        </div>
      )}
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
      {resultDraw && (
        <>
          <PenaltySelector
            label="Clasificado por penales"
            match={match}
            value={advances}
            onChange={setAdvances}
          />
          {!advances && <div className="result-line">Selecciona quién clasificó por penales para guardar este empate.</div>}
        </>
      )}
    </article>
  );
}

function PenaltySelector({ label, match, value, onChange }) {
  return (
    <fieldset className="penalty-selector">
      <legend>{label}</legend>
      <label>
        <input
          type="radio"
          name={`${match.id}-advances`}
          value="home"
          checked={value === "home"}
          onChange={(event) => onChange(event.target.value)}
        />
        <span><span className="flag-icon">{flagForTeam(match.home)}</span>{match.home}</span>
      </label>
      <label>
        <input
          type="radio"
          name={`${match.id}-advances`}
          value="away"
          checked={value === "away"}
          onChange={(event) => onChange(event.target.value)}
        />
        <span><span className="flag-icon">{flagForTeam(match.away)}</span>{match.away}</span>
      </label>
    </fieldset>
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
  let points = 0;

  if (pickHome === realHome && pickAway === realAway) {
    points = 3;
  } else if (winner(prediction) === winner(result) || predictedWinnerMatchesAdvancingTeam(prediction, result)) {
    points = 1;
  }

  if (pickHome === pickAway && realHome === realAway && prediction.advances && prediction.advances === result.advances) {
    points += 1;
  }

  return points;
}

function playerScore(name, state, matchList) {
  const picks = state.predictions[name] || {};
  return matchList.reduce((total, match) => total + scorePrediction(picks[match.id], state.results[match.id]), 0);
}

function predictedWinnerMatchesAdvancingTeam(prediction, result) {
  const predictedWinner = winner(prediction);
  const realWinner = winner(result);
  if (realWinner === "draw" && result.advances) return predictedWinner === result.advances;
  if (predictedWinner === "draw" && prediction.advances) return prediction.advances === realWinner;
  return false;
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
  const phase = state?.meta?.phase || "groups";
  const stateMatches = Array.isArray(state?.matches) ? state.matches : [];
  return {
    players: state?.players || {},
    predictions: state?.predictions || {},
    results: state?.results || {},
    matches: phase === "knockout" ? reconcileKnockoutMatches(stateMatches) : stateMatches,
    meta: {
      phase,
      previousWinner: state?.meta?.previousWinner || null
    }
  };
}

function mergeState(apiState, localState) {
  return {
    players: { ...(apiState?.players || {}), ...(localState?.players || {}) },
    predictions: { ...(apiState?.predictions || {}), ...(localState?.predictions || {}) },
    results: { ...(apiState?.results || {}), ...(localState?.results || {}) },
    matches: localState?.matches?.length ? localState.matches : apiState?.matches || [],
    meta: { ...(apiState?.meta || {}), ...(localState?.meta || {}) }
  };
}

function applyMutation(state, action, payload, adminPin) {
  if (action === "join") {
    state.players[payload.name] = { name: payload.name, joinedAt: new Date().toISOString() };
    state.predictions[payload.name] = state.predictions[payload.name] || {};
  }

  if (action === "prediction") {
    const match = getActiveMatches(state).find((item) => item.id === payload.matchId);
    if (!match) throw new Error("Partido no valido");
    if (match.teamsConfirmed === false) throw new Error("Los equipos aún no están definidos");
    if (hasMatchStarted(match)) throw new Error("El partido ya empezó");
    state.players[payload.name] = state.players[payload.name] || { name: payload.name, joinedAt: new Date().toISOString() };
    state.predictions[payload.name] = state.predictions[payload.name] || {};
    state.predictions[payload.name][payload.matchId] = {
      home: Number(payload.home),
      away: Number(payload.away),
      advances: normalizeAdvances(payload.advances, payload.home, payload.away),
      updatedAt: new Date().toISOString()
    };
  }

  if (action === "result") {
    if (adminPin !== "180799") throw new Error("PIN incorrecto en modo local");
    state.results[payload.matchId] = {
      home: Number(payload.home),
      away: Number(payload.away),
      advances: normalizeAdvances(payload.advances, payload.home, payload.away),
      updatedAt: new Date().toISOString()
    };
  }

  if (action === "match") {
    if (adminPin !== "180799") throw new Error("PIN incorrecto en modo local");
    updateMatchTeams(state, payload);
  }

  if (action === "close-current") {
    if (adminPin !== "180799") throw new Error("PIN incorrecto en modo local");
    const winnerName = normalizeName(payload.winnerName || "");
    if (!winnerName) throw new Error("Ganador inválido");
    state.players = {};
    state.predictions = {};
    state.results = {};
    state.matches = createKnockoutMatches();
    state.meta = {
      phase: "knockout",
      previousWinner: {
        name: winnerName,
        points: 59,
        closedAt: new Date().toISOString()
      }
    };
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getActiveMatches(state) {
  if (state?.meta?.phase === "knockout") {
    return state.matches?.length ? state.matches : createKnockoutMatches();
  }
  return matches;
}

function createKnockoutMatches() {
  return matches
    .filter((match) => !match.group.startsWith("Grupo"))
    .map((match) => ({ ...match }));
}

function reconcileKnockoutMatches(stateMatches) {
  const officialMatches = createKnockoutMatches();
  return officialMatches.map((match) => {
    const savedMatch = stateMatches.find((item) => item.id === match.id);
    if (!savedMatch) return match;
    return {
      ...match,
      home: savedMatch.home || match.home,
      away: savedMatch.away || match.away,
      teamsConfirmed: savedMatch.teamsConfirmed ?? match.teamsConfirmed
    };
  });
}

function updateMatchTeams(state, payload) {
  const matchList = state.matches?.length ? state.matches : createKnockoutMatches();
  const match = matchList.find((item) => item.id === payload.matchId);
  if (!match) throw new Error("Partido no valido");
  const home = normalizeName(payload.home || "");
  const away = normalizeName(payload.away || "");
  if (!home || !away) throw new Error("Equipos inválidos");
  match.home = home;
  match.away = away;
  match.teamsConfirmed = true;
  state.matches = matchList;
}

function normalizeAdvances(advances, home, away) {
  if (Number(home) !== Number(away)) return null;
  if (advances !== "home" && advances !== "away") throw new Error("Selecciona quién clasifica por penales");
  return advances;
}

function teamNameBySide(match, side) {
  if (side === "home") return match.home;
  if (side === "away") return match.away;
  return "";
}
