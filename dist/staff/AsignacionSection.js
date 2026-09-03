'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Pantalla de staff para asignar qué barcos declara cada persona
// (`kalai.entrant_declarants`). Sin esto el módulo entero no funciona: el
// banner del declarante en Coach Data busca los barcos asignados al usuario,
// así que mientras nadie esté asignado, a nadie le aparece nada.
//
// Se asigna DE A UNA PERSONA, viendo todos los barcos del evento con un
// checkbox — es el "en bloque" del plan: el caso real es un entrenador con
// diez o quince barcos de la misma clase, no uno por uno.
//
// No trae CSS propio: usa las clases de globals.css de management-site
// (decisión D6), igual que VentanasSection.
//
// Ojo con el vocabulario: acá "persona que declara" es una CUENTA real
// (`public.profiles`, vía `kalai.event_memberships`), no una fila del roster
// de entrenadores. Un entrenador cargado en Entrenadores es texto libre con
// email y no tiene usuario detrás hasta que acepta su invitación. Por eso
// esta pantalla lista miembros del evento y no el roster.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAllBoats, listDeclarantCandidates, listEventAssignments, listEventClasses, setDeclarantBoats, } from '../queries';
function errorText(err) {
    return err instanceof Error ? err.message : String(err);
}
function personLabel(c) {
    return c.name ? `${c.name} (${c.email})` : c.email;
}
export default function AsignacionSection({ supabase, eventId, userId, canEdit, locked }) {
    const [boats, setBoats] = useState(null);
    const [classes, setClasses] = useState([]);
    const [people, setPeople] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [selectedUser, setSelectedUser] = useState('');
    const [draft, setDraft] = useState(new Set());
    const [classFilter, setClassFilter] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [notice, setNotice] = useState(null);
    const load = useCallback(async () => {
        try {
            setErrorMsg(null);
            const [b, c, p, a] = await Promise.all([
                listAllBoats(supabase, eventId),
                listEventClasses(supabase, eventId),
                listDeclarantCandidates(supabase, eventId),
                listEventAssignments(supabase, eventId),
            ]);
            setBoats(b);
            setClasses(c);
            setPeople(p);
            setAssignments(a);
        }
        catch (err) {
            setErrorMsg(errorText(err));
        }
        finally {
            setLoading(false);
        }
    }, [supabase, eventId]);
    useEffect(() => {
        void load();
    }, [load]);
    // Lo que la persona seleccionada tiene asignado HOY en la base.
    const currentForUser = useMemo(() => assignments.filter((a) => a.user_id === selectedUser).map((a) => a.entrant_id), [assignments, selectedUser]);
    // Al cambiar de persona, el borrador arranca de lo que ya tiene.
    useEffect(() => {
        setDraft(new Set(currentForUser));
        setNotice(null);
    }, [selectedUser]); // eslint-disable-line react-hooks/exhaustive-deps
    // Cuántas personas declaran cada barco — un barco puede tener más de una
    // (entrenador + tripulante autónomo), y un barco con CERO es el que se
    // pasa por alto y nadie declara el día del evento.
    const declarantsByBoat = useMemo(() => {
        const map = new Map();
        for (const a of assignments)
            map.set(a.entrant_id, (map.get(a.entrant_id) ?? 0) + 1);
        return map;
    }, [assignments]);
    const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
    const visibleBoats = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (boats ?? []).filter((b) => {
            if (classFilter && b.class_id !== classFilter)
                return false;
            if (!q)
                return true;
            const haystack = [b.full_name, b.sail_number ?? '', ...(b.crew ?? []).map((c) => c.full_name)]
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [boats, classFilter, search]);
    const unassignedCount = useMemo(() => (boats ?? []).filter((b) => !declarantsByBoat.has(b.id)).length, [boats, declarantsByBoat]);
    const noClassCount = useMemo(() => (boats ?? []).filter((b) => !b.class_id).length, [boats]);
    const dirty = useMemo(() => {
        const current = new Set(currentForUser);
        if (current.size !== draft.size)
            return true;
        for (const id of draft)
            if (!current.has(id))
                return true;
        return false;
    }, [currentForUser, draft]);
    const toggle = (entrantId) => {
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(entrantId))
                next.delete(entrantId);
            else
                next.add(entrantId);
            return next;
        });
    };
    // Aplica sobre lo que se está viendo, no sobre todo el evento: con el
    // filtro de clase puesto, "Seleccionar todos" es "todos los de esta clase",
    // que es el gesto real del staff.
    const selectAllVisible = () => {
        setDraft((prev) => {
            const next = new Set(prev);
            for (const b of visibleBoats)
                next.add(b.id);
            return next;
        });
    };
    const clearVisible = () => {
        setDraft((prev) => {
            const next = new Set(prev);
            for (const b of visibleBoats)
                next.delete(b.id);
            return next;
        });
    };
    const save = async () => {
        if (!selectedUser)
            return;
        setSaving(true);
        setErrorMsg(null);
        setNotice(null);
        try {
            const { added, removed } = await setDeclarantBoats(supabase, selectedUser, userId, currentForUser, [...draft]);
            const parts = [];
            if (added > 0)
                parts.push(`${added} ${added === 1 ? 'barco asignado' : 'barcos asignados'}`);
            if (removed > 0)
                parts.push(`${removed} ${removed === 1 ? 'quitado' : 'quitados'}`);
            setNotice(parts.length > 0 ? parts.join(', ') : 'Sin cambios');
            // Se recarga en vez de confiar en el estado local: si otro miembro del
            // staff asignó los mismos barcos mientras tanto, esto lo trae.
            await load();
        }
        catch (err) {
            setErrorMsg(errorText(err));
        }
        finally {
            setSaving(false);
        }
    };
    const disabled = !canEdit || locked || saving;
    return (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "rowBetween", children: [_jsx("div", { className: "sectionTitle", children: "Asignaci\u00F3n de barcos" }), boats && boats.length > 0 && (_jsx("span", { className: "subtitle", children: unassignedCount === 0
                            ? 'Todos los barcos tienen declarante'
                            : `${unassignedCount} sin declarante` }))] }), errorMsg && _jsx("div", { className: "error", children: errorMsg }), loading ? (_jsx("div", { className: "subtitle", children: "Cargando\u2026" })) : people.length === 0 ? (_jsx("div", { className: "subtitle", children: "Todav\u00EDa no hay nadie en el evento a quien asignarle barcos. Solo aparecen ac\u00E1 las personas que ya aceptaron su invitaci\u00F3n y tienen cuenta \u2014 los entrenadores cargados en la secci\u00F3n Entrenadores son texto libre y no cuentan hasta que se registran." })) : (boats ?? []).length === 0 ? (_jsx("div", { className: "subtitle", children: "Todav\u00EDa no hay barcos cargados en Participantes." })) : (_jsxs(_Fragment, { children: [noClassCount > 0 && (_jsxs("div", { className: "error", children: [noClassCount, " ", noClassCount === 1 ? 'barco no tiene' : 'barcos no tienen', " clase asignada. Un barco sin clase no puede aparecer en ninguna ventana de check-in, aunque tenga declarante. Complet\u00E1 la clase en Participantes."] })), _jsxs("div", { style: { marginTop: 12 }, children: [_jsx("div", { className: "label", children: "Persona que declara" }), _jsxs("select", { className: "select", value: selectedUser, onChange: (e) => setSelectedUser(e.target.value), disabled: disabled, children: [_jsx("option", { value: "", children: "Eleg\u00ED una persona\u2026" }), people.map((p) => (_jsxs("option", { value: p.user_id, children: [personLabel(p), " \u2014 ", p.role] }, p.user_id)))] })] }), selectedUser && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }, children: [_jsxs("select", { className: "select", value: classFilter, onChange: (e) => setClassFilter(e.target.value), style: { maxWidth: 220 }, children: [_jsx("option", { value: "", children: "Todas las clases" }), classes.map((c) => (_jsx("option", { value: c.id, children: c.name }, c.id)))] }), _jsx("input", { className: "input", placeholder: "Buscar por nombre o vela", value: search, onChange: (e) => setSearch(e.target.value), style: { maxWidth: 260 } }), _jsxs("button", { className: "link", type: "button", onClick: selectAllVisible, disabled: disabled, children: ["Seleccionar ", classFilter || search ? 'los visibles' : 'todos'] }), _jsxs("button", { className: "link", type: "button", onClick: clearVisible, disabled: disabled, children: ["Quitar ", classFilter || search ? 'los visibles' : 'todos'] })] }), _jsxs("div", { className: "subtitle", style: { marginTop: 8 }, children: [draft.size, " ", draft.size === 1 ? 'barco seleccionado' : 'barcos seleccionados', visibleBoats.length !== (boats ?? []).length
                                        ? ` · mostrando ${visibleBoats.length} de ${(boats ?? []).length}`
                                        : ''] }), visibleBoats.length === 0 ? (_jsx("div", { className: "subtitle", children: "Ning\u00FAn barco coincide con el filtro." })) : (_jsx("div", { style: { marginTop: 8 }, children: visibleBoats.map((b) => {
                                    const others = (declarantsByBoat.get(b.id) ?? 0) - (currentForUser.includes(b.id) ? 1 : 0);
                                    const crewNames = (b.crew ?? [])
                                        .filter((c) => c.full_name && c.full_name !== b.full_name)
                                        .map((c) => c.full_name);
                                    return (_jsxs("label", { className: "memberRow", style: { cursor: disabled ? 'default' : 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: draft.has(b.id), onChange: () => toggle(b.id), disabled: disabled, style: { marginRight: 10 } }), _jsxs("span", { style: { flex: 1 }, children: [_jsxs("span", { style: { fontWeight: 600 }, children: [b.sail_number ? `${b.sail_number} · ` : '', b.full_name] }), _jsxs("span", { className: "subtitle", style: { display: 'block' }, children: [b.class_id ? (classNameById.get(b.class_id) ?? 'Clase desconocida') : 'Sin clase', crewNames.length > 0 ? ` · con ${crewNames.join(', ')}` : '', others > 0
                                                                ? ` · ${others} ${others === 1 ? 'declarante más' : 'declarantes más'}`
                                                                : ''] })] })] }, b.id));
                                }) })), notice && _jsx("div", { className: "subtitle", style: { marginTop: 8 }, children: notice }), _jsx("div", { style: { marginTop: 12 }, children: _jsx("button", { className: "button", type: "button", onClick: save, disabled: disabled || !dirty, children: saving ? 'Guardando…' : 'Guardar asignación' }) })] }))] }))] }));
}
