import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, setDoc, writeBatch, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, BtnPrimary, Campo, InputAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

const TIPO_LABEL = {
  liga:       "Liga",
  copa:       "Copa",
  copa_club:  "Copa",
  elim_club:  "Eliminatorias",
  copa_cat:   "Eliminatorias",
  elim_equipos: "Eliminatorias",
};

const PARTICIPANTES_LABEL = {
  clubes:  "Clubes con categorías",
  equipos: "Equipos independientes",
};

export default function Competencia({ liga, temporada, competencia, onBack, onSeleccionarZona, onIrAJugadores }) {
  const [tab, setTab] = useState("zonas");

  const ligaRef  = doc(db, "ligas", liga.docId);
  const tempRef  = doc(collection(ligaRef, "temporadas"), temporada.docId);
  const compRef  = doc(collection(tempRef, "competencias"), competencia.docId);
  const zonasCol = collection(compRef, "zonas");
  const clubesCol = collection(compRef, "clubes");
  const catsCol   = collection(compRef, "categorias");

  // ── Zonas ─────────────────────────────────────────────────────────────────
  const [zonas,         setZonas]         = useState([]);
  const [cargandoZ,     setCargandoZ]     = useState(true);
  const [modalZona,     setModalZona]     = useState(false);
  const [nombreZona,    setNombreZona]    = useState("");
  const [guardandoZ,    setGuardandoZ]    = useState(false);
  const [errorZ,        setErrorZ]        = useState("");
  const [pendingDelZona,   setPendingDelZona]   = useState(null);
  const [modalEditZona,    setModalEditZona]    = useState(null);
  const [editNombreZona,   setEditNombreZona]   = useState("");

  // ── Clubes ────────────────────────────────────────────────────────────────
  const [clubes,           setClubes]           = useState([]);
  const [cargandoC,        setCargandoC]        = useState(false);
  const [modalClub,        setModalClub]        = useState(false);
  const [nuevoClub,        setNuevoClub]        = useState("");
  const [logoFile,         setLogoFile]         = useState(null);
  const [logoPreview,      setLogoPreview]      = useState(null);
  const [subiendoLogo,     setSubiendoLogo]     = useState(false);
  const [pendingDelClub,   setPendingDelClub]   = useState(null);
  const [errorC,           setErrorC]           = useState("");
  const [modalEditClub,    setModalEditClub]    = useState(null);
  const [editNombreClub,   setEditNombreClub]   = useState("");
  const [editLogoFile,     setEditLogoFile]     = useState(null);
  const [editLogoPreview,  setEditLogoPreview]  = useState(null);
  const [editandoClub,     setEditandoClub]     = useState(false);

  // ── Categorías ────────────────────────────────────────────────────────────
  const [categorias,       setCategorias]       = useState([]);
  const [cargandoCat,      setCargandoCat]      = useState(false);
  const [modalCat,         setModalCat]         = useState(false);
  const [nuevaCat,         setNuevaCat]         = useState("");
  const [pendingDelCat,    setPendingDelCat]    = useState(null);
  const [errorCat,         setErrorCat]         = useState("");
  const [modalEditCat,     setModalEditCat]     = useState(null);
  const [editNombreCat,    setEditNombreCat]    = useState("");

  // ── Loaders ───────────────────────────────────────────────────────────────
  async function cargarZonas() {
    setCargandoZ(true);
    setErrorZ("");
    try {
      const snap = await getDocs(zonasCol);
      const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      items.sort((a, b) => (a.orden ?? a.creadoEn ?? 0) - (b.orden ?? b.creadoEn ?? 0));
      setZonas(items);
    } catch (e) {
      setErrorZ("Error al cargar zonas: " + e.message);
    } finally {
      setCargandoZ(false);
    }
  }

  async function cargarClubes() {
    setCargandoC(true);
    setErrorC("");
    try {
      const snap = await getDocs(clubesCol);
      setClubes(snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) {
      setErrorC("Error al cargar clubes: " + e.message);
    } finally {
      setCargandoC(false);
    }
  }

  async function cargarCategorias() {
    setCargandoCat(true);
    setErrorCat("");
    try {
      const snap = await getDocs(catsCol);
      const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      items.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));
      setCategorias(items);
    } catch (e) {
      setErrorCat("Error al cargar categorías: " + e.message);
    } finally {
      setCargandoCat(false);
    }
  }

  useEffect(() => { cargarZonas(); }, []);

  useEffect(() => {
    if (tab === "clubes"    && clubes.length === 0    && !cargandoC)   cargarClubes();
    if (tab === "categorias" && categorias.length === 0 && !cargandoCat) cargarCategorias();
  }, [tab]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function normNombre(s) {
    return (s || "").trim().toLowerCase();
  }

  // ── Zona actions ──────────────────────────────────────────────────────────
  async function reordenarZona(idx, dir) {
    const t = idx + dir;
    if (t < 0 || t >= zonas.length) return;
    const nuevas = [...zonas];
    [nuevas[idx], nuevas[t]] = [nuevas[t], nuevas[idx]];
    setZonas(nuevas);
    const batch = writeBatch(db);
    nuevas.forEach((z, i) => batch.update(doc(zonasCol, z.docId), { orden: i }));
    await batch.commit();
  }

  async function crearZona() {
    if (!nombreZona.trim()) { setErrorZ("El nombre es requerido"); return; }
    if (zonas.some(z => normNombre(z.nombre) === normNombre(nombreZona))) {
      setErrorZ("Ya existe una zona con ese nombre"); return;
    }
    setGuardandoZ(true);
    try {
      await addDoc(zonasCol, { nombre: nombreZona.trim(), creadoEn: Date.now(), orden: zonas.length });
      setModalZona(false);
      setNombreZona("");
      setErrorZ("");
      await cargarZonas();
    } catch (e) {
      setErrorZ("Error: " + e.message);
    }
    setGuardandoZ(false);
  }

  async function confirmarEliminarZona() {
    await deleteDoc(doc(zonasCol, pendingDelZona.docId));
    setPendingDelZona(null);
    await cargarZonas();
  }

  async function editarZona() {
    if (!editNombreZona.trim()) return;
    if (zonas.some(z => z.docId !== modalEditZona.docId && normNombre(z.nombre) === normNombre(editNombreZona))) {
      setErrorZ("Ya existe una zona con ese nombre");
      setModalEditZona(null);
      return;
    }
    await updateDoc(doc(zonasCol, modalEditZona.docId), { nombre: editNombreZona.trim() });
    setModalEditZona(null);
    await cargarZonas();
  }

  // ── Club actions ──────────────────────────────────────────────────────────
  async function editarClub() {
    if (!editNombreClub.trim()) return;
    if (clubes.some(c => c.docId !== modalEditClub.docId && normNombre(c.nombre) === normNombre(editNombreClub))) {
      setErrorC("Ya existe un club con ese nombre");
      setModalEditClub(null);
      return;
    }
    setEditandoClub(true);
    try {
      const updates = { nombre: editNombreClub.trim() };
      if (editLogoFile) {
        const storageRef = ref(storage, `logos/${liga.docId}/${modalEditClub.docId}`);
        await uploadBytes(storageRef, editLogoFile);
        updates.logoUrl = await getDownloadURL(storageRef);
      }
      await updateDoc(doc(clubesCol, modalEditClub.docId), updates);
      setModalEditClub(null);
      setEditLogoFile(null); setEditLogoPreview(null);
      await cargarClubes();
    } finally {
      setEditandoClub(false);
    }
  }

  async function agregarClub() {
    if (!nuevoClub.trim()) return;
    if (clubes.some(c => normNombre(c.nombre) === normNombre(nuevoClub))) {
      setErrorC("Ya existe un club con ese nombre");
      return;
    }
    setSubiendoLogo(true);
    try {
      const newRef = doc(clubesCol);
      let logoUrl = null;
      if (logoFile) {
        const storageRef = ref(storage, `logos/${liga.docId}/${newRef.id}`);
        await uploadBytes(storageRef, logoFile);
        logoUrl = await getDownloadURL(storageRef);
      }
      await setDoc(newRef, { nombre: nuevoClub.trim(), ...(logoUrl ? { logoUrl } : {}), creadoEn: Date.now() });
    } catch (e) {
      setErrorC("Error al agregar club: " + e.message);
    } finally {
      setSubiendoLogo(false);
    }
    setNuevoClub(""); setLogoFile(null); setLogoPreview(null); setModalClub(false);
    await cargarClubes();
  }

  async function eliminarClub() {
    const club = pendingDelClub;
    setPendingDelClub(null);
    // Verificar jugadores
    try {
      const jugSnap = await getDocs(query(
        collection(ligaRef, "jugadores"),
        where("clubId", "==", club.docId),
        where("competenciaId", "==", competencia.docId)
      ));
      if (!jugSnap.empty) {
        setErrorC(`No se puede eliminar: "${club.nombre}" tiene ${jugSnap.size} jugador${jugSnap.size !== 1 ? "es" : ""} asignado${jugSnap.size !== 1 ? "s" : ""}.`);
        return;
      }
      // Verificar partidos jugados en cualquier zona
      const zonasSnap = await getDocs(zonasCol);
      for (const zonaDoc of zonasSnap.docs) {
        const catsSnap = await getDocs(collection(zonaDoc.ref, "categorias"));
        for (const catDoc of catsSnap.docs) {
          const partidosSnap = await getDocs(query(
            collection(catDoc.ref, "partidos"),
            where("jugado", "==", true)
          ));
          const tienePartidos = partidosSnap.docs.some(d => {
            const p = d.data();
            return p.localId === club.docId || p.visitanteId === club.docId;
          });
          if (tienePartidos) {
            setErrorC(`No se puede eliminar: "${club.nombre}" tiene partidos jugados.`);
            return;
          }
        }
      }
    } catch (e) {
      setErrorC("Error al verificar: " + e.message);
      return;
    }
    await deleteDoc(doc(clubesCol, club.docId));
    await cargarClubes();
  }

  // ── Categoría actions ─────────────────────────────────────────────────────
  async function agregarCategoria() {
    if (!nuevaCat.trim()) return;
    if (categorias.some(c => normNombre(c.nombre) === normNombre(nuevaCat))) {
      setErrorCat("Ya existe una categoría con ese nombre");
      return;
    }
    await addDoc(catsCol, { nombre: nuevaCat.trim(), orden: categorias.length, creadaEn: Date.now() });
    setNuevaCat(""); setModalCat(false);
    await cargarCategorias();
  }

  async function editarCategoria() {
    if (!editNombreCat.trim()) return;
    if (categorias.some(c => c.docId !== modalEditCat.docId && normNombre(c.nombre) === normNombre(editNombreCat))) {
      setErrorCat("Ya existe una categoría con ese nombre");
      setModalEditCat(null);
      return;
    }
    await updateDoc(doc(catsCol, modalEditCat.docId), { nombre: editNombreCat.trim() });
    setModalEditCat(null);
    await cargarCategorias();
  }

  async function eliminarCategoria() {
    const cat = pendingDelCat;
    setPendingDelCat(null);
    try {
      const jugSnap = await getDocs(query(
        collection(ligaRef, "jugadores"),
        where("categoriaId", "==", cat.docId),
        where("competenciaId", "==", competencia.docId)
      ));
      if (!jugSnap.empty) {
        setErrorCat(`No se puede eliminar: "${cat.nombre}" tiene ${jugSnap.size} jugador${jugSnap.size !== 1 ? "es" : ""} asignado${jugSnap.size !== 1 ? "s" : ""}.`);
        return;
      }
    } catch (e) {
      setErrorCat("Error al verificar: " + e.message);
      return;
    }
    await deleteDoc(doc(catsCol, cat.docId));
    await cargarCategorias();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin
        titulo={competencia.nombre}
        subtitulo={String(temporada.anio) + " · " + liga.nombre}
        onBack={onBack}
      />

      {/* Tab bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #dcfce7", overflowX: "auto" }}>
        <div style={{ display: "flex", maxWidth: 600, margin: "0 auto", padding: "0 8px" }}>
          {[["zonas", "Zonas"], ["clubes", "Clubes"], ["categorias", "Categorías"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? "#1a3a2a" : "#6b7280", borderBottom: tab === id ? "2px solid #4ade80" : "2px solid transparent", whiteSpace: "nowrap" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>

        {/* ── ZONAS ── */}
        {tab === "zonas" && (
          <>
            {/* Jugadores */}
            <div onClick={onIrAJugadores} style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>👥</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Gestión de Jugadores</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Carga masiva, manual y duplicados</div>
              </div>
              <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setModalZona(true); setNombreZona(""); setErrorZ(""); }}
                style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                + Zona
              </button>
            </div>

            {errorZ && !cargandoZ && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "12px 16px", color: "#dc2626", fontSize: 13 }}>
                {errorZ}
              </div>
            )}
            {cargandoZ ? <Spinner /> : zonas.length === 0 && !errorZ ? (
              <EmptyState emoji="🗂" titulo="Sin zonas" descripcion="Creá la primera zona de esta competencia" />
            ) : (
              <>
                <SeccionLabel>Zonas</SeccionLabel>
                {zonas.map((zona, idx) => (
                  <ZonaCard key={zona.docId} zona={zona} onSeleccionar={onSeleccionarZona} onEliminar={setPendingDelZona}
                    onEditar={z => { setModalEditZona(z); setEditNombreZona(z.nombre); }}
                    onSubir={idx > 0 ? () => reordenarZona(idx, -1) : null}
                    onBajar={idx < zonas.length - 1 ? () => reordenarZona(idx, 1) : null}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* ── CLUBES ── */}
        {tab === "clubes" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setModalClub(true); setErrorC(""); }}
                style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                + Club
              </button>
            </div>
            {errorC && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#dc2626", fontSize: 13 }}>{errorC}</div>}
            {cargandoC ? <Spinner /> : clubes.length === 0 ? (
              <EmptyState emoji="🏟" titulo="Sin clubes" descripcion="Agregá los clubes de esta competencia" />
            ) : clubes.map(club => (
              <Card key={club.docId}>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <LogoClub club={club} size={40} />
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{club.nombre}</div>
                  <button onClick={() => { setModalEditClub(club); setEditNombreClub(club.nombre); setEditLogoPreview(club.logoUrl || null); setEditLogoFile(null); setErrorC(""); }}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 15, padding: "4px 6px" }}>✏️</button>
                  <button onClick={() => setPendingDelClub(club)}
                    style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>🗑</button>
                </div>
              </Card>
            ))}
          </>
        )}

        {/* ── CATEGORÍAS ── */}
        {tab === "categorias" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setModalCat(true); setErrorCat(""); }}
                style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                + Categoría
              </button>
            </div>
            {errorCat && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", color: "#dc2626", fontSize: 13 }}>{errorCat}</div>}
            {cargandoCat ? <Spinner /> : categorias.length === 0 ? (
              <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Agregá las categorías de esta competencia" />
            ) : categorias.map(cat => (
              <Card key={cat.docId}>
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat.nombre}</div>
                  <button onClick={() => { setModalEditCat(cat); setEditNombreCat(cat.nombre); setErrorCat(""); }}
                    style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 15, padding: "4px 6px" }}>✏️</button>
                  <button onClick={() => setPendingDelCat(cat)}
                    style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>🗑</button>
                </div>
              </Card>
            ))}
          </>
        )}
      </div>

      {/* Modales Zona */}
      {modalZona && (
        <Modal titulo="Nueva Zona" onClose={() => { setModalZona(false); setNombreZona(""); setErrorZ(""); }}>
          <Campo label="Nombre de la zona (ej: Zona A, Liga Infantil)">
            <InputAdmin placeholder="Zona A" value={nombreZona} onChange={e => setNombreZona(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && crearZona()} />
          </Campo>
          {errorZ && <div style={{ color: "#dc2626", fontSize: 13 }}>{errorZ}</div>}
          <BtnPrimary onClick={crearZona} disabled={guardandoZ} fullWidth>{guardandoZ ? "Creando..." : "Crear Zona"}</BtnPrimary>
        </Modal>
      )}
      {pendingDelZona && (
        <ConfirmModal
          mensaje={`Eliminás la zona "${pendingDelZona.nombre}".`}
          onConfirmar={confirmarEliminarZona}
          onCancelar={() => setPendingDelZona(null)}
        />
      )}

      {/* Modal Club */}
      {modalClub && (
        <Modal titulo="Agregar Club" onClose={() => { setModalClub(false); setNuevoClub(""); setLogoFile(null); setLogoPreview(null); setErrorC(""); }}>
          <Campo label="Nombre del club">
            <InputAdmin placeholder="Club Atlético..." value={nuevoClub} onChange={e => { setNuevoClub(e.target.value); setErrorC(""); }} autoFocus onKeyDown={e => !logoFile && e.key === "Enter" && agregarClub()} />
          </Campo>
          <Campo label="Logo (opcional)">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ cursor: "pointer", flexShrink: 0 }}>
                {logoPreview ? (
                  <img src={logoPreview} alt="preview"
                    style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "2px solid #4ade80", display: "block" }} />
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#f0fdf4", border: "2px dashed #86efac", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📷</div>
                )}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                }} />
              </label>
              <div style={{ flex: 1 }}>
                {logoFile ? (
                  <>
                    <div style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>✓ {logoFile.name}</div>
                    <button onClick={() => { setLogoFile(null); setLogoPreview(null); }}
                      style={{ marginTop: 4, background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer", padding: 0 }}>
                      Quitar imagen
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Toca la imagen para elegir</span>
                )}
              </div>
            </div>
          </Campo>
          {errorC && <div style={{ color: "#dc2626", fontSize: 13 }}>{errorC}</div>}
          <BtnPrimary onClick={agregarClub} disabled={subiendoLogo} fullWidth>
            {subiendoLogo ? "Subiendo..." : "Agregar"}
          </BtnPrimary>
        </Modal>
      )}
      {pendingDelClub && (
        <ConfirmModal
          mensaje={`Eliminás el club "${pendingDelClub.nombre}". Se verificará que no tenga jugadores ni partidos.`}
          onConfirmar={eliminarClub}
          onCancelar={() => setPendingDelClub(null)}
        />
      )}

      {/* Modal Categoría */}
      {modalCat && (
        <Modal titulo="Agregar Categoría" onClose={() => { setModalCat(false); setNuevaCat(""); setErrorCat(""); }}>
          <Campo label="Nombre de la categoría">
            <InputAdmin placeholder="Sub 13, Primera División..." value={nuevaCat} onChange={e => { setNuevaCat(e.target.value); setErrorCat(""); }} autoFocus onKeyDown={e => e.key === "Enter" && agregarCategoria()} />
          </Campo>
          {errorCat && <div style={{ color: "#dc2626", fontSize: 13 }}>{errorCat}</div>}
          <BtnPrimary onClick={agregarCategoria} fullWidth>Agregar</BtnPrimary>
        </Modal>
      )}
      {pendingDelCat && (
        <ConfirmModal
          mensaje={`Eliminás la categoría "${pendingDelCat.nombre}". Solo es posible si no tiene jugadores.`}
          onConfirmar={eliminarCategoria}
          onCancelar={() => setPendingDelCat(null)}
        />
      )}

      {/* Modal Editar Zona */}
      {modalEditZona && (
        <Modal titulo="Editar Zona" onClose={() => setModalEditZona(null)}>
          <Campo label="Nombre">
            <InputAdmin value={editNombreZona} onChange={e => setEditNombreZona(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && editarZona()} />
          </Campo>
          <BtnPrimary onClick={editarZona} fullWidth>Guardar</BtnPrimary>
        </Modal>
      )}

      {/* Modal Editar Club */}
      {modalEditClub && (
        <Modal titulo="Editar Club" onClose={() => { setModalEditClub(null); setEditLogoFile(null); setEditLogoPreview(null); }}>
          <Campo label="Nombre">
            <InputAdmin value={editNombreClub} onChange={e => setEditNombreClub(e.target.value)} autoFocus onKeyDown={e => !editLogoFile && e.key === "Enter" && editarClub()} />
          </Campo>
          <Campo label="Logo">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label style={{ cursor: "pointer", flexShrink: 0 }}>
                {editLogoPreview
                  ? <img src={editLogoPreview} alt="preview" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "2px solid #4ade80", display: "block" }} />
                  : <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#f0fdf4", border: "2px dashed #86efac", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>📷</div>
                }
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                  const file = e.target.files[0]; if (!file) return;
                  setEditLogoFile(file); setEditLogoPreview(URL.createObjectURL(file));
                }} />
              </label>
              <div style={{ flex: 1 }}>
                {editLogoFile
                  ? <button onClick={() => { setEditLogoFile(null); setEditLogoPreview(modalEditClub.logoUrl || null); }}
                      style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer", padding: 0 }}>Quitar cambio</button>
                  : <span style={{ fontSize: 12, color: "#9ca3af" }}>Toca para cambiar logo</span>
                }
              </div>
            </div>
          </Campo>
          <BtnPrimary onClick={editarClub} disabled={editandoClub} fullWidth>
            {editandoClub ? "Guardando..." : "Guardar"}
          </BtnPrimary>
        </Modal>
      )}

      {/* Modal Editar Categoría */}
      {modalEditCat && (
        <Modal titulo="Editar Categoría" onClose={() => setModalEditCat(null)}>
          <Campo label="Nombre">
            <InputAdmin value={editNombreCat} onChange={e => setEditNombreCat(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && editarCategoria()} />
          </Campo>
          <BtnPrimary onClick={editarCategoria} fullWidth>Guardar</BtnPrimary>
        </Modal>
      )}
    </div>
  );
}

function ZonaCard({ zona, onSeleccionar, onEliminar, onEditar, onSubir, onBajar }) {
  const tipoLabel          = TIPO_LABEL[zona.tipo]                        || "";
  const participantesLabel = PARTICIPANTES_LABEL[zona.tipoParticipantes] || "";

  return (
    <div
      onClick={() => onSeleccionar(zona)}
      style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", overflow: "hidden", cursor: "pointer" }}
    >
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onSubir?.(); }}
            disabled={!onSubir}
            style={{ background: "none", border: "none", cursor: onSubir ? "pointer" : "default", color: onSubir ? "#6b7280" : "#d1fae5", fontSize: 13, padding: "1px 4px", lineHeight: 1 }}>▲</button>
          <button onClick={e => { e.stopPropagation(); onBajar?.(); }}
            disabled={!onBajar}
            style={{ background: "none", border: "none", cursor: onBajar ? "pointer" : "default", color: onBajar ? "#6b7280" : "#d1fae5", fontSize: 13, padding: "1px 4px", lineHeight: 1 }}>▼</button>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🗂</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{zona.nombre}</div>
          {tipoLabel && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{tipoLabel}</div>}
          {participantesLabel && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{participantesLabel}</div>}
        </div>
        <button onClick={e => { e.stopPropagation(); onEditar(zona); }}
          style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 15, padding: "4px 6px", flexShrink: 0 }}>✏️</button>
        <button onClick={e => { e.stopPropagation(); onEliminar(zona); }}
          style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px", flexShrink: 0 }}>🗑</button>
        <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
      </div>
    </div>
  );
}

function iniciales(nombre) {
  return (nombre || "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

function LogoClub({ club, size = 40 }) {
  if (club.logoUrl) {
    return (
      <img src={club.logoUrl} alt={club.nombre}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid #dcfce7" }} />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#f0fdf4", border: "1.5px solid #dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.32, fontWeight: 700, color: "#1a3a2a", flexShrink: 0 }}>
      {iniciales(club.nombre)}
    </div>
  );
}
