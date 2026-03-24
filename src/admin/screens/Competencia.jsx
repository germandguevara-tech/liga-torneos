import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

const TIPO_LABEL = {
  liga:   "Liga",
  copa:   "Copa",
};

const PARTICIPANTES_LABEL = {
  clubes:  "Clubes con categorías",
  equipos: "Equipos independientes",
};

export default function Competencia({ liga, temporada, competencia, onBack, onSeleccionarZona }) {
  const [zonas, setZonas]           = useState([]);
  const [cargando, setCargando]     = useState(true);
  const [modal, setModal]           = useState(false);
  const [nombre, setNombre]         = useState("");
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const ligaRef  = doc(db, "ligas", liga.docId);
  const tempRef  = doc(collection(ligaRef, "temporadas"), temporada.docId);
  const compRef  = doc(collection(tempRef, "competencias"), competencia.docId);
  const zonasCol = collection(compRef, "zonas");

  async function cargar() {
    setCargando(true);
    const snap = await getDocs(zonasCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    items.sort((a, b) => (a.creadoEn || 0) - (b.creadoEn || 0));
    setZonas(items);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!nombre.trim()) { setError("El nombre es requerido"); return; }
    setGuardando(true);
    try {
      await addDoc(zonasCol, { nombre: nombre.trim(), creadoEn: Date.now() });
      setModal(false);
      setNombre("");
      setError("");
      await cargar();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setGuardando(false);
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(zonasCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin
        titulo={competencia.nombre}
        subtitulo={String(temporada.anio) + " · " + liga.nombre}
        onBack={onBack}
        accionLabel="+ Zona"
        onAccion={() => setModal(true)}
      />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {cargando ? <Spinner /> : zonas.length === 0 ? (
          <EmptyState emoji="🗂" titulo="Sin zonas" descripcion="Creá la primera zona de esta competencia" />
        ) : (
          <>
            <SeccionLabel>Zonas</SeccionLabel>
            {zonas.map(zona => (
              <ZonaCard
                key={zona.docId}
                zona={zona}
                onSeleccionar={onSeleccionarZona}
                onEliminar={setPendingDelete}
              />
            ))}
          </>
        )}
      </div>

      {modal && (
        <Modal titulo="Nueva Zona" onClose={() => { setModal(false); setNombre(""); setError(""); }}>
          <Campo label="Nombre de la zona (ej: Zona A, Liga Infantil)">
            <InputAdmin placeholder="Zona A" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && crear()} />
          </Campo>
          {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
          <BtnPrimary onClick={crear} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear Zona"}</BtnPrimary>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás la zona "${pendingDelete.nombre}".`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function ZonaCard({ zona, onSeleccionar, onEliminar }) {
  const tipoLabel         = TIPO_LABEL[zona.tipo]                        || "";
  const participantesLabel = PARTICIPANTES_LABEL[zona.tipoParticipantes] || "";

  return (
    <div
      onClick={() => onSeleccionar(zona)}
      style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", overflow: "hidden", cursor: "pointer" }}
    >
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🗂</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{zona.nombre}</div>
          {tipoLabel && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{tipoLabel}</div>}
          {participantesLabel && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{participantesLabel}</div>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onEliminar(zona); }}
          style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px", flexShrink: 0 }}
        >🗑</button>
        <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
      </div>
    </div>
  );
}
