'use client'

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

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CheckinWindow, EventClass, WindowKind } from '../types'
import {
  createCheckinWindow,
  createEventClass,
  deleteCheckinWindow,
  listEventClasses,
  listEventWindows,
  updateCheckinWindow,
} from '../queries'

export interface VentanasSectionProps {
  supabase: SupabaseClient
  eventId: string
  userId: string
  canEdit: boolean
  locked: boolean
}

type Status = 'scheduled' | 'open' | 'closed'

function computeStatus(startsAt: string, endsAt: string): Status {
  const now = Date.now()
  if (now < new Date(startsAt).getTime()) return 'scheduled'
  if (now > new Date(endsAt).getTime()) return 'closed'
  return 'open'
}

const STATUS_LABEL: Record<Status, string> = {
  scheduled: 'Programada',
  open: 'Abierta',
  closed: 'Cerrada',
}

const KIND_LABEL: Record<WindowKind, string> = {
  salida: 'Salida',
  regreso: 'Regreso',
}

// Las conversiones de acá abajo asumen que quien las usa está físicamente
// en el huso horario de Argentina — igual asunción que ya hace el resto de
// management-site (no hay manejo explícito de zona horaria en ningún otro
// componente). El "día operativo" real lo termina fijando la base.
function toLocalTimeInput(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function combineLocal(day: string, time: string): string {
  return new Date(`${day}T${time}:00`).toISOString()
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export default function VentanasSection({ supabase, eventId, userId, canEdit, locked }: VentanasSectionProps) {
  const [classes, setClasses] = useState<EventClass[] | null>(null)
  const [windows, setWindows] = useState<CheckinWindow[] | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [showAddClass, setShowAddClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [savingClass, setSavingClass] = useState(false)

  const [showAddWindow, setShowAddWindow] = useState(false)
  const [newWindow, setNewWindow] = useState({
    class_id: '',
    kind: 'salida' as WindowKind,
    day: '',
    startTime: '',
    endTime: '',
  })
  const [savingWindow, setSavingWindow] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ day: '', startTime: '', endTime: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(async () => {
    const [cls, win] = await Promise.all([listEventClasses(supabase, eventId), listEventWindows(supabase, eventId)])
    setClasses(cls)
    setWindows(win)
  }, [supabase, eventId])

  useEffect(() => {
    load()
  }, [load])

  const classById = useMemo(() => {
    const m = new Map<string, EventClass>()
    ;(classes ?? []).forEach((c) => m.set(c.id, c))
    return m
  }, [classes])

  async function handleAddClass(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const name = newClassName.trim()
    if (!name) return
    setSavingClass(true)
    try {
      await createEventClass(supabase, eventId, name)
      setNewClassName('')
      await load()
    } catch (err) {
      setErrorMsg(errorText(err))
    } finally {
      setSavingClass(false)
    }
  }

  async function handleAddWindow(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const { class_id, kind, day, startTime, endTime } = newWindow
    if (!class_id || !day || !startTime || !endTime) {
      setErrorMsg('Completá clase, día, hora de inicio y hora de fin.')
      return
    }
    setSavingWindow(true)
    try {
      await createCheckinWindow(supabase, {
        event_id: eventId,
        class_id,
        kind,
        day,
        starts_at: combineLocal(day, startTime),
        ends_at: combineLocal(day, endTime),
      })
      setNewWindow({ class_id: '', kind: 'salida', day: '', startTime: '', endTime: '' })
      setShowAddWindow(false)
      await load()
    } catch (err) {
      setErrorMsg(errorText(err))
    } finally {
      setSavingWindow(false)
    }
  }

  function openEdit(w: CheckinWindow) {
    setExpandedId(w.id)
    setEditValues({ day: w.day, startTime: toLocalTimeInput(w.starts_at), endTime: toLocalTimeInput(w.ends_at) })
    setErrorMsg(null)
  }

  async function handleSaveEdit(w: CheckinWindow) {
    setErrorMsg(null)
    setSavingEdit(true)
    try {
      await updateCheckinWindow(supabase, w.id, {
        day: editValues.day,
        starts_at: combineLocal(editValues.day, editValues.startTime),
        ends_at: combineLocal(editValues.day, editValues.endTime),
      })
      setExpandedId(null)
      await load()
    } catch (err) {
      setErrorMsg(errorText(err))
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar esta ventana?')) return
    setErrorMsg(null)
    try {
      await deleteCheckinWindow(supabase, id)
      setExpandedId(null)
      await load()
    } catch (err) {
      setErrorMsg(errorText(err))
    }
  }

  return (
    <div className="card">
      <div className="rowBetween">
        <div className="sectionTitle">Ventanas de check-in</div>
        {canEdit && !locked && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="link"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => {
                setShowAddClass((v) => !v)
                setShowAddWindow(false)
              }}
            >
              {showAddClass ? 'Cancelar' : '+ Clase'}
            </button>
            <button
              className="link"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => {
                setShowAddWindow((v) => !v)
                setShowAddClass(false)
              }}
            >
              {showAddWindow ? 'Cancelar' : '+ Ventana'}
            </button>
          </div>
        )}
      </div>

      {errorMsg && <div className="error">{errorMsg}</div>}

      {showAddClass && canEdit && !locked && (
        <form onSubmit={handleAddClass} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div className="label">Nombre de la clase</div>
            <input
              className="input"
              placeholder="Optimist, ILCA, 420…"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
            />
          </div>
          <button className="button" type="submit" disabled={savingClass}>
            {savingClass ? 'Guardando…' : 'Agregar'}
          </button>
        </form>
      )}

      {classes !== null && classes.length === 0 && !showAddClass && (
        <div className="subtitle">
          Todavía no hay clases cargadas para este evento — hace falta al menos una para poder crear una ventana.
        </div>
      )}

      {showAddWindow && canEdit && !locked && (
        <form onSubmit={handleAddWindow} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="label">Clase</div>
              <select
                className="select"
                value={newWindow.class_id}
                onChange={(e) => setNewWindow((v) => ({ ...v, class_id: e.target.value }))}
              >
                <option value="">Seleccionar…</option>
                {(classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">Tipo</div>
              <select
                className="select"
                value={newWindow.kind}
                onChange={(e) => setNewWindow((v) => ({ ...v, kind: e.target.value as WindowKind }))}
              >
                <option value="salida">Salida</option>
                <option value="regreso">Regreso</option>
              </select>
            </div>
            <div>
              <div className="label">Día</div>
              <input
                className="input"
                type="date"
                value={newWindow.day}
                onChange={(e) => setNewWindow((v) => ({ ...v, day: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="label">Hora inicio</div>
                <input
                  className="input"
                  type="time"
                  value={newWindow.startTime}
                  onChange={(e) => setNewWindow((v) => ({ ...v, startTime: e.target.value }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="label">Hora fin</div>
                <input
                  className="input"
                  type="time"
                  value={newWindow.endTime}
                  onChange={(e) => setNewWindow((v) => ({ ...v, endTime: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <button className="button" type="submit" disabled={savingWindow} style={{ alignSelf: 'flex-start' }}>
            {savingWindow ? 'Guardando…' : 'Crear ventana'}
          </button>
        </form>
      )}

      {windows === null ? (
        <div className="subtitle">Cargando…</div>
      ) : windows.length === 0 ? (
        <div className="subtitle">Todavía no hay ventanas configuradas.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {windows.map((w) => {
            const status = computeStatus(w.starts_at, w.ends_at)
            const expanded = expandedId === w.id
            return (
              <div key={w.id}>
                <div
                  className="memberRow"
                  style={{ cursor: canEdit && !locked ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (!canEdit || locked) return
                    if (expanded) setExpandedId(null)
                    else openEdit(w)
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>
                      {classById.get(w.class_id)?.name ?? '—'} · {KIND_LABEL[w.kind]}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {w.day} · {toLocalTimeInput(w.starts_at)}–{toLocalTimeInput(w.ends_at)}
                    </span>
                  </div>
                  {status === 'open' ? (
                    <span className="badge">Abierta</span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{STATUS_LABEL[status]}</span>
                  )}
                </div>
                {expanded && canEdit && !locked && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 0 16px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div>
                        <div className="label">Día</div>
                        <input
                          className="input"
                          type="date"
                          value={editValues.day}
                          onChange={(e) => setEditValues((v) => ({ ...v, day: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="label">Hora inicio</div>
                        <input
                          className="input"
                          type="time"
                          value={editValues.startTime}
                          onChange={(e) => setEditValues((v) => ({ ...v, startTime: e.target.value }))}
                        />
                      </div>
                      <div>
                        <div className="label">Hora fin</div>
                        <input
                          className="input"
                          type="time"
                          value={editValues.endTime}
                          onChange={(e) => setEditValues((v) => ({ ...v, endTime: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button className="button" onClick={() => handleSaveEdit(w)} disabled={savingEdit}>
                        {savingEdit ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        className="link"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}
                        onClick={() => handleDelete(w.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
