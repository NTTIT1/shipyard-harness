/* Seed a logged-in session into a lane's playwright-qa-dev Chromium profile,
 * WITHOUT ever surfacing the password to an agent's context. Driven by
 * lane-qa-login.sh, which passes credentials via env (sourced from the lane's
 * git-excluded .harness-qa.env). Strategy: authenticate against the deployment's
 * login API, then plant the returned tokens into the profile's localStorage
 * (the exact keys the app reads — set QA_TOKEN_KEY / QA_REFRESH_KEY /
 * QA_ORG_KEY in your profile.env), which persists in the user-data-dir so the
 * MCP browser opens already logged in.
 *
 * Works for any deployment (dev site or a lane's local stack):
 * API_BASE is the origin serving the login endpoint; APP_ORIGIN is the web
 * origin whose localStorage holds the session (same for dev, different ports
 * for local).
 *
 * Env: FRONTEND_DIR USER_DATA_DIR API_BASE APP_ORIGIN EMAIL PASSWORD
 *      QA_LOGIN_PATH QA_ORGS_PATH QA_TOKEN_KEY QA_REFRESH_KEY QA_ORG_KEY
 * Never logs the password or tokens. Exit 0 on success.
 */
const { createRequire } = require("module");

const FRONTEND_DIR = process.env.FRONTEND_DIR;
const USER_DATA_DIR = process.env.USER_DATA_DIR;
const API_BASE = (process.env.API_BASE || "").replace(/\/$/, "");
const APP_ORIGIN = (process.env.APP_ORIGIN || API_BASE).replace(/\/$/, "");
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const TOKEN_KEY = process.env.QA_TOKEN_KEY || "access_token";
const REFRESH_TOKEN_KEY = process.env.QA_REFRESH_KEY || "refresh_token";
const ORG_KEY = process.env.QA_ORG_KEY || "";           // empty = app keeps no org id in localStorage
const LOGIN_PATH = process.env.QA_LOGIN_PATH || "/api/v1/auth/login";
const ORGS_PATH = process.env.QA_ORGS_PATH || "/api/v1/organizations";

function fail(msg) {
  console.error("lane-qa-login: " + msg);
  process.exit(1);
}

(async () => {
  if (!FRONTEND_DIR || !USER_DATA_DIR) fail("FRONTEND_DIR and USER_DATA_DIR are required");
  if (!EMAIL || !PASSWORD) fail("EMAIL and PASSWORD are required (check the lane's .harness-qa.env)");

  // 1. Authenticate against the dev API (password stays here, never returned to a caller).
  let tokens;
  try {
    const res = await fetch(`${API_BASE}${LOGIN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (res.status === 401 || res.status === 400) fail(`login rejected for ${EMAIL} (account missing or wrong password)`);
    if (!res.ok) fail(`login HTTP ${res.status} for ${EMAIL}`);
    tokens = await res.json();
  } catch (e) {
    fail(`login request failed: ${e.message}`);
  }
  if (!tokens || !tokens.access_token) fail("login response had no access_token");

  // 2. Best-effort: resolve the active org id (non-fatal; skipped entirely when
  // the profile sets no QA_ORG_KEY — the app then derives it itself).
  let orgId = "";
  if (ORG_KEY) {
    try {
      const r = await fetch(`${API_BASE}${ORGS_PATH}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (r.ok) {
        const j = await r.json();
        const list = Array.isArray(j) ? j : j.items || j.organizations || [];
        if (list[0] && list[0].id) orgId = String(list[0].id);
      }
    } catch { /* non-fatal */ }
  }

  // 3. Plant the tokens into the profile's localStorage and persist.
  const req = createRequire(FRONTEND_DIR + "/package.json");
  const { chromium } = req("@playwright/test");
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(USER_DATA_DIR, { headless: true });
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.addInitScript(
      ([k1, v1, k2, v2, k3, v3]) => {
        localStorage.setItem(k1, v1);
        localStorage.setItem(k2, v2);
        if (k3 && v3) localStorage.setItem(k3, v3);
      },
      [TOKEN_KEY, tokens.access_token, REFRESH_TOKEN_KEY, tokens.refresh_token || "", ORG_KEY, orgId],
    );
    await page.goto(APP_ORIGIN, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500); // let the SPA boot and accept the session
    const planted = await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY);
    if (!planted) fail("token did not persist in the profile (app may have rejected it)");
    await ctx.close(); // flushes localStorage into the user-data-dir
  } catch (e) {
    try { if (ctx) await ctx.close(); } catch { /* ignore */ }
    fail(`seeding the profile failed: ${e.message}`);
  }

  console.log(`lane-qa-login: ${EMAIL} session seeded into ${USER_DATA_DIR}${orgId ? " (org set)" : ""}`);
})();
