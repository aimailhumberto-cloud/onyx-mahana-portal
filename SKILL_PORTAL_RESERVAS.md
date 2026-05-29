# 🧠 SKILL: Portal de Reservas — Mahana Tours

> **Propósito:** Este documento es tu manual operativo completo para manejar el Portal de Reservas de Mahana Tours vía API. Léelo, memorízalo, y opera siempre dentro de sus reglas.

---

## 🌐 ACCESO AL PORTAL

| Variable | Valor |
|----------|-------|
| **URL Base** | `https://mahana-portal.onrender.com` |
| **API Base** | `https://mahana-portal.onrender.com/api/v1` |
| **API Key** | Header `X-API-Key` — pedir al admin, NO usar la key de desarrollo |
| **Autenticación principal** | JWT vía `/api/v1/auth/login` |
| **Port local (dev)** | `3100` |

### Cómo autenticarte

**Opción 1 — API Key (recomendada para agentes):**
```
Header: X-API-Key: <API_KEY_PRODUCCION>
```
Esto te da acceso como `admin` automáticamente.

**Opción 2 — JWT Token (para sesiones persistentes):**
```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "admin@mahana.com", "password": "<ADMIN_PASSWORD>" }
```
Respuesta:
```json
{ "success": true, "data": { "token": "eyJ...", "user": { "id": 1, "email": "admin@mahana.com", "nombre": "Mahana Admin", "rol": "admin" } } }
```
Luego usa el token en todas las llamadas:
```
Header: Authorization: Bearer <token>
```
> ⚠️ El token expira en **7 días**. Si recibes error `TOKEN_EXPIRED`, re-autentícate.

### Verificar que el portal está vivo
```http
GET /api/v1/api-status
```
Respuesta esperada: `{ "success": true, "data": { "status": "ok", "version": "2.0.0" } }`

---

## 👥 ROLES Y PERMISOS

| Rol | Puede hacer |
|-----|-------------|
| **admin** | TODO — CRUD completo de tours, estadías, usuarios, productos, propiedades, dashboard, CxC, aprobaciones, notificaciones, exports |
| **partner** | Ver solo SUS tours (scoped por `vendedor`), crear tours (quedan "Por Aprobar"), ver su dashboard, ver disponibilidad |
| **vendedor** | Ver todos los tours, crear/editar tours, gestionar slots de disponibilidad |

> 🚨 Como agente AI, operas como **admin** (vía API Key). Esto te da poder total. **USA ESE PODER CON RESPONSABILIDAD.**

---

## ⛔ REGLAS ABSOLUTAS — LO QUE NUNCA DEBES HACER

> [!CAUTION]
> ### 🔴 PROHIBIDO — OPERACIONES DESTRUCTIVAS
> 
> 1. **NUNCA uses `DELETE /api/v1/tours/:id`** — Esto marca el tour como eliminado (soft delete). Solo un admin humano debería eliminar tours. Si un usuario te pide "cancelar" un tour, usa `PATCH /tours/:id/status` con `{"estatus": "Cancelado"}` en su lugar.
> 
> 2. **NUNCA uses `DELETE /api/v1/estadias/:id`** — Esto BORRA PERMANENTEMENTE la estadía de la base de datos. No hay soft delete para estadías. **IRREVERSIBLE.** Si hay que cancelar, cambia el estado a "Perdida".
> 
> 3. **NUNCA uses `DELETE /api/v1/actividades/:id`** — Borra el producto del catálogo permanentemente. Si quieres desactivar, usa `PUT /actividades/:id` con `{"activa": 0}`.
> 
> 4. **NUNCA uses `DELETE /api/v1/propiedades/:id`** — Borra la propiedad permanentemente. Desactiva con `{"activa": 0}`.
> 
> 5. **NUNCA uses `DELETE /api/v1/usuarios/:id`** — Borra el usuario permanentemente. Desactiva con `PATCH /usuarios/:id/toggle`.
> 
> 6. **NUNCA modifiques los campos financieros de un tour sin confirmación explícita del usuario** — `precio_ingreso`, `costo_pago`, `comision_pct`, `monto_comision`, `ganancia_mahana` afectan las CxC y reportes financieros.
> 
> 7. **NUNCA cambies el `vendedor` de un tour sin autorización** — Esto cambia la propiedad/scoping del tour y afecta qué partner lo ve.

---

## 📋 OPERACIONES QUE SÍ PUEDES HACER

### ✅ TOURS — Tu operación principal

#### Crear un tour
```http
POST /api/v1/tours
Content-Type: application/json
Authorization: Bearer <token>  (o X-API-Key)

{
  "fecha": "2026-05-15",
  "hora": "09:00",
  "cliente": "Juan Pérez",
  "whatsapp": "+507 6123-4567",
  "actividad": "Tour Cascada Filipinas",
  "vendedor": "Mahana Tours",
  "precio_ingreso": 100,
  "costo_pago": 40,
  "comision_pct": 20,
  "notas": "Familia de 4",
  "email_cliente": "juan@email.com",
  "hotel": "Radisson",
  "nacionalidad": "Panamá",
  "idioma": "Español",
  "pax": 4,
  "fuente": "ai-agent"
}
```

**Campos obligatorios:** `cliente`, `actividad`, `fecha`
**Campos opcionales pero recomendados:** `hora`, `whatsapp`, `vendedor`, `precio_ingreso`, `pax`, `email_cliente`

> 💡 Si envías `precio_ingreso` + `vendedor`, el sistema auto-calcula: `monto_comision`, `ganancia_mahana`, `cxc_subtotal`, `cxc_itbm`, `cxc_total`.

**Fórmula CxC automática:**
```
comision = precio_ingreso × comision_pct / 100
ganancia = precio_ingreso - costo_pago - comision
subtotal = precio_ingreso - comision
itbm = subtotal × 0.07
total_cxc = subtotal + itbm
```

#### Listar tours
```http
GET /api/v1/tours?estatus=Reservado&vendedor=Playa Caracol&fecha_desde=2026-03-01&fecha_hasta=2026-03-31&page=1&limit=50
```
Todos los filtros son opcionales. Paginación: `page` (default 1), `limit` (default 50).

#### Ver un tour específico
```http
GET /api/v1/tours/:id
```

#### Actualizar un tour
```http
PUT /api/v1/tours/:id
{ "estatus": "Reservado", "notas": "Confirmado por WhatsApp" }
```
> Solo roles `admin` y `vendedor` pueden editar.

#### Cambiar estatus de un tour (operación más común)
```http
PATCH /api/v1/tours/:id/status
{ "estatus": "Reservado" }
```

**Estatus válidos y su significado:**

| Estatus | Significado | Cuándo usarlo |
|---------|-------------|---------------|
| `Consulta` | Cliente preguntó pero no confirmó | Estado inicial por defecto |
| `Reservado` | Cliente confirmó, tiene cupo reservado | Cuando el cliente dice "sí quiero" |
| `Pagado` | Cliente ya pagó | Cuando hay comprobante de pago |
| `Cancelado` | Tour cancelado | ⚠️ Libera cupos del slot si existía |
| `Cerrado` | Tour completado/terminado | Post-actividad |
| `Por Aprobar` | Enviado por partner, pendiente aprobación admin | Solo para tours de partners |
| `Aprobado` | Admin aprobó un tour de partner | Tras revisión admin |
| `Rechazado` | Admin rechazó un tour de partner | ⚠️ Libera cupos del slot |

> **Flujo típico:** `Consulta` → `Reservado` → `Pagado` → `Cerrado`
> **Flujo partner:** `Por Aprobar` → `Aprobado` → `Reservado` → `Pagado` → `Cerrado`

#### Aprobar tour de partner (admin)
```http
POST /api/v1/tours/:id/aprobar
```
Auto-calcula precios si la actividad tiene `precio_base` configurado.

#### Rechazar tour de partner (admin)
```http
POST /api/v1/tours/:id/rechazar
{ "motivo": "Fecha no disponible" }
```

---

### 🏨 ESTADÍAS (Hospedaje)

#### Crear estadía
```http
POST /api/v1/estadias
{
  "cliente": "María López",
  "propiedad": "Radisson",
  "check_in": "2026-05-20",
  "check_out": "2026-05-23",
  "huespedes": 2,
  "tipo": "Suite",
  "precio_final": 450,
  "comision_pct": 20,
  "estado": "Solicitada",
  "notas": "Luna de miel"
}
```
**Campos obligatorios:** `cliente`, `propiedad`, `check_in`

#### Listar estadías
```http
GET /api/v1/estadias?estado=Confirmada&propiedad=Radisson&page=1&limit=50
```

#### Cambiar estatus de estadía
```http
PATCH /api/v1/estadias/:id/status
{ "estado": "Confirmada" }
```

**Estados válidos:** `Solicitada` → `Cotizada` → `Confirmada` → `Pagada` → `Perdida`

> ⚠️ Para "cancelar" una estadía, usa estado `Perdida`. NUNCA uses DELETE.

---

### 📊 DASHBOARD Y REPORTES

#### Dashboard admin (KPIs globales)
```http
GET /api/v1/dashboard?mes=2026-04
```
Retorna: resumen de tours, ingresos, ganancias, estadías, recientes, meses disponibles.

Filtros de mes: `2026-04` (mes), `2026` (año completo), `todo` (histórico).

#### Charts detallados
```http
GET /api/v1/charts?mes=2026-04
```
Retorna: ingresos por mes, distribución por actividad, periodos (hoy/semana/mes/año), estadías financieras.

#### Dashboard de partner
```http
GET /api/v1/partner/dashboard?mes=2026-04
```
Solo funciona con JWT de un usuario partner. Muestra solo datos de ese partner.

---

### 💰 CUENTAS POR COBRAR (CxC)

#### Listar CxC
```http
GET /api/v1/cxc?vendedor=Playa Caracol&cxc_estatus=Pendiente&fecha_desde=2026-03-01
```
Retorna: tours con CxC, summary (KPIs), aging (antigüedad), porVendedor.

#### Actualizar CxC de un tour
```http
PATCH /api/v1/tours/:id/cxc
{
  "cxc_estatus": "Pendiente",
  "cxc_factura_url": "https://...",
  "cxc_fecha_emision": "2026-04-01",
  "cxc_fecha_vencimiento": "2026-04-16"
}
```

**Flujo CxC:** `Sin Factura` → `Pendiente` → `Enviada` → `Pagada`

> 💡 Fechas se auto-llenan: emisión = hoy, vencimiento = +15 días, pago = hoy si marca "Pagada".

---

### 📅 DISPONIBILIDAD Y SLOTS

#### Ver disponibilidad de un día
```http
GET /api/v1/disponibilidad?fecha=2026-05-15
```

#### Ver disponibilidad de una semana
```http
GET /api/v1/disponibilidad/semana?desde=2026-05-12
```

#### Ver disponibilidad de un mes completo (⭐ recomendado para agentes)
```http
GET /api/v1/disponibilidad/mes?mes=2026-05&actividad_id=3
```
Retorna: todos los slots del mes + resumen por día (capacidad, reservados, disponibles, % ocupación).

#### Ver resumen de disponibilidad con alertas (⭐ ideal para monitoreo)
```http
GET /api/v1/disponibilidad/resumen
```
Retorna: por cada actividad, slots próximos 7 y 30 días, alertas de ocupación, días sin slots.

**Niveles de alerta:**
- `ok` — Todo bien
- `alta_ocupacion_7d` — ≥70% ocupación próximos 7 días
- `casi_lleno_7d` — ≥90% ocupación próximos 7 días
- `sin_slots_7d` — No hay slots creados para los próximos 7 días

#### Crear slot individual
```http
POST /api/v1/slots
{ "actividad_id": 3, "fecha": "2026-05-20", "hora": "09:00", "capacidad": 6 }
```

#### Crear slots en bulk (hasta 500)
```http
POST /api/v1/slots/bulk
{
  "slots": [
    { "actividad_id": 3, "fecha": "2026-05-20", "hora": "09:00", "capacidad": 6 },
    { "actividad_id": 3, "fecha": "2026-05-20", "hora": "14:00", "capacidad": 6 },
    { "actividad_id": 3, "fecha": "2026-05-21", "hora": "09:00", "capacidad": 6 }
  ]
}
```

---

### 🎯 CATÁLOGO DE ACTIVIDADES

#### Listar todas las actividades (productos)
```http
GET /api/v1/actividades
```

#### Crear actividad
```http
POST /api/v1/actividades
{
  "nombre": "Tour Islas Secas",
  "tipo": "tour",
  "categoria": "acuatico",
  "precio_base": 150,
  "costo_base": 60,
  "comision_caracol_pct": 20,
  "duracion": "6 horas",
  "punto_encuentro": "Marina David",
  "que_incluye": "Transporte, almuerzo, snorkel",
  "capacidad_max": 8,
  "visible_web": 1
}
```

#### Actualizar actividad
```http
PUT /api/v1/actividades/:id
{ "precio_base": 175, "activa": 1 }
```

#### Para desactivar (NO borrar):
```http
PUT /api/v1/actividades/:id
{ "activa": 0 }
```

---

### 🏠 PROPIEDADES

```http
GET /api/v1/propiedades              # Listar
POST /api/v1/propiedades             # Crear
PUT /api/v1/propiedades/:id          # Actualizar
```
Para desactivar: `PUT /propiedades/:id` con `{ "activa": 0 }`

---

### 📅 CALENDARIO

```http
GET /api/v1/calendar?mes=2026-05
```
Retorna tours y estadías del mes para vista de calendario.

---

### 👤 GESTIÓN DE USUARIOS

#### Listar usuarios (admin)
```http
GET /api/v1/usuarios
```

#### Crear usuario
```http
POST /api/v1/usuarios
{
  "email": "nuevo@email.com",
  "password": "minimo6chars",
  "nombre": "Nombre Completo",
  "rol": "partner",
  "vendedor": "Nombre Empresa"
}
```
- `rol`: `admin`, `partner`, `vendedor`
- `vendedor` es **obligatorio** para rol `partner`
- Password mínimo 6 caracteres

#### Activar/Desactivar usuario (↔️ toggle)
```http
PATCH /api/v1/usuarios/:id/toggle
```

#### Actualizar usuario
```http
PUT /api/v1/usuarios/:id
{ "nombre": "Nuevo Nombre", "password": "nuevaPass123" }
```

---

### 🔔 ALERTAS

#### Ver alertas (para monitoreo)
```http
GET /api/v1/alertas?tipo=tour_nuevo&leida=false&limit=20
```
Tipos de alerta: `tour_nuevo`, `tour_editado`, `tour_aprobado`, `tour_rechazado`

#### Marcar alerta como leída
```http
PATCH /api/v1/alertas/:id
```

#### Marcar todas como leídas
```http
PATCH /api/v1/alertas/leer-todas
```

---

### 📤 EXPORT CSV

```http
GET /api/v1/tours/export?fecha_desde=2026-01-01&fecha_hasta=2026-12-31&estatus=Pagado
GET /api/v1/estadias/export?check_in_desde=2026-01-01&estado=Confirmada
```
Retorna archivo CSV descargable.

---

### 📎 UPLOAD DE ARCHIVOS

```http
POST /api/v1/uploads
Content-Type: multipart/form-data
Body: file=<archivo>
```
Formatos: jpg, jpeg, png, gif, webp, pdf. Máximo 10MB.
Respuesta: `{ "url": "/uploads/1234567890-abc123.jpg" }`

La URL del archivo se usa en campos como `comprobante_url`.

---

### ⭐ RESEÑAS Y SATISFACCIÓN

#### Generar link de reseña para un tour
```http
POST /api/v1/tours/:id/link-resena
```
Retorna un código y URL para que el cliente deje su reseña.

#### Ver dashboard de satisfacción
```http
GET /api/v1/satisfaccion/dashboard?mes=2026-04
```

---

## 📐 FORMATO DE RESPUESTAS

**Éxito:**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 50, "page": 1, "limit": 50 }
}
```

**Error:**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Campo X es requerido" }
}
```

**Códigos de error comunes:**
| Código | HTTP | Significado |
|--------|------|-------------|
| `UNAUTHORIZED` | 401 | Token faltante o API Key inválida |
| `TOKEN_EXPIRED` | 401 | JWT expirado — re-autentícate |
| `FORBIDDEN` | 403 | No tienes permiso para esta acción |
| `NOT_FOUND` | 404 | Recurso no existe |
| `VALIDATION_ERROR` | 400 | Campos faltantes o inválidos |
| `DUPLICATE` | 409 | Ya existe un registro con ese valor único |
| `RATE_LIMIT` | 429 | Más de 200 requests/minuto |
| `SLOT_FULL` | 400 | No hay cupos disponibles en ese horario |

---

## 🗄️ ESTRUCTURA DE DATOS

### Tour (reservas_tours)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | int | ID único autoincremental |
| `fecha` | text | Fecha del tour (YYYY-MM-DD) |
| `hora` | text | Hora del tour (HH:MM) |
| `cliente` | text | **Obligatorio** — Nombre del cliente |
| `whatsapp` | text | Número WhatsApp del cliente |
| `email_cliente` | text | Email del cliente |
| `estatus` | text | Estado actual del tour |
| `vendedor` | text | Empresa vendedora (default: "Mahana Tours") |
| `actividad` | text | **Obligatorio** — Nombre de la actividad |
| `responsable` | text | Instructor/guía asignado |
| `precio_ingreso` | real | Precio total del tour cobrado al cliente |
| `costo_pago` | real | Costo del proveedor/operador |
| `comision_pct` | real | Porcentaje de comisión del partner |
| `monto_comision` | real | Monto calculado de la comisión |
| `ganancia_mahana` | real | Ganancia neta de Mahana |
| `notas` | text | Notas adicionales |
| `fuente` | text | Origen del registro (manual, api, partner-portal, ai-agent) |
| `pax` | int | Número de personas |
| `hotel` | text | Hotel donde se hospeda el cliente |
| `nacionalidad` | text | Nacionalidad del cliente |
| `idioma` | text | Idioma del cliente |
| `comprobante_url` | text | URL del comprobante de pago |
| `eliminado` | int | 0=activo, 1=soft-deleted |

### Estadía (reservas_estadias)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | int | ID único |
| `cliente` | text | **Obligatorio** — Nombre del cliente |
| `propiedad` | text | **Obligatorio** — Nombre de la propiedad |
| `check_in` | text | **Obligatorio** — Fecha check-in (YYYY-MM-DD) |
| `check_out` | text | Fecha check-out (YYYY-MM-DD) |
| `huespedes` | text | Número de huéspedes |
| `precio_cotizado` | text | Precio cotizado inicialmente |
| `precio_final` | real | Precio final acordado |
| `comision_pct` | real | % comisión (default 20%) |
| `monto_comision` | real | Monto de comisión calculado |
| `estado` | text | Estado de la estadía |
| `notas` | text | Notas |

---

## 🧭 GUÍA DE SITUACIONES COMUNES

### "El cliente quiere reservar un tour"
1. `GET /api/v1/disponibilidad?fecha=YYYY-MM-DD` — Verifica cupos
2. `GET /api/v1/actividades` — Consulta precios y detalles
3. `POST /api/v1/tours` — Crea la reserva con `fuente: "ai-agent"`
4. Si hay slot_id disponible, inclúyelo en el POST para decrementar cupos automáticamente

### "El cliente quiere cancelar"
1. `PATCH /api/v1/tours/:id/status` con `{ "estatus": "Cancelado" }`
2. **NUNCA** uses DELETE. Cancelar libera los cupos del slot automáticamente.

### "Necesito ver cómo van las ventas del mes"
1. `GET /api/v1/dashboard?mes=2026-04`

### "Un partner envió un tour — hay que revisarlo"
1. `GET /api/v1/alertas?tipo=tour_nuevo&leida=false` — Ver pendientes
2. `GET /api/v1/tours/:id` — Revisar detalles
3. `POST /api/v1/tours/:id/aprobar` o `POST /api/v1/tours/:id/rechazar`

### "¿Hay disponibilidad para mañana?"
1. `GET /api/v1/disponibilidad?fecha=YYYY-MM-DD`
2. O mejor: `GET /api/v1/disponibilidad/resumen` para vista global con alertas

### "Necesito desactivar un producto"
```http
PUT /api/v1/actividades/:id
{ "activa": 0 }
```
**NUNCA** uses DELETE.

### "Necesito desactivar un usuario"
```http
PATCH /api/v1/usuarios/:id/toggle
```
**NUNCA** uses DELETE.

---

## 🔒 RATE LIMITING

- **200 requests por minuto** por IP
- Si excedes el límite, recibirás `429 RATE_LIMIT`
- Espera 60 segundos y reintenta

---

## 🔔 SISTEMA DE NOTIFICACIONES

El portal envía notificaciones automáticamente por 3 canales cuando ocurren eventos:
- **Email** — Nodemailer
- **Telegram** — Bot API
- **WhatsApp** — Baileys

**Eventos que disparan notificaciones:**
- Tour creado
- Tour aprobado/rechazado
- Cambio de estatus
- Tour eliminado
- Estadía creada/actualizada
- Reseña con score bajo (auto-crea ticket de servicio)

**Recordatorios automáticos:**
- 6:00 PM Panamá — Recordatorios de tours de mañana
- 7:00 AM Panamá — Resumen diario

Tú **NO** necesitas enviar notificaciones manualmente. El sistema las envía automáticamente al crear/modificar registros vía API.

---

## 📝 RESUMEN EJECUTIVO

| ✅ SÍ puedes | ⛔ NO debes |
|-------------|------------|
| Crear tours | DELETE tours (usa Cancelado) |
| Cambiar estatus | DELETE estadías (usa Perdida) |
| Crear estadías | DELETE actividades (usa activa=0) |
| Consultar dashboard | DELETE usuarios (usa toggle) |
| Ver disponibilidad | Modificar financieros sin confirmar |
| Crear/editar actividades | Cambiar vendedor sin autorizar |
| Gestionar slots | Exceder 200 req/min |
| Aprobar/rechazar tours | Operar sin API Key/Token válido |
| Generar links de reseña | Inventar datos de clientes |
| Exportar CSV | Crear usuarios admin sin autorización |

---

*Última actualización: 2026-04-20*
*Portal v2.0.0 — Stack: Express + SQLite + React*
*Mantener este documento sincronizado con cambios al API*
