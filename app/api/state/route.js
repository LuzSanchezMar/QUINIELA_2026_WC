import { matches } from "../../../lib/matches";

const initialState = {
  players: {},
  predictions: {},
  results: {},
  matches: [],
  meta: {
    phase: "groups",
    previousWinner: null
  }
};

const key = "quiniela-2026-state";
globalThis.__quinielaMemoryState = globalThis.__quinielaMemoryState || clone(initialState);

export async function GET() {
  const state = normalizeState(await readState());
  const synced = await syncRealResults(state);
  if (synced) await writeState(state);
  return json({ state: publicState(state), storage: hasKv() ? "kv" : "memory" });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const payload = body.payload || {};
  const state = normalizeState(await readState());

  try {
    const result = await mutate(state, action, payload, request);
    await writeState(state);
    return json({ state: publicState(state), storage: hasKv() ? "kv" : "memory", ...result });
  } catch (error) {
    return json({ error: error.message }, 400);
  }
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

async function mutate(state, action, payload, request) {
  if (action === "admin-login") {
    requireAdminPin(request.headers.get("x-admin-pin"));
    return { admin: true };
  }

  if (action === "register") {
    const name = normalizeName(payload.name);
    requireName(name);
    requirePassword(payload.password);
    if (state.players[name]?.passwordHash) throw new Error("Ese nombre ya está registrado");
    const password = await hashPassword(payload.password);
    state.players[name] = {
      ...(state.players[name] || {}),
      name,
      joinedAt: state.players[name]?.joinedAt || new Date().toISOString(),
      passwordHash: password.hash,
      passwordSalt: password.salt
    };
    state.predictions[name] = state.predictions[name] || {};
    return { session: await createSession(name) };
  }

  if (action === "login") {
    const name = normalizeName(payload.name);
    requireName(name);
    requirePassword(payload.password);
    const player = state.players[name];
    if (!player?.passwordHash || !(await verifyPassword(payload.password, player.passwordSalt, player.passwordHash))) {
      throw new Error("Nombre o contraseña incorrectos");
    }
    return { session: await createSession(name) };
  }

  if (action === "prediction") {
    const session = await verifySession(request.headers.get("authorization"));
    const name = normalizeName(session.name);
    requireName(name);
    requireScore(payload.home, payload.away);
    requireOpenMatch(state, payload.matchId);
    if (!state.players[name]) throw new Error("Participante no registrado");
    state.predictions[name] = state.predictions[name] || {};
    state.predictions[name][payload.matchId] = {
      home: Number(payload.home),
      away: Number(payload.away),
      updatedAt: new Date().toISOString()
    };
    return;
  }

  if (action === "result") {
    requireAdminPin(request.headers.get("x-admin-pin"));
    requireScore(payload.home, payload.away);
    state.results[payload.matchId] = {
      home: Number(payload.home),
      away: Number(payload.away),
      updatedAt: new Date().toISOString()
    };
    return;
  }

  if (action === "match") {
    requireAdminPin(request.headers.get("x-admin-pin"));
    updateMatchTeams(state, payload);
    return;
  }

  if (action === "close-current") {
    requireAdminPin(request.headers.get("x-admin-pin"));
    const winnerName = normalizeName(payload.winnerName);
    requireName(winnerName);
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
    return;
  }

  throw new Error("Acción no válida");
}

function requireAdminPin(adminPin) {
  const expectedPin = process.env.ADMIN_PIN || "180799";
  if (!adminPin || adminPin !== expectedPin) throw new Error("PIN incorrecto");
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function requireName(name) {
  if (!name || name.length > 60) throw new Error("Nombre inválido");
}

function requireScore(home, away) {
  const homeScore = Number(home);
  const awayScore = Number(away);
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) throw new Error("Marcador inválido");
  if (homeScore < 0 || awayScore < 0 || homeScore > 20 || awayScore > 20) throw new Error("Marcador fuera de rango");
}

function requirePassword(password) {
  if (typeof password !== "string" || password.length < 4 || password.length > 80) {
    throw new Error("La contraseña debe tener entre 4 y 80 caracteres");
  }
}

function requireOpenMatch(state, matchId) {
  const match = getActiveMatches(state).find((item) => item.id === matchId);
  if (!match) throw new Error("Partido no válido");
  if (match.teamsConfirmed === false) throw new Error("Los equipos aún no están definidos");
  if (Date.now() >= new Date(match.date).getTime()) throw new Error("El partido ya empezó");
}

function hasKv() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function publicState(state) {
  return {
    players: Object.fromEntries(
      Object.entries(state.players || {}).map(([name, player]) => [
        name,
        {
          name: player.name,
          joinedAt: player.joinedAt
        }
      ])
    ),
    predictions: state.predictions || {},
    results: state.results || {},
    matches: state.matches || [],
    meta: state.meta || initialState.meta
  };
}

async function readState() {
  if (!hasKv()) return clone(globalThis.__quinielaMemoryState);

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
  if (!hasKv()) {
    globalThis.__quinielaMemoryState = clone(state);
    return;
  }

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
      const match = getActiveMatches(state).find((entry) => entry.id === matchId);
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

function normalizeState(state) {
  return {
    players: state?.players || {},
    predictions: state?.predictions || {},
    results: state?.results || {},
    matches: Array.isArray(state?.matches) ? state.matches : [],
    meta: {
      phase: state?.meta?.phase || "groups",
      previousWinner: state?.meta?.previousWinner || null
    }
  };
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

function updateMatchTeams(state, payload) {
  const matchList = state.matches?.length ? state.matches : createKnockoutMatches();
  const match = matchList.find((item) => item.id === payload.matchId);
  if (!match) throw new Error("Partido no valido");
  const home = normalizeName(payload.home);
  const away = normalizeName(payload.away);
  requireName(home);
  requireName(away);
  match.home = home;
  match.away = away;
  match.teamsConfirmed = true;
  state.matches = matchList;
}

function playerScore(name, state, matchList) {
  const picks = state.predictions[name] || {};
  return matchList.reduce((total, match) => total + scorePrediction(picks[match.id], state.results[match.id]), 0);
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

function winner(score) {
  if (!score) return null;
  if (Number(score.home) > Number(score.away)) return "home";
  if (Number(score.home) < Number(score.away)) return "away";
  return "draw";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function hashPassword(password, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey("raw", encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(salt),
      iterations: 120000
    },
    key,
    256
  );

  return {
    salt,
    hash: bytesToBase64Url(new Uint8Array(bits))
  };
}

async function verifyPassword(password, salt, expectedHash) {
  const passwordHash = await hashPassword(password, salt);
  return timingSafeEqual(passwordHash.hash, expectedHash);
}

async function createSession(name) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 30;
  const payload = bytesToBase64Url(encode(JSON.stringify({ name, expiresAt, nonce: randomToken(12) })));
  const signature = await sign(payload);
  return {
    name,
    token: `${payload}.${signature}`,
    expiresAt
  };
}

async function verifySession(header) {
  const token = String(header || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Sesión requerida");
  const [payload, signature] = parts;
  if (!timingSafeEqual(await sign(payload), signature)) throw new Error("Sesión inválida");
  const { name, expiresAt } = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
  if (!name || Number(expiresAt) < Date.now()) throw new Error("Sesión expirada");
  return { name };
}

async function sign(value) {
  const key = await crypto.subtle.importKey("raw", encode(sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function sessionSecret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_PIN || "quiniela-local-secret";
}

function randomToken(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function encode(value) {
  return new TextEncoder().encode(value);
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
