import { useState, useEffect } from "react";
import { collection, getDocs, setDoc, getDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

const COLORES_DEFAULT = { colorPrincipal: "#1a3a2a", colorAcento: "#4ade80", colorFondo: "#f0fdf4" };

export default function Ligas({ onSeleccionar }) {
  const [ligas,         setLigas]         = useState([]);
  const [cargando,      setCargando]      = useState(true);
  const [modal,         setModal]         = useState(false);  // "crear" | "editar" | false
  const [ligaEdit,      setLigaEdit]      = useState(null);
  const [form,          setForm]          = useState({ id: "", nombre: "", descripcion: "", ...COLORES_DEFAULT });
  const [logoFile,      setLogoFile]      = useState(null);
  const [logoPreview,   setLogoPreview]   = useState(null);
  const [guardando,     setGuardando]     = useState(false);
  const [error,         setError]         = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  async function cargar() {
    setCargando(true);
    setError("");
    try {
      const lifhurRef  = doc(db, "ligas", "lifhur");
      const lifhurSnap = await getDoc(lifhurRef);
      if (!lifhurSnap.exists()) {
        // Crear doc base si no existe
        await setDoc(lifhurRef, {
          id: "lifhur", nombre: "LifHur", descripcion: "Liga de Fútbol Hurlingam",
          configuracion: COLORES_DEFAULT, creadaEn: Date.now(),
        });
      } else if (!lifhurSnap.data().configuracion) {
        // Migrar doc existente que no tiene configuracion todavía
        await updateDoc(lifhurRef, { configuracion: COLORES_DEFAULT });
      }
      const snap = await getDocs(collection(db, "ligas"));
      setLigas(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    } catch (e) {
      setError("Error al cargar datos: " + e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  function abrirCrear() {
    setLigaEdit(null);
    setForm({ id: "", nombre: "", descripcion: "", ...COLORES_DEFAULT });
    setLogoFile(null);
    setLogoPreview(null);
    setError("");
    setModal("crear");
  }

  function abrirEditar(e, liga) {
    e.stopPropagation();
    setLigaEdit(liga);
    const conf = liga.configuracion || COLORES_DEFAULT;
    setForm({
      id:             liga.id          || liga.docId,
      nombre:         liga.nombre      || "",
      descripcion:    liga.descripcion || "",
      colorPrincipal: conf.colorPrincipal || COLORES_DEFAULT.colorPrincipal,
      colorAcento:    conf.colorAcento    || COLORES_DEFAULT.colorAcento,
      colorFondo:     conf.colorFondo     || COLORES_DEFAULT.colorFondo,
    });
    setLogoFile(null);
    setLogoPreview(liga.logoUrl || null);
    setError("");
    setModal("editar");
  }

  function cerrarModal() {
    setModal(false);
    setLigaEdit(null);
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

  async function subirLogo(ligaId) {
    const storageRef = ref(storage, `ligas/${ligaId}/logo`);
    await uploadBytes(storageRef, logoFile);
    return getDownloadURL(storageRef);
  }

  async function crear() {
    if (!form.id.trim() || !form.nombre.trim()) { setError("ID y nombre son requeridos"); return; }
    const idLimpio = form.id.trim().toLowerCase().replace(/\s+/g, "-");
    setGuardando(true);
    try {
      const datos = {
        id:          idLimpio,
        nombre:      form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        configuracion: {
          colorPrincipal: form.colorPrincipal,
          colorAcento:    form.colorAcento,
          colorFondo:     form.colorFondo,
          nombre:         form.nombre.trim(),
        },
        creadaEn: Date.now(),
      };
      await setDoc(doc(db, "ligas", idLimpio), datos);
      if (logoFile) {
        const logoUrl = await subirLogo(idLimpio);
        await updateDoc(doc(db, "ligas", idLimpio), {
          logoUrl,
          "configuracion.logoUrl": logoUrl,
        });
      }
      cerrarModal();
      await cargar();
    } catch (e) {
      setError("Error al crear liga: " + e.message);
    }
    setGuardando(false);
  }

  async function editar() {
    if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
    setGuardando(true);
    try {
      const existingLogoUrl = ligaEdit.configuracion?.logoUrl || ligaEdit.logoUrl || null;
      const conf = {
        colorPrincipal: form.colorPrincipal,
        colorAcento:    form.colorAcento,
        colorFondo:     form.colorFondo,
        nombre:         form.nombre.trim(),
        ...(existingLogoUrl ? { logoUrl: existingLogoUrl } : {}),
      };
      const updates = {
        nombre:        form.nombre.trim(),
        descripcion:   form.descripcion.trim(),
        configuracion: conf,
      };
      if (logoFile) {
        const logoUrl = await subirLogo(ligaEdit.docId);
        updates.logoUrl         = logoUrl;
        updates.configuracion   = { ...conf, logoUrl };
      }
      await updateDoc(doc(db, "ligas", ligaEdit.docId), updates);
      cerrarModal();
      await cargar();
    } catch (e) {
      setError("Error al guardar: " + e.message);
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
      <HeaderAdmin titulo="Ligas" accionLabel="+ Liga" onAccion={abrirCrear} />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {error && !cargando && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", color: "#dc2626", fontSize: 13 }}>
            {error}
            <button onClick={cargar} style={{ marginLeft: 10, textDecoration: "underline", background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13 }}>Reintentar</button>
          </div>
        )}
        {cargando ? <Spinner /> : ligas.length === 0 && !error ? (
          <EmptyState emoji="🏟️" titulo="Sin ligas" descripcion="Creá la primera liga" />
        ) : (
          <>
            <SeccionLabel>Ligas registradas</SeccionLabel>
            {ligas.map(liga => (
              <Card key={liga.docId} onClick={() => onSeleccionar(liga)}>
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  {/* Logo o color de muestra */}
                  <div style={{ width: 42, height: 42, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: liga.configuracion?.colorPrincipal || "#1a3a2a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {liga.logoUrl
                      ? <img src={liga.logoUrl} alt={liga.nombre} style={{ width: 42, height: 42, objectFit: "cover" }} />
                      : <span style={{ fontSize: 20 }}>🏟️</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{liga.nombre}</div>
                    {liga.descripcion && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{liga.descripcion}</div>}
                    {/* Muestra de colores */}
                    <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                      {[liga.configuracion?.colorPrincipal, liga.configuracion?.colorAcento, liga.configuracion?.colorFondo].filter(Boolean).map((c, i) => (
                        <div key={i} title={c} style={{ width: 14, height: 14, borderRadius: 4, background: c, border: "1px solid #e5e7eb" }} />
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={e => abrirEditar(e, liga)}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 15, padding: "4px 6px", flexShrink: 0 }}
                    title="Editar"
                  >✏️</button>
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
        <Modal
          titulo={modal === "editar" ? "Editar Liga" : "Nueva Liga"}
          onClose={cerrarModal}
        >
          {modal === "crear" && (
            <Campo label="ID único (ej: lifhur)">
              <InputAdmin
                placeholder="lifhur"
                value={form.id}
                onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
                autoFocus
              />
            </Campo>
          )}
          <Campo label="Nombre">
            <InputAdmin
              placeholder="Liga de Fútbol Hurlingam"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              autoFocus={modal === "editar"}
            />
          </Campo>
          <Campo label="Descripción (opcional)">
            <InputAdmin
              placeholder="Descripción breve"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          </Campo>

          {/* Logo */}
          <Campo label="Logo (opcional)">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {logoPreview && (
                <img src={logoPreview} alt="preview" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", border: "1px solid #dcfce7", flexShrink: 0 }} />
              )}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f0fdf4", border: "1.5px dashed #86efac", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "#166534", fontWeight: 600 }}>
                📷 {logoPreview ? "Cambiar logo" : "Subir logo"}
                <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} />
              </label>
            </div>
          </Campo>

          {/* Colores */}
          <SeccionLabel>Colores</SeccionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { key: "colorPrincipal", label: "Principal (header)" },
              { key: "colorAcento",    label: "Acento (botones)" },
              { key: "colorFondo",     label: "Fondo (suave)" },
            ].map(({ key, label }) => (
              <Campo key={key} label={label}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="color"
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: 36, height: 36, border: "none", borderRadius: 8, cursor: "pointer", padding: 2, background: "transparent" }}
                  />
                  <InputAdmin
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ fontFamily: "monospace", fontSize: 12 }}
                  />
                </div>
              </Campo>
            ))}
          </div>

          {/* Preview de colores */}
          <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb" }}>
            <div style={{ background: form.colorPrincipal, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: form.colorAcento }} />
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{form.nombre || "Liga"}</span>
            </div>
            <div style={{ background: form.colorFondo, padding: "10px 14px", fontSize: 12, color: "#374151" }}>
              Vista previa de colores
            </div>
          </div>

          {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}
          <BtnPrimary onClick={modal === "editar" ? editar : crear} disabled={guardando} fullWidth>
            {guardando ? "Guardando..." : modal === "editar" ? "Guardar cambios" : "Crear Liga"}
          </BtnPrimary>
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
