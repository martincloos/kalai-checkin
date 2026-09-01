import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ActiveWindow,
  BatchEntry,
  Boat,
  BoatCheckState,
  CheckinHistoryEntry,
  CheckinWindow,
  CrewMember,
  EventClass,
  NewCheckinWindow,
} from './types'

// Este paquete NUNCA crea su propio cliente de Supabase: lo recibe. Coach
// Data y management-site ya tienen el suyo configurado (persistencia de
// sesión, storage, env vars propias) y hablan con el mismo proyecto, así
// que crear otro acá significaría una segunda sesión desincronizada.
//
// Todo vive en el schema `kalai`, de ahí el .schema('kalai') en cada
// consulta.
const SCHEMA = 'kalai'

function k(supabase: SupabaseClient) {
  return supabase.schema(SCHEMA)
}

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
export async function listActiveWindows(
  supabase: SupabaseClient,
  eventId: string,
): Promise<ActiveWindow[]> {
  const { data, error } = await k(supabase).rpc('active_checkin_windows', {
    p_event_id: eventId,
  })
  if (error) throw error
  return (data ?? []) as ActiveWindow[]
}

/**
 * Los barcos del usuario en una clase. La RLS devuelve solo los que tiene
 * asignados — el filtro real es un permiso en la base, no este `.eq()`.
 */
export async function listMyBoats(
  supabase: SupabaseClient,
  eventId: string,
  classId: string,
): Promise<Boat[]> {
  const { data, error } = await k(supabase)
    .from('event_entrants')
    .select('id, event_id, class_id, club_id, full_name, sail_number, entrant_crew(*)')
    .eq('event_id', eventId)
    .eq('class_id', classId)
    .order('sail_number')
  if (error) throw error

  return (data ?? []).map((row: Record<string, unknown>) => {
    const { entrant_crew, ...boat } = row as Record<string, unknown> & { entrant_crew?: CrewMember[] }
    return {
      ...(boat as unknown as Boat),
      crew: (entrant_crew ?? []).slice().sort((a, b) => a.position - b.position),
    }
  })
}

/** Estado vigente de cada barco en una ventana (el último evento de cada uno). */
export async function getWindowState(
  supabase: SupabaseClient,
  windowId: string,
): Promise<BoatCheckState[]> {
  const { data, error } = await k(supabase).rpc('checkin_window_state', { p_window_id: windowId })
  if (error) throw error
  return (data ?? []) as BoatCheckState[]
}

/**
 * Historial completo de un barco en una ventana: TODAS las modificaciones
 * y quién las envió, no solo la última. Es el mecanismo de trazabilidad
 * que justifica el producto.
 */
export async function getCheckinHistory(
  supabase: SupabaseClient,
  windowId: string,
  entrantId: string,
): Promise<CheckinHistoryEntry[]> {
  const { data, error } = await k(supabase).rpc('checkin_history', {
    p_window_id: windowId,
    p_entrant_id: entrantId,
  })
  if (error) throw error
  return (data ?? []) as CheckinHistoryEntry[]
}

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
export async function submitCheckinBatch(
  supabase: SupabaseClient,
  windowId: string,
  entries: BatchEntry[],
): Promise<{ inserted: number }> {
  const { data, error } = await k(supabase).rpc('submit_checkin_batch', {
    p_window_id: windowId,
    p_entries: entries,
  })
  if (error) throw error
  return data as { inserted: number }
}

/** Ventanas de un evento en un día dado — para la configuración del staff. */
export async function listWindowsByDay(
  supabase: SupabaseClient,
  eventId: string,
  day: string,
): Promise<CheckinWindow[]> {
  const { data, error } = await k(supabase)
    .from('checkin_windows')
    .select('*')
    .eq('event_id', eventId)
    .eq('day', day)
  if (error) throw error
  return (data ?? []) as CheckinWindow[]
}

/** Todas las ventanas de un evento, sin filtrar por día — para la pantalla de configuración del staff. */
export async function listEventWindows(supabase: SupabaseClient, eventId: string): Promise<CheckinWindow[]> {
  const { data, error } = await k(supabase)
    .from('checkin_windows')
    .select('*')
    .eq('event_id', eventId)
    .order('day', { ascending: true })
    .order('starts_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CheckinWindow[]
}

/**
 * Crea una ventana. La RLS y el trigger `enforce_checkin_window_edit` (037)
 * son quienes realmente validan — acá no se duplica esa lógica, solo se
 * deja que el error de la base (por ejemplo, "ya existe una ventana de
 * ese tipo para esa clase ese día") suba tal cual al llamador.
 */
export async function createCheckinWindow(
  supabase: SupabaseClient,
  input: NewCheckinWindow,
): Promise<CheckinWindow> {
  const { data, error } = await k(supabase).from('checkin_windows').insert(input).select().single()
  if (error) throw error
  return data as CheckinWindow
}

/**
 * Edita una ventana existente (típicamente para extender el fin de una en
 * curso). El trigger de la base rechaza tocar una ventana ya cerrada, o
 * acortarla a menos de 10 minutos desde ahora — esos errores suben tal
 * cual, no se re-validan acá.
 */
export async function updateCheckinWindow(
  supabase: SupabaseClient,
  windowId: string,
  patch: Partial<Pick<CheckinWindow, 'day' | 'starts_at' | 'ends_at'>>,
): Promise<CheckinWindow> {
  const { data, error } = await k(supabase).from('checkin_windows').update(patch).eq('id', windowId).select().single()
  if (error) throw error
  return data as CheckinWindow
}

/** Borra una ventana. El trigger de la base rechaza borrar una ya cerrada. */
export async function deleteCheckinWindow(supabase: SupabaseClient, windowId: string): Promise<void> {
  const { error } = await k(supabase).from('checkin_windows').delete().eq('id', windowId)
  if (error) throw error
}

/** Clases del evento, para poblar el selector al crear una ventana. */
export async function listEventClasses(supabase: SupabaseClient, eventId: string): Promise<EventClass[]> {
  const { data, error } = await k(supabase).from('event_classes').select('*').eq('event_id', eventId).order('name')
  if (error) throw error
  return (data ?? []) as EventClass[]
}

/**
 * Crea una clase a mano. Necesario porque las clases hoy solo se
 * completan por backfill desde el roster (029/035) o por el importador de
 * CSV (Fase 5, todavía sin construir) — el staff necesita poder armar el
 * cronograma de ventanas ANTES de tener el roster cargado.
 */
export async function createEventClass(supabase: SupabaseClient, eventId: string, name: string): Promise<EventClass> {
  const { data, error } = await k(supabase)
    .from('event_classes')
    .insert({ event_id: eventId, name })
    .select()
    .single()
  if (error) throw error
  return data as EventClass
}
