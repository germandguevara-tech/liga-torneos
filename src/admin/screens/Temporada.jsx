import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

export default function Temporada({ liga, temporada, onBack, onSeleccionarCompetencia }) {
  const [competencias, setCompetencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const ligaRef = doc(db, "ligas", liga.docId);
  const tempRef = doc(collection(ligaRef, "temporadas"), temporada.docId);
  const compCol = collection(tempRef, "competencias");

  async function cargar() {
    setCargando(true);
    const snap = await getDocs(compCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    items.sort((a, b) => (a.creadaEn || 0) - (b.creadaEn || 0));
    setCompetencias(items);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
    setGuardando(true);
    try {
      await addDoc(compCol, {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        creadaEn: Date.now(),
      });
      setModal(false);
      setForm({ nombre: "", descripcion: "" });
      setError("");
      await cargar();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setGuardando(false);
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(compCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin
        titulo={String(temporada.anio)}
        subtitulo={liga.nombre + " · Competencias"}
        onBack={onBack}
        accionLabel="+ Competencia"
        onAccion={() => setModal(true)}
      />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {cargando ? <Spinner /> : competencias.length === 0 ? (
          <EmptyState emoji="🎯" titulo="Sin competencias" descripcion="Creá la primera competencia de esta temporada" />
        ) : (
          <>
            <SeccionLabel>Competencias</SeccionLabel>
            {competencias.map(comp => (
              <Card key={comp.docId} onClick={() => onSeleccionarCompetencia(comp)}>
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎯</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{comp.nombre}</div>
                    {comp.descripcion && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{comp.descripcion}</div>}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setPendingDelete(comp); }}
                    style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px", flexShrink: 0 }}
                  >🗑</button>
                  <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      {modal && (
        <Modal titulo="Nueva Competencia" onClose={() => { setModal(false); setError(""); setForm({ nombre: "", descripcion: "" }); }}>
          <Campo label="Nombre (ej: Fútbol Infantil Masculino)">
            <InputAdmin placeholder="Fútbol Infantil Masculino" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
          </Campo>
          <Campo label="Descripción (opcional)">
            <InputAdmin placeholder="Descripción breve" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </Campo>
          {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
          <BtnPrimary onClick={crear} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear Competencia"}</BtnPrimary>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás la competencia "${pendingDelete.nombre}".`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
