const initialState = {
  players: {},
  predictions: {},
  results: {}
};

const key = "quiniela-2026-state";

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "GET") {
    const state = await readState();
    return response.status(200).json({ state, storage: hasKv() ? "kv" : "memory" });
  }

  if (request.method !== "POST") {
    return response.status(405).json({ error: "Metodo no permitido" });
  }

  const body = request.body || {};
  const action = body.action;
  const payload = body.payload || {};
  const state = await readState();

  try {
    mutate(state, action, payload, request.headers["x-admin-pin"]);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  await writeState(state);
  return response.status(200).json({ state, storage: hasKv() ? "kv" : "memory" });
};

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

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readState() {
  if (!hasKv()) return clone(initialState);

  const result = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`
    }
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
