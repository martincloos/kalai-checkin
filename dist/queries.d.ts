import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveWindow, BatchEntry, Boat, BoatCheckState, CheckinHistoryEntry, CheckinWindow, DeclarantAssignment, DeclarantCandidate, EventClass, NewCheckinWindow } from './types';
/**
 * Los eventos en los que el usuario tiene al menos un barco asignado para
 * declarar.
 *
 * Hace falta porque la app mobile de Coach Data no sabe nada de eventos:
 * no tiene selector de evento ni contexto de evento en ningún lado. El
 * banner del declarante tiene que descubrir solo en qué evento está
 * parado.
 *
 * Se consulta `entrant_declarants` y no `event_entrants` a propósito: la
 * RLS de la primera es `user_id = auth.uid()`, así que devuelve exactamente
 * los barcos de este usuario. `event_entrants` le mostraría el roster
 * completo a alguien que además sea staff, y este banner es la vista del
 * declarante, no la del staff.
 */
export declare function listMyCheckinEvents(supabase: SupabaseClient): Promise<string[]>;
/**
 * Ventanas abiertas AHORA para los barcos del usuario — es lo que alimenta
 * los banners del declarante (uno por combinación clase × acción).
 *
 * La RLS ya limita las ventanas a las clases donde el usuario tiene algún
 * barco asignado, así que no hace falta filtrar por usuario acá. El corte
 * por "abierta" se hace contra `starts_at`/`ends_at` en la base, no contra
 * el reloj del cliente: un cliente con la hora mal no debe ver un banner
 * que no corresponde.
 */
export declare function listActiveWindows(supabase: SupabaseClient, eventId: string): Promise<ActiveWindow[]>;
/**
 * Los barcos del usuario en una clase. La RLS devuelve solo los que tiene
 * asignados — el filtro real es un permiso en la base, no este `.eq()`.
 */
export declare function listMyBoats(supabase: SupabaseClient, eventId: string, classId: string): Promise<Boat[]>;
/** Estado vigente de cada barco en una ventana (el último evento de cada uno). */
export declare function getWindowState(supabase: SupabaseClient, windowId: string): Promise<BoatCheckState[]>;
/**
 * Historial completo de un barco en una ventana: TODAS las modificaciones
 * y quién las envió, no solo la última. Es el mecanismo de trazabilidad
 * que justifica el producto.
 */
export declare function getCheckinHistory(supabase: SupabaseClient, windowId: string, entrantId: string): Promise<CheckinHistoryEntry[]>;
/**
 * Envía la declaración completa de una ventana, en lote.
 *
 * Manda el estado que el usuario dejó en pantalla para TODOS sus barcos;
 * el servidor calcula el delta y registra solo los que cambiaron. Si no
 * cambió nada, no se genera ningún registro (`inserted: 0`).
 *
 * No atrapa el error a propósito: si la ventana cerró o el usuario no
 * está habilitado, tiene que fallar de forma visible. Nunca mostrar un
 * "guardado" que no ocurrió.
 */
export declare function submitCheckinBatch(supabase: SupabaseClient, windowId: string, entries: BatchEntry[]): Promise<{
    inserted: number;
}>;
/** Ventanas de un evento en un día dado — para la configuración del staff. */
export declare function listWindowsByDay(supabase: SupabaseClient, eventId: string, day: string): Promise<CheckinWindow[]>;
/** Todas las ventanas de un evento, sin filtrar por día — para la pantalla de configuración del staff. */
export declare function listEventWindows(supabase: SupabaseClient, eventId: string): Promise<CheckinWindow[]>;
/**
 * Crea una ventana. La RLS y el trigger `enforce_checkin_window_edit` (037)
 * son quienes realmente validan — acá no se duplica esa lógica, solo se
 * deja que el error de la base (por ejemplo, "ya existe una ventana de
 * ese tipo para esa clase ese día") suba tal cual al llamador.
 */
export declare function createCheckinWindow(supabase: SupabaseClient, input: NewCheckinWindow): Promise<CheckinWindow>;
/**
 * Edita una ventana existente (típicamente para extender el fin de una en
 * curso). El trigger de la base rechaza tocar una ventana ya cerrada, o
 * acortarla a menos de 10 minutos desde ahora — esos errores suben tal
 * cual, no se re-validan acá.
 */
export declare function updateCheckinWindow(supabase: SupabaseClient, windowId: string, patch: Partial<Pick<CheckinWindow, 'day' | 'starts_at' | 'ends_at'>>): Promise<CheckinWindow>;
/** Borra una ventana. El trigger de la base rechaza borrar una ya cerrada. */
export declare function deleteCheckinWindow(supabase: SupabaseClient, windowId: string): Promise<void>;
/**
 * Todos los barcos del evento — vista de STAFF, no de declarante.
 *
 * A diferencia de `listMyBoats`, no filtra por clase: la RLS del staff
 * (036) devuelve el roster completo. Es lo que alimenta la pantalla de
 * asignación.
 */
export declare function listAllBoats(supabase: SupabaseClient, eventId: string): Promise<Boat[]>;
/**
 * Quiénes pueden quedar asignados como declarantes de este evento.
 *
 * Son los MIEMBROS del evento, o sea cuentas reales ya registradas — no las
 * filas de `event_coaches`, que son texto libre con email y no tienen
 * usuario detrás. Un entrenador cargado en el roster no aparece acá hasta
 * que acepta su invitación y se crea su perfil.
 *
 * `event_memberships` vive en el schema `kalai` y `profiles` en `public`,
 * así que son dos consultas: PostgREST no puede cruzar schemas en un embed.
 */
export declare function listDeclarantCandidates(supabase: SupabaseClient, eventId: string): Promise<DeclarantCandidate[]>;
/** Todas las asignaciones vigentes del evento (vista de staff). */
export declare function listEventAssignments(supabase: SupabaseClient, eventId: string): Promise<DeclarantAssignment[]>;
/**
 * Deja la asignación de UNA persona exactamente como la dejó el staff en
 * pantalla: agrega los barcos nuevos y borra los que sacó.
 *
 * No es un RPC transaccional a propósito: `entrant_declarants` no es el log
 * append-only (ese es `checkin_events`). Acá borrar una asignación es una
 * corrección legítima y no destruye ningún registro de declaración — los
 * `checkin_events` ya emitidos por esa persona quedan intactos, con su
 * autoría.
 */
export declare function setDeclarantBoats(supabase: SupabaseClient, userId: string, assignedBy: string, currentEntrantIds: string[], nextEntrantIds: string[]): Promise<{
    added: number;
    removed: number;
}>;
/** Clases del evento, para poblar el selector al crear una ventana. */
export declare function listEventClasses(supabase: SupabaseClient, eventId: string): Promise<EventClass[]>;
/**
 * Crea una clase a mano. Necesario porque las clases hoy solo se
 * completan por backfill desde el roster (029/035) o por el importador de
 * CSV (Fase 5, todavía sin construir) — el staff necesita poder armar el
 * cronograma de ventanas ANTES de tener el roster cargado.
 */
export declare function createEventClass(supabase: SupabaseClient, eventId: string, name: string): Promise<EventClass>;
