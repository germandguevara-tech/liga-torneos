import { useState, useEffect } from "react";
import { collection, getDocs, setDoc, getDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

export default function Ligas({ onSeleccionar }) {
  const [ligas, setLigas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ id: "", nombre: "", descripcion: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  async function cargar() {
    setCargando(true);
    const lifhurRef = doc(db, "ligas", "lifhur");
    const lifhurSnap = await getDoc(lifhurRef);
    if (!lifhurSnap.exists()) {
      await setDoc(lifhurRef, {
        id: "lifhur",
        nombre: "LifHur",
        descripcion: "Liga de Fútbol Hurlingam",
        creadaEn: Date.now(),
      });
    }
    const snap = await getDocs(collection(db, "ligas"));
    setLigas(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  async function crear() {
    if (!form.id.trim() || !form.nombre.trim()) { setError("ID y nombre son requeridos"); return; }
    const idLimpio = form.id.trim().toLowerCase().replace(/\s+/g, "-");
    setGuardando(true);
    try {
      await setDoc(doc(db, "ligas", idLimpio), {
        id: idLimpio,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        creadaEn: Date.now(),
      });
      setModal(false);
      setForm({ id: "", nombre: "", descripcion: "" });
      setError("");
      await cargar();
    } catch (e) {
      setError("Error al crear liga: " + e.message);
    }
    setGuardando(false);
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(db, "ligas", pendingDelete.docId));
    setPendingDelete(null);
    await cargar();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin titulo="Ligas" accionLabel="+ Liga" onAccion={() => setModal(true)} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {cargando ? <Spinner /> : ligas.length === 0 ? (
          <EmptyState emoji="🏟️" titulo="Sin ligas" descripcion="Creá la primera liga" />
        ) : (
          <>
            <SeccionLabel>Ligas registradas</SeccionLabel>
            {ligas.map(liga => (
              <Card key={liga.docId} onClick={() => onSeleccionar(liga)}>
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🏟️</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{liga.nombre}</div>
                    {liga.descripcion && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{liga.descripcion}</div>}
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>ID: {liga.id}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setPendingDelete(liga); }}
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
        <Modal titulo="Nueva Liga" onClose={() => { setModal(false); setError(""); setForm({ id: "", nombre: "", descripcion: "" }); }}>
          <Campo label="ID único (ej: lifhur)">
            <InputAdmin placeholder="lifhur" value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} />
          </Campo>
          <Campo label="Nombre">
            <InputAdmin placeholder="Liga de Fútbol Hurlingam" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </Campo>
          <Campo label="Descripción (opcional)">
            <InputAdmin placeholder="Descripción breve" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </Campo>
          {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
          <BtnPrimary onClick={crear} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear Liga"}</BtnPrimary>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmModal
          mensaje={`Eliminás la liga "${pendingDelete.nombre}". Esta acción no se puede deshacer.`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
