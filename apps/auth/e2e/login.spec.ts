import { test, expect, type Page } from "@playwright/test"

const validPhoneNumber = "+213555123456"

async function installFastTimers(page: Page) {
  await page.addInitScript(() => {
    const originalSetTimeout = window.setTimeout.bind(window)
    const originalSetInterval = window.setInterval.bind(window)

    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
      originalSetTimeout(callback, typeof delay === "number" && delay >= 1000 ? 10 : delay, ...args)) as typeof window.setTimeout

    window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
      originalSetInterval(callback, typeof delay === "number" && delay >= 1000 ? 10 : delay, ...args)) as typeof window.setInterval
  })
}

function passwordInput(page: Page) {
  return page.locator('input[name="password"]')
}

function submitButton(page: Page) {
  return page.locator('button[type="submit"]')
}

async function clickResendCode(page: Page) {
  const resendButton = page.getByRole("button", { name: /Resend code/i })
  await expect(resendButton).toBeVisible({ timeout: 5000 })
  await expect(resendButton).toBeEnabled({ timeout: 5000 })
  await resendButton.evaluate((button: HTMLButtonElement) => button.click())
}

test.describe("Login MFA flow", () => {
  test("email login stays on the login page until MFA is completed", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, mfaRequired: true, factorType: "email" }),
      })
    })

    await page.goto("/en/login")
    await page.getByLabel("Email").fill("john@example.com")
    await passwordInput(page).fill("Password123!")
    await submitButton(page).click()

    await expect(page).toHaveURL(/\/en\/login$/)
    await expect(page.getByRole("heading", { name: "Enter verification code" })).toBeVisible()
  })

  test("phone login submits sms MFA verification payloads", async ({ page }) => {
    let loginPayload: Record<string, unknown> | null = null
    let verifyPayload: Record<string, unknown> | null = null

    await page.route("**/api/auth/login", async (route) => {
      loginPayload = route.request().postDataJSON() as Record<string, unknown>

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, mfaRequired: true, factorType: "sms" }),
      })
    })

    await page.route("**/api/auth/verify-otp", async (route) => {
      verifyPayload = route.request().postDataJSON() as Record<string, unknown>

      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid verification code" }),
      })
    })

    await page.goto("/en/login")
    await page.getByRole("button", { name: "Login with Phone Number" }).click()
    await page.getByLabel("Phone Number").fill(validPhoneNumber)
    await passwordInput(page).fill("Password123!")
    await submitButton(page).click()

    await expect(page.getByRole("heading", { name: "Enter verification code" })).toBeVisible()

    const otpInputs = page.locator('input[autocomplete="one-time-code"]')
    for (let index = 0; index < 6; index += 1) {
      await otpInputs.nth(index).fill(String(index + 1))
    }

    await expect.poll(() => loginPayload).not.toBeNull()
    await expect.poll(() => verifyPayload).not.toBeNull()

    expect(loginPayload).toMatchObject({
      phone: validPhoneNumber,
      password: "Password123!",
    })
    expect(verifyPayload).toMatchObject({
      phone: validPhoneNumber,
      token: "123456",
      type: "sms",
      flow: "login",
    })
  })

  test("phone login resend replays the credential step instead of bypassing MFA", async ({ page }) => {
    let loginRequests = 0

    await installFastTimers(page)

    await page.route("**/api/auth/login", async (route) => {
      loginRequests += 1

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, mfaRequired: true, factorType: "sms" }),
      })
    })

    await page.goto("/en/login")
    await page.getByRole("button", { name: "Login with Phone Number" }).click()
    await page.getByLabel("Phone Number").fill(validPhoneNumber)
    await passwordInput(page).fill("Password123!")
    await submitButton(page).click()

    await expect(page.getByRole("heading", { name: "Enter verification code" })).toBeVisible()
    await clickResendCode(page)

    await expect.poll(() => loginRequests).toBeGreaterThanOrEqual(2)
  })
})
