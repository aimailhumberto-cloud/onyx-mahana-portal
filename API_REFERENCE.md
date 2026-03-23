# Mahana Portal — API Reference

**Base URL:** `https://mahana-portal.onrender.com/api/v1`

## Autenticación

Todos los endpoints requieren autenticación. Hay dos métodos:

### Opción 1: API Key (para agentes/bots)
```
Header: X-API-Key: <API_KEY configurado en Render>
```

### Opción 2: JWT Token (para usuarios del portal)
```
Header: Authorization: Bearer <token>
```

---

## Auth

### Login
```http
POST /auth/login
Content-Type: application/json

{ "email": "admin@mahana.com", "password": "tu_password" }
```
**Respuesta:** `{ success: true, data: { token, user: { id, email, nombre, rol, vendedor } } }`

### Mi perfil
```http
GET /auth/me
```

---

## Usuarios

### Listar
```http
GET /usuarios
```

### Crear
```http
POST /usuarios
{ "email": "nuevo@email.com", "password": "min6chars", "nombre": "Nombre", "rol": "partner", "vendedor": "Playa Caracol" }
```
- Roles válidos: `admin`, `partner`, `vendedor`
- `vendedor` solo aplica para rol `partner`

### Actualizar
```http
PUT /usuarios/:id
{ "nombre": "Nuevo Nombre", "password": "nuevaPassword123" }
```
> ⚠️ La contraseña debe tener **mínimo 6 caracteres**. Si tiene menos, se ignora sin error.

### Activar/Desactivar
```http
PATCH /usuarios/:id/toggle
```

### Eliminar
```http
DELETE /usuarios/:id
```

---

## Tours

### Listar
```http
GET /tours?estatus=Reservado&vendedor=Playa Caracol&fecha_desde=2026-03-01&fecha_hasta=2026-03-31&page=1&limit=50
```

### Obtener uno
```http
GET /tours/:id
```

### Crear
```http
POST /tours
{
  "fecha": "2026-03-25",
  "hora": "09:00",
  "cliente": "Juan Pérez",
  "whatsapp": "+507 6123-4567",
  "actividad": "Tour Cascada Filipinas",
  "vendedor": "Playa Caracol",
  "precio_ingreso": 100,
  "costo_pago": 40,
  "comision_pct": 20,
  "notas": "Familia de 4"
}
```
> CxC (subtotal, ITBM, total) se auto-calcula si `precio_ingreso` y `vendedor` están presentes.

### Actualizar
```http
PUT /tours/:id
{ "estatus": "Reservado", "precio_ingreso": 120 }
```

### Cambiar estatus
```http
PATCH /tours/:id/status
{ "estatus": "Reservado" }
```
Estatus válidos: `Consulta`, `Reservado`, `Pagado`, `Cancelado`, `Cerrado`, `Aprobado`, `Por Aprobar`, `Rechazado`

### Eliminar (soft delete)
```http
DELETE /tours/:id
```

---

## CxC (Cuentas por Cobrar)

### Listar CxC (admin)
```http
GET /cxc?vendedor=Playa Caracol&cxc_estatus=Pendiente&fecha_desde=2026-03-01
```
**Respuesta incluye:** `tours`, `summary` (KPIs), `aging` (antigüedad), `porVendedor`

### Actualizar CxC de un tour
```http
PATCH /tours/:id/cxc
{
  "cxc_estatus": "Pendiente",
  "cxc_factura_url": "https://...",
  "cxc_fecha_emision": "2026-03-23",
  "cxc_fecha_vencimiento": "2026-04-07"
}
```
Estatus CxC: `Sin Factura` → `Pendiente` → `Enviada` → `Pagada`

> Fechas se auto-llenan: emisión = hoy, vencimiento = +15 días, pago = hoy si marca Pagada.

### CxC del Partner
```http
GET /partner/cxc
```
> Requiere JWT de un usuario partner. Retorna solo sus facturas.

---

## Estadías

### Listar
```http
GET /estadias?estado=Confirmada&page=1&limit=50
```

### Crear
```http
POST /estadias
{
  "cliente": "María López",
  "propiedad": "Radisson",
  "check_in": "2026-03-25",
  "check_out": "2026-03-28",
  "huespedes": 2,
  "precio_noche": 150
}
```

### Actualizar
```http
PUT /estadias/:id
{ "estado": "Confirmada" }
```

### Cambiar estatus
```http
PATCH /estadias/:id/status
{ "estado": "Confirmada" }
```

---

## Catálogos

### Actividades (productos)
```http
GET    /actividades          # Listar todas
GET    /actividades/:id      # Obtener una
POST   /actividades          # Crear (admin)
PUT    /actividades/:id      # Actualizar (admin)
DELETE /actividades/:id      # Eliminar (admin)
```

### Propiedades
```http
GET    /propiedades          # Listar todas
GET    /propiedades/:id      # Obtener una
POST   /propiedades          # Crear (admin)
PUT    /propiedades/:id      # Actualizar (admin)
DELETE /propiedades/:id      # Eliminar (admin)
```

---

## Dashboard y Charts
```http
GET /dashboard?mes=2026-03
GET /charts?mes=2026-03
```

---

## Disponibilidad / Slots
```http
GET  /disponibilidad?fecha=2026-03-25
GET  /disponibilidad/semana?desde=2026-03-24
POST /slots                           # Crear slot
PUT  /slots/:id                       # Actualizar
```

---

## Subir archivos
```http
POST /upload
Content-Type: multipart/form-data
Body: file=<archivo>
```
**Respuesta:** `{ success: true, data: { url: "/uploads/filename.jpg" } }`

---

## Formato de Respuesta

Todas las respuestas siguen este formato:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 50, "page": 1, "limit": 50 }
}
```

En caso de error:
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Campo X es requerido" }
}
```

## Cálculo CxC (auto)

```
Precio tour:           $100
Comisión partner (20%): -$20
Subtotal Mahana:        $80
ITBM (7% de $80):      $5.60
Total CxC:             $85.60  ← lo que el partner debe pagar a Mahana
```
