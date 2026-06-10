const content = document.getElementById("ticketContent");
const message = document.getElementById("message");
const exportLink = document.getElementById("exportLink");
const logoutButton = document.getElementById("logoutButton");
const filters = [...document.querySelectorAll(".filter")];
let currentStatus = "Pendiente";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = `message show${isError ? " error" : ""}`;
}

function hideMessage() {
  message.className = "message";
  message.textContent = "";
}

function renderTickets(tickets) {
  if (tickets.length === 0) {
    content.innerHTML = '<div class="empty">No hay tickets para este filtro.</div>';
    return;
  }

  content.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Solicitante</th>
            <th>Área</th>
            <th>Incidencia</th>
            <th>Prioridad</th>
            <th>Descripción</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map((ticket) => `
            <tr>
              <td><strong>${escapeHtml(ticket.codigo)}</strong><br><span class="muted">${escapeHtml(new Date(ticket.created_at).toLocaleString("es-PE"))}</span></td>
              <td>${escapeHtml(ticket.solicitante)}<br><span class="muted">${escapeHtml(ticket.correo)}</span></td>
              <td>${escapeHtml(ticket.area)}</td>
              <td>${escapeHtml(ticket.tipo)}</td>
              <td><span class="tag ${escapeHtml(ticket.prioridad)}">${escapeHtml(ticket.prioridad)}</span></td>
              <td>${escapeHtml(ticket.descripcion)}</td>
              <td>${escapeHtml(ticket.estado)}</td>
              <td>
                ${ticket.estado === "Pendiente"
                  ? `<button class="success finish" data-id="${escapeHtml(ticket.id)}" type="button">Finalizar</button>`
                  : '<span class="muted">Cerrado</span>'}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadTickets() {
  hideMessage();
  exportLink.href = `/api/export?status=${encodeURIComponent(currentStatus)}`;
  const response = await fetch(`/api/tickets?status=${encodeURIComponent(currentStatus)}`);

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  const result = await response.json();
  if (!response.ok) {
    showMessage(result.error || "No se pudieron cargar los tickets.", true);
    return;
  }

  renderTickets(result.tickets);
}

filters.forEach((button) => {
  button.addEventListener("click", () => {
    currentStatus = button.dataset.status;
    filters.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    loadTickets();
  });
});

content.addEventListener("click", async (event) => {
  if (!event.target.classList.contains("finish")) return;

  const response = await fetch(`/api/tickets/${encodeURIComponent(event.target.dataset.id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado: "Finalizado" })
  });
  const result = await response.json();

  if (!response.ok) {
    showMessage(result.error || "No se pudo finalizar el ticket.", true);
    return;
  }

  showMessage(`Ticket ${result.ticket.codigo} finalizado.`);
  loadTickets();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
});

loadTickets();
