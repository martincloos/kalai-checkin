# kalai-checkin — contexto del proyecto

Módulo de **check-in / check-out de embarcaciones** de Kalai Analytics.
Registra, día por día, qué barcos bajaron al agua y cuáles regresaron a
tierra, con un responsable identificable por cada declaración.

Herramienta de **organización y seguridad**: el objetivo operativo crítico
es que la organización detecte rápido **un barco con salida registrada y
sin registro de regreso**.

Contexto de negocio en [`../KALAI-ANALYTICS.md`](../KALAI-ANALYTICS.md).
El relevamiento que definió dónde vive cada pieza está en
[`../CHECKIN-FASE0-RELEVAMIENTO.md`](../CHECKIN-FASE0-RELEVAMIENTO.md) —
leerlo antes de tocar nada.

## Qué es este repo y qué NO es

Es **un paquete compartido**, no una app. No tiene servidor, no tiene
login propio, no tiene base de datos propia.

- **El schema vive en `coach-data`** (`supabase/migrations/035`–`038`,
  schema `kalai`), no acá. Decisión D5 del relevamiento: `coach-data` es
  el dueño del schema `kalai` y la convención del ecosistema es que todo
  cambio de schema/RLS se documente en **su** `CHANGELOG.md`. Dos repos
  corriendo `supabase db push` contra el mismo proyecto colisionan en la
  tabla de historial de migraciones del CLI.
- **La autenticación es la de Kalai**, en el proyecto Supabase de Coach
  Data. Este paquete nunca crea un cliente de Supabase: lo **recibe** por
  parámetro. Coach Data y management-site ya tienen el suyo configurado, y
  crear otro significaría una segunda sesión desincronizada.

## Quién lo consume

| Consumidor | Qué usa | Cómo |
|---|---|---|
| `coach-data` (Expo/RN) | Pantalla del **declarante**: banners + tabla + Guardar | Banner arriba de todo en `apps/mobile/app/(tabs)/index.tsx`, siempre visible (decisión D3) |
| `management-site` (Next) | Pantallas de **staff**: ventanas, import, asignación, tabla de control | Renderizadas dentro de esa app (decisión D2) |

El mecanismo es el mismo que ya usa `kalai-ui`: **dependencia git pineada
a un commit SHA**, distribuida como fuente TS que compila al instalarse
(`prepare: tsc`). No hay registry privado — actualizar el paquete es
cambiar el SHA a mano en el `package.json` del consumidor.

Por eso el repo es **un solo paquete en la raíz** y no un monorepo con
`packages/`: ni npm ni pnpm pueden instalar un subdirectorio de un repo
git como paquete. Los dos consumidores se separan por *subpath exports*
(`kalai-checkin`, `kalai-checkin/declarante`, `kalai-checkin/staff`), no
por paquetes distintos.

## Estilo visual

- Parte **declarante** (mobile): usa `kalai-ui`, el design system del
  ecosistema.
- Parte **staff** (web): `kalai-ui` es React Native puro y **no sirve en
  web**. Se sigue la convención de `management-site` — CSS plano, paleta
  blanco/gris con acento teal `#0d9488` (decisión D6).

## Reglas de dominio que NO se deben "arreglar"

Son decisiones deliberadas, tomadas con el dueño del producto. Si algo de
esto parece un bug, no lo es:

1. **El check-in es por BARCO, no por persona.** Una fila con dos nombres
   tiene un solo checkbox. La inscripción a estos campeonatos es por barco.
2. **`checkin_events` es append-only y no tiene unique por
   (barco, ventana).** Se esperan varias filas por par: es lo que permite
   registrar "Fran tildó → Martín destildó → Fran volvió a tildar".
3. **Concurrencia: gana el último que aprieta Guardar.** Sin bloqueos, sin
   merge, sin advertencia al segundo usuario. Todos los envíos quedan
   registrados igual.
4. **Un envío sin cambios no genera ningún registro.** No agregar un log
   de "revisó y no tocó nada".
5. **Salida y Regreso de una misma clase pueden solaparse.** No agregar
   validación de solapamiento.
6. **No hay reemplazo destructivo en el import.** No agregar
   "sobrescribir todo".
7. **Las ventanas no tienen `label` de texto libre**, y no tienen botón
   manual de abrir/cerrar. El estado se calcula solo, server-side, en hora
   de Argentina.
8. **No hay vista pública.** Todo acceso requiere login; no agregar
   policies para `anon`.

## Seguridad

- **La RLS es el permiso; un filtro en el front no lo es.** Un declarante
  accede únicamente a los barcos asignados a su usuario — no puede leer el
  roster completo, ni datos de contacto de otros entrenadores, ni barcos de
  otras clases o clubes. Está implementado en las policies de `035`/`036`.
- **`checkin_events` no tiene policy de INSERT**: la única forma de
  escribir es el RPC `kalai.submit_checkin_batch()` (security definer), que
  resuelve el usuario por `auth.uid()` — nunca por un identificador que
  mande el cliente.
- La service-role key **nunca** viaja al cliente. El invite de altas corre
  en una ruta de servidor de `management-site`.

## Comandos

```bash
pnpm install
pnpm typecheck
pnpm build
```
