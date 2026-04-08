/* global AbortSignal, console, fetch, process, setTimeout */

import { spawn } from "node:child_process"
import { readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, "..")
const apiTestsDir = join(projectRoot, "src", "__tests__", "api")
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"
const readinessPath = `${baseUrl}/en/login`

function getPnpmInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `pnpm ${args.join(" ")}`],
    }
  }

  return {
    command: "pnpm",
    args,
  }
}

function getNodeArgs(testFiles) {
  return [
    "--experimental-strip-types",
    "--test",
    "--test-isolation=none",
    ...testFiles,
  ]
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function waitForServer(url, timeoutMs = 120_000) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      })

      if (response.status < 500) {
        return
      }
    } catch {
      // Server is still starting.
    }

    await wait(1_000)
  }

  throw new Error(`Timed out waiting for auth server at ${url}`)
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    })

    child.on("error", rejectPromise)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(
        new Error(
          signal
            ? `${command} exited due to signal ${signal}`
            : `${command} exited with code ${code ?? "unknown"}`
        )
      )
    })
  })
}

async function terminateProcessTree(pid) {
  if (!pid) {
    return
  }

  if (process.platform === "win32") {
    try {
      await runCommand("taskkill", ["/pid", String(pid), "/t", "/f"], {
        stdio: "ignore",
      })
    } catch {
      // Best-effort cleanup on Windows.
    }
    return
  }

  try {
    process.kill(pid, "SIGTERM")
  } catch {
    // Process already exited.
  }
}

async function main() {
  const allEntries = await readdir(apiTestsDir, { withFileTypes: true })
  const testFiles = allEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => join("src", "__tests__", "api", entry.name))
    .sort()

  if (testFiles.length === 0) {
    throw new Error("No API tests were found in src/__tests__/api")
  }

  const serverInvocation = getPnpmInvocation([
    "exec",
    "next",
    "dev",
    "--port",
    "3001",
    "--hostname",
    "localhost",
  ])

  const server = spawn(serverInvocation.command, serverInvocation.args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  })

  try {
    await waitForServer(readinessPath)
    await runCommand(process.execPath, getNodeArgs(testFiles), {
      cwd: projectRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_SITE_URL: baseUrl,
      },
    })
  } finally {
    await terminateProcessTree(server.pid)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
