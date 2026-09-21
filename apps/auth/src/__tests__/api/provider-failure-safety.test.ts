import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
const ORIGIN = new URL(BASE_URL).origin;
const simulationSecret = process.env.AUTH_TEST_SIMULATION_SECRET;

if (!simulationSecret) {
  throw new Error("AUTH_TEST_SIMULATION_SECRET must be supplied by run-api-tests.mjs");
}

const SIMULATION_SECRET: string = simulationSecret;

const csrfHeaders = {
  "Content-Type": "application/json",
  Origin: ORIGIN,
  "x-csrf-token": "test-csrf-token",
  Cookie: "nodiox_csrf_token=test-csrf-token",
};

function withSimulation(
  headers: Record<string, string>,
  ip: string,
  simValue: string
) {
  return {
    ...headers,
    "x-forwarded-for": ip,
    "x-test-simulate-error": simValue,
    "x-auth-test-simulation-secret": SIMULATION_SECRET,
  };
}

// Sensitive patterns that must never appear in any response body
const LEAK_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s]+/i,
  /supabase\.co/i,
  /upstash\.io/i,
  /resend\.com/i,
  /infobip\.com/i,
  /api_key\s*[=:]\s*\S+/i,
  /service_role\s*[=:]\s*\S+/i,
  /re_[a-zA-Z0-9]{6,}/,
  /ETIMEDOUT/,
  /ECONNREFUSED/,
  /connect\s+timeout/i,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  /\+\d{10,}/,
];

function assertNoLeaks(rawBody: string, context: string) {
  for (const pattern of LEAK_PATTERNS) {
    assert.doesNotMatch(
      rawBody,
      pattern,
      `[${context}] Response body leaked sensitive data matching ${pattern}`
    );
  }
}

function assertSafeJson(
  body: Record<string, unknown>,
  context: string
) {
  // Only { error, correlationId } should exist
  const keys = Object.keys(body);
  assert.ok(
    keys.includes("error"),
    `[${context}] Response must include 'error' field`
  );
  assert.ok(
    keys.includes("correlationId"),
    `[${context}] Response must include 'correlationId' field`
  );
  assert.strictEqual(
    keys.length,
    2,
    `[${context}] Response must contain exactly { error, correlationId }, found: ${keys.join(", ")}`
  );
}

// ---------------------------------------------------------------------------
// 1. Redis / Upstash failure simulation
// ---------------------------------------------------------------------------
describe("Provider Failure Safety: Redis (redis-down)", () => {
  test("login: redis-down returns 429 with safe message, no Redis internals", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: withSimulation(csrfHeaders, "198.51.100.100", "redis-down"),
      body: JSON.stringify({
        email: "redisdown@example.com",
        password: "Password123!",
      }),
    });

    assert.strictEqual(res.status, 429);
    const rawBody = await res.text();
    assertNoLeaks(rawBody, "login/redis-down");

    const body = JSON.parse(rawBody);
    assert.strictEqual(body.error, "Too many attempts. Please try again later.");
    assertSafeJson(body, "login/redis-down");
  });

  test("send-otp: redis-down returns 429 with safe message, no Redis internals", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: "POST",
      headers: withSimulation(csrfHeaders, "198.51.100.101", "redis-down"),
      body: JSON.stringify({
        email: "redisdown-otp@example.com",
      }),
    });

    assert.strictEqual(res.status, 429);
    const rawBody = await res.text();
    assertNoLeaks(rawBody, "send-otp/redis-down");

    const body = JSON.parse(rawBody);
    assert.strictEqual(body.error, "Too many attempts. Please try again later.");
    assertSafeJson(body, "send-otp/redis-down");
  });
});

// ---------------------------------------------------------------------------
// 2. Supabase failure simulation
// ---------------------------------------------------------------------------
describe("Provider Failure Safety: Supabase (supabase-down)", () => {
  test("login: supabase-down returns 500 with generic error, no DB URL or email leak", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: withSimulation(csrfHeaders, "198.51.100.110", "supabase-down"),
      body: JSON.stringify({
        email: "supadown@example.com",
        password: "Password123!",
      }),
    });

    assert.strictEqual(res.status, 500);
    const rawBody = await res.text();
    assertNoLeaks(rawBody, "login/supabase-down");

    const body = JSON.parse(rawBody);
    assert.strictEqual(body.error, "An unexpected error occurred");
    assertSafeJson(body, "login/supabase-down");
  });

  test("send-otp: supabase-down returns 500 with generic error, no DB URL leak", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: "POST",
      headers: withSimulation(csrfHeaders, "198.51.100.111", "supabase-down"),
      body: JSON.stringify({
        email: "supadown-otp@example.com",
      }),
    });

    assert.strictEqual(res.status, 500);
    const rawBody = await res.text();
    assertNoLeaks(rawBody, "send-otp/supabase-down");

    const body = JSON.parse(rawBody);
    assert.strictEqual(body.error, "An unexpected error occurred");
    assertSafeJson(body, "send-otp/supabase-down");
  });
});

// ---------------------------------------------------------------------------
// 3. Notification provider failure simulation
// ---------------------------------------------------------------------------
describe("Provider Failure Safety: Notification (notification-down)", () => {
  test("login: notification-down returns 500 with generic error, no API key or email leak", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: withSimulation(csrfHeaders, "198.51.100.120", "notification-down"),
      body: JSON.stringify({
        email: "notifdown@example.com",
        password: "Password123!",
      }),
    });

    assert.strictEqual(res.status, 500);
    const rawBody = await res.text();
    assertNoLeaks(rawBody, "login/notification-down");

    const body = JSON.parse(rawBody);
    assert.strictEqual(body.error, "An unexpected error occurred");
    assertSafeJson(body, "login/notification-down");
  });

  test("send-otp: notification-down returns 500 with generic error, no API key leak", async () => {
    const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: "POST",
      headers: withSimulation(csrfHeaders, "198.51.100.121", "notification-down"),
      body: JSON.stringify({
        email: "notifdown-otp@example.com",
      }),
    });

    assert.strictEqual(res.status, 500);
    const rawBody = await res.text();
    assertNoLeaks(rawBody, "send-otp/notification-down");

    const body = JSON.parse(rawBody);
    assert.strictEqual(body.error, "An unexpected error occurred");
    assertSafeJson(body, "send-otp/notification-down");
  });
});

// ---------------------------------------------------------------------------
// 4. Verify simulation headers are rejected when not gated
// ---------------------------------------------------------------------------
describe("Provider Failure Safety: Header value containment", () => {
  test("simulation header value never appears in response body", async () => {
    const simulationValues = ["redis-down", "supabase-down", "notification-down"];

    for (const simValue of simulationValues) {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: withSimulation(csrfHeaders, "198.51.100.130", simValue),
        body: JSON.stringify({
          email: "headercheck@example.com",
          password: "Password123!",
        }),
      });

      const rawBody = await res.text();
      assert.ok(
        !rawBody.includes(simValue),
        `Response must not echo simulation header value '${simValue}'`
      );
    }
  });
});
