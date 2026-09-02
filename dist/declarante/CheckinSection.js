import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Pantalla del declarante (Fase 2). Se renderiza arriba de todo en
// apps/mobile/app/(tabs)/index.tsx de Coach Data (decisión D3).
//
// Qué muestra: un banner por cada ventana de check-in ABIERTA ahora mismo
// que le corresponda a este usuario (una por combinación clase × acción).
// Si no hay ninguna abierta, no renderiza NADA — la pantalla principal de
// Coach Data es la de sesión y este módulo no puede robarle espacio los
// días que no hay check-in.
//
// Reglas de dominio que se respetan acá y que NO son bugs (ver CLAUDE.md
// del paquete):
//  - Un checkbox POR BARCO, aunque el barco lleve dos tripulantes.
//  - Gana el último que aprieta Guardar. Sin bloqueos ni merge ni aviso
//    al segundo usuario.
//  - Un envío sin cambios no genera ningún registro: el server calcula el
//    delta. Por eso se manda SIEMPRE el estado completo de la ventana.
//  - Quién abre y cierra la ventana lo decide la base, no el reloj del
//    teléfono. Acá no se recalcula nada: si el server no la devuelve como
//    activa, no aparece.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Button, Card, CheckIcon, useTheme } from 'kalai-ui';
import { getWindowState, listActiveWindows, listMyBoats, listMyCheckinEvents, submitCheckinBatch, } from '../queries';
const KIND_LABEL = {
    salida: 'Salida',
    regreso: 'Regreso',
};
function errorText(err) {
    return err instanceof Error ? err.message : String(err);
}
export default function CheckinSection({ supabase, refreshToken }) {
    const [windows, setWindows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        try {
            setError(null);
            const eventIds = await listMyCheckinEvents(supabase);
            if (eventIds.length === 0) {
                setWindows([]);
                return;
            }
            // Un usuario puede estar en más de un evento a la vez (un entrenador
            // que cubre dos campeonatos el mismo fin de semana). Se juntan las
            // ventanas abiertas de todos.
            const perEvent = await Promise.all(eventIds.map((id) => listActiveWindows(supabase, id)));
            setWindows(perEvent.flat());
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setLoading(false);
        }
    }, [supabase]);
    useEffect(() => {
        void load();
    }, [load, refreshToken]);
    // Mientras carga por primera vez no se muestra nada: un spinner arriba
    // de la pantalla principal en cada arranque molesta más de lo que informa.
    if (loading)
        return null;
    // Un error tampoco se traga en silencio, pero solo se muestra si el
    // usuario tiene algo que ver con el check-in.
    if (error) {
        return (_jsx(Shell, { children: _jsx(ErrorBanner, { message: error, onRetry: () => void load() }) }));
    }
    if (windows.length === 0)
        return null;
    return (_jsx(Shell, { children: windows.map((w) => (_jsx(WindowCard, { supabase: supabase, window: w }, w.id))) }));
}
/**
 * El padding vive acá adentro y no en el contenedor del host a propósito:
 * cuando no hay ninguna ventana abierta el componente devuelve null, y un
 * View con padding en Coach Data dejaría una franja vacía arriba de la
 * pantalla de sesión todos los días que no hay check-in.
 */
function Shell({ children }) {
    return _jsx(View, { style: { gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }, children: children });
}
function ErrorBanner({ message, onRetry }) {
    const { colors } = useTheme();
    return (_jsxs(Card, { style: { marginBottom: 16, borderColor: colors.bad, borderWidth: 1 }, children: [_jsx(Text, { style: { color: colors.bad, fontWeight: '600', marginBottom: 4 }, children: "No se pudo cargar el check-in" }), _jsx(Text, { style: { color: colors.textDim, marginBottom: 12 }, children: message }), _jsx(Button, { label: "Reintentar", onPress: onRetry })] }));
}
function WindowCard({ supabase, window: w }) {
    const { colors } = useTheme();
    const [boats, setBoats] = useState(null);
    const [checked, setChecked] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            setError(null);
            const [myBoats, state] = await Promise.all([
                listMyBoats(supabase, w.event_id, w.class_id),
                getWindowState(supabase, w.id),
            ]);
            const byId = {};
            for (const b of myBoats)
                byId[b.id] = false;
            // El estado vigente puede incluir barcos de otros declarantes de la
            // misma clase; solo interesan los propios.
            for (const s of state) {
                if (s.entrant_id in byId)
                    byId[s.entrant_id] = s.checked;
            }
            setBoats(myBoats);
            setChecked(byId);
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setLoading(false);
        }
    }, [supabase, w.event_id, w.class_id, w.id]);
    useEffect(() => {
        void load();
    }, [load]);
    const save = useCallback(async () => {
        if (!boats)
            return;
        setSaving(true);
        setNotice(null);
        setError(null);
        try {
            // Se manda el estado de TODOS los barcos, no solo los que cambiaron:
            // el delta lo calcula el server (submit_checkin_batch). Si no cambió
            // nada, no se registra nada — eso es deliberado.
            const entries = boats.map((b) => ({ entrant_id: b.id, checked: !!checked[b.id] }));
            const { inserted } = await submitCheckinBatch(supabase, w.id, entries);
            setNotice(inserted === 0
                ? 'Sin cambios para registrar'
                : `${inserted} ${inserted === 1 ? 'cambio registrado' : 'cambios registrados'}`);
            // Se recarga desde la base en vez de confiar en el estado local: si
            // otro declarante tocó los mismos barcos, esto lo trae.
            await load();
        }
        catch (err) {
            // Si la ventana cerró justo o el usuario perdió el permiso, tiene que
            // verse. Nunca mostrar un "guardado" que no ocurrió.
            setError(errorText(err));
        }
        finally {
            setSaving(false);
        }
    }, [boats, checked, supabase, w.id, load]);
    const total = boats?.length ?? 0;
    const marked = boats ? boats.filter((b) => checked[b.id]).length : 0;
    return (_jsxs(Card, { children: [_jsxs(View, { style: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, children: [_jsxs(View, { style: { flex: 1 }, children: [_jsxs(Text, { style: { color: colors.text, fontSize: 17, fontWeight: '700' }, children: [KIND_LABEL[w.kind], " \u2014 ", w.class_name] }), _jsx(Text, { style: { color: colors.textDim, fontSize: 13, marginTop: 2 }, children: total === 0
                                    ? 'No tenés barcos en esta clase'
                                    : `${marked} de ${total} ${total === 1 ? 'barco' : 'barcos'}` })] }), _jsx(View, { style: {
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: colors.accentA,
                        }, children: _jsx(Text, { style: { color: colors.onAccentA, fontSize: 12, fontWeight: '700' }, children: "Abierta" }) })] }), loading ? (_jsx(ActivityIndicator, { color: colors.accentA })) : (_jsxs(_Fragment, { children: [(boats ?? []).map((b) => (_jsx(BoatRow, { boat: b, checked: !!checked[b.id], disabled: saving, onToggle: () => setChecked((prev) => ({ ...prev, [b.id]: !prev[b.id] })) }, b.id))), error ? (_jsx(Text, { style: { color: colors.bad, marginTop: 10 }, children: error })) : notice ? (_jsx(Text, { style: { color: colors.textDim, marginTop: 10 }, children: notice })) : null, total > 0 ? (_jsx(View, { style: { marginTop: 12 }, children: _jsx(Button, { label: "Guardar", variant: "primary", accent: "A", block: true, loading: saving, onPress: save }) })) : null] }))] }));
}
/**
 * Una fila = UN BARCO, con un solo checkbox, aunque lleve dos tripulantes.
 * La tripulación se lista como texto secundario para que el declarante
 * identifique el barco, no para tildarla por separado.
 */
function BoatRow({ boat, checked, disabled, onToggle, }) {
    const { colors } = useTheme();
    const crewNames = (boat.crew ?? [])
        .filter((c) => c.full_name && c.full_name !== boat.full_name)
        .map((c) => c.full_name);
    return (_jsxs(Pressable, { onPress: onToggle, disabled: disabled, accessibilityRole: "checkbox", accessibilityState: { checked, disabled }, accessibilityLabel: boat.sail_number ? `${boat.sail_number} ${boat.full_name}` : boat.full_name, style: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            opacity: disabled ? 0.5 : 1,
        }, children: [_jsx(View, { style: {
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    marginRight: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: checked ? colors.accentA : 'transparent',
                    borderWidth: checked ? 0 : 1,
                    borderColor: colors.line,
                }, children: checked ? _jsx(CheckIcon, { size: 18, color: colors.onAccentA }) : null }), _jsxs(View, { style: { flex: 1 }, children: [_jsxs(Text, { style: { color: colors.text, fontSize: 15, fontWeight: '600' }, children: [boat.sail_number ? `${boat.sail_number} · ` : '', boat.full_name] }), crewNames.length > 0 ? (_jsxs(Text, { style: { color: colors.textDim, fontSize: 13, marginTop: 2 }, children: ["con ", crewNames.join(', ')] })) : null] })] }));
}
