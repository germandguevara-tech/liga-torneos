import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

export default function Temporada({ liga, temporada, onBack, onSeleccionarCompetencia }) {
  const [competencias, setCompetencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [editComp, setEditComp] = useState(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "" });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const ligaRef = doc(db, "ligas", liga.docId);
  const tempRef = doc(collection(ligaRef, "temporadas"), temporada.docId);
  const compCol = collection(tempRef, "competencias");

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const snap = await getDocs(compCol);
      const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      items.sort((a, b) => (a.creadaEn || 0) - (b.creadaEn || 0));
      setCompetencias(items);
    } catch (e) {
      console.error("Error cargando competencias:", e);
      setError("Error al cargar competencias: " + e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirCrear() {
    setEditComp(null);
    setForm({ nombre: "", descripcion: "" });
    setLogoFile(null);
    setLogoPreview(null);
    setError("");
    setModal(true);
  }

  function abrirEditar(e, comp) {
    e.stopPropagation();
    setEditComp(comp);
    setForm({ nombre: comp.nombre, descripcion: comp.descripcion || "" });
    setLogoFile(null);
    setLogoPreview(comp.logoUrl || null);
    setError("");
    setModal(true);
  }

  function cerrarModal() {
    setModal(false);
    setEditComp(null);
    setForm({ nombre: "", descripcion: "" });
    setLogoFile(null);
    setLogoPreview(null);
    setError("");
  }

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function subirLogo(compDocId) {
    const storageRef = ref(storage, `ligas/${liga.docId}/competencias/${compDocId}/logo`);
    await uploadBytes(storageRef, logoFile);
    return getDownloadURL(storageRef);
  }

  async function crear() {
    if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
    setGuardando(true);
    try {
      const docRef = await addDoc(compCol, {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        creadaEn: Date.now(),
      });
      if (logoFile) {
        const logoUrl = await subirLogo(docRef.id);
        await updateDoc(docRef, { logoUrl });
      }
      cerrarModal();
      await cargar();
    } catch (e) {
      setError("Error: " + e.message);
    }
    setGuardando(false);
  }

  async function editar() {
    if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
    setGuardando(true);
    try {
      const compDocRef = doc(compCol, editComp.docId);
      const updates = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
      };
      if (logoFile) {
        updates.logoUrl = await subirLogo(editComp.docId);
      }
      await updateDoc(compDocRef, updates);
      cerrarModal();
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
        onAccion={abrirCrear}
      />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {error && !cargando && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", color: "#dc2626", fontSize: 13 }}>
            {error}
            <button onClick={cargar} style={{ marginLeft: 10, textDecoration: "underline", background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13 }}>Reintentar</button>
          </div>
        )}
        {cargando ? <Spinner /> : competencias.length === 0 && !error ? (
          <EmptyState emoji="🎯" titulo="Sin competencias" descripcion="Creá la primera competencia de esta temporada" />
        ) : (
          <>
            <SeccionLabel>Competencias</SeccionLabel>
            {competencias.map(comp => (
              <Card key={comp.docId} onClick={() => onSeleccionarCompetencia(comp)}>
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, overflow: "hidden" }}>
                    {comp.logoUrl
                      ? <img src={comp.logoUrl} alt={comp.nombre} style={{ width: 42, height: 42, objectFit: "cover" }} />
                      : "🎯"
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{comp.nombre}</div>
                    {comp.descripcion && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{comp.descripcion}</div>}
                  </div>
                  <button
                    onClick={e => abrirEditar(e, comp)}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 15, padding: "4px 6px", flexShrink: 0 }}
                    title="Editar"
                  >✏️</button>
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
        <Modal
          titulo={editComp ? "Editar Competencia" : "Nueva Competencia"}
          onClose={cerrarModal}
        >
          <Campo label="Nombre (ej: Fútbol Infantil Masculino)">
            <InputAdmin placeholder="Fútbol Infantil Masculino" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
          </Campo>
          <Campo label="Descripción (opcional)">
            <InputAdmin placeholder="Descripción breve" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </Campo>
          <Campo label="Logo (opcional)">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="preview"
                  style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", border: "1px solid #dcfce7", flexShrink: 0 }}
                />
              )}
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#f0fdf4", border: "1.5px dashed #86efac",
                borderRadius: 10, padding: "8px 14px", cursor: "pointer",
                fontSize: 13, color: "#166534", fontWeight: 600,
              }}>
                📷 {logoPreview ? "Cambiar logo" : "Subir logo"}
                <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} />
              </label>
            </div>
          </Campo>
          {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
          <BtnPrimary onClick={editComp ? editar : crear} disabled={guardando} fullWidth>
            {guardando ? (editComp ? "Guardando..." : "Creando...") : (editComp ? "Guardar cambios" : "Crear Competencia")}
          </BtnPrimary>
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
