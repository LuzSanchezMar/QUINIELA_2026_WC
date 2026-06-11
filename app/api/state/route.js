import { matches } from "../../../lib/matches";

const initialState = {
  players: {},
  predictions: {},
  results: {}
};

const key = "quiniela-2026-state";

export async function GET() {
  const state = await readState();
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
