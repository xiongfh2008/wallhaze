import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/**
 * Minimal Chrome DevTools Protocol client for the local, self-authored media
 * generator. It launches headless Edge, creates one about:blank target, and
 * exposes Runtime.evaluate over the flattened session. No page source is
 * fetched and no external asset is loaded.
 */
export async function withHeadlessPage(fn) {
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = await mkdtemp(join(tmpdir(), "wallhaze-media-"));
  const child = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true }
  );

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 8000);
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });

    const send = (method, params = {}, sessionId = undefined) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const call = (method, params = {}) => send(method, params, sessionId);
    await call("Runtime.enable");
    await call("Page.enable");

    const evaluate = async (expression) => {
      const result = await call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text ??
            "page evaluation failed"
        );
      }
      return result.result?.value;
    };

    return await fn({ evaluate, call, close: async () => ws.close() });
  } finally {
    child.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // browser still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
