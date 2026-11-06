import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import express from "express";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
mkdirSync(dataDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, "jahitlink.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL,
    garment TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    material TEXT NOT NULL DEFAULT '',
    material_amount TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    measurements_json TEXT NOT NULL DEFAULT '{}',
    fitting_date TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    total INTEGER NOT NULL DEFAULT 0,
    picked_up_at TEXT
  );
  CREATE TABLE IF NOT EXISTS progress_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT NOT NULL,
    date TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL,
    date TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS progress_order_idx ON progress_updates(order_id, id);
  CREATE INDEX IF NOT EXISTS payments_order_idx ON payments(order_id, id);
`);

const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const sessionCookie = "jahitlink_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;
const passwordSaltBytes = 16;
const passwordHashBytes = 64;
const passwordMinimumLength = 10;
const statuses = new Set([
  "Menunggu konfirmasi",
  "Menunggu pengerjaan",
  "Dalam pengerjaan",
  "Siap fitting",
  "Perlu revisi",
  "Siap diambil",
  "Selesai",
]);

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

function apiError(res, status, message) {
  return res.status(status).json({ error: message });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validDate(value) {
  return value === "" || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function passwordHash(password, salt) {
  return scryptSync(password, salt, passwordHashBytes).toString("hex");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [];
    return [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()]];
  }));
}

function sessionHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function createSession(res) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + sessionDurationMs;
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)").run(sessionHash(token), expiresAt);
  const options = [`${sessionCookie}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${sessionDurationMs / 1000}`];
  if (isProduction) options.push("Secure");
  res.setHeader("Set-Cookie", options.join("; "));
}

function clearSession(res, token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sessionHash(token));
  const options = [`${sessionCookie}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (isProduction) options.push("Secure");
  res.setHeader("Set-Cookie", options.join("; "));
}

function currentSession(req) {
  const token = parseCookies(req.headers.cookie)[sessionCookie];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = sessionHash(token);
  const session = db.prepare("SELECT token_hash, expires_at FROM sessions WHERE token_hash = ?").get(hash);
  if (!session || session.expires_at <= Date.now()) {
    if (session) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    return null;
  }
  return { token, hash };
}

function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      return apiError(res, 403, "Asal permintaan tidak valid.");
    }
    if (originHost !== req.get("host")) return apiError(res, 403, "Permintaan lintas situs ditolak.");
  }
  if (req.get("sec-fetch-site") === "cross-site") return apiError(res, 403, "Permintaan lintas situs ditolak.");
  next();
}

function requireAdmin(req, res, next) {
  const session = currentSession(req);
  if (!session) return apiError(res, 401, "Sesi admin berakhir. Silakan masuk kembali.");
  req.adminSession = session;
  next();
}

function orderId(number) {
  return `JL-${String(number).padStart(3, "0")}`;
}

function serializeOrder(row, isPublic = false) {
  const progress = db.prepare(
    "SELECT status, note, date FROM progress_updates WHERE order_id = ? ORDER BY id",
  ).all(row.id);
  const payments = db.prepare(
    "SELECT amount, method, date FROM payments WHERE order_id = ? ORDER BY id",
  ).all(row.id);
  const base = {
    id: orderId(row.id),
    token: row.tracking_token,
    createdAt: row.created_at,
    customer: row.customer,
    service: row.service,
    garment: row.garment,
    model: row.model,
    dueDate: row.due_date,
    fittingDate: row.fitting_date,
    total: row.total,
    payments,
    progress,
  };
  if (isPublic) return base;
  return {
    ...base,
    phone: row.phone,
    material: row.material,
    materialAmount: row.material_amount,
    note: row.note,
    measurements: JSON.parse(row.measurements_json),
    pickedUpAt: row.picked_up_at,
  };
}

function findOrderById(id) {
  const match = /^JL-(\d{3,})$/i.exec(id);
  if (!match) return null;
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(match[1]));
  return row ? serializeOrder(row) : null;
}

function sendOrder(req, res, id) {
  const order = findOrderById(id);
  if (!order) return apiError(res, 404, "Pesanan tidak ditemukan.");
  return res.json({ order });
}

app.use("/api", requireSameOrigin);

app.get("/api/auth/status", (req, res) => {
  const session = currentSession(req);
  const admin = db.prepare("SELECT username FROM admins WHERE id = 1").get();
  res.json({ setupRequired: !admin, authenticated: Boolean(session), username: session ? admin?.username : null });
});

const loginAttempts = new Map();
function allowLoginAttempt(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (entry && entry.resetAt > now && entry.count >= 10) {
    return apiError(res, 429, "Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.");
  }
  if (!entry || entry.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else entry.count += 1;
  next();
}

app.post("/api/auth/setup", allowLoginAttempt, (req, res) => {
  const username = normalizeText(req.body?.username, 64);
  const password = req.body?.password;
  if (username.length < 3 || !/^[\p{L}\p{N}_.-]+$/u.test(username)) {
    return apiError(res, 400, "Nama pengguna harus 3–64 karakter dan hanya berisi huruf, angka, titik, garis bawah, atau tanda hubung.");
  }
  if (typeof password !== "string" || password.length < passwordMinimumLength || password.length > 200) {
    return apiError(res, 400, "Kata sandi harus terdiri dari 10–200 karakter.");
  }
  const salt = randomBytes(passwordSaltBytes);
  const hash = passwordHash(password, salt);
  try {
    db.prepare("INSERT INTO admins (id, username, password_salt, password_hash, created_at) VALUES (1, ?, ?, ?, ?)")
      .run(username, salt.toString("hex"), hash, today());
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return apiError(res, 409, "Akun admin sudah dibuat.");
    }
    throw error;
  }
  createSession(res);
  res.status(201).json({ authenticated: true, username });
});

app.post("/api/auth/login", allowLoginAttempt, (req, res) => {
  const username = normalizeText(req.body?.username, 64);
  const password = req.body?.password;
  const admin = db.prepare("SELECT username, password_salt, password_hash FROM admins WHERE id = 1").get();
  if (!admin) return apiError(res, 409, "Akun admin belum dibuat.");
  if (typeof password !== "string" || password.length > 200) return apiError(res, 400, "Nama pengguna atau kata sandi salah.");

  const actual = Buffer.from(passwordHash(password, Buffer.from(admin.password_salt, "hex")));
  const expected = Buffer.from(admin.password_hash);
  if (
    username.toLocaleLowerCase("id") !== admin.username.toLocaleLowerCase("id")
    || actual.length !== expected.length
    || !timingSafeEqual(actual, expected)
  ) return apiError(res, 401, "Nama pengguna atau kata sandi salah.");

  createSession(res);
  res.json({ authenticated: true, username: admin.username });
});

app.post("/api/auth/logout", (req, res) => {
  const token = parseCookies(req.headers.cookie)[sessionCookie];
  clearSession(res, token);
  res.json({ authenticated: false });
});

app.get("/api/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  res.json({ orders: rows.map((row) => serializeOrder(row)) });
});

app.post("/api/orders", requireAdmin, (req, res) => {
  const body = req.body ?? {};
  const customer = normalizeText(body.customer, 120);
  const garment = normalizeText(body.garment, 200);
  const service = normalizeText(body.service, 60);
  const total = Number(body.total);
  const deposit = Number(body.deposit ?? 0);
  const measurements = body.measurements && typeof body.measurements === "object" && !Array.isArray(body.measurements)
    ? Object.fromEntries(Object.entries(body.measurements).slice(0, 30).map(([key, value]) => [normalizeText(key, 60), normalizeText(value, 30)]))
    : {};

  if (!customer || !garment || !["Jahit baru", "Permak", "Perbaikan"].includes(service)) {
    return apiError(res, 400, "Nama pelanggan, jenis layanan, dan pakaian wajib diisi.");
  }
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(deposit) || deposit < 0 || deposit > total) {
    return apiError(res, 400, "Total biaya dan DP tidak valid.");
  }
  if (!validDate(body.dueDate ?? "") || !validDate(body.fittingDate ?? "")) return apiError(res, 400, "Format tanggal tidak valid.");

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO orders (tracking_token, created_at, customer, phone, service, garment, model, material, material_amount, note, measurements_json, fitting_date, due_date, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomBytes(32).toString("hex"),
      today(),
      customer,
      normalizeText(body.phone, 40),
      service,
      garment,
      normalizeText(body.model, 500),
      normalizeText(body.material, 200),
      normalizeText(body.materialAmount, 100),
      normalizeText(body.note, 1000),
      JSON.stringify(measurements),
      body.fittingDate || "",
      body.dueDate || "",
      total,
    );
    const id = Number(result.lastInsertRowid);
    db.prepare("INSERT INTO progress_updates (order_id, status, note, date) VALUES (?, ?, ?, ?)")
      .run(id, "Menunggu pengerjaan", "Pesanan diterima.", today());
    if (deposit > 0) {
      db.prepare("INSERT INTO payments (order_id, amount, method, date) VALUES (?, ?, ?, ?)")
        .run(id, deposit, normalizeText(body.paymentMethod, 40) || "Tunai", today());
    }
    return id;
  });
  const id = orderId(create());
  return sendOrder(req, res, id);
});

app.post("/api/orders/:id/progress", requireAdmin, (req, res) => {
  const order = findOrderById(req.params.id);
  if (!order) return apiError(res, 404, "Pesanan tidak ditemukan.");
  const status = req.body?.status;
  if (!statuses.has(status)) return apiError(res, 400, "Status pesanan tidak valid.");
  const rowId = Number(req.params.id.slice(3));
  db.prepare("INSERT INTO progress_updates (order_id, status, note, date) VALUES (?, ?, ?, ?)")
    .run(rowId, status, normalizeText(req.body?.note, 500) || `Status diperbarui menjadi ${status}.`, today());
  return sendOrder(req, res, req.params.id);
});

app.post("/api/orders/:id/quote", requireAdmin, (req, res) => {
  const order = findOrderById(req.params.id);
  if (!order) return apiError(res, 404, "Pesanan tidak ditemukan.");
  const total = Number(req.body?.total);
  if (!Number.isSafeInteger(total) || total <= 0 || total < order.payments.reduce((sum, payment) => sum + payment.amount, 0)) {
    return apiError(res, 400, "Biaya harus berupa bilangan positif dan tidak boleh kurang dari pembayaran yang sudah diterima.");
  }
  db.prepare("UPDATE orders SET total = ? WHERE id = ?").run(total, Number(req.params.id.slice(3)));
  return sendOrder(req, res, req.params.id);
});

app.post("/api/orders/:id/payments", requireAdmin, (req, res) => {
  const order = findOrderById(req.params.id);
  if (!order) return apiError(res, 404, "Pesanan tidak ditemukan.");
  const amount = Number(req.body?.amount);
  const balance = order.total - order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > balance) return apiError(res, 400, `Pembayaran harus antara Rp1 dan Rp${Math.max(0, balance)}.`);
  db.prepare("INSERT INTO payments (order_id, amount, method, date) VALUES (?, ?, ?, ?)")
    .run(Number(req.params.id.slice(3)), amount, normalizeText(req.body?.method, 40) || "Tunai", today());
  return sendOrder(req, res, req.params.id);
});

app.post("/api/orders/:id/pickup", requireAdmin, (req, res) => {
  const order = findOrderById(req.params.id);
  if (!order) return apiError(res, 404, "Pesanan tidak ditemukan.");
  if (order.pickedUpAt) return apiError(res, 409, "Pesanan sudah dicatat telah diambil.");
  const rowId = Number(req.params.id.slice(3));
  const date = today();
  const pickup = db.transaction(() => {
    db.prepare("UPDATE orders SET picked_up_at = ? WHERE id = ? AND picked_up_at IS NULL").run(date, rowId);
    db.prepare("INSERT INTO progress_updates (order_id, status, note, date) VALUES (?, ?, ?, ?)")
      .run(rowId, "Selesai", "Pesanan telah diambil pelanggan.", date);
  });
  pickup();
  return sendOrder(req, res, req.params.id);
});

app.get("/api/track/:token", (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(req.params.token)) return apiError(res, 404, "Pesanan tidak ditemukan.");
  const row = db.prepare("SELECT * FROM orders WHERE tracking_token = ?").get(req.params.token);
  if (!row) return apiError(res, 404, "Pesanan tidak ditemukan.");
  const order = serializeOrder(row, true);
  order.paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  delete order.payments;
  delete order.token;
  res.json({ order });
});

app.use("/api", (req, res) => apiError(res, 404, "Endpoint tidak ditemukan."));

app.use((error, req, res, next) => {
  console.error("Kesalahan server API.", error);
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && "body" in error) return apiError(res, 400, "Format JSON tidak valid.");
  return apiError(res, 500, "Terjadi kesalahan server.");
});

if (isProduction) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) => res.sendFile(path.join(root, "dist", "index.html")));
}

const server = app.listen(port, process.env.HOST || "127.0.0.1", () => {
  console.log(`JahitLink API berjalan di http://${process.env.HOST || "127.0.0.1"}:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
