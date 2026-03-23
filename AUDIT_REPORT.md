# 🔍 Auditoría de Código — Mahana Portal v2

**Fecha:** 2026-03-23  
**Repositorio:** onyx-mahana-portal  
**Auditor:** Antigravity (AI Coding Assistant)  
**Método:** Revisión exhaustiva línea por línea de todo el codebase

---

## 📊 Resumen Ejecutivo

| Área | Score | Estado |
|------|-------|--------|
| **Arquitectura** | 75/100 | 🟡 Funcional pero necesita refactoring |
| **Seguridad** | 65/100 | 🟠 Varios riesgos abiertos |
| **Frontend** | 85/100 | ✅ Sólido |
| **Base de Datos** | 80/100 | ✅ Bien estructurada |
| **Notificaciones** | 90/100 | ✅ Excelente |
| **Deploy/DevOps** | 70/100 | 🟡 Mejorable |
| **Testing** | 0/100 | 🔴 Inexistente |
| **Score Global** | **66/100** | 🟡 |

---

## 🔴 PROBLEMAS CRÍTICOS

### C1 — `server.js` es un monolito de 2,102 líneas (83KB)

**Archivo:** `server/server.js`  
**Impacto:** Mantenibilidad, debugging, onboarding de devs

Todo el backend vive en un solo archivo: auth, tours, estadías, dashboard, partner, approval, usuarios, notificaciones config, alertas, uploads, charts, calendario, disponibilidad, propiedades, staff, export CSV, WhatsApp API, plantillas, y scheduler. 

**Recomendación:** Dividir en módulos por dominio:
```
server/
  routes/
    tours.js
    estadias.js
    dashboard.js
    partner.js
    usuarios.js
    disponibilidad.js
    ...
  middleware/
    auth.js
    rateLimiter.js
    validation.js
  server.js (solo setup + mount)
```

---

### C2 — Secretos hardcodeados y defaults inseguros

| Secreto | Ubicación | Problema |
|---------|-----------|----------|
| `API_KEY` | `server.js:34` | Default: `'mahana-dev-key-2026'` — usado en prod si no se setea env var |
| `JWT_SECRET` | `auth.js:4` | Default: `'mahana-jwt-secret-2026-change-in-prod'` |
| Passwords seed | `server.js:2042-2043` | `'mahana2026'` y `'caracol2026'` hardcodeados |
| API Key frontend | `api.ts:9` | `'mahana-dev-key-2026'` expuesto en bundle del cliente |

> [!CAUTION]
> El `API_KEY` se incluye en el frontend bundle (`api.ts:9`). Cualquier usuario puede verlo en las DevTools del navegador. Esto invalida la protección de los endpoints protegidos con `requireApiKey`.

**Recomendación:** 
- Eliminar el API Key del frontend — usar JWT para todos los endpoints
- Forzar env vars obligatorias en producción (crash si no existen)
- Rotar las passwords de seed

---

### C3 — `ALLOWED_ORIGINS: "*"` en producción

**Archivo:** `render.yaml:13`

```yaml
- key: ALLOWED_ORIGINS
  value: "*"
```

CORS está completamente abierto en el deploy de Render. Cualquier sitio puede hacer requests autenticados al API.

---

### C4 — Sin tests unitarios ni de integración

No existe ningún archivo `.test.*`, `.spec.*`, ni configuración de test runner (jest, vitest, etc.) en el proyecto.

**Impacto:** Cada cambio es un riesgo. No hay forma automatizada de validar regresiones.

---

## 🟠 PROBLEMAS ALTOS

### A1 — Endpoints públicos que deberían ser protegidos

| Endpoint | Auth actual | Debería ser |
|----------|------------|-------------|
| `GET /api/v1/actividades` | ❌ Público | `requireAuth` |
| `GET /api/v1/actividades/:id` | ❌ Público | `requireAuth` |
| `GET /api/v1/propiedades` | ❌ Público | `requireAuth` |
| `GET /api/v1/propiedades/:id` | ❌ Público | `requireAuth` |
| `GET /api/v1/staff` | ❌ Público | `requireAuth` |
| `GET /api/v1/dashboard` | ❌ Público | `requireAuth` |
| `GET /api/v1/charts` | ❌ Público | `requireAuth` |

Cualquier persona sin autenticación puede ver los precios, catálogo de productos, staff, y **datos financieros del dashboard** (ingresos, ganancias, recientes, etc.).

---

### A2 — `requireApiKey` vs `requireAuth` inconsistente

Los endpoints de **estadías** usan `requireApiKey` (header `X-API-Key`), pero los de **tours** usan `requireAuth` (JWT). Esto crea confusión y una superficie de ataque mixta:

| Recurso | POST | PUT | DELETE |
|---------|------|-----|--------|
| Tours | `requireAuth` | `requireAuth + requireRole` | `requireAuth + requireRole` |
| Estadías | `requireApiKey` | `requireApiKey` | `requireApiKey` |
| Actividades | `requireApiKey` | `requireApiKey` | `requireApiKey` |
| Propiedades | `requireApiKey` | `requireApiKey` | `requireApiKey` |

**Recomendación:** Migrar todo a `requireAuth` + RBAC. El API Key está comprometido al estar en el frontend bundle.

---

### A3 — SQL Injection potencial en queries del Dashboard/Charts

Aunque `findAll()` usa parámetros preparados, los endpoints de **dashboard**, **charts**, y **calendar** construyen queries manualmente con interpolación de strings:

```javascript
// server.js:639 — tourDateFilter usa ? (bien)
// Pero orderBy en findAll() no está sanitizado:
findAll('reservas_tours', { orderBy: 'fecha DESC, hora DESC' }) // hardcoded OK
```

Las queries del dashboard (lines 629-714) y charts (lines 1289-1407) usan prepared statements con `?`, lo cual es correcto. Sin embargo, el parámetro `orderBy` en `findAll()` se interpola directamente en el SQL (line 228). Actualmente solo se pasan strings hardcodeados, pero si algún endpoint en el futuro pasara user input como `orderBy`, sería SQLi.

---

### A4 — Rate limiter in-memory se pierde con cada restart

```javascript
// server.js:47-75
const requestCounts = {}; // ← se pierde al reiniciar
```

En un solo proceso esto funciona, pero no escala y se resetea con cada deploy.

---

### A5 — Uploads sin verificación de contenido

`multer` solo valida la extensión del archivo (`.jpg`, `.png`, etc.), no el contenido real. Un archivo malicioso renombrado a `.jpg` se aceptaría.

```javascript
// server.js:26-29
fileFilter: (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|pdf)$/i;
  if (allowed.test(path.extname(file.originalname))) cb(null, true); // solo extensión
```

---

## 🟡 PROBLEMAS MEDIOS

### M1 — Daily scheduler con polling cada 5 min

```javascript
// server.js:2099-2100
setInterval(scheduleDailyJobs, 5 * 60 * 1000);
```

El scheduler verifica la hora de Panamá cada 5 minutos buscando las 7am y 6pm. Si el proceso se reinicia durante esa ventana de 5 minutos, el job se pierde. Además, puede ejecutarse múltiples veces si el check cae en los primeros 5 minutos de la hora.

**Recomendación:** Usar `node-cron` para scheduling preciso, o un servicio externo de cron jobs.

---

### M2 — Dockerfile expone `node_modules` completos

```dockerfile
COPY --from=builder /app/node_modules ./node_modules  # ← todo, incluyendo devDeps
```

La imagen de producción incluye todas las dependencias (incluyendo las de desarrollo como TypeScript, Tailwind, etc.).

**Recomendación:** Solo copiar `server/node_modules` (deps de producción del backend).

---

### M3 — Error handling con `catch {}` vacío en migrations

```javascript
// database.js:26
const addCol = (table, col, type) => {
  try { db.exec(`ALTER TABLE ...`); } catch {} // silencioso
};
```

Si una migración falla por un motivo inesperado (no "column already exists"), el error se traga silenciosamente.

---

### M4 — Frontend API Key expuesta en bundle

```typescript
// api.ts:9
const API_KEY = import.meta.env.VITE_API_KEY || 'mahana-dev-key-2026'
```

Este valor se incluye en el JavaScript compilado. Es visible en DevTools → Sources.

---

### M5 — Proxy `/uploads` no funciona en producción

En desarrollo, Vite proxifica `/api` al backend. Pero `/uploads` no tiene proxy, funciona solo porque Express sirve `/uploads` como static. El manejo de rutas de uploads depende del deploy.

---

## ✅ LO QUE ESTÁ BIEN

### ✅ Arquitectura General
- Base de datos SQLite con schema bien definido y índices apropiados
- Migraciones seguras (idempotentes) en `database.js`
- CRUD genérico con paginación server-side (`findAll` con LIMIT/OFFSET/meta)
- API versionada (`/api/v1/`)
- Respuestas estandarizadas (`{ success, data, meta, error }`)

### ✅ Autenticación y Autorización
- JWT con expiración de 7 días
- RBAC con 3 roles: `admin`, `partner`, `vendedor`
- Partner scoping: partners solo ven sus propios tours
- Protecciones contra auto-desactivación y eliminación del último admin
- Auto-logout en frontend cuando token expira (interceptor 401)

### ✅ Frontend
- React 18 + TypeScript + Vite + Tailwind
- 18 componentes bien organizados (14 admin + 4 partner)
- Router con protección por roles (`AdminOnly` wrapper)
- Error Boundary global
- Loading/Error states en todos los componentes con datos
- API client tipado con interfaces TypeScript
- Diseño responsivo (desktop tabla + mobile cards)

### ✅ Sistema de Notificaciones
- Orquestador centralizado con 3 canales: Email, WhatsApp, Telegram
- Cada canal tiene su propio try/catch (si uno falla, los otros siguen)
- Configuración dinámica desde DB con fallback a env vars
- Notificaciones asíncronas (`setImmediate`) que no bloquean la respuesta
- Recordatorios diarios automáticos + resumen matutino
- Templates HTML profesionales para emails

### ✅ Funcionalidades de Negocio
- Workflow de aprobación de tours (Por Aprobar → Aprobado/Rechazado)
- Soft delete con audit trail (quién eliminó y cuándo)
- Cálculo automático de ganancias, comisiones, ITBM
- Sistema de disponibilidad (plantillas + slots)
- Exportación CSV para tours y estadías
- Dashboard con KPIs por período (hoy/semana/mes/año/todo)
- Calendario integrado
- Upload de comprobantes de pago

---

## 📊 INVENTARIO DEL CODEBASE

### Backend (Node.js + Express)

| Archivo | Líneas | Función |
|---------|--------|---------|
| `server/server.js` | 2,102 | API monolítica (50+ endpoints) |
| `server/auth.js` | 100 | JWT, bcrypt, RBAC middleware |
| `server/db/database.js` | 307 | SQLite, CRUD genérico, migraciones |
| `server/db/schema.sql` | 121 | 8 tablas + índices |
| `server/db/migrate.js` | ~200 | Migraciones adicionales |
| `server/notifications/index.js` | 345 | Orquestador de notificaciones |
| `server/notifications/email.js` | 400+ | Templates HTML + Nodemailer |
| `server/notifications/telegram.js` | 150+ | Bot API + templates |
| `server/notifications/whatsapp.js` | 250+ | Baileys + QR + templates |

### Frontend (React + TypeScript + Vite)

| Archivo | Líneas | Función |
|---------|--------|---------|
| `src/App.tsx` | 103 | Routing + auth guards |
| `src/api/api.ts` | 661 | HTTP client + TypeScript types |
| `src/contexts/AuthContext.tsx` | ~80 | Auth state management |
| **Componentes Admin** | | |
| `Dashboard.tsx` | 480+ | KPIs, charts, recientes |
| `ToursList.tsx` | 554 | Lista con paginación, filtros, acciones |
| `TourForm.tsx` | 530+ | Crear/editar tour |
| `EstadiasList.tsx` | 420+ | Lista de estadías |
| `EstadiaForm.tsx` | 400+ | Crear/editar estadía |
| `CalendarView.tsx` | 500+ | Vista calendario mensual |
| `DisponibilidadAdmin.tsx` | 1,150+ | Gestión de slots y plantillas |
| `Productos.tsx` | 780+ | Catálogo de actividades |
| `AdminPanel.tsx` | 170+ | Panel admin |
| `UsuariosAdmin.tsx` | 300+ | CRUD de usuarios |
| `NotificacionesConfig.tsx` | 220+ | Config de notificaciones |
| `LoginPage.tsx` | 170+ | Login form |
| `Layout.tsx` | 130+ | Sidebar + header |
| `ErrorBoundary.tsx` | 60+ | Error boundary global |
| **Componentes Partner** | | |
| `PartnerDashboard.tsx` | 430+ | Dashboard para partners |
| `PartnerLayout.tsx` | 130+ | Layout partner |
| `PartnerReservations.tsx` | 600+ | Lista de reservas partner |
| `PartnerTourRequest.tsx` | 750+ | Formulario multi-step |

### Infraestructura

| Archivo | Función |
|---------|---------|
| `Dockerfile` | Multi-stage build (node:20-alpine) |
| `render.yaml` | Deploy Render config |
| `vite.config.ts` | Vite + React + proxy |
| `tailwind.config.js` | Colores custom (azul, turquoise, arena) |
| `package.json` | 14 deps prod + 7 dev |

### Base de Datos (SQLite - 8 tablas)

| Tabla | Función |
|-------|---------|
| `reservas_tours` | Tours y reservas (~30 columnas) |
| `reservas_estadias` | Estadías y hospedaje (~20 cols) |
| `actividades` | Catálogo de actividades (~20 cols) |
| `propiedades` | Propiedades (hotel, apartamento, etc.) |
| `staff` | Instructores y responsables |
| `usuarios` | Auth (email, hash, rol, vendedor) |
| `horarios_slots` | Slots de disponibilidad |
| `plantillas_horario` | Templates semanales |
| `alertas` | AI monitoring alerts |
| `configuracion_notificaciones` | Config de canales |

---

## 📋 PLAN DE ACCIÓN RECOMENDADO

### 🔴 Prioridad URGENTE (esta semana)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 1 | Proteger endpoints públicos con `requireAuth` (dashboard, actividades, propiedades, staff, charts) | 30 min |
| 2 | Eliminar API Key del frontend, migrar estadías/actividades/propiedades a JWT auth | 1 hora |
| 3 | Cambiar `ALLOWED_ORIGINS` en `render.yaml` a la URL real del frontend | 5 min |
| 4 | Forzar env vars obligatorias (JWT_SECRET, API_KEY) en producción | 15 min |

### 🟠 Prioridad ALTA (próxima semana)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 5 | Dividir `server.js` en módulos por dominio (~10 archivos de rutas) | 3-4 horas |
| 6 | Agregar validación de contenido real en uploads (magic bytes) | 30 min |
| 7 | Agregar test framework (vitest) + tests básicos para auth y tours CRUD | 2-3 horas |

### 🟡 Prioridad MEDIA (próximo mes)

| # | Tarea | Esfuerzo |
|---|-------|----------|
| 8 | Reemplazar scheduler polling por `node-cron` | 30 min |
| 9 | Optimizar Dockerfile para excluir devDependencies | 30 min |
| 10 | Agregar logging estructurado (pino/winston) | 1 hora |
| 11 | Agregar health check endpoint para Render | 15 min |
| 12 | Documentar API con Swagger/OpenAPI | 2-3 horas |

---

**Auditoría completada:** 2026-03-23  
**Próxima auditoría recomendada:** 2026-04-23