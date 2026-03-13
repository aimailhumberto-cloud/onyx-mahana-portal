# 🔍 Auditoría de Código - Mahana Portal

**Fecha:** 2026-03-13  
**Repositorio:** aimailhumberto-cloud/onyx-mahana-portal  
**Auditores:** Coding Expert, Design Expert, Interface Expert  
**Estado:** Carga con errores

---

## 📊 Resumen Ejecutivo

| Categoría | Críticos | Altos | Medios | Bajos |
|-----------|----------|-------|--------|-------|
| **Coding** | 2 | 3 | 2 | 1 |
| **Design** | 0 | 2 | 3 | 1 |
| **Interface** | 0 | 1 | 2 | 2 |

**Score Total:** 62/100 (Funcional pero necesita mejoras)

---

## 👨‍💻 CODING EXPERT - Arquitectura y Código

### Funcionalidad Actual

**✅ Lo que SÍ funciona:**
- Backend server JSON levanta correctamente
- API endpoints responden (`/api/tours`, `/api/crm`, `/api/status`)
- Datos de prueba cargados (`tours.json`, `crm.json`)
- Frontend compila y renderiza
- Colores Tailwind correctamente configurados
- Build de producción funciona

**❌ Lo que NO funciona:**
- Frontend NO consume la API real (usa datos mock)
- API URL hardcodeada a `localhost:3100`
- Sin conexión entre componentes y backend

---

### 🔴 Críticos

#### C1: Frontend Desconectado del Backend
**Archivos:** `src/components/Dashboard.tsx`, `src/components/ToursList.tsx`

**Problema:** Los componentes usan datos hardcodeados (mock), NO la API.

```typescript
// Dashboard.tsx - LÍNEAS 7-26
const stats = [
  { label: 'Reservas Hoy', value: '12', change: 3, ... },  // ← HARDCODED
  ...
]

const recentReservations = [
  { id: 1, client: 'Juan Pérez', ... },  // ← FALSO
  ...
]
```

```typescript
// ToursList.tsx - LÍNEAS 17-24
const mockReservations = [
  { id: 1, client: 'Juan Pérez', ... },  // ← NUNCA USA getTours()
  ...
]
```

**Impacto:** El portal muestra datos falsos. Usuario ve "Juan Pérez" en lugar de datos reales.

**Solución:**
```typescript
// Dashboard.tsx
import { getDashboard, getTours } from '../api/sheets'
import { useEffect, useState } from 'react'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const dashboard = await getDashboard()
        const tours = await getTours()
        setStats(transformToStats(dashboard, tours))
      } catch (e) {
        setError('Error al cargar datos')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  // ... render con datos reales
}
```

---

#### C2: API URL Hardcodeada ( producción fallará)
**Archivo:** `src/api/sheets.ts:4`

```typescript
const API_URL = 'http://localhost:3100'  // ← SOLO FUNCIONA EN LOCAL
```

**Problema:** En Render/Vercel/etc, `localhost` no existe.

**Solución:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD 
    ? 'https://mahana-portal.onrender.com'  // URL producción
    : 'http://localhost:3100')
```

**Crear `.env.production`:**
```
VITE_API_URL=https://tu-backend-url.com
```

---

### 🟠 Altos

#### C3: Sin Manejo de Estados (loading, error, empty)
**Archivos:** Todos los componentes

**Problema:** No hay estados de carga ni error. Usuario ve pantalla vacía o datos incorrectos.

**Missing:**
- `useState([])` para datos
- `useState(true)` para loading
- `useState(null)` para error
- `useEffect()` para fetch

---

#### C4: Funciones API Definidas pero NO Usadas
**Archivo:** `src/api/sheets.ts`

```typescript
// EXISTEN pero nunca se llaman:
export async function getAllData() { ... }      // ← SIN USO
export async function getTours() { ... }         // ← SIN USO
export async function getVentasCaracol() { ... } // ← SIN USO
export async function getCRM() { ... }           // ← SIN USO
export async function getDashboard() { ... }     // ← SIN USO
```

**Solución:** Conectar o eliminar.

---

#### C5: Vulnerabilidad de Seguridad en POST
**Archivo:** `server/server.js:40-48`

```javascript
const newItem = {
  ID: newId,
  ...req.body,  // ← SIN VALIDACIÓN - Prototype Pollution posible
  Estado: '📥 Solicitada'
};
```

**Solución:**
```javascript
const allowed = ['Cliente', 'WhatsApp', 'Email', 'Propiedad', 'Tipo', 
                  'Check-in', 'Check-out', 'Huéspedes', 'Habitaciones', 'Notas']
const newItem = {
  ID: newId,
  'Fecha Solicitud': new Date().toISOString().split('T')[0],
  Estado: '📥 Solicitada'
}
allowed.forEach(field => {
  if (req.body[field] !== undefined) {
    newItem[field] = String(req.body[field]).slice(0, 500) // sanitizar
  }
})
```

---

### 🟡 Medios

#### C6: Tipos TypeScript Inconsistentes
**Archivos:** `src/types/index.ts` vs `src/api/sheets.ts`

```typescript
// types/index.ts define:
export interface Reservation {
  id: string
  clientName: string
  ...
}

// sheets.ts define:
export interface Tour {
  ID?: string        // ← DIFERENTE
  Cliente?: string   // ← DIFERENTE
  ...
}
```

**Solución:** Unificar tipos o crear mappers.

---

#### C7: Sin Environment Variables
**Problema:** Configuración hardcodeada.

**Crear:**
```
# .env.example
VITE_API_URL=http://localhost:3100
PORT=3100
NODE_ENV=development
```

---

### 🟢 Bajos

#### C8: CORS Abierto
**Archivo:** `server/server.js:12`

```javascript
app.use(cors());  // ← Permite cualquier origen
```

**Mejor:** Limitar a dominios conocidos en producción.

---

---

## 🎨 DESIGN EXPERT - UX y Flujo de Usuario

### Flujo Actual

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Usuario   │ ──► │   Frontend   │ ──► │   Mock Data │ ← PROBLEMA: No llega al backend
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            │ NO CONECTA
                            ▼
                    ┌──────────────┐
                    │   Backend    │
                    │  (server.js) │
                    └──────────────┘
```

---

### 🟠 Altos

#### D1: Sin Feedback al Usuario
**Problema:** Cuando la API falla o carga, el usuario NO lo sabe.

**Estado Actual:**
- Carga → Pantalla vacía o datos incorrectos
- Error → Nada, silencio total
- Sin datos → Muestra "Juan Pérez" falso

**Solución:**
```tsx
{loading && (
  <div className="flex justify-center p-8">
    <Spinner className="animate-spin" />
  </div>
)}

{error && (
  <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
    <p className="text-red-700">{error}</p>
    <button onClick={retry}>Reintentar</button>
  </div>
)}

{data.length === 0 && !loading && (
  <EmptyState message="No hay reservas" />
)}
```

---

#### D2: Navegación Confusa
**Archivo:** `src/App.tsx`

```tsx
<Route path="crm" element={<ToursList />} />     // ← MISMO que Tours??
<Route path="admin" element={<Dashboard />} />    // ← MISMO que Home??
```

**Problema:**
- `/crm` muestra lista de tours, no CRM
- `/admin` muestra dashboard, no panel admin
- Usuario no sabe dónde está

**Solución:** Crear componentes específicos:
- `CRMList.tsx` - Para solicitudes de habitaciones
- `AdminPanel.tsx` - Para configuración/admin

---

### 🟡 Medios

#### D3: Datos No Corresponden a Labels
**Archivo:** `src/components/Dashboard.tsx`

```tsx
{ label: 'Reservas Hoy', value: '12', change: 3, ...
```

**Problema:** Dice "Reservas Hoy" pero el dato es falso.

**Solución:** Usar datos reales del API:
```typescript
const stats = [
  { label: 'Reservas Hoy', value: toursHoy.length, change: deltaHoy },
  { label: 'Ingresos Mes', value: `$${ingresosMes.toLocaleString()}`, change: deltaMes },
  ...
]
```

---

#### D4: Búsqueda No Funcional
**Archivo:** `src/components/ToursList.tsx:39-41`

```tsx
const filteredReservations = mockReservations.filter(r => {
  if (search && !r.client.toLowerCase().includes(search.toLowerCase())) return false
  ...
})
```

**Problema:** 
- Filtra datos mock, no datos reales
- Si escribe algo y luego carga datos reales, el filtro no funciona

---

#### D5: Categorías Hardcodeadas
**Archivo:** `src/components/ToursList.tsx:9-15`

```tsx
const categories = [
  { id: 'all', name: 'Todos', count: 45 },      // ← FALSO
  { id: 'surf', name: 'Surf', count: 12 },      // ← FALSO
  ...
]
```

**Solución:** Calcular dinámicamente:
```typescript
const categories = useMemo(() => [
  { id: 'all', name: 'Todos', count: reservations.length },
  { id: 'surf', name: 'Surf', count: reservations.filter(r => r.Actividad?.includes('Surf')).length },
  ...
], [reservations])
```

---

### 🟢 Bajos

#### D6: Botones sin Funcionalidad
**Archivo:** `src/components/Dashboard.tsx:77-88`

```tsx
<button>Nueva Reserva</button>      // ← No hace nada
<button>Nueva Solicitud CRM</button> // ← No hace nada
<button>Exportar Excel</button>      // ← No hace nada
<button>Ver Calendario</button>       // ← No hace nada
```

**Estado:** Botones visuales sin onClick.

---

---

## 🖥️ INTERFACE EXPERT - UI y Componentes

### Estructura Visual

**✅ Bueno:**
- Colores definidos correctamente en Tailwind
- Tipografía con Inter + Poppins
- Responsive design implementado
- Iconos Lucide consistentes
- Layout con sidebar funcional

**❌ Problemas:**
- Componentes no usan datos reales
- Algunos estilos no aplican por datos incorrectos

---

### 🟠 Alto

#### I1: Colores en Status Mal Mapeados
**Archivo:** `src/components/ToursList.tsx:25-30`

```tsx
const statusColors: Record<string, string> = {
  confirmada: 'bg-turquoise-100 text-turquoise-700 border-turquoise-200',
  pendiente: 'bg-arena-100 text-arena-700 border-arena-200',
  pagada: 'bg-green-100 text-green-700 border-green-200',
  cancelada: 'bg-red-100 text-red-700 border-red-200',
}
```

**Problema:** Los datos reales tienen status:
- `"Pagado"` ← Español
- `"Reservado"`
- `"Consulta"`
- `"Cerrado"`

Pero el código usa status en inglés: `confirmada`, `pendiente`, `pagada`

**Solución:**
```typescript
const statusColors: Record<string, string> = {
  'Pagado': 'bg-green-100 text-green-700',
  'Reservado': 'bg-turquoise-100 text-turquoise-700',
  'Consulta': 'bg-arena-100 text-arena-700',
  'Cerrado': 'bg-gray-100 text-gray-700',
  'Cancelado': 'bg-red-100 text-red-700',
}
```

---

### 🟡 Medios

#### I2: Paginación Sin Implementar
**Archivo:** `src/components/ToursList.tsx:129-138`

```tsx
<button>Anterior</button>
<button>1</button>
<button>2</button>
<button>Siguiente</button>
```

**Estado:** Botones estáticos, no funcionales.

---

#### I3: Filtros por Status No Persisten
**Problema:** Si filtras por "confirmada" y luego cargan datos reales con status "Pagado", el filtro no encuentra nada.

---

### 🟢 Bajos

#### I4: Iconos Hardcodeados en Stats
**Archivo:** `src/components/Dashboard.tsx`

```tsx
const stats = [
  { icon: Calendar, ... },  // ← Fijo
  { icon: DollarSign, ... }, // ← Fijo
  ...
]
```

**Mejorable:** Podría calcularse según contexto.

---

#### I5: Sidebar Usuario Hardcodeado
**Archivo:** `src/components/Layout.tsx:62-67`

```tsx
<div className="w-10 h-10 rounded-full bg-turquoise-600 ...">
  <span className="font-semibold">HB</span>
</div>
<p className="font-medium truncate">Admin</p>
<p className="text-sm text-gray-400 truncate">admin@mahana.com</p>
```

**Estado:** Usuario fixo, no dinámico.

---

---

## 🔧 PUNTOS CRÍTICOS A REVISAR (del análisis anterior)

Estos problemas de seguridad y arquitectura siguen siendo válidos:

### Mantener de la Auditoría Anterior:

| # | Problema | Prioridad | Estado |
|---|----------|-----------|--------|
| **E1** | Sin validación de input en POST /api/crm | 🔴 CRÍTICO | Pendiente |
| **E2** | CORS abierto a todos los dominios | 🟠 ALTO | Pendiente |
| **E3** | Sin rate limiting | 🟠 ALTO | Pendiente |
| **E4** | Race condition en escritura de archivos | 🟡 MEDIO | Pendiente |
| **E5** | Sin error handling global | 🟡 MEDIO | Pendiente |

---

---

## 📋 PLAN DE ACCIÓN PRIORITARIO

### 🔴 HOY - Conectar Frontend al Backend

**1. Crear hook para datos:**
```typescript
// src/hooks/useApi.ts
export function useApi<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetcher()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [fetcher])

  return { data, loading, error }
}
```

**2. Actualizar Dashboard:**
```typescript
export default function Dashboard() {
  const { data: dashboard, loading, error } = useApi(() => getDashboard())
  const { data: tours } = useApi(() => getTours())

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />

  // Usar datos reales
  const stats = [
    { label: 'Reservas Hoy', value: tours?.data?.length || 0, ... },
    ...
  ]
}
```

**3. Actualizar API URL:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:3100')
```

---

### 🟠 ESTA SEMANA

1. Crear componentes `CRMList.tsx` y `AdminPanel.tsx`
2. Agregar validación de input en POST /api/crm
3. Configurar CORS para producción
4. Implementar loading/error states
5. Mapear status en español

---

### 🟡 PRÓXIMA SEMANA

1. Implementar paginación real
2. Agregar funcionalidad a botones
3. Crear tests unitarios básicos

---

---

## 📈 MÉTRICAS DE CÓDIGO

| Métrica | Valor | Estado |
|---------|-------|--------|
| Archivos TypeScript | 8 | 🟢 OK |
| Componentes | 4 | 🟢 OK |
| Líneas de código | ~500 | 🟢 OK |
| Conexión Frontend-Backend | 0% | 🔴 Crítico |
| Tests | 0 | 🔴 Crítico |
| TypeScript estricto | Parcial | 🟡 |
| Responsive Design | Sí | 🟢 |
| Colores configurados | Sí | 🟢 ✅ (corrección) |

---

## 🎯 CONCLUSIÓN

**El portal CARGA pero NO funciona:**
- ✅ Backend responde con datos
- ✅ Frontend renderiza correctamente
- ❌ Frontend NO consume el backend
- ❌ Usuario ve datos falsos

**Score de Funcionalidad Real: 30%**
- Visual: 90% ✅
- Conexión: 0% ❌
- Datos reales: 0% ❌

**Tiempo para Versión Funcional:** 4-8 horas
- Conectar API: 2 horas
- Estados loading/error: 1 hora
- Mapear status correctos: 30 min
- Testing básico: 1 hora
- Fixes adicionales: 1-2 horas

---

**Auditado por:**  
👨‍💻 **Coding Expert** - Arquitectura, backend, conexión  
🎨 **Design Expert** - UX, flujo, feedback  
🖥️ **Interface Expert** - UI, componentes, estilos

**Próximo paso:** Conectar frontend al backend y corregir puntos críticos de seguridad.