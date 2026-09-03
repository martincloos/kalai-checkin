'use client'

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

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Boat, DeclarantAssignment, DeclarantCandidate, EventClass } from '../types'
import {
  listAllBoats,
  listDeclarantCandidates,
  listEventAssignments,
  listEventClasses,
  setDeclarantBoats,
} from '../queries'

export interface AsignacionSectionProps {
  supabase: SupabaseClient
  eventId: string
  userId: string
  canEdit: boolean
  locked: boolean
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function personLabel(c: DeclarantCandidate): string {
  return c.name ? `${c.name} (${c.email})` : c.email
}

export default function AsignacionSection({ supabase, eventId, userId, canEdit, locked }: AsignacionSectionProps) {
  const [boats, setBoats] = useState<Boat[] | null>(null)
  const [classes, setClasses] = useState<EventClass[]>([])
  const [people, setPeople] = useState<DeclarantCandidate[]>([])
  const [assignments, setAssignments] = useState<DeclarantAssignment[]>([])

  const [selectedUser, setSelectedUser] = useState<string>('')
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [classFilter, setClassFilter] = useState<string>('')
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setErrorMsg(null)
      const [b, c, p, a] = await Promise.all([
        listAllBoats(supabase, eventId),
        listEventClasses(supabase, eventId),
        listDeclarantCandidates(supabase, eventId),
        listEventAssignments(supabase, eventId),
      ])
      setBoats(b)
      setClasses(c)
      setPeople(p)
      setAssignments(a)
    } catch (err) {
      setErrorMsg(errorText(err))
    } finally {
      setLoading(false)
    }
  }, [supabase, eventId])

  useEffect(() => {
    void load()
  }, [load])

  // Lo que la persona seleccionada tiene asignado HOY en la base.
  const currentForUser = useMemo(
    () => assignments.filter((a) => a.user_id === selectedUser).map((a) => a.entrant_id),
    [assignments, selectedUser],
  )

  // Al cambiar de persona, el borrador arranca de lo que ya tiene.
  useEffect(() => {
    setDraft(new Set(currentForUser))
    setNotice(null)
  }, [selectedUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuántas personas declaran cada barco — un barco puede tener más de una
  // (entrenador + tripulante autónomo), y un barco con CERO es el que se
  // pasa por alto y nadie declara el día del evento.
  const declarantsByBoat = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of assignments) map.set(a.entrant_id, (map.get(a.entrant_id) ?? 0) + 1)
    return map
  }, [assignments])

  const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes])

  const visibleBoats = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (boats ?? []).filter((b) => {
      if (classFilter && b.class_id !== classFilter) return false
      if (!q) return true
      const haystack = [b.full_name, b.sail_number ?? '', ...(b.crew ?? []).map((c) => c.full_name)]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [boats, classFilter, search])

  const unassignedCount = useMemo(
    () => (boats ?? []).filter((b) => !declarantsByBoat.has(b.id)).length,
    [boats, declarantsByBoat],
  )

  const noClassCount = useMemo(() => (boats ?? []).filter((b) => !b.class_id).length, [boats])

  const dirty = useMemo(() => {
    const current = new Set(currentForUser)
    if (current.size !== draft.size) return true
    for (const id of draft) if (!current.has(id)) return true
    return false
  }, [currentForUser, draft])

  const toggle = (entrantId: string) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(entrantId)) next.delete(entrantId)
      else next.add(entrantId)
      return next
    })
  }

  // Aplica sobre lo que se está viendo, no sobre todo el evento: con el
  // filtro de clase puesto, "Seleccionar todos" es "todos los de esta clase",
  // que es el gesto real del staff.
  const selectAllVisible = () => {
    setDraft((prev) => {
      const next = new Set(prev)
      for (const b of visibleBoats) next.add(b.id)
      return next
    })
  }

  const clearVisible = () => {
    setDraft((prev) => {
      const next = new Set(prev)
      for (const b of visibleBoats) next.delete(b.id)
      return next
    })
  }

  const save = async () => {
    if (!selectedUser) return
    setSaving(true)
    setErrorMsg(null)
    setNotice(null)
    try {
      const { added, removed } = await setDeclarantBoats(
        supabase,
        selectedUser,
        userId,
        currentForUser,
        [...draft],
      )
      const parts: string[] = []
      if (added > 0) parts.push(`${added} ${added === 1 ? 'barco asignado' : 'barcos asignados'}`)
      if (removed > 0) parts.push(`${removed} ${removed === 1 ? 'quitado' : 'quitados'}`)
      setNotice(parts.length > 0 ? parts.join(', ') : 'Sin cambios')
      // Se recarga en vez de confiar en el estado local: si otro miembro del
      // staff asignó los mismos barcos mientras tanto, esto lo trae.
      await load()
    } catch (err) {
      setErrorMsg(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  const disabled = !canEdit || locked || saving

  return (
    <div className="card">
      <div className="rowBetween">
        <div className="sectionTitle">Asignación de barcos</div>
        {boats && boats.length > 0 && (
          <span className="subtitle">
            {unassignedCount === 0
              ? 'Todos los barcos tienen declarante'
              : `${unassignedCount} sin declarante`}
          </span>
        )}
      </div>

      {errorMsg && <div className="error">{errorMsg}</div>}

      {loading ? (
        <div className="subtitle">Cargando…</div>
      ) : people.length === 0 ? (
        <div className="subtitle">
          Todavía no hay nadie en el evento a quien asignarle barcos. Solo aparecen acá las
          personas que ya aceptaron su invitación y tienen cuenta — los entrenadores cargados
          en la sección Entrenadores son texto libre y no cuentan hasta que se registran.
        </div>
      ) : (boats ?? []).length === 0 ? (
        <div className="subtitle">Todavía no hay barcos cargados en Participantes.</div>
      ) : (
        <>
          {noClassCount > 0 && (
            <div className="error">
              {noClassCount} {noClassCount === 1 ? 'barco no tiene' : 'barcos no tienen'} clase
              asignada. Un barco sin clase no puede aparecer en ninguna ventana de check-in,
              aunque tenga declarante. Completá la clase en Participantes.
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div className="label">Persona que declara</div>
            <select
              className="select"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              disabled={disabled}
            >
              <option value="">Elegí una persona…</option>
              {people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {personLabel(p)} — {p.role}
                </option>
              ))}
            </select>
          </div>

          {selectedUser && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <select
                  className="select"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">Todas las clases</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="Buscar por nombre o vela"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ maxWidth: 260 }}
                />
                <button className="link" type="button" onClick={selectAllVisible} disabled={disabled}>
                  Seleccionar {classFilter || search ? 'los visibles' : 'todos'}
                </button>
                <button className="link" type="button" onClick={clearVisible} disabled={disabled}>
                  Quitar {classFilter || search ? 'los visibles' : 'todos'}
                </button>
              </div>

              <div className="subtitle" style={{ marginTop: 8 }}>
                {draft.size} {draft.size === 1 ? 'barco seleccionado' : 'barcos seleccionados'}
                {visibleBoats.length !== (boats ?? []).length
                  ? ` · mostrando ${visibleBoats.length} de ${(boats ?? []).length}`
                  : ''}
              </div>

              {visibleBoats.length === 0 ? (
                <div className="subtitle">Ningún barco coincide con el filtro.</div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {visibleBoats.map((b) => {
                    const others = (declarantsByBoat.get(b.id) ?? 0) - (currentForUser.includes(b.id) ? 1 : 0)
                    const crewNames = (b.crew ?? [])
                      .filter((c) => c.full_name && c.full_name !== b.full_name)
                      .map((c) => c.full_name)
                    return (
                      <label key={b.id} className="memberRow" style={{ cursor: disabled ? 'default' : 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={draft.has(b.id)}
                          onChange={() => toggle(b.id)}
                          disabled={disabled}
                          style={{ marginRight: 10 }}
                        />
                        <span style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600 }}>
                            {b.sail_number ? `${b.sail_number} · ` : ''}
                            {b.full_name}
                          </span>
                          <span className="subtitle" style={{ display: 'block' }}>
                            {b.class_id ? (classNameById.get(b.class_id) ?? 'Clase desconocida') : 'Sin clase'}
                            {crewNames.length > 0 ? ` · con ${crewNames.join(', ')}` : ''}
                            {others > 0
                              ? ` · ${others} ${others === 1 ? 'declarante más' : 'declarantes más'}`
                              : ''}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              {notice && <div className="subtitle" style={{ marginTop: 8 }}>{notice}</div>}

              <div style={{ marginTop: 12 }}>
                <button className="button" type="button" onClick={save} disabled={disabled || !dirty}>
                  {saving ? 'Guardando…' : 'Guardar asignación'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
