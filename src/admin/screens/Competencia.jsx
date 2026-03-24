import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

export default function Competencia({ liga, temporada, competencia, onBack, onSeleccionarTorneo }) {
  const [torneos, setTorneos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", tipo: "A" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const ligaRef = doc(db, "ligas", liga.docId);
  const tempRef = doc(collection(ligaRef, "temporadas"), temporada.docId);
  const compRef = doc(collection(tempRef, "competencias"), competencia.docId);
  const torneosCol = collection(compRef, "torneos");

  async function cargar() {
    setCargando(true);
    const snap = await getDocs(torneosCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    items.sort((a, b) => (a.creadoEn || 0) - (b.creadoEn || 0));
    setTorneos(items);
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
    setGuardando(true);
    try {
      await addDoc(torneosCol, {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        puntosPorVictoria: 3,
        puntosPorEmpate: 1,
        criteriosDesempate: ["puntos", "gd", "gf", "enfrentamientoDirecto"],
        amarillasParaSuspension: 5,
        advertenciaFaltanAmarillas: 1,
        creadoEn: Date.now(),
      });
      setModal(false);
      setForm({ nombre: "", tipo: "A" });
      setError("");
      await cargar();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setGuardando(false);
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(torneosCol, pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin
        titulo={competencia.nombre}
        subtitulo={String(temporada.anio) + " · " + liga.nombre}
        onBack={onBack}
        accionLabel="+ Torneo"
        onAccion={() => setModal(true)}
      />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {cargando ? <Spinner /> : torneos.length === 0 ? (
          <EmptyState emoji="🏆" titulo="Sin torneos" descripcion="Creá el primer torneo de esta competencia" />
        ) : (
          <>
            <SeccionLabel>Torneos</SeccionLabel>
            {torneos.map(torneo => (
              <Card key={torneo.docId} onClick={() => onSeleccionarTorneo(torneo)}>
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#fef9c3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🏆</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{torneo.nombre}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      Tipo {torneo.tipo === "A" ? "A — Equipos independientes" : "B — Clubes con categorías"}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setPendingDelete(torneo); }}
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
        <Modal titulo="Nuevo Torneo" onClose={() => { setModal(false); setError(""); setForm({ nombre: "", tipo: "A" }); }}>
          <Campo label="Nombre (ej: Liga, Copa)">
            <InputAdmin placeholder="Liga" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
          </Campo>
          <Campo label="Tipo">
            <SelectAdmin value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              <option value="A">Tipo A — Equipos independientes</option>
              <option value="B">Tipo B — Clubes con categorías</option>
            </SelectAdmin>
          </Campo>
          <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#374151" }}>
            {form.tipo === "A"
              ? "Los equipos se inscriben directamente en zonas."
              : "Los clubes agrupan equipos por categoría (Sub-14, Sub-16, etc.)."}
          </div>
          {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
          <BtnPrimary onClick={crear} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear Torneo"}</BtnPrimary>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás el torneo "${pendingDelete.nombre}".`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
