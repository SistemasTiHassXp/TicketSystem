# Sistema de Tickets TI

Aplicación inicial con backend para registrar tickets públicos y administrarlos desde un panel privado de Soporte TI.

## Páginas

- `/ticket`: formulario público para usuarios, sin login.
- `/login`: acceso privado de Soporte TI.
- `/dashboard`: panel protegido para ver pendientes, finalizados, todos, cerrar tickets y exportar reporte CSV compatible con Excel.

## Ejecutar localmente

```bash
npm start
```

Luego abre:

```text
http://localhost:3000/ticket
```

Credenciales por defecto:

```text
Usuario: soporte
Contraseña: Cambiar123!
```

Para cambiarlas:

```bash
ADMIN_USER=tu_usuario ADMIN_PASSWORD=tu_clave npm start
```

En Windows PowerShell:

```powershell
$env:ADMIN_USER="tu_usuario"
$env:ADMIN_PASSWORD="tu_clave"
npm start
```

## Correos

El backend ya prepara dos notificaciones cuando se registra un ticket:

- confirmación al solicitante,
- aviso a `SoporteTI@hassxp.com`.

Si no configuras un proveedor de correo, los correos se guardan en `data/email-log.json` para pruebas locales.

Para envío real con Resend:

```powershell
$env:RESEND_API_KEY="tu_api_key"
$env:MAIL_FROM="Soporte TI <tickets@tu-dominio.com>"
$env:SUPPORT_EMAIL="SoporteTI@hassxp.com"
npm start
```

## Base de datos

Localmente usa `data/tickets.json`.

Para nube gratuita se recomienda usar Supabase porque ofrece PostgreSQL y el backend ya puede conectarse con variables de entorno:

```text
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

Tabla sugerida en Supabase:

```sql
create table tickets (
  id uuid primary key,
  codigo text not null,
  solicitante text not null,
  area text not null,
  correo text not null,
  jefe text not null,
  correo_jefe text not null,
  tipo text not null,
  prioridad text not null,
  descripcion text not null,
  estado text not null default 'Pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Despliegue sugerido

1. Subir esta carpeta a GitHub.
2. Crear una base gratuita en Supabase y ejecutar el SQL de la tabla.
3. Crear un Web Service en Render conectado al repositorio.
4. Configurar variables de entorno en Render:
   - `ADMIN_USER`
   - `ADMIN_PASSWORD`
   - `SUPPORT_EMAIL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY` y `MAIL_FROM` si quieres envío real de correos.
5. Usar `npm start` como comando de inicio.
