const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || "soporte";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Cambiar123!";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "SoporteTI@hassxp.com";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");
const EMAIL_LOG_FILE = path.join(DATA_DIR, "email-log.json");
const sessions = new Map();

const AREAS = [
  "RECURSOS HUMANOS",
  "COMERCIAL",
  "MARKETING",
  "SUPPLY CHAIN",
  "ADMINISTRACIÓN",
  "LEGAL",
  "PROYECTOS & ARQUITECTURA",
  "CONTABILIDAD & FINANZAS",
  "MANTENIMIENTO PATRIMONIAL",
  "SIG",
  "SEGURIDAD",
  "RESTAURANTE & CLUB"
];

const INCIDENT_TYPES = [
  "HARDWARE (PC no enciende, daño físico)",
  "SOFTWARE (Error en programas, Office)",
  "RED E INTERNET (Sin internet, lentitud, acceso a red)",
  "ACCESOS Y CONTRASEÑAS (Reseteo, desbloqueo)",
  "IMPRESORAS Y ESCÁNERES (No imprime, atasco, configuración)",
  "EQUIPO MÓVIL (Celular corporativo, configuración, daño)",
  "SOLICITUD DE SERVICIO (Instalación de programas, configuración)",
  "CONSULTA O ASESORÍA (Dudas sobre sistemas o procedimientos)"
];

const PRIORITIES = ["Alta", "Media", "Baja"];

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
  if (!fs.existsSync(EMAIL_LOG_FILE)) fs.writeFileSync(EMAIL_LOG_FILE, "[]");
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function textResponse(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function readLocalTickets() {
  ensureDataDir();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeLocalTickets(tickets) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(tickets, null, 2));
}

function supabaseEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseFetch(pathname, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${pathname}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listTickets(status) {
  if (supabaseEnabled()) {
    const filter = status && status !== "Todos" ? `&estado=eq.${encodeURIComponent(status)}` : "";
    return supabaseFetch(`tickets?select=*&order=created_at.desc${filter}`);
  }

  const tickets = readLocalTickets();
  return tickets
    .filter((ticket) => !status || status === "Todos" || ticket.estado === status)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function createTicket(ticket) {
  if (supabaseEnabled()) {
    const created = await supabaseFetch("tickets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(ticket)
    });
    return created[0];
  }

  const tickets = readLocalTickets();
  tickets.push(ticket);
  writeLocalTickets(tickets);
  return ticket;
}

async function updateTicketStatus(id, estado) {
  if (supabaseEnabled()) {
    const updated = await supabaseFetch(`tickets?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ estado, updated_at: new Date().toISOString() })
    });
    return updated[0];
  }

  const tickets = readLocalTickets();
  const ticket = tickets.find((item) => item.id === id);
  if (!ticket) return null;
  ticket.estado = estado;
  ticket.updated_at = new Date().toISOString();
  writeLocalTickets(tickets);
  return ticket;
}

async function nextTicketCode() {
  const tickets = await listTickets("Todos");
  return `TK-${String(tickets.length + 1).padStart(4, "0")}`;
}

function getCookie(req, name) {
  const cookies = (req.headers.cookie || "").split(";").map((cookie) => cookie.trim());
  const item = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.split("=").slice(1).join("=")) : "";
}

function getSession(req) {
  const sid = getCookie(req, "sid");
  return sid ? sessions.get(sid) : null;
}

function requireAuth(req, res) {
  if (getSession(req)) return true;
  jsonResponse(res, 401, { error: "No autorizado" });
  return false;
}

function validateTicket(input) {
  const fields = ["solicitante", "area", "correo", "jefe", "correoJefe", "tipo", "prioridad", "descripcion"];
  for (const field of fields) {
    if (!String(input[field] || "").trim()) return `El campo ${field} es obligatorio.`;
  }
  if (!AREAS.includes(input.area)) return "El área seleccionada no es válida.";
  if (!INCIDENT_TYPES.includes(input.tipo)) return "El tipo de incidencia seleccionado no es válido.";
  if (!PRIORITIES.includes(input.prioridad)) return "La prioridad seleccionada no es válida.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.correo)) return "El correo del solicitante no es válido.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.correoJefe)) return "El correo del jefe no es válido.";
  return "";
}

function appendEmailLog(email) {
  ensureDataDir();
  const emails = JSON.parse(fs.readFileSync(EMAIL_LOG_FILE, "utf8"));
  emails.push({ ...email, logged_at: new Date().toISOString() });
  fs.writeFileSync(EMAIL_LOG_FILE, JSON.stringify(emails, null, 2));
}

async function sendEmail(email) {
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text
      })
    });

    if (!response.ok) {
      throw new Error(`No se pudo enviar correo: ${await response.text()}`);
    }
    return;
  }

  appendEmailLog(email);
}

async function notifyTicketCreated(ticket) {
  await Promise.all([
    sendEmail({
      to: ticket.correo,
      subject: `Ticket recibido ${ticket.codigo}`,
      text: `Hola ${ticket.solicitante},\n\nHemos recibido tu ticket ${ticket.codigo} y se realizará el seguimiento correspondiente.\n\nTipo de incidencia: ${ticket.tipo}\nPrioridad: ${ticket.prioridad}\nDescripción: ${ticket.descripcion}\n\nSaludos,\nSoporte TI`
    }),
    sendEmail({
      to: SUPPORT_EMAIL,
      subject: `Nuevo ticket ${ticket.codigo} - ${ticket.prioridad}`,
      text: `Se registró un nuevo ticket.\n\nCódigo: ${ticket.codigo}\nSolicitante: ${ticket.solicitante}\nÁrea: ${ticket.area}\nCorreo: ${ticket.correo}\nJefe inmediato: ${ticket.jefe}\nCorreo del jefe: ${ticket.correoJefe}\nTipo de incidencia: ${ticket.tipo}\nPrioridad: ${ticket.prioridad}\nEstado: ${ticket.estado}\nFecha: ${ticket.created_at}\n\nDescripción:\n${ticket.descripcion}`
    })
  ]);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toExcelHtml(tickets, status) {
  const headers = [
    "Código",
    "Fecha",
    "Solicitante",
    "Área",
    "Correo",
    "Jefe inmediato",
    "Correo del jefe",
    "Tipo de incidencia",
    "Prioridad",
    "Estado",
    "Descripcion"
  ];
  const rows = tickets.map((ticket) => `
    <tr>
      <td>${escapeHtml(ticket.codigo)}</td>
      <td>${escapeHtml(new Date(ticket.created_at).toLocaleString("es-PE"))}</td>
      <td>${escapeHtml(ticket.solicitante)}</td>
      <td>${escapeHtml(ticket.area)}</td>
      <td>${escapeHtml(ticket.correo)}</td>
      <td>${escapeHtml(ticket.jefe)}</td>
      <td>${escapeHtml(ticket.correo_jefe)}</td>
      <td>${escapeHtml(ticket.tipo)}</td>
      <td>${escapeHtml(ticket.prioridad)}</td>
      <td>${escapeHtml(ticket.estado)}</td>
      <td>${escapeHtml(ticket.descripcion)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .meta { margin: 0 0 18px; color: #475569; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #1f4e78; color: #ffffff; font-weight: bold; }
    th, td { border: 1px solid #94a3b8; padding: 8px; vertical-align: top; }
    td { mso-number-format: "\\@"; }
  </style>
</head>
<body>
  <h1>Reporte de tickets</h1>
  <p class="meta">Filtro: ${escapeHtml(status)} | Generado: ${escapeHtml(new Date().toLocaleString("es-PE"))}</p>
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${headers.length}">No hay tickets para este filtro.</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const routeMap = {
    "/": "ticket.html",
    "/ticket": "ticket.html",
    "/login": "login.html",
    "/dashboard": "dashboard.html"
  };
  const requested = routeMap[url.pathname] || url.pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    textResponse(res, 403, "Acceso denegado");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    textResponse(res, 404, "No encontrado");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8"
  };
  textResponse(res, 200, fs.readFileSync(filePath), contentTypes[ext] || "application/octet-stream");
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/config") {
    jsonResponse(res, 200, { areas: AREAS, incidentTypes: INCIDENT_TYPES, priorities: PRIORITIES });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    jsonResponse(res, 200, { authenticated: Boolean(getSession(req)), user: ADMIN_USER });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    if (body.user !== ADMIN_USER || body.password !== ADMIN_PASSWORD) {
      jsonResponse(res, 401, { error: "Usuario o contraseña incorrectos." });
      return;
    }

    const sid = crypto.randomBytes(32).toString("hex");
    sessions.set(sid, { user: ADMIN_USER, createdAt: Date.now() });
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    const sid = getCookie(req, "sid");
    if (sid) sessions.delete(sid);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tickets") {
    const body = await readBody(req);
    const error = validateTicket(body);
    if (error) {
      jsonResponse(res, 400, { error });
      return;
    }

    const ticket = {
      id: crypto.randomUUID(),
      codigo: await nextTicketCode(),
      solicitante: body.solicitante.trim(),
      area: body.area,
      correo: body.correo.trim(),
      jefe: body.jefe.trim(),
      correo_jefe: body.correoJefe.trim(),
      tipo: body.tipo,
      prioridad: body.prioridad,
      descripcion: body.descripcion.trim(),
      estado: "Pendiente",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const created = await createTicket(ticket);
    await notifyTicketCreated(created);
    jsonResponse(res, 201, { ticket: created });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tickets") {
    if (!requireAuth(req, res)) return;
    const status = url.searchParams.get("status") || "Pendiente";
    jsonResponse(res, 200, { tickets: await listTickets(status) });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/tickets/")) {
    if (!requireAuth(req, res)) return;
    const segments = url.pathname.split("/");
    const id = decodeURIComponent(segments[3] || "");
    const body = await readBody(req);
    if (!["Pendiente", "Finalizado"].includes(body.estado)) {
      jsonResponse(res, 400, { error: "Estado no válido." });
      return;
    }

    const ticket = await updateTicketStatus(id, body.estado);
    if (!ticket) {
      jsonResponse(res, 404, { error: "Ticket no encontrado." });
      return;
    }

    jsonResponse(res, 200, { ticket });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/export") {
    if (!requireAuth(req, res)) return;
    const status = url.searchParams.get("status") || "Todos";
    const excelHtml = toExcelHtml(await listTickets(status), status);
    res.writeHead(200, {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="reporte-tickets-${new Date().toISOString().slice(0, 10)}.xls"`
    });
    res.end(excelHtml);
    return;
  }

  jsonResponse(res, 404, { error: "Ruta API no encontrada." });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    if (req.url === "/admin") {
      redirect(res, "/dashboard");
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, { error: "Error interno del servidor." });
  }
});

server.listen(PORT, () => {
  ensureDataDir();
  console.log(`Sistema de tickets listo en http://localhost:${PORT}`);
});
