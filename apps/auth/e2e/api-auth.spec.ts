import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test"

const baseURL = "http://localhost:3001"
const csrfToken = "playwright-csrf-token"

async function createCsrfContext(ip: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      "content-type": "application/json",
      origin: baseURL,
      "x-csrf-token": csrfToken,
      "x-forwarded-for": ip,
    },
    storageState: {
      cookies: [
        {
          name: "nodiox_csrf_token",
          value: csrfToken,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 60 * 5,
          sameSite: "Strict",
          httpOnly: false,
          secure: false,
        },
      ],
      origins: [],
    },
  })
}

test.describe("Auth API security contract", () => {
  test("login rejects malformed requests when CSRF is valid", async () => {
    const request = await createCsrfContext("198.51.100.50")
    const response = await request.post("/api/auth/login", {
      data: { password: "Password123!" },
    })

    try {
      expect(response.status()).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: "Invalid request format",
      })
    } finally {
      await request.dispose()
    }
  })

  test("send-otp rejects invalid email format when CSRF is valid", async () => {
    const request = await createCsrfContext("198.51.100.51")
    const response = await request.post("/api/auth/send-otp", {
      data: { email: "invalid-email" },
    })

    try {
      expect(response.status()).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: "Invalid request format",
      })
    } finally {
      await request.dispose()
    }
  })

  test("set-password rejects requests without the signup verification cookie", async () => {
    const request = await createCsrfContext("198.51.100.52")
    const response = await request.post("/api/auth/set-password", {
      data: {
        password: "Password123!",
        fullName: "Test User",
      },
    })

    try {
      expect(response.status()).toBe(401)
      await expect(response.json()).resolves.toMatchObject({
        error: "Email verification expired or not found. Please restart signup.",
      })
    } finally {
      await request.dispose()
    }
  })

  test("verify-otp rejects email login MFA without a pending login challenge", async () => {
    const request = await createCsrfContext("198.51.100.53")
    const email = `pending-login-${Date.now()}@example.com`
    const response = await request.post("/api/auth/verify-otp", {
      data: {
        email,
        token: "123456",
        type: "email",
        flow: "login",
      },
    })

    try {
      expect(response.status()).toBe(401)
      await expect(response.json()).resolves.toMatchObject({
        error: "Your login verification session has expired. Please log in again.",
      })
    } finally {
      await request.dispose()
    }
  })

  test("verify-otp rejects phone login MFA without a pending login challenge", async () => {
    const request = await createCsrfContext("198.51.100.54")
    const response = await request.post("/api/auth/verify-otp", {
      data: {
        phone: "+213555123456",
        token: "123456",
        type: "sms",
        flow: "login",
      },
    })

    try {
      expect(response.status()).toBe(401)
      await expect(response.json()).resolves.toMatchObject({
        error: "Your login verification session has expired. Please log in again.",
      })
    } finally {
      await request.dispose()
    }
  })
})
