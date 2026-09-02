# Changelog

Registro de cambios de este paquete. **Los cambios de schema, RLS y
funciones NO se anotan acá**: el schema `kalai` vive en el repo de Coach
Data, así que se documentan en
[`../Coach Pro Tracker/coach-data/CHANGELOG.md`](../Coach%20Pro%20Tracker/coach-data/CHANGELOG.md)
— misma convención que sigue `management-site`.

---

## 2026-09-02 — Pantalla del declarante (Fase 2) + el paquete deja de compilarse al instalarse

- **`src/declarante/CheckinSection.tsx`**: el componente React Native que
  Coach Data renderiza arriba de todo en `(tabs)/index.tsx` (decisión D3).
  Un banner por cada ventana **abierta ahora** que le corresponda al
  usuario, sus barcos con **un checkbox por barco**, y Guardar. Si no hay
  ninguna ventana abierta **no renderiza nada** — la pantalla principal de
  Coach Data es la de sesión y este módulo no puede ocuparle espacio los
  días que no hay check-in.
  - Se manda siempre el estado completo de la ventana: el delta lo calcula
    `submit_checkin_batch` en la base, y un envío sin cambios no registra
    nada (regla 4 del CLAUDE.md).
  - Después de guardar se recarga desde la base en vez de confiar en el
    estado local, para que se vea si otro declarante tocó los mismos
    barcos mientras tanto (regla 3: gana el último que aprieta Guardar).
  - El estado abierta/cerrada no se recalcula acá: si el server no
    devuelve la ventana como activa, no aparece.
- **Query nueva `listMyCheckinEvents`**: la app mobile de Coach Data no
  tiene contexto de evento (no hay selector ni nada parecido), así que el
  banner tiene que descubrir solo en qué evento está parado. Va contra
  `entrant_declarants` (RLS `user_id = auth.uid()`) y **no** contra
  `event_entrants`, para que a alguien que además sea staff no le aparezca
  el roster completo por esta ventana.
- **Bug latente arreglado**: `package.json` ya declaraba el subpath
  `"./declarante"` apuntando a `dist/declarante/index.js`, que no se
  generaba. Cualquier `import` de `kalai-checkin/declarante` fallaba.
- ⚠️ **Cambio de mecanismo de distribución: `dist/` se commitea y se sacó
  el `prepare`.** Compilar al instalarse rompía el deploy de
  `management-site` en Vercel, de forma no obvia: Vercel pone el store de
  pnpm **dentro** del proyecto, el `prepare` corre un `pnpm install` en un
  temp dir de ese store, ese install camina hacia arriba, encuentra la raíz
  del consumidor y lo reinstala entero — lo que vuelve a preparar este
  paquete. Recursión infinita (9 niveles anidados, 349 paquetes por nivel)
  hasta que dos ramas paralelas chocan con `ERR_PNPM_EEXIST`. Localmente
  no se reproduce nunca porque ahí el store vive fuera del proyecto.
  **Contrapartida: hay que correr `pnpm build` y commitear `dist/` antes de
  pushear.**
- `kalai-ui` y `react-native` quedan como peer deps **opcionales** (y
  devDeps para poder compilar acá). Al no haber `prepare`, `management-site`
  ya no instala nada de eso.
- **Verificado**: `pnpm typecheck` y `pnpm build` limpios, `dist/declarante/`
  generado. **Sin probar en un dispositivo todavía** — falta integrarlo en
  Coach Data y correrlo en Expo.

## 2026-09-02 — El repo se transfirió a `martincloos` y pasó a ser público

- **Dueño nuevo**: `github.com/martincloos/kalai-checkin`. La URL vieja
  (`fgentile123/kalai-checkin`) hoy responde con un redirect 301 de GitHub,
  pero **no hay que apoyarse en eso**: el redirect se pierde si alguien
  crea un repo nuevo con ese nombre en la cuenta vieja.
- **Visibilidad: público** (antes privado). Revisado antes de dar por buena
  la situación: el paquete **no contiene secretos** — es UI, tipos y capa
  de consultas, sin claves ni URLs de proyecto. Las claves viven en las
  env vars de quien lo consume.
- **Quién lo hizo**: no fue en esta sesión. La API de GitHub marca el
  cambio a las `2026-09-01T20:19Z`, posterior al último push del repo
  (`14:01Z`). Confirmado con Fran el 2026-09-02 que la transferencia es
  definitiva.
- **Qué se actualizó en consecuencia**: la URL de la dependencia y la clave
  de `allowBuilds` en `management-site` (ver su CHANGELOG, entrada del
  2026-09-02) y el remote local de este repo.

## 2026-09-01 — Repo pusheado a GitHub + pantalla de Ventanas (Fase 2)

- **El repo pasó a existir en GitHub**: `github.com/fgentile123/kalai-checkin`
  (privado). Vive bajo la cuenta personal de Fran, no bajo `martincloos`
  como el resto del ecosistema — colaborador no puede crear repos en la
  cuenta de otro. Se puede transferir después con "Transfer ownership" de
  GitHub sin perder historial, si hace falta unificar. **[Desactualizado:
  eso ya pasó el 2026-09-01 — hoy es `martincloos/kalai-checkin` y es
  público. Ver entrada del 2026-09-02.]** Necesario para que
  `management-site` lo consuma como dependencia git pineada a un SHA,
  mismo mecanismo que `kalai-ui`.
- **Qué se hizo**: `src/staff/VentanasSection.tsx` — pantalla de staff
  para crear/editar/borrar ventanas de check-in (Salida/Regreso por clase
  y por día) y dar de alta clases a mano (necesario porque hoy las clases
  solo se completan por backfill del roster o por el importador de CSV,
  todavía sin construir — el staff tiene que poder armar el cronograma
  antes de tener el roster cargado). Sin CSS propio: usa las clases ya
  definidas en `globals.css` de `management-site` (decisión D6).
  - El estado mostrado (Programada/Abierta/Cerrada) se calcula en el
    cliente solo para el badge visual — la base decide de verdad qué
    ventana acepta declaraciones (`kalai.checkin_window_status`), acá no
    se duplica esa lógica de negocio.
  - Los errores del trigger `enforce_checkin_window_edit` (ventana ya
    cerrada, acortar a menos de 10 minutos) suben tal cual del backend a
    la UI — no se re-valida nada de eso en el cliente.
- Se agregaron a `queries.ts`: `listEventWindows`, `createCheckinWindow`,
  `updateCheckinWindow`, `deleteCheckinWindow`, `listEventClasses`,
  `createEventClass`.
- **Verificado**: `pnpm typecheck` y `pnpm build` limpios, `dist/staff/`
  se genera con la estructura que espera el subpath export ya declarado
  en `package.json`. **Sin probar en un navegador real todavía** — falta
  integrarla en `management-site` y probarla contra el evento real.

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
