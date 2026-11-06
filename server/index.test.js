import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port.");
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("admin setup, protected orders, and private tracking run against SQLite", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "jahitlink-test-"));
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(root, "server", "index.js")], {
    cwd: root,
    env: { ...process.env, DATA_DIR: dataDirectory, HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  server.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`Test API exited early.\n${output}`);
      try {
        await fetch(`${origin}/api/auth/status`);
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(ready, true, `Test API did not start.\n${output}`);

    const request = async (route, { method = "GET", body, cookie } = {}) => {
      const response = await fetch(`${origin}${route}`, {
        method,
        headers: {
          Origin: origin,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { response, payload: await response.json() };
    };

    const { payload: initialStatus } = await request("/api/auth/status");
    assert.deepEqual(initialStatus, { setupRequired: true, authenticated: false, username: null });
    const unauthorized = await request("/api/orders");
    assert.equal(unauthorized.response.status, 401);

    const setup = await request("/api/auth/setup", {
      method: "POST",
      body: { username: "testadmin", password: "ValidPass123!" },
    });
    assert.equal(setup.response.status, 201);
    const cookie = setup.response.headers.get("set-cookie").split(";")[0];
    assert.equal(setup.payload.authenticated, true);

    const duplicateSetup = await request("/api/auth/setup", {
      method: "POST",
      body: { username: "secondadmin", password: "OtherValidPass123!" },
    });
    assert.equal(duplicateSetup.response.status, 409);

    const created = await request("/api/orders", {
      method: "POST",
      cookie,
      body: {
        customer: "Pelanggan Uji",
        phone: "08123456789",
        service: "Jahit baru",
        garment: "Kemeja",
        model: "Lengan panjang",
        note: "Catatan internal",
        measurements: { "Lingkar badan": "90" },
        total: 25000,
        deposit: 5000,
        paymentMethod: "Tunai",
      },
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.payload.order.id, "JL-001");
    assert.equal(created.payload.order.payments[0].amount, 5000);
    const token = created.payload.order.token;

    const publicResult = await request(`/api/track/${token}`);
    assert.equal(publicResult.response.status, 200);
    assert.equal(publicResult.payload.order.paid, 5000);
    assert.equal("phone" in publicResult.payload.order, false);
    assert.equal("measurements" in publicResult.payload.order, false);
    assert.equal("note" in publicResult.payload.order, false);
    assert.equal("token" in publicResult.payload.order, false);

    const invalidStatus = await request("/api/orders/JL-001/progress", {
      method: "POST",
      cookie,
      body: { status: "Unknown", note: "" },
    });
    assert.equal(invalidStatus.response.status, 400);

    const progress = await request("/api/orders/JL-001/progress", {
      method: "POST",
      cookie,
      body: { status: "Dalam pengerjaan", note: "Mulai dijahit" },
    });
    assert.equal(progress.payload.order.progress.at(-1).status, "Dalam pengerjaan");

    const payment = await request("/api/orders/JL-001/payments", {
      method: "POST",
      cookie,
      body: { amount: 5000, method: "QRIS" },
    });
    assert.equal(payment.payload.order.payments.length, 2);

    const invalidQuote = await request("/api/orders/JL-001/quote", {
      method: "POST",
      cookie,
      body: { total: 4000 },
    });
    assert.equal(invalidQuote.response.status, 400);

    const pickup = await request("/api/orders/JL-001/pickup", { method: "POST", cookie });
    assert.equal(pickup.payload.order.progress.at(-1).status, "Selesai");
    assert.ok(pickup.payload.order.pickedUpAt);

    await request("/api/auth/logout", { method: "POST", cookie });
    const unauthorizedAfterLogout = await request("/api/orders", { cookie });
    assert.equal(unauthorizedAfterLogout.response.status, 401);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: { username: "testadmin", password: "ValidPass123!" },
    });
    assert.equal(login.response.status, 200);
  } finally {
    server.kill();
    await once(server, "exit");
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
