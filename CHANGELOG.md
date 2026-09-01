# Changelog

Registro de cambios de este paquete. **Los cambios de schema, RLS y
funciones NO se anotan acá**: el schema `kalai` vive en el repo de Coach
Data, así que se documentan en
[`../Coach Pro Tracker/coach-data/CHANGELOG.md`](../Coach%20Pro%20Tracker/coach-data/CHANGELOG.md)
— misma convención que sigue `management-site`.

---

## 2026-08-26 — Creación del repo: tipos, capa de consultas y CSV (Fase 1)

- **Qué se hizo**: scaffold del paquete (`package.json` con subpath
  exports, `tsconfig`, `CLAUDE.md`, `README.md`) y el núcleo
  framework-agnóstico:
  - `src/types.ts` — tipos que espejan el schema de las migraciones
    `035`–`038` de Coach Data (originalmente escritas como `029`–`032`,
    renumeradas — ver CHANGELOG de `coach-data`). `Boat` es la unidad de check-in (un barco,
    no una persona), con `crew` como tripulación.
  - `src/queries.ts` — capa de consultas. **Recibe el cliente de Supabase
    por parámetro, nunca crea el suyo**: Coach Data y management-site ya
    tienen uno configurado contra el mismo proyecto, y crear otro
    significaría una segunda sesión desincronizada.
  - `src/csv.ts` — parser portado literal desde
    `management-site/src/lib/csv.ts`, que es su origen real (el scaffold
    descartado `checkin-mvp/` lo había copiado de ahí, no al revés).
- **Decisión de estructura, forzada por el mecanismo de integración**: el
  repo es **un solo paquete en la raíz**, no un monorepo con `packages/`.
  Ni npm ni pnpm pueden instalar un subdirectorio de un repo git como
  paquete, y el ecosistema integra por dependencia git pineada a un SHA
  (así se consume `kalai-ui`). Los dos consumidores se separan por subpath
  exports: `kalai-checkin`, `kalai-checkin/declarante` (React Native, para
  Coach Data) y `kalai-checkin/staff` (web, para management-site).
- **Por qué el repo es nuevo y no una carpeta más de un repo existente**:
  el módulo se renderiza dentro de DOS apps distintas (Coach Data mobile y
  management-site web). Vivir en cualquiera de las dos lo ataría a ese
  consumidor.
- **Verificado**: `pnpm typecheck` limpio.
- **Todavía sin construir**: las pantallas (`declarante/` y `staff/`) —
  son las Fases 2 a 5. Los subpath exports ya están declarados en
  `package.json` apuntando a rutas que aún no existen; hay que crearlas
  antes de que un consumidor pueda importarlas.

### Corrección hecha en el camino

La primera versión de `listActiveWindows()` filtraba las ventanas abiertas
desde el cliente con `.lte('starts_at', 'now()')`. Estaba mal por dos
motivos: PostgREST manda ese valor como texto y `'now()'` no es un literal
casteable a `timestamptz` (habría fallado en runtime), y además resolver
"está abierta" del lado del cliente contradice el requisito de evaluar
siempre server-side. Se reemplazó por el RPC
`kalai.active_checkin_windows()`, agregado a la migración `037`.
