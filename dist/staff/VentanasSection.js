'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Pantalla de staff para configurar las ventanas de check-in (Fase 2).
//
// No trae CSS propio: usa las clases ya definidas en globals.css de
// management-site (.card, .input, .select, .button, .badge, etc. — ver
// decisión D6 del relevamiento de Fase 0). Recibe el cliente de Supabase
// por parámetro, nunca crea el suyo (ver CLAUDE.md del paquete).
//
// El estado (Programada/Abierta/Cerrada) se calcula acá SOLO para mostrar
// un badge — no es la fuente de verdad. La base (kalai.checkin_window_status)
// decide de verdad qué ventana acepta declaraciones; si el reloj del
// cliente está mal, en el peor caso el badge muestra un estado desfasado
// unos segundos, nunca habilita algo que el servidor rechazaría.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createCheckinWindow, createEventClass, deleteCheckinWindow, listEventClasses, listEventWindows, updateCheckinWindow, } from '../queries';
function computeStatus(startsAt, endsAt) {
    const now = Date.now();
    if (now < new Date(startsAt).getTime())
        return 'scheduled';
    if (now > new Date(endsAt).getTime())
        return 'closed';
    return 'open';
}
const STATUS_LABEL = {
    scheduled: 'Programada',
    open: 'Abierta',
    closed: 'Cerrada',
};
const KIND_LABEL = {
    salida: 'Salida',
    regreso: 'Regreso',
};
// Las conversiones de acá abajo asumen que quien las usa está físicamente
// en el huso horario de Argentina — igual asunción que ya hace el resto de
// management-site (no hay manejo explícito de zona horaria en ningún otro
// componente). El "día operativo" real lo termina fijando la base.
function toLocalTimeInput(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function combineLocal(day, time) {
    return new Date(`${day}T${time}:00`).toISOString();
}
function errorText(err) {
    return err instanceof Error ? err.message : String(err);
}
export default function VentanasSection({ supabase, eventId, userId, canEdit, locked }) {
    const [classes, setClasses] = useState(null);
    const [windows, setWindows] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [showAddClass, setShowAddClass] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [savingClass, setSavingClass] = useState(false);
    const [showAddWindow, setShowAddWindow] = useState(false);
    const [newWindow, setNewWindow] = useState({
        class_id: '',
        kind: 'salida',
        day: '',
        startTime: '',
        endTime: '',
    });
    const [savingWindow, setSavingWindow] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [editValues, setEditValues] = useState({ day: '', startTime: '', endTime: '' });
    const [savingEdit, setSavingEdit] = useState(false);
    const load = useCallback(async () => {
        const [cls, win] = await Promise.all([listEventClasses(supabase, eventId), listEventWindows(supabase, eventId)]);
        setClasses(cls);
        setWindows(win);
    }, [supabase, eventId]);
    useEffect(() => {
        load();
    }, [load]);
    const classById = useMemo(() => {
        const m = new Map();
        (classes ?? []).forEach((c) => m.set(c.id, c));
        return m;
    }, [classes]);
    async function handleAddClass(e) {
        e.preventDefault();
        setErrorMsg(null);
        const name = newClassName.trim();
        if (!name)
            return;
        setSavingClass(true);
        try {
            await createEventClass(supabase, eventId, name);
            setNewClassName('');
            await load();
        }
        catch (err) {
            setErrorMsg(errorText(err));
        }
        finally {
            setSavingClass(false);
        }
    }
    async function handleAddWindow(e) {
        e.preventDefault();
        setErrorMsg(null);
        const { class_id, kind, day, startTime, endTime } = newWindow;
        if (!class_id || !day || !startTime || !endTime) {
            setErrorMsg('Completá clase, día, hora de inicio y hora de fin.');
            return;
        }
        setSavingWindow(true);
        try {
            await createCheckinWindow(supabase, {
                event_id: eventId,
                class_id,
                kind,
                day,
                starts_at: combineLocal(day, startTime),
                ends_at: combineLocal(day, endTime),
                created_by: userId,
            });
            setNewWindow({ class_id: '', kind: 'salida', day: '', startTime: '', endTime: '' });
            setShowAddWindow(false);
            await load();
        }
        catch (err) {
            setErrorMsg(errorText(err));
        }
        finally {
            setSavingWindow(false);
        }
    }
    function openEdit(w) {
        setExpandedId(w.id);
        setEditValues({ day: w.day, startTime: toLocalTimeInput(w.starts_at), endTime: toLocalTimeInput(w.ends_at) });
        setErrorMsg(null);
    }
    async function handleSaveEdit(w) {
        setErrorMsg(null);
        setSavingEdit(true);
        try {
            await updateCheckinWindow(supabase, w.id, {
                day: editValues.day,
                starts_at: combineLocal(editValues.day, editValues.startTime),
                ends_at: combineLocal(editValues.day, editValues.endTime),
            });
            setExpandedId(null);
            await load();
        }
        catch (err) {
            setErrorMsg(errorText(err));
        }
        finally {
            setSavingEdit(false);
        }
    }
    async function handleDelete(id) {
        if (!window.confirm('¿Eliminar esta ventana?'))
            return;
        setErrorMsg(null);
        try {
            await deleteCheckinWindow(supabase, id);
            setExpandedId(null);
            await load();
        }
        catch (err) {
            setErrorMsg(errorText(err));
        }
    }
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "rowBetween", children: [_jsx("div", { className: "sectionTitle", children: "Ventanas de check-in" }), canEdit && !locked && (_jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsx("button", { className: "link", style: { background: 'none', border: 'none', cursor: 'pointer' }, onClick: () => {
                                    setShowAddClass((v) => !v);
                                    setShowAddWindow(false);
                                }, children: showAddClass ? 'Cancelar' : '+ Clase' }), _jsx("button", { className: "link", style: { background: 'none', border: 'none', cursor: 'pointer' }, onClick: () => {
                                    setShowAddWindow((v) => !v);
                                    setShowAddClass(false);
                                }, children: showAddWindow ? 'Cancelar' : '+ Ventana' })] }))] }), errorMsg && _jsx("div", { className: "error", children: errorMsg }), showAddClass && canEdit && !locked && (_jsxs("form", { onSubmit: handleAddClass, style: { display: 'flex', gap: 12, alignItems: 'flex-end' }, children: [_jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { className: "label", children: "Nombre de la clase" }), _jsx("input", { className: "input", placeholder: "Optimist, ILCA, 420\u2026", value: newClassName, onChange: (e) => setNewClassName(e.target.value) })] }), _jsx("button", { className: "button", type: "submit", disabled: savingClass, children: savingClass ? 'Guardando…' : 'Agregar' })] })), classes !== null && classes.length === 0 && !showAddClass && (_jsx("div", { className: "subtitle", children: "Todav\u00EDa no hay clases cargadas para este evento \u2014 hace falta al menos una para poder crear una ventana." })), showAddWindow && canEdit && !locked && (_jsxs("form", { onSubmit: handleAddWindow, style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, children: [_jsxs("div", { children: [_jsx("div", { className: "label", children: "Clase" }), _jsxs("select", { className: "select", value: newWindow.class_id, onChange: (e) => setNewWindow((v) => ({ ...v, class_id: e.target.value })), children: [_jsx("option", { value: "", children: "Seleccionar\u2026" }), (classes ?? []).map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id)))] })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Tipo" }), _jsxs("select", { className: "select", value: newWindow.kind, onChange: (e) => setNewWindow((v) => ({ ...v, kind: e.target.value })), children: [_jsx("option", { value: "salida", children: "Salida" }), _jsx("option", { value: "regreso", children: "Regreso" })] })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "D\u00EDa" }), _jsx("input", { className: "input", type: "date", value: newWindow.day, onChange: (e) => setNewWindow((v) => ({ ...v, day: e.target.value })) })] }), _jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { className: "label", children: "Hora inicio" }), _jsx("input", { className: "input", type: "time", value: newWindow.startTime, onChange: (e) => setNewWindow((v) => ({ ...v, startTime: e.target.value })) })] }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { className: "label", children: "Hora fin" }), _jsx("input", { className: "input", type: "time", value: newWindow.endTime, onChange: (e) => setNewWindow((v) => ({ ...v, endTime: e.target.value })) })] })] })] }), _jsx("button", { className: "button", type: "submit", disabled: savingWindow, style: { alignSelf: 'flex-start' }, children: savingWindow ? 'Guardando…' : 'Crear ventana' })] })), windows === null ? (_jsx("div", { className: "subtitle", children: "Cargando\u2026" })) : windows.length === 0 ? (_jsx("div", { className: "subtitle", children: "Todav\u00EDa no hay ventanas configuradas." })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column' }, children: windows.map((w) => {
                    const status = computeStatus(w.starts_at, w.ends_at);
                    const expanded = expandedId === w.id;
                    return (_jsxs("div", { children: [_jsxs("div", { className: "memberRow", style: { cursor: canEdit && !locked ? 'pointer' : 'default' }, onClick: () => {
                                    if (!canEdit || locked)
                                        return;
                                    if (expanded)
                                        setExpandedId(null);
                                    else
                                        openEdit(w);
                                }, children: [_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 2 }, children: [_jsxs("span", { style: { fontWeight: 600 }, children: [classById.get(w.class_id)?.name ?? '—', " \u00B7 ", KIND_LABEL[w.kind]] }), _jsxs("span", { style: { fontSize: 12, color: 'var(--muted)' }, children: [w.day, " \u00B7 ", toLocalTimeInput(w.starts_at), "\u2013", toLocalTimeInput(w.ends_at)] })] }), status === 'open' ? (_jsx("span", { className: "badge", children: "Abierta" })) : (_jsx("span", { style: { fontSize: 12, color: 'var(--muted)' }, children: STATUS_LABEL[status] }))] }), expanded && canEdit && !locked && (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12, padding: '0 0 16px' }, children: [_jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsxs("div", { children: [_jsx("div", { className: "label", children: "D\u00EDa" }), _jsx("input", { className: "input", type: "date", value: editValues.day, onChange: (e) => setEditValues((v) => ({ ...v, day: e.target.value })) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Hora inicio" }), _jsx("input", { className: "input", type: "time", value: editValues.startTime, onChange: (e) => setEditValues((v) => ({ ...v, startTime: e.target.value })) })] }), _jsxs("div", { children: [_jsx("div", { className: "label", children: "Hora fin" }), _jsx("input", { className: "input", type: "time", value: editValues.endTime, onChange: (e) => setEditValues((v) => ({ ...v, endTime: e.target.value })) })] })] }), _jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsx("button", { className: "button", onClick: () => handleSaveEdit(w), disabled: savingEdit, children: savingEdit ? 'Guardando…' : 'Guardar' }), _jsx("button", { className: "link", style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }, onClick: () => handleDelete(w.id), children: "Eliminar" })] })] }))] }, w.id));
                }) }))] }));
}
