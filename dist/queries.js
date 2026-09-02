// Este paquete NUNCA crea su propio cliente de Supabase: lo recibe. Coach
// Data y management-site ya tienen el suyo configurado (persistencia de
// sesión, storage, env vars propias) y hablan con el mismo proyecto, así
// que crear otro acá significaría una segunda sesión desincronizada.
//
// Todo vive en el schema `kalai`, de ahí el .schema('kalai') en cada
// consulta.
const SCHEMA = 'kalai';
function k(supabase) {
    return supabase.schema(SCHEMA);
}
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
export async function listMyCheckinEvents(supabase) {
    const { data, error } = await k(supabase)
        .from('entrant_declarants')
        .select('event_entrants!inner(event_id)');
    if (error)
        throw error;
    // PostgREST devuelve el embed como objeto o como array según cómo
    // infiera la cardinalidad de la relación; se contemplan los dos.
    const ids = new Set();
    for (const row of (data ?? [])) {
        const embed = row.event_entrants;
        for (const e of Array.isArray(embed) ? embed : embed ? [embed] : []) {
            if (e.event_id)
                ids.add(e.event_id);
        }
    }
    return Array.from(ids);
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
export async function listActiveWindows(supabase, eventId) {
    const { data, error } = await k(supabase).rpc('active_checkin_windows', {
        p_event_id: eventId,
    });
    if (error)
        throw error;
    return (data ?? []);
}
/**
 * Los barcos del usuario en una clase. La RLS devuelve solo los que tiene
 * asignados — el filtro real es un permiso en la base, no este `.eq()`.
 */
export async function listMyBoats(supabase, eventId, classId) {
    const { data, error } = await k(supabase)
        .from('event_entrants')
        .select('id, event_id, class_id, club_id, full_name, sail_number, entrant_crew(*)')
        .eq('event_id', eventId)
        .eq('class_id', classId)
        .order('sail_number');
    if (error)
        throw error;
    return (data ?? []).map((row) => {
        const { entrant_crew, ...boat } = row;
        return {
            ...boat,
            crew: (entrant_crew ?? []).slice().sort((a, b) => a.position - b.position),
        };
    });
}
/** Estado vigente de cada barco en una ventana (el último evento de cada uno). */
export async function getWindowState(supabase, windowId) {
    const { data, error } = await k(supabase).rpc('checkin_window_state', { p_window_id: windowId });
    if (error)
        throw error;
    return (data ?? []);
}
/**
 * Historial completo de un barco en una ventana: TODAS las modificaciones
 * y quién las envió, no solo la última. Es el mecanismo de trazabilidad
 * que justifica el producto.
 */
export async function getCheckinHistory(supabase, windowId, entrantId) {
    const { data, error } = await k(supabase).rpc('checkin_history', {
        p_window_id: windowId,
        p_entrant_id: entrantId,
    });
    if (error)
        throw error;
    return (data ?? []);
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
export async function submitCheckinBatch(supabase, windowId, entries) {
    const { data, error } = await k(supabase).rpc('submit_checkin_batch', {
        p_window_id: windowId,
        p_entries: entries,
    });
    if (error)
        throw error;
    return data;
}
/** Ventanas de un evento en un día dado — para la configuración del staff. */
export async function listWindowsByDay(supabase, eventId, day) {
    const { data, error } = await k(supabase)
        .from('checkin_windows')
        .select('*')
        .eq('event_id', eventId)
        .eq('day', day);
    if (error)
        throw error;
    return (data ?? []);
}
/** Todas las ventanas de un evento, sin filtrar por día — para la pantalla de configuración del staff. */
export async function listEventWindows(supabase, eventId) {
    const { data, error } = await k(supabase)
        .from('checkin_windows')
        .select('*')
        .eq('event_id', eventId)
        .order('day', { ascending: true })
        .order('starts_at', { ascending: true });
    if (error)
        throw error;
    return (data ?? []);
}
/**
 * Crea una ventana. La RLS y el trigger `enforce_checkin_window_edit` (037)
 * son quienes realmente validan — acá no se duplica esa lógica, solo se
 * deja que el error de la base (por ejemplo, "ya existe una ventana de
 * ese tipo para esa clase ese día") suba tal cual al llamador.
 */
export async function createCheckinWindow(supabase, input) {
    const { data, error } = await k(supabase).from('checkin_windows').insert(input).select().single();
    if (error)
        throw error;
    return data;
}
/**
 * Edita una ventana existente (típicamente para extender el fin de una en
 * curso). El trigger de la base rechaza tocar una ventana ya cerrada, o
 * acortarla a menos de 10 minutos desde ahora — esos errores suben tal
 * cual, no se re-validan acá.
 */
export async function updateCheckinWindow(supabase, windowId, patch) {
    const { data, error } = await k(supabase).from('checkin_windows').update(patch).eq('id', windowId).select().single();
    if (error)
        throw error;
    return data;
}
/** Borra una ventana. El trigger de la base rechaza borrar una ya cerrada. */
export async function deleteCheckinWindow(supabase, windowId) {
    const { error } = await k(supabase).from('checkin_windows').delete().eq('id', windowId);
    if (error)
        throw error;
}
/**
 * Todos los barcos del evento — vista de STAFF, no de declarante.
 *
 * A diferencia de `listMyBoats`, no filtra por clase: la RLS del staff
 * (036) devuelve el roster completo. Es lo que alimenta la pantalla de
 * asignación.
 */
export async function listAllBoats(supabase, eventId) {
    const { data, error } = await k(supabase)
        .from('event_entrants')
        .select('id, event_id, class_id, club_id, full_name, sail_number, entrant_crew(*)')
        .eq('event_id', eventId)
        .order('full_name');
    if (error)
        throw error;
    return (data ?? []).map((row) => {
        const { entrant_crew, ...boat } = row;
        return {
            ...boat,
            crew: (entrant_crew ?? []).slice().sort((a, b) => a.position - b.position),
        };
    });
}
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
export async function listDeclarantCandidates(supabase, eventId) {
    const { data: memberRows, error } = await k(supabase)
        .from('event_memberships')
        .select('user_id, role')
        .eq('event_id', eventId);
    if (error)
        throw error;
    const members = (memberRows ?? []);
    if (members.length === 0)
        return [];
    const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', members.map((m) => m.user_id));
    if (profileError)
        throw profileError;
    const byId = new Map((profileRows ?? []).map((p) => [p.id, p]));
    return members
        .map((m) => {
        const p = byId.get(m.user_id);
        return {
            user_id: m.user_id,
            // Si el perfil no es legible (RLS), al menos no se rompe la pantalla.
            email: p?.email ?? m.user_id,
            name: p?.name ?? null,
            role: m.role,
        };
    })
        .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}
/** Todas las asignaciones vigentes del evento (vista de staff). */
export async function listEventAssignments(supabase, eventId) {
    const { data, error } = await k(supabase)
        .from('entrant_declarants')
        .select('id, entrant_id, user_id, event_entrants!inner(event_id)')
        .eq('event_entrants.event_id', eventId);
    if (error)
        throw error;
    return (data ?? []).map((row) => ({
        id: row.id,
        entrant_id: row.entrant_id,
        user_id: row.user_id,
    }));
}
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
export async function setDeclarantBoats(supabase, userId, assignedBy, currentEntrantIds, nextEntrantIds) {
    const current = new Set(currentEntrantIds);
    const next = new Set(nextEntrantIds);
    const toAdd = [...next].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !next.has(id));
    if (toAdd.length > 0) {
        const { error } = await k(supabase)
            .from('entrant_declarants')
            .insert(toAdd.map((entrant_id) => ({ entrant_id, user_id: userId, assigned_by: assignedBy })));
        if (error)
            throw error;
    }
    if (toRemove.length > 0) {
        const { error } = await k(supabase)
            .from('entrant_declarants')
            .delete()
            .eq('user_id', userId)
            .in('entrant_id', toRemove);
        if (error)
            throw error;
    }
    return { added: toAdd.length, removed: toRemove.length };
}
/** Clases del evento, para poblar el selector al crear una ventana. */
export async function listEventClasses(supabase, eventId) {
    const { data, error } = await k(supabase).from('event_classes').select('*').eq('event_id', eventId).order('name');
    if (error)
        throw error;
    return (data ?? []);
}
/**
 * Crea una clase a mano. Necesario porque las clases hoy solo se
 * completan por backfill desde el roster (029/035) o por el importador de
 * CSV (Fase 5, todavía sin construir) — el staff necesita poder armar el
 * cronograma de ventanas ANTES de tener el roster cargado.
 */
export async function createEventClass(supabase, eventId, name) {
    const { data, error } = await k(supabase)
        .from('event_classes')
        .insert({ event_id: eventId, name })
        .select()
        .single();
    if (error)
        throw error;
    return data;
}
