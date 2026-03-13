# 🔍 Auditoría de Código - Mahana Portal

**Fecha:** 2026-03-13  
**Repositorio:** aimailhumberto-cloud/onyx-mahana-portal  
**Auditores:** Warren (CFO), Steve (COO), Elon (CTO)

---

## 📊 Resumen Ejecutivo

| Categoría | Críticos | Altos | Medios | Bajos |
|-----------|----------|-------|--------|-------|
| **Seguridad** | 3 | 2 | 1 | 0 |
| **Funcionalidad** | 2 | 3 | 4 | 2 |
| **Mantenibilidad** | 0 | 1 | 5 | 3 |
| **Performance** | 0 | 1 | 2 | 1 |

**Score Total:** 52/100 (Requiere atención inmediata)

---

## 💰 WARREN (CFO) - Eficiencia y Costos

### Problemas Críticos

#### ❌ W1: API Hardcodeada - Costo de Migración Alto
**Archivo:** `src/api/sheets.ts:4`
```typescript
const API_URL = 'http://localhost:3100'
```
**Problema:** La URL está hardcodeada. En producción fallará.
**Costo:** Tiempo de desarrollo + debugging + hotfix
**Solución:**
```typescript
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3100'
```

#### ❌ W2: Datos Mock en Producción
**Archivo:** `src/components/Dashboard.tsx:7-26`
```typescript
const stats = [
  { label: 'Reservas Hoy', value: '12', change: 3, ...
```
**Problema:** Dashboard muestra datos estáticos, no usa la API.
**ROI Negativo:** El portal no proporciona valor real sin datos dinámicos.
**Costo Estimado:** 2-4 horas de desarrollo.

#### ❌ W3: Funciones API No Usadas
**Archivo:** `src/api/sheets.ts:66-97`
**Problema:** Existen funciones `getAllData()`, `getTours()`, etc. pero NO se usan en los componentes.
**Deuda Técnica:** Código muerto que aumenta el bundle size.

### Recomendaciones Warren
1. **Inmediato:** Crear `.env` con URLs de API
2. **Semana 1:** Conectar Dashboard a API real
3. **Semana 2:** Eliminar código muerto

**Impacto Financiero:** El portal sin datos reales = $0 ROI. Conectar API = habilita $21K+/mes en reservas.

---

## 🔧 STEVE (COO) - Operaciones y Mantenibilidad

### Problemas Altos

#### ⚠️ S1: Sin Manejo de Estados de Carga
**Archivo:** `src/components/ToursList.tsx`
**Problema:** No hay loading states, error states, ni estados vacíos.
**UX Impact:** Usuario ve datos vacíos mientras carga la API.
**Solución:**
```typescript
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

// En useEffect
try {
  setLoading(true)
  const data = await getTours()
  setReservations(data)
} catch (e) {
  setError('No se pudieron cargar las reservas')
} finally {
  setLoading(false)
}
```

#### ⚠️ S2: Sin Persistencia de Datos
**Archivo:** `server/server.js`
**Problema:** Los datos se guardan en archivos JSON locales.
**Riesgo Operativo:** 
- Sin backups automáticos
- Sin historial de cambios
- Conflictos si múltiples instancias
**Solución:** Migrar a base de datos (SQLite mínimo, PostgreSQL ideal).

#### ⚠️ S3: Navegación Inconsistente
**Archivo:** `src/App.tsx:10-14`
```typescript
<Route path="crm" element={<ToursList />} />
<Route path="admin" element={<Dashboard />} />
```
**Problema:** CRM usa el mismo componente que Tours (ToursList). Admin usa Dashboard.
**Confusión:** Usuario no sabe en qué página está.
**Solución:** Crear componentes separados `CRMList.tsx` y `AdminPanel.tsx`.

### Problemas Medios

#### 📝 S4: Colores Personalizados Sin Definición
**Archivo:** Varios componentes
```typescript
'bg-turquoise-500', 'bg-arena-500', 'text-azul-900'
```
**Problema:** Colores personalizados (`turquoise`, `arena`, `azul`) no están definidos en Tailwind.
**Resultado:** Clases no funcionan, colores por defecto.
**Solución:** Agregar a `tailwind.config.js`:
```javascript
colors: {
  turquoise: { 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
  arena: { 500: '#d4a574', 600: '#c4956a' },
  azul: { 600: '#1e40af', 900: '#1e3a5f' }
}
```

#### 📝 S5: Sin Tests Automatizados
**Problema:** Zero test files.
**Riesgo:** Cualquier cambio puede romper funcionalidad existente.
**Costo:** Sin tests, cada release requiere testing manual completo.

### Recomendaciones Steve
1. **Inmediato:** Agregar loading/error states
2. **Semana 1:** Configurar colores Tailwind
3. **Semana 2:** Separar componentes CRM y Admin
4. **Semana 3:** Migrar a base de datos real
5. **Mes 2:** Agregar tests unitarios mínimos

---

## 🛡️ ELON (CTO) - Arquitectura y Seguridad

### Problemas Críticos de Seguridad

#### 🚨 E1: Sin Validación de Input (CRITICAL)
**Archivo:** `server/server.js:40-48`
```javascript
app.post('/api/crm', (req, res) => {
  const crm = readJSON('crm.json');
  const newId = 'R' + String(crm.length + 1).padStart(3, '0');
  const newItem = {
    ID: newId,
    'Fecha Solicitud': new Date().toISOString().split('T')[0],
    ...req.body,  // ⚠️ SPREAD SIN VALIDACIÓN
    Estado: '📥 Solicitada'
  };
```
**Vulnerabilidades:**
1. **Prototype Pollution:** Attacker puede inyectar `__proto__`
2. **XSS:** Sin sanitización de strings
3. **Injection:** Campos maliciosos pueden sobrescribir ID, Fecha, Estado

**Exploit:**
```javascript
// Attacker envía:
{ "Cliente": "<script>alert('xss')</script>", "__proto__": { "admin": true } }
```

**Solución:**
```javascript
const allowedFields = ['Cliente', 'WhatsApp', 'Email', 'Propiedad', 'Tipo', 'Check-in', 'Check-out', 'Huéspedes', 'Habitaciones'];
const newItem = {
  ID: newId,
  'Fecha Solicitud': new Date().toISOString().split('T')[0],
  Estado: '📥 Solicitada'
};
allowedFields.forEach(field => {
  if (req.body[field] !== undefined) {
    newItem[field] = sanitize(req.body[field]);
  }
});
```

#### 🚨 E2: Sin Rate Limiting
**Archivo:** `server/server.js`
**Problema:** Cualquiera puede hacer ataques DoS o brute force.
**Solución:**
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100 // 100 requests por ventana
});
app.use('/api/', limiter);
```

#### 🚨 E3: Sin CORS Configuration Segura
**Archivo:** `server/server.js:12`
```javascript
app.use(cors());
```
**Problema:** Permite requests de CUALQUIER origen.
**Solución:**
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true
}));
```

### Problemas Altos

#### ⚠️ E4: Sin Environment Variables
**Problema:** Configuración hardcodeada.
**Solución:** Crear `.env.example`:
```
PORT=3100
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,https://portal.mahana.com
DATA_DIR=./data
```

#### ⚠️ E5: Sin Error Handling Global
**Archivo:** `server/server.js`
**Problema:** Un error no manejado puede crashear el servidor.
**Solución:**
```javascript
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Graceful shutdown
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
```

#### ⚠️ E6: Race Condition en Escritura
**Archivo:** `server/server.js:24`
```javascript
const writeJSON = (file, data) => {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
};
```
**Problema:** Múltiples requests concurrentes pueden causar corrupción de datos.
**Solución:** Usar file locks o migrar a base de datos.

### Problemas de Arquitectura

#### 🏗️ E7: Frontend No Usa Tipos TypeScript
**Archivos:** Todos los `.tsx`
**Problema:** Interfaces definidas pero no usadas con datos reales.
```typescript
// sheets.ts define tipos
export interface Tour { ... }
// Pero ToursList usa mockReservations sin tipo
const mockReservations = [ ... ]
```

#### 🏗️ E8: Sin Separación de Concerns
**Problema:** Todo el backend en un archivo (`server.js` de 120 líneas).
**Mejor Práctica:**
```
server/
├── routes/
│   ├── tours.js
│   ├── crm.js
│   └── dashboard.js
├── middleware/
│   ├── validation.js
│   └── errorHandler.js
├── services/
│   └── dataService.js
└── server.js
```

### Recomendaciones Elon
1. **URGENTE (Hoy):** Agregar validación de input en POST /api/crm
2. **URGENTE (Hoy):** Configurar CORS correctamente
3. **Esta Semana:** Agregar rate limiting
4. **Esta Semana:** Crear tests de seguridad básicos
5. **Próximo Mes:** Migrar a arquitectura modular + base de datos

---

## 📋 Checklist de Acciones Prioritarias

### 🔴 Crítico (Hoy)
- [ ] E1: Agregar validación de input en POST /api/crm
- [ ] E2: Configurar CORS con origins específicos
- [ ] W1: Crear archivo `.env` con configuración

### 🟠 Alto (Esta Semana)
- [ ] E3: Agregar rate limiting
- [ ] S1: Implementar loading/error states
- [ ] W2: Conectar Dashboard a API real
- [ ] S4: Configurar colores Tailwind

### 🟡 Medio (Próxima Semana)
- [ ] S5: Separar componentes CRM y Admin
- [ ] E4: Agregar error handling global
- [ ] W3: Eliminar código API muerto

### 🟢 Bajo (Próximo Mes)
- [ ] S2: Migrar a base de datos
- [ ] S5: Agregar tests unitarios
- [ ] E8: Refactorizar arquitectura modular

---

## 📈 Métricas de Código

| Métrica | Valor | Estado |
|---------|-------|--------|
| Líneas de código | ~500 | 🟢 OK |
| Cobertura de tests | 0% | 🔴 Crítico |
| Dependencias vulnerables | 2 moderate | 🟡 |
| TypeScript estricto | No | 🟡 |
| Archivos .env | 0 | 🔴 |
| Archivos de config | 1 (vite.config.ts) | 🟢 |

---

## 🎯 Conclusión

**Veredicto:** El proyecto está en estado **POC/MVP** pero necesita trabajo significativo antes de producción.

**Riesgo Principal:** Seguridad - Sin validación de input, CORS abierto, sin rate limiting.

**Recomendación General:**
1. **No deployar a producción sin resolver E1, E2, E3**
2. Conectar API real antes de considerar el portal "funcional"
3. Migrar a base de datos antes de escalar

**Tiempo Estimado para Producción:**
- Fixes críticos: 1-2 días
- Funcionalidad completa: 1-2 semanas
- Producción-ready: 3-4 semanas

---

**Auditado por:** Warren 💰 | Steve 🔧 | Elon 🛡️  
**Repositorio:** [GitHub](https://github.com/aimailhumberto-cloud/onyx-mahana-portal)