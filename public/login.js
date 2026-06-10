const form = document.getElementById("loginForm");
const message = document.getElementById("message");

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = `message show${isError ? " error" : ""}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json();

  if (!response.ok) {
    showMessage(result.error || "No se pudo iniciar sesión.", true);
    return;
  }

  window.location.href = "/dashboard";
});
