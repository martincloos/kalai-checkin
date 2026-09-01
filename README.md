# kalai-checkin

Módulo de check-in / check-out de embarcaciones de Kalai Analytics.

Paquete compartido, no una app: exporta tipos, capa de consultas y (a
medida que avancen las fases) las pantallas que renderizan **Coach Data**
(declarante) y **management-site** (staff).

Ver [`CLAUDE.md`](CLAUDE.md) para el contexto completo y las reglas de
dominio que no hay que "arreglar".

## Estado

| Fase | Estado |
|---|---|
| 0 — Relevamiento | ✅ cerrada (`../CHECKIN-FASE0-RELEVAMIENTO.md`) |
| 1 — Schema y permisos | ✅ aplicada y verificada (`coach-data`, `035`–`038`, RLS probada con dos usuarios reales el 2026-09-01) |
| 2 — Ventanas (staff) | ⏸ |
| 3 — RPC + pantalla del declarante | ⏸ el RPC ya existe en `038`; falta la UI |
| 4 — Tabla de control del staff | ⏸ |
| 5 — Carga inicial y altas | ⏸ |
| 6 — Verificación end-to-end | ⏸ |

## Uso

El paquete recibe el cliente de Supabase ya configurado — no crea el suyo.

```ts
import { listActiveWindows, listMyBoats, submitCheckinBatch } from 'kalai-checkin'

// Banners: ventanas abiertas ahora para los barcos de este usuario.
// El corte "está abierta" lo evalúa la base con su propio reloj.
const windows = await listActiveWindows(supabase, eventId)

// Los barcos del usuario en esa clase (la RLS ya devuelve solo los suyos).
const boats = await listMyBoats(supabase, eventId, windows[0].class_id)

// Guardar: se manda el estado de TODOS los barcos; el servidor calcula el
// delta y registra solo los que cambiaron.
const { inserted } = await submitCheckinBatch(supabase, windows[0].id, [
  { entrant_id: boats[0].id, checked: true },
])
```

## Schema

Vive en el repo de **Coach Data**, no acá:
`Coach Pro Tracker/coach-data/supabase/migrations/035`–`038`.

| Tabla | Qué es |
|---|---|
| `kalai.event_classes` / `event_clubs` | Clases y clubes normalizados por evento |
| `kalai.event_entrants` | **El barco** (una fila por barco, no por persona) |
| `kalai.entrant_crew` | Tripulación del barco, con email por persona |
| `kalai.entrant_declarants` | N:N usuario ↔ barco: quién puede declarar qué |
| `kalai.checkin_windows` | Franjas Salida/Regreso, por clase y por día |
| `kalai.checkin_events` | Log append-only de declaraciones |

| Función | Qué hace |
|---|---|
| `submit_checkin_batch(window, entries)` | Envío en lote: valida ventana, resuelve usuario por `auth.uid()`, calcula delta, escribe solo cambios |
| `checkin_window_state(window)` | Estado vigente de cada barco (último evento) |
| `checkin_history(window, entrant)` | Historial completo: quién declaró qué y cuándo |
| `active_checkin_windows(event)` | Ventanas abiertas ahora, evaluado server-side |
| `is_event_staff(event)` | admin + secretario + acreditador |
| `can_declare_entrant(entrant)` | Si el usuario actual puede declarar ese barco |
