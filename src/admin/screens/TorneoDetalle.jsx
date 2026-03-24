import { useState, useEffect, useRef } from "react";
import {
  collection, getDocs, addDoc, doc, updateDoc, setDoc, deleteDoc, query, orderBy
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SelectAdmin,
  SeccionLabel, EmptyState, Spinner, Switch, sombra
} from "../AdminUI";

const V = "#1a3a2a";
const VL = "#4ade80";
const CRITERIOS_OPCIONES = [
  { id: "puntos",                label: "Puntos" },
  { id: "gd",                    label: "Diferencia de goles" },
  { id: "gf",                    label: "Goles a favor" },
  { id: "enfrentamientoDirecto", label: "Enfrentamiento directo" },
  { id: "menosGC",               label: "Menos goles en contra" },
];

export default function TorneoDetalle({ liga, temporada, competencia, torneo, onBack }) {
  const [tab, setTab] = useState("config");

  const ligaRef = doc(db, "ligas", liga.docId);
  const tempRef = doc(collection(ligaRef, "temporadas"), temporada.docId);
  const compRef = doc(collection(tempRef, "competencias"), competencia.docId);
  const torneoRef = doc(collection(compRef, "torneos"), torneo.docId);

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin titulo={torneo.nombre} subtitulo={competencia.nombre + " · " + String(temporada.anio)} onBack={onBack} />
      {/* Tab bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #dcfce7", position: "sticky", top: 52, zIndex: 9 }}>
        <div style={{ display: "flex", maxWidth: 600, margin: "0 auto" }}>
          {[
            { id: "config",      label: "Config" },
            { id: "zonas",       label: torneo.tipo === "B" ? "Clubes" : "Zonas" },
            { id: "suspendidos", label: "Suspendidos" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 4px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? V : "#6b7280",
              borderBottom: tab === t.id ? `2px solid ${VL}` : "2px solid transparent",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {tab === "config"      && <TabConfig torneo={torneo} torneoRef={torneoRef} />}
        {tab === "zonas"       && <TabZonas torneo={torneo} torneoRef={torneoRef} />}
        {tab === "suspendidos" && <TabSuspendidos torneo={torneo} torneoRef={torneoRef} liga={liga} temporada={temporada} />}
      </div>
    </div>
  );
}

// ─── TAB CONFIGURACIÓN ──────────────────────────────────────────────────────

function TabConfig({ torneo, torneoRef }) {
  const [config, setConfig] = useState({
    puntosPorVictoria:          torneo.puntosPorVictoria ?? 3,
    puntosPorEmpate:            torneo.puntosPorEmpate ?? 1,
    criteriosDesempate:         torneo.criteriosDesempate ?? ["puntos", "gd", "gf", "enfrentamientoDirecto"],
    amarillasParaSuspension:    torneo.amarillasParaSuspension ?? 5,
    advertenciaFaltanAmarillas: torneo.advertenciaFaltanAmarillas ?? 1,
  });
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const dragIdx = useRef(null);

  async function guardar() {
    setGuardando(true);
    await updateDoc(torneoRef, config);
    setGuardando(false);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2000);
  }

  function moverCriterio(idx, dir) {
    const arr = [...config.criteriosDesempate];
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    setConfig(c => ({ ...c, criteriosDesempate: arr }));
  }

  function toggleCriterio(id) {
    setConfig(c => {
      const arr = c.criteriosDesempate;
      if (arr.includes(id)) return { ...c, criteriosDesempate: arr.filter(x => x !== id) };
      return { ...c, criteriosDesempate: [...arr, id] };
    });
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      <SeccionLabel>Puntuación</SeccionLabel>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Campo label="Puntos por victoria" style={{ flex: 1 }}>
            <InputAdmin type="number" min={0} max={9} value={config.puntosPorVictoria}
              onChange={e => setConfig(c => ({ ...c, puntosPorVictoria: parseInt(e.target.value) || 0 }))} />
          </Campo>
          <Campo label="Puntos por empate" style={{ flex: 1 }}>
            <InputAdmin type="number" min={0} max={9} value={config.puntosPorEmpate}
              onChange={e => setConfig(c => ({ ...c, puntosPorEmpate: parseInt(e.target.value) || 0 }))} />
          </Campo>
        </div>
      </Card>

      <SeccionLabel>Criterios de desempate (en orden)</SeccionLabel>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CRITERIOS_OPCIONES.map(op => {
            const idx = config.criteriosDesempate.indexOf(op.id);
            const activo = idx !== -1;
            return (
              <div key={op.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderRadius: 8, background: activo ? "#f0fdf4" : "transparent" }}>
                <Switch value={activo} onChange={() => toggleCriterio(op.id)} />
                <span style={{ flex: 1, fontSize: 13, color: activo ? "#111827" : "#9ca3af", fontWeight: activo ? 600 : 400 }}>
                  {activo ? `${idx + 1}. ` : ""}{op.label}
                </span>
                {activo && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => moverCriterio(idx, -1)} disabled={idx === 0}
                      style={{ background: "#e5e7eb", border: "none", borderRadius: 6, width: 28, height: 28, cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, fontSize: 12 }}>↑</button>
                    <button onClick={() => moverCriterio(idx, 1)} disabled={idx === config.criteriosDesempate.length - 1}
                      style={{ background: "#e5e7eb", border: "none", borderRadius: 6, width: 28, height: 28, cursor: idx === config.criteriosDesempate.length - 1 ? "default" : "pointer", opacity: idx === config.criteriosDesempate.length - 1 ? 0.3 : 1, fontSize: 12 }}>↓</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <SeccionLabel>Tarjetas amarillas</SeccionLabel>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Campo label="Amarillas para suspensión" style={{ flex: 1 }}>
            <InputAdmin type="number" min={1} max={20} value={config.amarillasParaSuspension}
              onChange={e => setConfig(c => ({ ...c, amarillasParaSuspension: parseInt(e.target.value) || 1 }))} />
          </Campo>
          <Campo label="Advertencia (faltan X)" style={{ flex: 1 }}>
            <InputAdmin type="number" min={0} max={5} value={config.advertenciaFaltanAmarillas}
              onChange={e => setConfig(c => ({ ...c, advertenciaFaltanAmarillas: parseInt(e.target.value) || 0 }))} />
          </Campo>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
          Se advertirá cuando al jugador le falte {config.advertenciaFaltanAmarillas} amarilla{config.advertenciaFaltanAmarillas !== 1 ? "s" : ""} para llegar a {config.amarillasParaSuspension}.
        </div>
      </Card>

      <BtnPrimary onClick={guardar} disabled={guardando} fullWidth>
        {guardado ? "✓ Guardado" : guardando ? "Guardando..." : "Guardar configuración"}
      </BtnPrimary>
    </div>
  );
}

// ─── TAB ZONAS ──────────────────────────────────────────────────────────────

function TabZonas({ torneo, torneoRef }) {
  const [zonas, setZonas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [zonaAbierta, setZonaAbierta] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nombre: "" });
  const [guardando, setGuardando] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const zonasCol = collection(torneoRef, "zonas");

  async function cargar() {
    setCargando(true);
    const snap = await getDocs(zonasCol);
    setZonas(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crearZona() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    await addDoc(zonasCol, { nombre: form.nombre.trim(), creadaEn: Date.now() });
    setForm({ nombre: "" });
    setModal(false);
    setGuardando(false);
    await cargar();
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(zonasCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  if (zonaAbierta) {
    return (
      <ZonaDetalle
        torneo={torneo}
        zona={zonaAbierta}
        zonaRef={doc(zonasCol, zonaAbierta.docId)}
        onBack={() => { setZonaAbierta(null); cargar(); }}
      />
    );
  }

  const etiquetaZona = torneo.tipo === "B" ? "Club" : "Zona";

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SeccionLabel>{etiquetaZona}s</SeccionLabel>
        <button onClick={() => setModal(true)} style={{ background: V, color: VL, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ {etiquetaZona}</button>
      </div>
      {cargando ? <Spinner /> : zonas.length === 0 ? (
        <EmptyState emoji="📋" titulo={`Sin ${etiquetaZona.toLowerCase()}s`} descripcion={`Agregá la primera ${etiquetaZona.toLowerCase()}`} />
      ) : (
        zonas.map(zona => (
          <Card key={zona.docId} onClick={() => setZonaAbierta(zona)}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {torneo.tipo === "B" ? "🏟️" : "📋"}
              </div>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#111827" }}>{zona.nombre}</div>
              <button
                onClick={e => { e.stopPropagation(); setPendingDelete(zona); }}
                style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px", flexShrink: 0 }}
              >🗑</button>
              <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
            </div>
          </Card>
        ))
      )}

      {modal && (
        <Modal titulo={`Nueva ${etiquetaZona}`} onClose={() => { setModal(false); setForm({ nombre: "" }); }}>
          <Campo label="Nombre">
            <InputAdmin placeholder={torneo.tipo === "B" ? "Club Atlético Hurlingam" : "Zona A"} value={form.nombre} onChange={e => setForm({ nombre: e.target.value })} />
          </Campo>
          <BtnPrimary onClick={crearZona} disabled={guardando} fullWidth>{guardando ? "Creando..." : `Crear ${etiquetaZona}`}</BtnPrimary>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás ${etiquetaZona === "Club" ? "el club" : "la zona"} "${pendingDelete.nombre}".`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ─── ZONA DETALLE (equipos directos o categorías) ───────────────────────────

function ZonaDetalle({ torneo, zona, zonaRef, onBack }) {
  const [catAbierta, setCatAbierta] = useState(null);

  if (torneo.tipo === "B") {
    if (catAbierta) {
      const catRef = doc(collection(zonaRef, "categorias"), catAbierta.docId);
      return (
        <EquiposYFixture
          titulo={catAbierta.nombre}
          subtitulo={zona.nombre}
          contenedorRef={catRef}
          onBack={() => setCatAbierta(null)}
        />
      );
    }
    return <CategoriasList zona={zona} zonaRef={zonaRef} onSeleccionar={setCatAbierta} onBack={onBack} />;
  }

  return (
    <EquiposYFixture
      titulo={zona.nombre}
      subtitulo={null}
      contenedorRef={zonaRef}
      onBack={onBack}
    />
  );
}

// ─── LISTA DE CATEGORÍAS (Tipo B) ───────────────────────────────────────────

function CategoriasList({ zona, zonaRef, onSeleccionar, onBack }) {
  const [cats, setCats] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nombre: "" });
  const [guardando, setGuardando] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const catsCol = collection(zonaRef, "categorias");

  async function cargar() {
    setCargando(true);
    const snap = await getDocs(catsCol);
    setCats(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    await addDoc(catsCol, { nombre: form.nombre.trim(), creadaEn: Date.now() });
    setForm({ nombre: "" });
    setModal(false);
    setGuardando(false);
    await cargar();
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(catsCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 22, lineHeight: 1, padding: 0 }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{zona.nombre}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SeccionLabel>Categorías</SeccionLabel>
        <button onClick={() => setModal(true)} style={{ background: V, color: VL, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Categoría</button>
      </div>
      {cargando ? <Spinner /> : cats.length === 0 ? (
        <EmptyState emoji="📂" titulo="Sin categorías" descripcion="Agregá categorías al club" />
      ) : (
        cats.map(cat => (
          <Card key={cat.docId} onClick={() => onSeleccionar(cat)}>
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "#111827" }}>{cat.nombre}</div>
              <button
                onClick={e => { e.stopPropagation(); setPendingDelete(cat); }}
                style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px", flexShrink: 0 }}
              >🗑</button>
              <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
            </div>
          </Card>
        ))
      )}
      {modal && (
        <Modal titulo="Nueva Categoría" onClose={() => { setModal(false); setForm({ nombre: "" }); }}>
          <Campo label="Nombre (ej: Sub-20)">
            <InputAdmin placeholder="Sub-20" value={form.nombre} onChange={e => setForm({ nombre: e.target.value })} />
          </Campo>
          <BtnPrimary onClick={crear} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear Categoría"}</BtnPrimary>
        </Modal>
      )}
      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás la categoría "${pendingDelete.nombre}".`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ─── EQUIPOS Y FIXTURE ──────────────────────────────────────────────────────

function EquiposYFixture({ titulo, subtitulo, contenedorRef, onBack }) {
  const [subTab, setSubTab] = useState("equipos");
  const equiposCol = collection(contenedorRef, "equipos");
  const fixtureCol = collection(contenedorRef, "fixture");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px 0", borderTop: "1px solid #f0fdf4" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 22, lineHeight: 1, padding: 0 }}>‹</button>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 11, color: "#9ca3af" }}>{subtitulo}</div>}
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: "1px solid #dcfce7", margin: "8px 0 0" }}>
        {[{ id: "equipos", label: "Equipos" }, { id: "fixture", label: "Fixture" }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            flex: 1, padding: "9px 4px", border: "none", background: "none", cursor: "pointer",
            fontSize: 13, fontWeight: subTab === t.id ? 700 : 500,
            color: subTab === t.id ? V : "#6b7280",
            borderBottom: subTab === t.id ? `2px solid ${VL}` : "2px solid transparent",
          }}>{t.label}</button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {subTab === "equipos" && <Equipos equiposCol={equiposCol} />}
        {subTab === "fixture" && <Fixture fixtureCol={fixtureCol} equiposCol={equiposCol} />}
      </div>
    </div>
  );
}

// ─── EQUIPOS ────────────────────────────────────────────────────────────────

function Equipos({ equiposCol }) {
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nombre: "" });
  const [guardando, setGuardando] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function cargar() {
    setCargando(true);
    const snap = await getDocs(equiposCol);
    setEquipos(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!form.nombre.trim()) return;
    setGuardando(true);
    await addDoc(equiposCol, { nombre: form.nombre.trim(), creadoEn: Date.now() });
    setForm({ nombre: "" });
    setModal(false);
    setGuardando(false);
    await cargar();
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(equiposCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SeccionLabel>Equipos</SeccionLabel>
        <button onClick={() => setModal(true)} style={{ background: V, color: VL, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Equipo</button>
      </div>
      {cargando ? <Spinner /> : equipos.length === 0 ? (
        <EmptyState emoji="⚽" titulo="Sin equipos" descripcion="Agregá equipos a esta zona" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {equipos.map(eq => (
            <div key={eq.docId} style={{ background: "#fff", borderRadius: 10, border: "1px solid #dcfce7", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{eq.nombre}</span>
              <button onClick={() => setPendingDelete(eq)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "2px 6px" }}>🗑</button>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <Modal titulo="Nuevo Equipo" onClose={() => { setModal(false); setForm({ nombre: "" }); }}>
          <Campo label="Nombre del equipo">
            <InputAdmin placeholder="Atlético Hurlingam" value={form.nombre} onChange={e => setForm({ nombre: e.target.value })} autoFocus />
          </Campo>
          <BtnPrimary onClick={crear} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Agregar Equipo"}</BtnPrimary>
        </Modal>
      )}
      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás el equipo "${pendingDelete.nombre}".`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

// ─── FIXTURE ────────────────────────────────────────────────────────────────

function Fixture({ fixtureCol, equiposCol }) {
  const [partidos, setPartidos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ fecha: "", jornada: "1", local: "", visitante: "", golesLocal: "", golesVisitante: "" });
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  async function cargar() {
    setCargando(true);
    const [pSnap, eSnap] = await Promise.all([getDocs(fixtureCol), getDocs(equiposCol)]);
    const ps = pSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
    ps.sort((a, b) => (a.jornada || 0) - (b.jornada || 0) || (a.fecha || "").localeCompare(b.fecha || ""));
    setPartidos(ps);
    setEquipos(eSnap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  function abrirModal(partido = null) {
    if (partido) {
      setForm({
        fecha: partido.fecha || "",
        jornada: String(partido.jornada || "1"),
        local: partido.local || "",
        visitante: partido.visitante || "",
        golesLocal: partido.golesLocal !== undefined ? String(partido.golesLocal) : "",
        golesVisitante: partido.golesVisitante !== undefined ? String(partido.golesVisitante) : "",
      });
      setEditando(partido.docId);
    } else {
      const maxJ = partidos.reduce((m, p) => Math.max(m, p.jornada || 0), 0);
      setForm({ fecha: "", jornada: String(maxJ + 1), local: "", visitante: "", golesLocal: "", golesVisitante: "" });
      setEditando(null);
    }
    setModal(true);
  }

  async function guardar() {
    if (!form.local || !form.visitante) return;
    setGuardando(true);
    const data = {
      jornada: parseInt(form.jornada) || 1,
      fecha: form.fecha,
      local: form.local,
      visitante: form.visitante,
    };
    if (form.golesLocal !== "" && form.golesVisitante !== "") {
      data.golesLocal = parseInt(form.golesLocal);
      data.golesVisitante = parseInt(form.golesVisitante);
      data.jugado = true;
    } else {
      data.jugado = false;
    }
    if (editando) {
      await updateDoc(doc(fixtureCol, editando), data);
    } else {
      await addDoc(fixtureCol, { ...data, creadoEn: Date.now() });
    }
    setModal(false);
    setEditando(null);
    setGuardando(false);
    await cargar();
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(fixtureCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  const jornadas = [...new Set(partidos.map(p => p.jornada || 1))].sort((a, b) => a - b);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <SeccionLabel>Partidos</SeccionLabel>
        <button onClick={() => abrirModal()} style={{ background: V, color: VL, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Partido</button>
      </div>
      {cargando ? <Spinner /> : partidos.length === 0 ? (
        <EmptyState emoji="📅" titulo="Sin partidos" descripcion="Cargá los partidos del fixture" />
      ) : (
        jornadas.map(j => (
          <div key={j} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Fecha {j}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {partidos.filter(p => (p.jornada || 1) === j).map(p => (
                <div key={p.docId} style={{ background: "#fff", borderRadius: 10, border: "1px solid #dcfce7", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, fontSize: 13, color: "#111827" }}>
                      <span style={{ fontWeight: 700 }}>{p.local}</span>
                      {p.jugado ? (
                        <span style={{ margin: "0 6px", fontWeight: 700, color: V }}>{p.golesLocal} - {p.golesVisitante}</span>
                      ) : (
                        <span style={{ margin: "0 6px", color: "#9ca3af" }}>vs</span>
                      )}
                      <span style={{ fontWeight: 700 }}>{p.visitante}</span>
                    </div>
                    <button onClick={() => abrirModal(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 14, padding: "2px 4px" }}>✎</button>
                    <button onClick={() => setPendingDelete(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: "2px 4px" }}>🗑</button>
                  </div>
                  {p.fecha && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{p.fecha}</div>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {modal && (
        <Modal titulo={editando ? "Editar partido" : "Nuevo partido"} onClose={() => { setModal(false); setEditando(null); }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Campo label="Fecha nro." style={{ flex: 1 }}>
              <InputAdmin type="number" min={1} value={form.jornada} onChange={e => setForm(f => ({ ...f, jornada: e.target.value }))} />
            </Campo>
            <Campo label="Fecha (opcional)" style={{ flex: 2 }}>
              <InputAdmin type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </Campo>
          </div>
          <Campo label="Local">
            <SelectAdmin value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))}>
              <option value="">— Seleccionar —</option>
              {equipos.map(eq => <option key={eq.docId} value={eq.nombre}>{eq.nombre}</option>)}
            </SelectAdmin>
          </Campo>
          <Campo label="Visitante">
            <SelectAdmin value={form.visitante} onChange={e => setForm(f => ({ ...f, visitante: e.target.value }))}>
              <option value="">— Seleccionar —</option>
              {equipos.map(eq => <option key={eq.docId} value={eq.nombre}>{eq.nombre}</option>)}
            </SelectAdmin>
          </Campo>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Resultado (dejar vacío si no se jugó)</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <InputAdmin type="number" min={0} placeholder="0" value={form.golesLocal} onChange={e => setForm(f => ({ ...f, golesLocal: e.target.value }))} style={{ textAlign: "center" }} />
            <span style={{ color: "#6b7280", fontWeight: 700 }}>-</span>
            <InputAdmin type="number" min={0} placeholder="0" value={form.golesVisitante} onChange={e => setForm(f => ({ ...f, golesVisitante: e.target.value }))} style={{ textAlign: "center" }} />
          </div>
          <BtnPrimary onClick={guardar} disabled={guardando || !form.local || !form.visitante} fullWidth>
            {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Agregar partido"}
          </BtnPrimary>
        </Modal>
      )}
      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás el partido ${pendingDelete.local} vs ${pendingDelete.visitante}.`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

// ─── TAB SUSPENDIDOS ────────────────────────────────────────────────────────

function TabSuspendidos({ torneo, torneoRef, liga, temporada }) {
  const [suspendidos, setSuspendidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    jugadorNombre: "", equipo: "", motivo: "roja",
    fechaDesde: "", fechasAusentar: "1", notas: ""
  });
  const [guardando, setGuardando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  const suspCol = collection(torneoRef, "suspendidos");

  async function cargar() {
    setCargando(true);
    const snap = await getDocs(suspCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    items.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
    setSuspendidos(items);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function registrar() {
    if (!form.jugadorNombre.trim() || !form.fechaDesde) return;
    setGuardando(true);
    const fechasAusentar = parseInt(form.fechasAusentar) || 1;

    // Calcular fecha de retorno (suma N fechas calendario aproximadas, 7 días c/u)
    const desde = new Date(form.fechaDesde + "T12:00:00");
    const retorno = new Date(desde.getTime() + fechasAusentar * 7 * 24 * 60 * 60 * 1000);
    const retornoStr = retorno.toISOString().split("T")[0];

    await addDoc(suspCol, {
      jugadorNombre: form.jugadorNombre.trim(),
      equipo: form.equipo.trim(),
      motivo: form.motivo,
      fechaDesde: form.fechaDesde,
      fechasAusentar,
      fechaRetorno: retornoStr,
      notas: form.notas.trim(),
      activo: true,
      creadoEn: Date.now(),
    });
    setForm({ jugadorNombre: "", equipo: "", motivo: "roja", fechaDesde: "", fechasAusentar: "1", notas: "" });
    setModal(false);
    setGuardando(false);
    await cargar();
  }

  async function toggleActivo(s) {
    await updateDoc(doc(suspCol, s.docId), { activo: !s.activo });
    setSuspendidos(arr => arr.map(x => x.docId === s.docId ? { ...x, activo: !x.activo } : x));
  }

  const activos = suspendidos.filter(s => s.activo);
  const historial = suspendidos.filter(s => !s.activo);

  const hoy = new Date().toISOString().split("T")[0];

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SeccionLabel>Suspendidos activos</SeccionLabel>
        <button onClick={() => setModal(true)} style={{ background: V, color: VL, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Registrar</button>
      </div>

      {cargando ? <Spinner /> : activos.length === 0 ? (
        <EmptyState emoji="✅" titulo="Sin suspendidos activos" descripcion="Registrá una suspensión cuando sea necesario" />
      ) : (
        activos.map(s => <SuspendidoCard key={s.docId} s={s} hoy={hoy} onToggle={toggleActivo} />)
      )}

      {historial.length > 0 && (
        <>
          <button onClick={() => setVerHistorial(v => !v)} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: "#374151", textAlign: "left" }}>
            {verHistorial ? "▲" : "▼"} Historial ({historial.length})
          </button>
          {verHistorial && historial.map(s => <SuspendidoCard key={s.docId} s={s} hoy={hoy} onToggle={toggleActivo} />)}
        </>
      )}

      {modal && (
        <Modal titulo="Registrar suspensión" onClose={() => { setModal(false); }}>
          <Campo label="Nombre del jugador">
            <InputAdmin placeholder="Nombre completo" value={form.jugadorNombre} onChange={e => setForm(f => ({ ...f, jugadorNombre: e.target.value }))} />
          </Campo>
          <Campo label="Equipo">
            <InputAdmin placeholder="Nombre del equipo" value={form.equipo} onChange={e => setForm(f => ({ ...f, equipo: e.target.value }))} />
          </Campo>
          <Campo label="Motivo">
            <SelectAdmin value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}>
              <option value="roja">Tarjeta roja directa</option>
              <option value="rojaDobleAmarilla">Doble amarilla (= roja)</option>
              <option value="acumulacion">Acumulación de amarillas</option>
              <option value="disciplinario">Sanción disciplinaria</option>
            </SelectAdmin>
          </Campo>
          <div style={{ display: "flex", gap: 12 }}>
            <Campo label="Fecha del partido" style={{ flex: 2 }}>
              <InputAdmin type="date" value={form.fechaDesde} onChange={e => setForm(f => ({ ...f, fechaDesde: e.target.value }))} />
            </Campo>
            <Campo label="Fechas a ausentarse" style={{ flex: 1 }}>
              <InputAdmin type="number" min={1} max={20} value={form.fechasAusentar} onChange={e => setForm(f => ({ ...f, fechasAusentar: e.target.value }))} />
            </Campo>
          </div>
          {form.fechaDesde && (
            <div style={{ background: "#fef9c3", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#713f12" }}>
              📅 Retorno estimado: {(() => {
                const d = new Date(form.fechaDesde + "T12:00:00");
                d.setDate(d.getDate() + (parseInt(form.fechasAusentar) || 1) * 7);
                return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
              })()}
            </div>
          )}
          <Campo label="Notas (opcional)">
            <InputAdmin placeholder="Observaciones adicionales" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
          </Campo>
          <BtnPrimary onClick={registrar} disabled={guardando || !form.jugadorNombre.trim() || !form.fechaDesde} fullWidth>
            {guardando ? "Registrando..." : "Registrar suspensión"}
          </BtnPrimary>
        </Modal>
      )}
    </div>
  );
}

const MOTIVO_LABEL = {
  roja: "Roja directa",
  rojaDobleAmarilla: "Doble amarilla",
  acumulacion: "Acumulación",
  disciplinario: "Disciplinario",
};

function SuspendidoCard({ s, hoy, onToggle }) {
  const vencido = s.fechaRetorno && s.fechaRetorno <= hoy;
  return (
    <Card>
      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{s.jugadorNombre}</div>
            {s.equipo && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>{s.equipo}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                {MOTIVO_LABEL[s.motivo] || s.motivo}
              </span>
              <span style={{ fontSize: 11, background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 20 }}>
                {s.fechasAusentar} fecha{s.fechasAusentar !== 1 ? "s" : ""}
              </span>
              {vencido && s.activo && (
                <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
                  Puede volver ✓
                </span>
              )}
            </div>
            {s.fechaRetorno && (
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                Retorno: {new Date(s.fechaRetorno + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
              </div>
            )}
            {s.notas && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>{s.notas}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <Switch value={s.activo} onChange={() => onToggle(s)} />
            <span style={{ fontSize: 10, color: "#9ca3af" }}>{s.activo ? "Activo" : "Cumplió"}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
