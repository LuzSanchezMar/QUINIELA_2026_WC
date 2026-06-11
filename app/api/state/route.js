import { matches } from "../../../lib/matches";

const initialState = {
  players: {},
  predictions: {},
  results: {}
};

const key = "quiniela-2026-state";

export async function GET() {
  const state = await readState();
  const synced = await syncRealResults(state);
  if (synced) await writeState(state);
  return json({ state, storage: hasKv() ? "kv" : "memory" });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const payload = body.payload || {};
  const state = await readState();

  try {
    mutate(state, action, payload, request.headers.get("x-admin-pin"));
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  await writeState(state);
  return json({ state, storage: hasKv() ? "kv" : "memory" });
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function mutate(state, action, payload, adminPin) {
  if (action === "join") {
    const name = normalizeName(payload.name);
    requireName(name);
    state.players[name] = state.players[name] || { name, joinedAt: new Date().toISOString() };
    state.predictions[name] = state.predictions[name] || {};
    return;
  }

  if (action === "prediction") {
    const name = normalizeName(payload.name);
    requireName(name);
    requireScore(payload.home, payload.away);
    requireOpenMatch(payload.matchId);
    state.players[name] = state.players[name] || { name, joinedAt: new Date().toISOString() };
    state.predictions[name] = state.predictions[name] || {};
    state.predictions[name][payload.matchId] = {
      home: Number(payload.home),
      away: Number(payload.away),
      updatedAt: new Date().toISOString()
    };
    return;
  }

  if (action === "result") {
    const expectedPin = process.env.ADMIN_PIN || "1234";
    if (!adminPin || adminPin !== expectedPin) throw new Error("PIN incorrecto");
    requireScore(payload.home, payload.away);
    state.results[payload.matchId] = {
      home: Number(payload.home),
      away: Number(payload.away),
      updatedAt: new Date().toISOString()
    };
    return;
  }

  throw new Error("Accion no valida");
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function requireName(name) {
  if (!name || name.length > 60) throw new Error("Nombre invalido");
}

function requireScore(home, away) {
  const homeScore = Number(home);
  const awayScore = Number(away);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) throw new Error("Marcador invalido");
  if (homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20) throw new Error("Marcador fuera de rango");
}

function requireOpenMatch(matchId) {
  const match = matches.find((item) => item.id === matchId);
  if (!match) throw new Error("Partido no valido");
  if (match.teamsConfirmed === false) throw new Error("Los equipos aun no estan definidos");
  if (Date.now() >= new Date(match.date).getTime()) throw new Error("El partido ya empezo");
}

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readState() {
  if (!hasKv()) return clone(initialState);

  const result = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`
    },
    cache: "no-store"
  });

  if (!result.ok) return clone(initialState);
  const data = await result.json();
  if (!data.result) return clone(initialState);

  try {
    return JSON.parse(data.result);
  } catch {
    return clone(initialState);
  }
}

async function writeState(state) {
  if (!hasKv()) return;

  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "text/plain"
    },
    body: JSON.stringify(state)
  });
}

async function syncRealResults(state) {
  if (!process.env.RESULTS_API_URL) return false;

  try {
    const response = await fetch(process.env.RESULTS_API_URL, {
      headers: process.env.RESULTS_API_TOKEN
        ? { Authorization: `Bearer ${process.env.RESULTS_API_TOKEN}` }
        : {},
      cache: "no-store"
    });
    if (!response.ok) return false;

    const data = await response.json();
    const results = Array.isArray(data) ? data : data.results || data.matches || [];
    let changed = false;

    for (const item of results) {
      const matchId = item.matchId || item.id;
      const home = item.homeScore ?? item.home ?? item.score?.home;
      const away = item.awayScore ?? item.away ?? item.score?.away;
      const status = String(item.status || item.state || "").toLowerCase();
      const finished = item.finished === true || ["finished", "final", "ft", "full_time"].includes(status);

      if (!finished || !matchId || home === undefined || away === undefined) continue;
      const match = matches.find((entry) => entry.id === matchId);
      if (!match) continue;
      requireScore(home, away);

      const current = state.results[matchId];
      if (!current || Number(current.home) !== Number(home) || Number(current.away) !== Number(away)) {
        state.results[matchId] = {
          home: Number(home),
          away: Number(away),
          updatedAt: new Date().toISOString(),
          source: "auto"
        };
        changed = true;
      }
    }

    return changed;
  } catch {
    return false;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
