import type { SupabaseClient } from '@supabase/supabase-js';
export interface AsignacionSectionProps {
    supabase: SupabaseClient;
    eventId: string;
    userId: string;
    canEdit: boolean;
    locked: boolean;
}
export default function AsignacionSection({ supabase, eventId, userId, canEdit, locked }: AsignacionSectionProps): import("react").JSX.Element;
