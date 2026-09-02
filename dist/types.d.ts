/** Salida = bajada al agua (check-in). Regreso = vuelta a tierra (check-out). */
export type WindowKind = 'salida' | 'regreso';
/** Calculado server-side contra la hora de Argentina — nunca con el reloj del cliente. */
export type WindowStatus = 'scheduled' | 'open' | 'closed';
export interface EventClass {
    id: string;
    event_id: string;
    name: string;
    is_crewed: boolean;
}
export interface EventClub {
    id: string;
    event_id: string;
    name: string;
}
/**
 * La unidad de check-in es el BARCO, no la persona. Una fila de
 * inscripción = un barco, aunque lleve dos o más tripulantes. Un solo
 * checkbox por barco.
 */
export interface Boat {
    id: string;
    event_id: string;
    class_id: string | null;
    club_id: string | null;
    /** Nombre del timonel/skipper — se muestra como nombre del barco. */
    full_name: string;
    sail_number: string | null;
    crew?: CrewMember[];
}
export interface CrewMember {
    id: string;
    entrant_id: string;
    full_name: string;
    email: string | null;
    /** 0 = timonel/skipper, 1+ = resto de la tripulación. */
    position: number;
}
export interface CheckinWindow {
    id: string;
    event_id: string;
    class_id: string;
    kind: WindowKind;
    /** Día operativo en hora de Argentina. */
    day: string;
    starts_at: string;
    ends_at: string;
}
/** Una ventana abierta ahora mismo, con el nombre de su clase — alimenta los banners. */
export interface ActiveWindow extends CheckinWindow {
    class_name: string;
}
/** Lo que hace falta para crear una ventana — el resto lo completa la base. */
export interface NewCheckinWindow {
    event_id: string;
    class_id: string;
    kind: WindowKind;
    day: string;
    starts_at: string;
    ends_at: string;
    created_by?: string;
}
/** Estado vigente de un barco en una ventana: el último evento declarado. */
export interface BoatCheckState {
    entrant_id: string;
    checked: boolean;
    declared_by: string;
    declared_at: string;
}
/** Una entrada del historial: quién declaró qué y cuándo. */
export interface CheckinHistoryEntry {
    action: 'check' | 'uncheck';
    declared_by: string;
    declared_by_name: string | null;
    declared_at: string;
}
/** Lo que se manda al RPC en lote: el estado que el usuario dejó en pantalla. */
export interface BatchEntry {
    entrant_id: string;
    checked: boolean;
}
/**
 * Alguien que puede quedar asignado como declarante de un barco. Es una
 * CUENTA real (`public.profiles`), no una fila del roster de entrenadores:
 * `entrant_declarants.user_id` apunta a un usuario que ya se registró.
 */
export interface DeclarantCandidate {
    user_id: string;
    email: string;
    name: string | null;
    /** Rol en el evento (`kalai.event_memberships`). */
    role: string;
}
/** Una asignación vigente usuario ↔ barco. */
export interface DeclarantAssignment {
    id: string;
    entrant_id: string;
    user_id: string;
}
