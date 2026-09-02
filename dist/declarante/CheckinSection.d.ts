import type { SupabaseClient } from '@supabase/supabase-js';
export interface CheckinSectionProps {
    supabase: SupabaseClient;
    /**
     * Cambiar este valor fuerza una recarga. Coach Data lo usa desde su
     * `useFocusEffect` para refrescar al volver a la pestaña: una ventana
     * puede haberse abierto o cerrado mientras el usuario estaba en otra
     * pantalla.
     */
    refreshToken?: number | string;
}
export default function CheckinSection({ supabase, refreshToken }: CheckinSectionProps): import("react").JSX.Element | null;
