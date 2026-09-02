import type { SupabaseClient } from '@supabase/supabase-js';
export interface VentanasSectionProps {
    supabase: SupabaseClient;
    eventId: string;
    userId: string;
    canEdit: boolean;
    locked: boolean;
}
export default function VentanasSection({ supabase, eventId, userId, canEdit, locked }: VentanasSectionProps): import("react").JSX.Element;
