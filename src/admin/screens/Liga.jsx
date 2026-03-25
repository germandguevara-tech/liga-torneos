import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, Switch, BtnPrimary, Campo, InputAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

const ANIO_ACTUAL = new Date().getFullYear();

export default function Liga({ liga, onBack, onSeleccionarTemporada }) {
  const [temporadas, setTemporadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ anio: ANIO_ACTUAL.toString() });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const ligaRef = doc(db, "ligas", liga.docId);
  const tempCol = collection(ligaRef, "temporadas");

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const snap = await getDocs(tempCol);
      const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      items.sort((a, b) => (b.anio || 0) - (a.anio || 0));
      setTemporadas(items);
    } catch (e) {
      console.error("Error cargando temporadas:", e);
      setError("Error al cargar temporadas: " + e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    const anio = parseInt(form.anio);
    if (!anio || anio < 2000 || anio > 2100) { setError("Ingresá un año válido"); return; }
    setGuardando(true);
    try {
      await addDoc(tempCol, { anio, activa: false, creadaEn: Date.now() });
      setModal(false);
      setForm({ anio: ANIO_ACTUAL.toString() });
      setError("");
      await cargar();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setGuardando(false);
  }

  async function toggleActiva(temp) {
    await updateDoc(doc(tempCol, temp.docId), { activa: !temp.activa });
    setTemporadas(ts => ts.map(t => t.docId === temp.docId ? { ...t, activa: !t.activa } : t));
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(tempCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  const activas = temporadas.filter(t => t.activa);
  const inactivas = temporadas.filter(t => !t.activa);

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin titulo={liga.nombre} subtitulo="Temporadas" onBack={onBack} accionLabel="+ Temporada" onAccion={() => setModal(true)} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {error && !cargando && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", color: "#dc2626", fontSize: 13 }}>
            {error}
            <button onClick={cargar} style={{ marginLeft: 10, textDecoration: "underline", background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13 }}>Reintentar</button>
          </div>
        )}
        {cargando ? <Spinner /> : temporadas.length === 0 && !error ? (
          <EmptyState emoji="📅" titulo="Sin temporadas" descripcion="Creá la primera temporada" />
        ) : (
          <>
            {activas.length > 0 && (
              <>
                <SeccionLabel>Activas</SeccionLabel>
                {activas.map(t => <TemporadaCard key={t.docId} temp={t} onSeleccionar={onSeleccionarTemporada} onToggle={toggleActiva} onEliminar={setPendingDelete} />)}
              </>
            )}
            {inactivas.length > 0 && (
              <>
                <SeccionLabel>Inactivas</SeccionLabel>
                {inactivas.map(t => <TemporadaCard key={t.docId} temp={t} onSeleccionar={onSeleccionarTemporada} onToggle={toggleActiva} onEliminar={setPendingDelete} />)}
              </>
            )}
          </>
        )}
      </div>

      {modal && (
        <Modal titulo="Nueva Temporada" onClose={() => { setModal(false); setError(""); setForm({ anio: ANIO_ACTUAL.toString() }); }}>
          <Campo label="Año">
            <InputAdmin type="number" placeholder={ANIO_ACTUAL} value={form.anio} onChange={e => setForm({ anio: e.target.value })} autoFocus />
          </Campo>
          {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
          <BtnPrimary onClick={crear} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear Temporada"}</BtnPrimary>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás la temporada ${pendingDelete.anio}.`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function TemporadaCard({ temp, onSeleccionar, onToggle, onEliminar }) {
  return (
    <Card>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onSeleccionar(temp)}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{temp.anio}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: temp.activa ? "#166534" : "#6b7280" }}>{temp.activa ? "Activa" : "Inactiva"}</span>
          <Switch value={temp.activa} onChange={() => onToggle(temp)} />
          <button
            onClick={e => { e.stopPropagation(); onEliminar(temp); }}
            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 4px" }}
          >🗑</button>
          <span style={{ fontSize: 18, color: "#9ca3af", cursor: "pointer" }} onClick={() => onSeleccionar(temp)}>›</span>
        </div>
      </div>
    </Card>
  );
}
