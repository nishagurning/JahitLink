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

    const request = async (route, { method = "GET", body, cookie, headers = {} } = {}) => {
      const response = await fetch(`${origin}${route}`, {
        method,
        headers: {
          Origin: origin,
          ...headers,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { response, payload: await response.json() };
    };

    const proxiedStatus = await request("/api/auth/status", {
      headers: { Origin: "http://localhost:5173", "X-Forwarded-Host": "localhost:5173" },
    });
    assert.equal(proxiedStatus.response.status, 200);
    const rejectedCrossOrigin = await request("/api/auth/status", {
      headers: { Origin: "https://attacker.example", "X-Forwarded-Host": "localhost:5173" },
    });
    assert.equal(rejectedCrossOrigin.response.status, 403);

    const { payload: initialStatus } = await request("/api/auth/status");
    assert.deepEqual(initialStatus, { setupRequired: true, authenticated: false, username: null });
    const unauthorized = await request("/api/orders");
    assert.equal(unauthorized.response.status, 401);

    const invalidEmailSetup = await request("/api/auth/setup", {
      method: "POST",
      body: { username: "adminjahit@", password: "ValidPass123!" },
    });
    assert.equal(invalidEmailSetup.response.status, 400);

    const setup = await request("/api/auth/setup", {
      method: "POST",
      body: { username: "adminjahit@gmail.com", password: "ValidPass123!" },
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
        address: "Jl. Merdeka No. 10, Bandung",
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
    assert.equal(created.payload.order.address, "Jl. Merdeka No. 10, Bandung");
    assert.equal(created.payload.order.customerAccountId, null);
    const token = created.payload.order.token;

    const customerRegistration = await request("/api/customer/auth/register", {
      method: "POST",
      body: { name: "Pelanggan Uji", phone: "0812-3456-7890", password: "CustomerPass123!" },
    });
    assert.equal(customerRegistration.response.status, 201);
    const customerCookie = customerRegistration.response.headers.get("set-cookie").split(";")[0];
    assert.equal(customerRegistration.payload.customer.name, "Pelanggan Uji");
    const unlinkedOrders = await request("/api/customer/orders", { cookie: customerCookie });
    assert.deepEqual(unlinkedOrders.payload.orders, []);
    assert.equal((await request("/api/orders", { cookie: customerCookie })).response.status, 401);
    assert.equal((await request("/api/customer/orders", { cookie })).response.status, 401);

    const customerAccounts = await request("/api/customer-accounts", { cookie });
    assert.equal(customerAccounts.payload.customers.length, 1);
    const assigned = await request("/api/orders/JL-001/customer-account", {
      method: "POST",
      cookie,
      body: { customerAccountId: customerRegistration.payload.customer.id },
    });
    assert.equal(assigned.payload.order.customerAccountId, customerRegistration.payload.customer.id);
    const linkedOrders = await request("/api/customer/orders", { cookie: customerCookie });
    assert.equal(linkedOrders.payload.orders.length, 1);
    assert.equal(linkedOrders.payload.orders[0].id, "JL-001");
    assert.equal(linkedOrders.payload.orders[0].paid, 5000);
    assert.equal("phone" in linkedOrders.payload.orders[0], false);

    const secondCustomer = await request("/api/customer/auth/register", {
      method: "POST",
      body: { name: "Pelanggan Lain", phone: "081298765432", password: "AnotherPass123!" },
    });
    const secondCustomerCookie = secondCustomer.response.headers.get("set-cookie").split(";")[0];
    const otherOrders = await request("/api/customer/orders", { cookie: secondCustomerCookie });
    assert.deepEqual(otherOrders.payload.orders, []);

    const publicResult = await request(`/api/track/${token}`);
    assert.equal(publicResult.response.status, 200);
    assert.equal(publicResult.payload.order.paid, 5000);
    assert.equal("phone" in publicResult.payload.order, false);
    assert.equal("address" in publicResult.payload.order, false);
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
      body: { username: "adminjahit@gmail.com", password: "ValidPass123!" },
    });
    assert.equal(login.response.status, 200);

    await request("/api/customer/auth/logout", { method: "POST", cookie: customerCookie });
    const unauthorizedCustomerAfterLogout = await request("/api/customer/orders", { cookie: customerCookie });
    assert.equal(unauthorizedCustomerAfterLogout.response.status, 401);
    const customerLogin = await request("/api/customer/auth/login", {
      method: "POST",
      body: { phone: "081234567890", password: "CustomerPass123!" },
    });
    assert.equal(customerLogin.response.status, 200);
    assert.equal(customerLogin.payload.customer.name, "Pelanggan Uji");
  } finally {
    server.kill();
    await once(server, "exit");
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
