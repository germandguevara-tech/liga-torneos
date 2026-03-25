import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { HeaderAdmin, Card, Modal, BtnPrimary, Campo, InputAdmin, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

// ── Avatar jugador ────────────────────────────────────────────────────────────
function AvatarJug({ jug, size = 36 }) {
  if (jug?.fotoUrl) {
    return <img src={jug.fotoUrl} alt={jug.nombre} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid #dcfce7" }} />;
  }
  const ini = [jug?.apellido?.[0], jug?.nombre?.[0]].filter(Boolean).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#f0fdf4", border: "1.5px solid #dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.33, fontWeight: 700, color: "#166534", flexShrink: 0 }}>
      {ini || "?"}
    </div>
  );
}

// ── Modal agregar/editar jugador ──────────────────────────────────────────────
function ModalJugador({ jugador, ligaId, zonas, allClubes, allCats, onGuardar, onEliminar, onClose }) {
  const [apellido,    setApellido]    = useState(jugador?.apellido       || "");
  const [nombre,      setNombre]      = useState(jugador?.nombre         || "");
  const [dni,         setDni]         = useState(jugador?.dni             || "");
  const [fechaNac,    setFechaNac]    = useState(jugador?.fechaNacimiento || "");
  const [zonaId,      setZonaId]      = useState(jugador?.zonaId          || zonas[0]?.docId || "");
  const [clubId,      setClubId]      = useState(jugador?.clubId          || "");
  const [catId,       setCatId]       = useState(jugador?.categoriaId     || "");
  const [fotoFile,    setFotoFile]    = useState(null);
  const [fotoPreview, setFotoPreview] = useState(jugador?.fotoUrl         || "");
  const [guardando,   setGuardando]   = useState(false);
  const [error,       setError]       = useState("");
  const [confirmDel,  setConfirmDel]  = useState(false);

  useEffect(() => {
    if (!jugador) { setClubId(""); setCatId(""); }
  }, [zonaId]);

  function handleFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  }

  async function guardar() {
    if (!apellido.trim() || !nombre.trim()) { setError("Apellido y nombre son requeridos"); return; }
    if (!dni.trim())  { setError("El DNI es requerido"); return; }
    if (!clubId)      { setError("Seleccioná un club"); return; }
    if (!catId)       { setError("Seleccioná una categoría"); return; }
    setGuardando(true); setError("");
    try {
      await onGuardar({
        docId: jugador?.docId || null,
        apellido: apellido.trim(), nombre: nombre.trim(), dni: dni.trim(),
        fechaNacimiento: fechaNac, clubId, categoriaId: catId, zonaId,
        fotoUrl: jugador?.fotoUrl || "",
        fotoFile,
      });
    } catch (e) { setError("Error: " + e.message); }
    setGuardando(false);
  }

  return (
    <Modal titulo={jugador ? `${jugador.apellido}, ${jugador.nombre}` : "Nuevo Jugador"} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <AvatarJug jug={{ ...jugador, fotoUrl: fotoPreview }} size={60} />
        <label style={{ background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: 10, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#166534" }}>
          📷 {fotoPreview ? "Cambiar foto" : "Agregar foto"}
          <input type="file" accept="image/*" onChange={handleFoto} style={{ display: "none" }} />
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Campo label="Apellido *"><InputAdmin value={apellido} onChange={e => setApellido(e.target.value)} placeholder="García" /></Campo>
        <Campo label="Nombre *"><InputAdmin value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan" /></Campo>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Campo label="DNI *"><InputAdmin value={dni} onChange={e => setDni(e.target.value)} placeholder="12345678" /></Campo>
        <Campo label="Fecha de nacimiento"><InputAdmin type="date" value={fechaNac} onChange={e => setFechaNac(e.target.value)} /></Campo>
      </div>
      <Campo label="Zona">
        <SelectAdmin value={zonaId} onChange={e => setZonaId(e.target.value)}>
          {zonas.map(z => <option key={z.docId} value={z.docId}>{z.nombre}</option>)}
        </SelectAdmin>
      </Campo>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Campo label="Club *">
          <SelectAdmin value={clubId} onChange={e => setClubId(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {allClubes.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
          </SelectAdmin>
        </Campo>
        <Campo label="Categoría *">
          <SelectAdmin value={catId} onChange={e => setCatId(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {allCats.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
          </SelectAdmin>
        </Campo>
      </div>
      {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}
      <BtnPrimary onClick={guardar} disabled={guardando} fullWidth>
        {guardando ? "Guardando..." : jugador ? "Guardar cambios" : "Agregar jugador"}
      </BtnPrimary>
      {jugador && !confirmDel && (
        <button onClick={() => setConfirmDel(true)} style={{ background: "none", border: "1px solid #fecaca", borderRadius: 10, padding: "9px 16px", color: "#dc2626", cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%" }}>
          Eliminar jugador
        </button>
      )}
      {confirmDel && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 10 }}>¿Eliminás a {jugador.apellido}, {jugador.nombre}?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onEliminar(jugador)} style={{ flex: 1, background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: 9, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Sí, eliminar</button>
            <button onClick={() => setConfirmDel(false)} style={{ flex: 1, background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: 8, padding: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Modal importar Excel ──────────────────────────────────────────────────────
function ModalExcel({ zonas, allClubes, allCats, onImportar, onClose }) {
  const [zonaId,     setZonaId]     = useState(zonas[0]?.docId || "");
  const [filas,      setFilas]      = useState(null);
  const [importando, setImportando] = useState(false);
  const [error,      setError]      = useState("");

  function norm(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  }

  function parsearApNom(val) {
    const s = String(val || "").trim();
    if (s.includes(",")) {
      const idx = s.indexOf(",");
      return { apellido: s.slice(0, idx).trim(), nombre: s.slice(idx + 1).trim() };
    }
    const parts = s.split(" ");
    return { apellido: parts[0] || "", nombre: parts.slice(1).join(" ") };
  }

  function parsearFecha(val) {
    if (!val) return "";
    if (typeof val === "number") {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s;
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError(""); setFilas(null);
    try {
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const parsed = rows.map(row => {
        const get = (...keys) => {
          for (const k of Object.keys(row)) {
            for (const key of keys) {
              if (norm(k) === norm(key)) return row[k];
            }
          }
          return "";
        };
        const { apellido, nombre } = parsearApNom(get("Apellido y Nombre", "ApellidoNombre", "Apellido"));
        const dni       = String(get("DNI", "Dni") || "").trim();
        const fechaNac  = parsearFecha(get("Fecha de nacimiento", "FechaNacimiento", "Fecha"));
        const clubNom   = norm(get("Club"));
        const catNom    = norm(get("Categoria", "Categoría"));
        const club = allClubes.find(c => norm(c.nombre) === clubNom);
        const cat  = allCats.find(c => norm(c.nombre) === catNom);
        return {
          apellido, nombre, dni, fechaNacimiento: fechaNac,
          clubNomOrig: String(get("Club") || "").trim(),
          catNomOrig:  String(get("Categoria", "Categoría") || "").trim(),
          clubId:      club?.docId || null,
          categoriaId: cat?.docId  || null,
          zonaId,
          valido: !!(apellido && dni && club && cat),
        };
      }).filter(r => r.apellido || r.dni);

      setFilas(parsed);
    } catch (e) {
      setError("Error al leer el archivo: " + e.message);
    }
  }

  async function importar() {
    const validas = filas.filter(f => f.valido);
    if (!validas.length) { setError("No hay filas válidas"); return; }
    setImportando(true);
    try { await onImportar(validas); }
    catch (e) { setError("Error: " + e.message); setImportando(false); }
  }

  const validas   = filas?.filter(f => f.valido).length ?? 0;
  const invalidas = filas ? filas.length - validas : 0;

  return (
    <Modal titulo="Importar desde Excel" onClose={onClose}>
      <Campo label="Zona (para identificar clubes y categorías)">
        <SelectAdmin value={zonaId} onChange={e => { setZonaId(e.target.value); setFilas(null); }}>
          {zonas.map(z => <option key={z.docId} value={z.docId}>{z.nombre}</option>)}
        </SelectAdmin>
      </Campo>
      <div style={{ background: "#f0fdf4", border: "1px dashed #86efac", borderRadius: 12, padding: "11px 14px", fontSize: 12, color: "#374151", lineHeight: 1.8 }}>
        <b>Columnas esperadas:</b> Club · Categoría · Apellido y Nombre · DNI · Fecha de nacimiento<br />
        <span style={{ color: "#6b7280" }}>Ej: "García, Juan" · 12345678 · 15/05/2010</span>
      </div>
      <label style={{ background: "#1a3a2a", color: "#4ade80", borderRadius: 10, padding: "11px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, textAlign: "center", display: "block" }}>
        📊 Seleccionar archivo .xlsx
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
      </label>
      {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}
      {filas && filas.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 12, background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>✓ {validas} válidos</span>
            {invalidas > 0 && <span style={{ fontSize: 12, background: "#fef2f2", color: "#dc2626", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>✗ {invalidas} con error</span>}
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #dcfce7", borderRadius: 10 }}>
            {filas.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", background: f.valido ? "#fff" : "#fef2f2" }}>
                <span style={{ flexShrink: 0 }}>{f.valido ? "✅" : "❌"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827" }}>
                    {f.apellido}{f.nombre ? `, ${f.nombre}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    DNI {f.dni || "—"} · {f.clubNomOrig}{!f.clubId ? " ⚠️" : ""} · {f.catNomOrig}{!f.categoriaId ? " ⚠️" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {validas > 0 && (
            <BtnPrimary onClick={importar} disabled={importando} fullWidth>
              {importando ? "Importando..." : `Importar ${validas} jugador${validas !== 1 ? "es" : ""}`}
            </BtnPrimary>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function JugadoresAdmin({ liga, temporada, competencia, onBack }) {
  const [tab,        setTab]        = useState("lista");
  const [zonas,      setZonas]      = useState([]);
  const [allClubes,  setAllClubes]  = useState([]);
  const [allCats,    setAllCats]    = useState([]);
  const [jugadores,  setJugadores]  = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [modalJug,   setModalJug]   = useState(null);  // null | "nuevo" | jugadorObj
  const [modalExcel, setModalExcel] = useState(false);
  const [filtroZona,  setFiltroZona]  = useState("");
  const [filtroCat,   setFiltroCat]   = useState("");
  const [filtroClub,  setFiltroClub]  = useState("");
  const [busqueda,    setBusqueda]    = useState("");

  const ligaRef = doc(db, "ligas", liga.docId);
  const compRef = doc(db, "ligas", liga.docId, "temporadas", temporada.docId, "competencias", competencia.docId);

  async function cargarTodo() {
    setCargando(true);
    const [zonasSnap, clubesSnap, catsSnap, jugSnap] = await Promise.all([
      getDocs(collection(compRef, "zonas")),
      getDocs(collection(compRef, "clubes")),
      getDocs(collection(compRef, "categorias")),
      getDocs(query(collection(ligaRef, "jugadores"), where("competenciaId", "==", competencia.docId))),
    ]);
    setZonas(zonasSnap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setAllClubes(clubesSnap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setAllCats(catsSnap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setJugadores(jugSnap.docs.map(d => ({ docId: d.id, ...d.data() })));
    setCargando(false);
  }

  useEffect(() => { cargarTodo(); }, []);

  const jugFiltrados = useMemo(() => {
    return jugadores.filter(j => {
      if (filtroZona  && j.zonaId !== filtroZona)     return false;
      if (filtroCat   && j.categoriaId !== filtroCat) return false;
      if (filtroClub  && j.clubId !== filtroClub)     return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!`${j.apellido} ${j.nombre}`.toLowerCase().includes(q) && !(j.dni || "").includes(q)) return false;
      }
      return true;
    }).sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
  }, [jugadores, filtroZona, filtroCat, filtroClub, busqueda]);

  const duplicados = useMemo(() => {
    const porDni = {};
    jugadores.forEach(j => {
      if (!j.dni) return;
      if (!porDni[j.dni]) porDni[j.dni] = [];
      porDni[j.dni].push(j);
    });
    return Object.entries(porDni).filter(([, arr]) => arr.length > 1).map(([dni, arr]) => ({ dni, jugadores: arr }));
  }, [jugadores]);

  async function guardarJugador({ docId, fotoFile, ...datos }) {
    if (docId) {
      let fotoUrl = datos.fotoUrl;
      if (fotoFile) {
        const storRef = ref(storage, `jugadores/${liga.docId}/${docId}`);
        await uploadBytes(storRef, fotoFile);
        fotoUrl = await getDownloadURL(storRef);
      }
      await updateDoc(doc(ligaRef, "jugadores", docId), { ...datos, fotoUrl });
      setJugadores(prev => prev.map(j => j.docId === docId ? { docId, ...datos, fotoUrl } : j));
    } else {
      const newRef = await addDoc(collection(ligaRef, "jugadores"), {
        ...datos, fotoUrl: "", competenciaId: competencia.docId, temporadaId: temporada.docId,
      });
      let fotoUrl = "";
      if (fotoFile) {
        const storRef = ref(storage, `jugadores/${liga.docId}/${newRef.id}`);
        await uploadBytes(storRef, fotoFile);
        fotoUrl = await getDownloadURL(storRef);
        await updateDoc(newRef, { fotoUrl });
      }
      setJugadores(prev => [...prev, { docId: newRef.id, ...datos, fotoUrl, competenciaId: competencia.docId, temporadaId: temporada.docId }]);
    }
    setModalJug(null);
  }

  async function eliminarJugador(jug) {
    await deleteDoc(doc(ligaRef, "jugadores", jug.docId));
    setJugadores(prev => prev.filter(j => j.docId !== jug.docId));
    setModalJug(null);
  }

  async function importarJugadores(filas) {
    const nuevosRef = await Promise.all(
      filas.map(f => addDoc(collection(ligaRef, "jugadores"), {
        apellido: f.apellido, nombre: f.nombre, dni: f.dni,
        fechaNacimiento: f.fechaNacimiento || "", fotoUrl: "",
        clubId: f.clubId, categoriaId: f.categoriaId, zonaId: f.zonaId,
        competenciaId: competencia.docId, temporadaId: temporada.docId,
      }))
    );
    const nuevos = filas.map((f, i) => ({
      docId: nuevosRef[i].id, apellido: f.apellido, nombre: f.nombre, dni: f.dni,
      fechaNacimiento: f.fechaNacimiento || "", fotoUrl: "",
      clubId: f.clubId, categoriaId: f.categoriaId, zonaId: f.zonaId,
      competenciaId: competencia.docId, temporadaId: temporada.docId,
    }));
    setJugadores(prev => [...prev, ...nuevos]);
    setModalExcel(false);
  }

  const catsParaFiltro   = allCats;
  const clubesParaFiltro = allClubes;

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin
        titulo="Jugadores"
        subtitulo={`${competencia.nombre} · ${liga.nombre}`}
        onBack={onBack}
        accionLabel="+ Jugador"
        onAccion={() => setModalJug("nuevo")}
      />
      <div style={{ background: "#1a3a2a", display: "flex", padding: "0 16px" }}>
        {[["lista", "Lista"], ["duplicados", `Duplicados${duplicados.length > 0 ? ` (${duplicados.length})` : ""}`]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: tab === k ? 700 : 500, color: tab === k ? "#4ade80" : "rgba(255,255,255,0.55)", borderBottom: tab === k ? "2px solid #4ade80" : "2px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 600, margin: "0 auto" }}>
        {cargando ? <Spinner /> : (
          <>
            {tab === "lista" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                  <InputAdmin placeholder="Buscar nombre o DNI..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                  <button onClick={() => setModalExcel(true)} style={{ background: "#fff", border: "1px solid #dcfce7", borderRadius: 10, padding: "0 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#166534", whiteSpace: "nowrap" }}>
                    📊 Excel
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <SelectAdmin value={filtroZona} onChange={e => { setFiltroZona(e.target.value); setFiltroCat(""); setFiltroClub(""); }} style={{ flex: 1, minWidth: 100 }}>
                    <option value="">Todas las zonas</option>
                    {zonas.map(z => <option key={z.docId} value={z.docId}>{z.nombre}</option>)}
                  </SelectAdmin>
                  <SelectAdmin value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ flex: 1, minWidth: 100 }}>
                    <option value="">Todas las cats.</option>
                    {catsParaFiltro.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
                  </SelectAdmin>
                  <SelectAdmin value={filtroClub} onChange={e => setFiltroClub(e.target.value)} style={{ flex: 1, minWidth: 100 }}>
                    <option value="">Todos los clubes</option>
                    {clubesParaFiltro.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
                  </SelectAdmin>
                </div>
                <SeccionLabel>{jugFiltrados.length} jugador{jugFiltrados.length !== 1 ? "es" : ""}</SeccionLabel>
                {jugFiltrados.length === 0 ? (
                  <EmptyState emoji="👤" titulo="Sin jugadores" descripcion="Agregá jugadores manualmente o importá desde Excel" />
                ) : (
                  <Card>
                    {jugFiltrados.map((j, i) => {
                      const club = allClubes.find(c => c.docId === j.clubId);
                      const cat  = allCats.find(c => c.docId === j.categoriaId);
                      return (
                        <div key={j.docId} onClick={() => setModalJug(j)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", cursor: "pointer" }}>
                          <AvatarJug jug={j} size={36} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{j.apellido}, {j.nombre}</div>
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{club?.nombre || "—"} · {cat?.nombre || "—"}</div>
                          </div>
                          <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
                        </div>
                      );
                    })}
                  </Card>
                )}
              </>
            )}

            {tab === "duplicados" && (
              duplicados.length === 0 ? (
                <EmptyState emoji="✅" titulo="Sin duplicados" descripcion="No hay jugadores con el mismo DNI en múltiples categorías" />
              ) : (
                duplicados.map(({ dni, jugadores: grupo }) => (
                  <Card key={dni}>
                    <div style={{ padding: "9px 14px", background: "#fef2f2", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>DNI {dni}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af", background: "#fff", borderRadius: 20, padding: "1px 8px" }}>{grupo.length} registros</span>
                    </div>
                    {grupo.map((j, i) => {
                      const club = allClubes.find(c => c.docId === j.clubId);
                      const cat  = allCats.find(c => c.docId === j.categoriaId);
                      return (
                        <div key={j.docId} onClick={() => setModalJug(j)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", cursor: "pointer" }}>
                          <AvatarJug jug={j} size={30} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{j.apellido}, {j.nombre}</div>
                            <div style={{ fontSize: 11, color: "#6b7280" }}>{club?.nombre || "—"} · Cat. {cat?.nombre || "—"}</div>
                          </div>
                          <span style={{ fontSize: 18, color: "#9ca3af" }}>›</span>
                        </div>
                      );
                    })}
                  </Card>
                ))
              )
            )}
          </>
        )}
      </div>

      {modalJug && (
        <ModalJugador
          jugador={modalJug === "nuevo" ? null : modalJug}
          ligaId={liga.docId}
          zonas={zonas}
          allClubes={allClubes}
          allCats={allCats}
          onGuardar={guardarJugador}
          onEliminar={modalJug !== "nuevo" ? eliminarJugador : null}
          onClose={() => setModalJug(null)}
        />
      )}

      {modalExcel && (
        <ModalExcel
          zonas={zonas}
          allClubes={allClubes}
          allCats={allCats}
          onImportar={importarJugadores}
          onClose={() => setModalExcel(false)}
        />
      )}
    </div>
  );
}
