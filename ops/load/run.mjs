// Load test for a running DPMS API with the SYNTHETIC dataset from seed.cjs.
//   API_URL=http://localhost:4100 node ops/load/run.mjs
// Reports latency percentiles per scenario and compares them with PROPOSED targets (not client-approved).
// A single-process Node client on a developer machine: indicative only, not a capacity statement.
const API = process.env.API_URL ?? 'http://localhost:4100';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3100';
const EMAIL = process.env.LOAD_EMAIL ?? 'owner@load.invalid';
const PASSWORD = process.env.LOAD_PASSWORD ?? 'Load-Synthetic-Passw0rd!';
const DURATION_S = Number(process.env.LOAD_DURATION ?? 10);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 20);

async function login() {
  const r = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];

async function scenario(name, target, fn) {
  const lat = []; let errors = 0; const end = Date.now() + DURATION_S * 1000;
  const worker = async () => {
    while (Date.now() < end) {
      const t = performance.now();
      try { const r = await fn(); if (!r.ok) errors++; await r.arrayBuffer(); } catch { errors++; }
      lat.push(performance.now() - t);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  lat.sort((a, b) => a - b);
  const res = { name, requests: lat.length, rps: +(lat.length / DURATION_S).toFixed(1), errors,
    p50: +pct(lat, 50).toFixed(1), p95: +pct(lat, 95).toFixed(1), p99: +pct(lat, 99).toFixed(1), targetP95: target };
  res.pass = res.errors === 0 && res.p95 <= target;
  return res;
}

const cookie = await login();
const h = { cookie };
const from = new Date().toISOString(); const to = new Date(Date.now() + 7 * 86400_000).toISOString();
const names = ['Ann', 'Ben', 'Cara', 'Dan', 'Eve', 'Syntheticson', 'Testa', 'Mock'];
let i = 0;
const results = [];
// Targets are proposals for client approval (docs/21), in ms at p95 under CONCURRENCY parallel clients.
results.push(await scenario('patient search (name prefix)', 300, () => fetch(`${API}/api/v1/patients?q=${names[i++ % names.length]}`, { headers: h })));
results.push(await scenario('patient search (phone)', 300, () => fetch(`${API}/api/v1/patients?q=%2B2782100${String(i++ % 10)}`, { headers: h })));
results.push(await scenario('calendar read (7 days)', 400, () => fetch(`${API}/api/v1/appointments?from=${from}&to=${to}`, { headers: h })));
results.push(await scenario('authenticated read (me)', 150, () => fetch(`${API}/api/v1/auth/me`, { headers: h })));
// Login is deliberately slow (Argon2id) and rate limited; measured at low concurrency to size the cost, not to gate.
const loginRes = await (async () => {
  const lat = [];
  for (let n = 0; n < 5; n++) { const t = performance.now(); await login(); lat.push(performance.now() - t); }
  lat.sort((a, b) => a - b);
  return { name: 'login (Argon2id, sequential)', requests: 5, p50: +pct(lat, 50).toFixed(1), p95: +pct(lat, 95).toFixed(1), targetP95: 1000, pass: pct(lat, 95) <= 1000 };
})();
results.push(loginRes);
console.log(JSON.stringify({ api: API, concurrency: CONCURRENCY, durationS: DURATION_S, results }, null, 2));
process.exit(results.every((r) => r.pass) ? 0 : 1);
