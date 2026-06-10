const form = document.getElementById("ticketForm");
const message = document.getElementById("message");

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = `message show${isError ? " error" : ""}`;
}

function fillSelect(id, placeholder, values) {
  const select = document.getElementById(id);
  select.innerHTML = [`<option value="">${placeholder}</option>`, ...values.map((value) => `<option>${value}</option>`)].join("");
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const config = await response.json();
  fillSelect("area", "Seleccione un área", config.areas);
  fillSelect("jefe", "Seleccione un jefe", config.chiefs);
  fillSelect("tipo", "Seleccione el tipo de incidencia", config.incidentTypes);
  fillSelect("prioridad", "Seleccione una prioridad", config.priorities);

  const jefeSelect = document.getElementById("jefe");
  const correoJefeInput = document.getElementById("correoJefe");

  jefeSelect.addEventListener("change", () => {
    const index = config.chiefs.indexOf(jefeSelect.value);

    if (index >= 0) {
      correoJefeInput.value = config.chiefEmails[index];
    } else {
      correoJefeInput.value = "";
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());

  const response = await fetch("/api/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json();

  if (!response.ok) {
    showMessage(result.error || "No se pudo registrar el ticket.", true);
    return;
  }

  showMessage(`Ticket ${result.ticket.codigo} registrado correctamente. Soporte TI realizará el seguimiento.`);
  form.reset();
});

loadConfig();
