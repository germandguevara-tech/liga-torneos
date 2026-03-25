import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, Switch, BtnPrimary, Campo, InputAdmin, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";
import FixtureAdmin from "./FixtureAdmin";

const CRITERIOS_DEFAULT = [
  { id: "puntos",         label: "Puntos",                 activo: true  },
  { id: "diferencia",     label: "Diferencia de goles",    activo: true  },
  { id: "golesFavor",     label: "Goles a favor",          activo: true  },
  { id: "enfrentamiento", label: "Enfrentamiento directo",  activo: true  },
  { id: "golesContra",    label: "Goles en contra",        activo: false },
  { id: "fairPlay",       label: "Fair play",              activo: false },
];

export default function ZonaAdmin({ liga, temporada, competencia, zona, onBack }) {
  const [tab, setTab] = useState("config");

  const ligaRef   = doc(db, "ligas", liga.docId);
  const tempRef   = doc(collection(ligaRef, "temporadas"), temporada.docId);
  const compRef   = doc(collection(tempRef, "competencias"), competencia.docId);
  const zonaRef   = doc(collection(compRef, "zonas"), zona.docId);
  const clubesCol = collection(zonaRef, "clubes");
  const catsCol   = collection(zonaRef, "categorias");

  // ── Config ────────────────────────────────────────────────────────────────
  const [config, setConfig] = useState({
    tipo:                       zona.tipo                       || "liga",
    tipoParticipantes:          zona.tipoParticipantes          || "clubes",
    idaYVuelta:                 zona.idaYVuelta                 ?? true,
    puntosPorVictoria:          zona.puntosPorVictoria          ?? 3,
    puntosPorEmpate:            zona.puntosPorEmpate            ?? 1,
    criteriosDesempate:         zona.criteriosDesempate         || CRITERIOS_DEFAULT,
    amarillasParaSuspension:    zona.amarillasParaSuspension    ?? 3,
    advertenciaFaltanAmarillas: zona.advertenciaFaltanAmarillas ?? 1,
  });
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  // ── Clubes ────────────────────────────────────────────────────────────────
  const [clubes,        setClubes]        = useState([]);
  const [cargandoClubes, setCargandoClubes] = useState(false);
  const [modalClub,     setModalClub]     = useState(false);
  const [nuevoClub,     setNuevoClub]     = useState("");
  const [logoFile,      setLogoFile]      = useState(null);
  const [logoPreview,   setLogoPreview]   = useState(null);
  const [subiendoLogo,  setSubiendoLogo]  = useState(false);
  const [pendingDelClub, setPendingDelClub] = useState(null);

  // ── Categorías ────────────────────────────────────────────────────────────
  const [categorias,    setCategorias]    = useState([]);
  const [cargandoCats,  setCargandoCats]  = useState(true);
  const [modalCat,      setModalCat]      = useState(false);
  const [nuevaCat,      setNuevaCat]      = useState("");
  const [pendingDelCat, setPendingDelCat] = useState(null);

  // ── Tabla General config ───────────────────────────────────────────────────
  const [tablaConf, setTablaConf] = useState({
    tablaGeneralActiva:         zona.tablaGeneralActiva         ?? false,
    tablaGeneralVisible:        zona.tablaGeneralVisible        ?? false,
    tablaGeneralPuntosVictoria: zona.tablaGeneralPuntosVictoria ?? 3,
    tablaGeneralCategorias:     zona.tablaGeneralCategorias     || [],
    tablaGeneralSanciones:      zona.tablaGeneralSanciones      || [],
  });

  // ── Loaders ───────────────────────────────────────────────────────────────
  useEffect(() => {
    cargarCategorias();
    if (zona.tipoParticipantes === "clubes") cargarClubes();
  }, []);

  useEffect(() => {
    if (tab === "clubes" && config.tipoParticipantes === "clubes" && clubes.length === 0) cargarClubes();
  }, [tab]);

  async function cargarClubes() {
    setCargandoClubes(true);
    try {
      const snap = await getDocs(clubesCol);
      setClubes(snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) {
      console.error("Error cargando clubes:", e);
    } finally {
      setCargandoClubes(false);
    }
  }

  async function cargarCategorias() {
    setCargandoCats(true);
    try {
      const snap = await getDocs(catsCol);
      const items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
      items.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));
      setCategorias(items);
    } catch (e) {
      console.error("Error cargando categorías:", e);
    } finally {
      setCargandoCats(false);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function guardarConfig() {
    setGuardandoConfig(true);
    await updateDoc(zonaRef, { ...config, ...tablaConf });
    setGuardandoConfig(false);
  }

  async function agregarClub() {
    if (!nuevoClub.trim()) return;
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
    } finally {
      setSubiendoLogo(false);
    }
    setNuevoClub(""); setLogoFile(null); setLogoPreview(null); setModalClub(false);
    await cargarClubes();
  }

  async function eliminarClub() {
    await deleteDoc(doc(clubesCol, pendingDelClub.docId));
    setPendingDelClub(null);
    await cargarClubes();
  }

  async function agregarCategoria() {
    if (!nuevaCat.trim()) return;
    await addDoc(catsCol, { nombre: nuevaCat.trim(), visible: true, orden: categorias.length, creadaEn: Date.now() });
    setNuevaCat(""); setModalCat(false);
    await cargarCategorias();
  }

  async function toggleVisibleCat(cat) {
    await updateDoc(doc(catsCol, cat.docId), { visible: !cat.visible });
    setCategorias(cs => cs.map(c => c.docId === cat.docId ? { ...c, visible: !c.visible } : c));
  }

  async function eliminarCategoria() {
    await deleteDoc(doc(catsCol, pendingDelCat.docId));
    setPendingDelCat(null);
    await cargarCategorias();
  }

  function moverCriterio(idx, dir) {
    const arr = [...config.criteriosDesempate];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    setConfig(c => ({ ...c, criteriosDesempate: arr }));
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS = [
    { id: "config",     label: "Config"     },
    ...(config.tipoParticipantes === "clubes" ? [{ id: "clubes", label: "Clubes" }] : []),
    { id: "categorias", label: "Categorías" },
    { id: "fixture",    label: "Fixture"    },
    { id: "tablas",     label: "Tablas"     },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <HeaderAdmin
        titulo={zona.nombre}
        subtitulo={competencia.nombre + " · " + String(temporada.anio) + " · " + liga.nombre}
        onBack={onBack}
      />

      {/* Tab bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #dcfce7", overflowX: "auto" }}>
        <div style={{ display: "flex", maxWidth: 600, margin: "0 auto", padding: "0 8px" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#1a3a2a" : "#6b7280", borderBottom: tab === t.id ? "2px solid #4ade80" : "2px solid transparent", whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 600, margin: "0 auto" }}>
        {tab === "config" && (
          <TabConfig
            config={config} setConfig={setConfig}
            tablaConf={tablaConf} setTablaConf={setTablaConf}
            categorias={categorias}
            guardar={guardarConfig} guardando={guardandoConfig}
            moverCriterio={moverCriterio}
          />
        )}
        {tab === "clubes" && (
          <TabClubes clubes={clubes} cargando={cargandoClubes} onAgregar={() => setModalClub(true)} onEliminar={setPendingDelClub} />
        )}
        {tab === "categorias" && (
          <TabCategorias categorias={categorias} cargando={cargandoCats} onAgregar={() => setModalCat(true)} onEliminar={setPendingDelCat} onToggleVisible={toggleVisibleCat} />
        )}
        {tab === "fixture" && (
          <FixtureAdmin zonaRef={zonaRef} zona={zona} ligaId={liga.docId} />
        )}
        {tab === "tablas" && (
          <TabTablas
            zonaRef={zonaRef} zona={zona}
            clubes={clubes} categorias={categorias}
            tablaConf={tablaConf} setTablaConf={setTablaConf}
          />
        )}
      </div>

      {/* Modales */}
      {modalClub && (
        <Modal titulo="Agregar Club" onClose={() => { setModalClub(false); setNuevoClub(""); setLogoFile(null); setLogoPreview(null); }}>
          <Campo label="Nombre del club">
            <InputAdmin placeholder="Club Atlético..." value={nuevoClub} onChange={e => setNuevoClub(e.target.value)} autoFocus onKeyDown={e => !logoFile && e.key === "Enter" && agregarClub()} />
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
                  <label style={{ cursor: "pointer" }}>
                    <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>Elegir imagen</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>JPG, PNG o WebP · Toca para seleccionar</div>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setLogoFile(file);
                      setLogoPreview(URL.createObjectURL(file));
                    }} />
                  </label>
                )}
              </div>
            </div>
          </Campo>
          <BtnPrimary onClick={agregarClub} disabled={subiendoLogo} fullWidth>
            {subiendoLogo ? "Subiendo..." : "Agregar"}
          </BtnPrimary>
        </Modal>
      )}

      {modalCat && (
        <Modal titulo="Agregar Categoría" onClose={() => { setModalCat(false); setNuevaCat(""); }}>
          <Campo label="Nombre de la categoría">
            <InputAdmin placeholder="Sub 13, Primera División..." value={nuevaCat} onChange={e => setNuevaCat(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && agregarCategoria()} />
          </Campo>
          <BtnPrimary onClick={agregarCategoria} fullWidth>Agregar</BtnPrimary>
        </Modal>
      )}

      {pendingDelClub && <ConfirmModal mensaje={`Eliminás el club "${pendingDelClub.nombre}".`}     onConfirmar={eliminarClub}      onCancelar={() => setPendingDelClub(null)} />}
      {pendingDelCat  && <ConfirmModal mensaje={`Eliminás la categoría "${pendingDelCat.nombre}".`} onConfirmar={eliminarCategoria} onCancelar={() => setPendingDelCat(null)}  />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB CONFIG
// ══════════════════════════════════════════════════════════════════════════════
function TabConfig({ config, setConfig, tablaConf, setTablaConf, categorias, guardar, guardando, moverCriterio }) {
  const catsSelIds = tablaConf.tablaGeneralCategorias || [];
  return (
    <>
      <SeccionLabel>Tipo de torneo</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Campo label="Formato">
            <SelectAdmin value={config.tipo} onChange={e => setConfig(c => ({ ...c, tipo: e.target.value }))}>
              <option value="liga">Liga</option>
              <option value="copa">Copa</option>
            </SelectAdmin>
          </Campo>
          <Campo label="Participantes">
            <SelectAdmin value={config.tipoParticipantes} onChange={e => setConfig(c => ({ ...c, tipoParticipantes: e.target.value }))}>
              <option value="clubes">Clubes con categorías</option>
              <option value="equipos">Equipos independientes</option>
            </SelectAdmin>
          </Campo>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch value={config.idaYVuelta} onChange={v => setConfig(c => ({ ...c, idaYVuelta: v }))} />
            <span style={{ fontSize: 13, color: "#374151" }}>Ida y vuelta</span>
          </div>
        </div>
      </Card>

      <SeccionLabel>Puntos por categoría</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Campo label="Victoria">
            <InputAdmin type="number" min="0" value={config.puntosPorVictoria} onChange={e => setConfig(c => ({ ...c, puntosPorVictoria: parseInt(e.target.value) || 0 }))} />
          </Campo>
          <Campo label="Empate">
            <InputAdmin type="number" min="0" value={config.puntosPorEmpate} onChange={e => setConfig(c => ({ ...c, puntosPorEmpate: parseInt(e.target.value) || 0 }))} />
          </Campo>
        </div>
      </Card>

      <SeccionLabel>Criterios de desempate</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {config.criteriosDesempate.map((cr, i) => (
            <div key={cr.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Switch value={cr.activo} onChange={() => {
                const arr = [...config.criteriosDesempate];
                arr[i] = { ...arr[i], activo: !arr[i].activo };
                setConfig(c => ({ ...c, criteriosDesempate: arr }));
              }} />
              <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{cr.label}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <BtnFlecha onClick={() => moverCriterio(i, -1)} label="↑" disabled={i === 0} />
                <BtnFlecha onClick={() => moverCriterio(i, 1)}  label="↓" disabled={i === config.criteriosDesempate.length - 1} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SeccionLabel>Disciplina</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Campo label="Amarillas para suspensión">
            <InputAdmin type="number" min="1" value={config.amarillasParaSuspension} onChange={e => setConfig(c => ({ ...c, amarillasParaSuspension: parseInt(e.target.value) || 1 }))} />
          </Campo>
          <Campo label="Aviso faltan N">
            <InputAdmin type="number" min="0" value={config.advertenciaFaltanAmarillas} onChange={e => setConfig(c => ({ ...c, advertenciaFaltanAmarillas: parseInt(e.target.value) || 0 }))} />
          </Campo>
        </div>
      </Card>

      <SeccionLabel>Tabla general</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch value={tablaConf.tablaGeneralActiva} onChange={v => setTablaConf(c => ({ ...c, tablaGeneralActiva: v }))} />
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>Tabla general activa</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch value={tablaConf.tablaGeneralVisible} onChange={v => setTablaConf(c => ({ ...c, tablaGeneralVisible: v }))} />
            <span style={{ fontSize: 13, color: "#374151" }}>Visible al público</span>
          </div>
        </div>
      </Card>

      {tablaConf.tablaGeneralActiva && (
        <>
          <Card>
            <div style={{ padding: "12px 16px" }}>
              <Campo label="Puntos por victoria (tabla general)">
                <InputAdmin type="number" min="0" value={tablaConf.tablaGeneralPuntosVictoria}
                  onChange={e => setTablaConf(c => ({ ...c, tablaGeneralPuntosVictoria: parseInt(e.target.value) || 0 }))} />
              </Campo>
            </div>
          </Card>

          {categorias.length > 0 && (
            <>
              <SeccionLabel>Categorías que suman a la general</SeccionLabel>
              <Card>
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {categorias.map(cat => {
                    const checked = catsSelIds.includes(cat.docId);
                    return (
                      <div key={cat.docId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Switch value={checked} onChange={() => setTablaConf(c => ({
                          ...c,
                          tablaGeneralCategorias: checked
                            ? c.tablaGeneralCategorias.filter(id => id !== cat.docId)
                            : [...(c.tablaGeneralCategorias || []), cat.docId],
                        }))} />
                        <span style={{ fontSize: 13, color: "#374151" }}>{cat.nombre}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      <BtnPrimary onClick={guardar} disabled={guardando} fullWidth>
        {guardando ? "Guardando..." : "Guardar configuración"}
      </BtnPrimary>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB CLUBES
// ══════════════════════════════════════════════════════════════════════════════
function TabClubes({ clubes, cargando, onAgregar, onEliminar }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BtnAccion onClick={onAgregar}>+ Club</BtnAccion>
      </div>
      {cargando ? <Spinner /> : clubes.length === 0 ? (
        <EmptyState emoji="🏟" titulo="Sin clubes" descripcion="Agregá los clubes participantes" />
      ) : clubes.map(club => (
        <Card key={club.docId}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <LogoClub club={club} size={40} />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{club.nombre}</div>
            <BtnDel onClick={() => onEliminar(club)} />
          </div>
        </Card>
      ))}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════
function TabCategorias({ categorias, cargando, onAgregar, onEliminar, onToggleVisible }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BtnAccion onClick={onAgregar}>+ Categoría</BtnAccion>
      </div>
      {cargando ? <Spinner /> : categorias.length === 0 ? (
        <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Agregá las categorías del torneo" />
      ) : categorias.map(cat => (
        <Card key={cat.docId}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat.nombre}</div>
            <span style={{ fontSize: 11, color: cat.visible ? "#166534" : "#6b7280" }}>{cat.visible ? "Visible" : "Oculta"}</span>
            <Switch value={cat.visible} onChange={() => onToggleVisible(cat)} />
            <BtnDel onClick={() => onEliminar(cat)} />
          </div>
        </Card>
      ))}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB TABLAS
// ══════════════════════════════════════════════════════════════════════════════
function TabTablas({ zonaRef, zona, clubes, categorias, tablaConf, setTablaConf }) {
  const opciones = [
    ...categorias.map(c => ({ id: c.docId, label: c.nombre, tipo: "cat" })),
    ...(tablaConf.tablaGeneralActiva ? [{ id: "__general__", label: "Tabla General", tipo: "general" }] : []),
  ];

  const [selId,             setSelId]             = useState(opciones[0]?.id || "");
  const [partidos,          setPartidos]          = useState([]);
  const [sanciones,         setSanciones]         = useState([]);
  const [cargando,          setCargando]          = useState(false);
  const [modalSancion,      setModalSancion]      = useState(false);
  const [pendingDelSancion, setPendingDelSancion] = useState(null);

  const sel = opciones.find(o => o.id === selId);

  // Si el selId queda inválido (ej: general desactivada), resetear
  useEffect(() => {
    if (opciones.length > 0 && !opciones.find(o => o.id === selId)) {
      setSelId(opciones[0].id);
    }
  }, [opciones.length]);

  useEffect(() => {
    if (selId && sel) cargarDatos();
  }, [selId]);

  async function cargarDatos() {
    setCargando(true);
    try {
      if (sel.tipo === "cat") {
        const catRef = doc(collection(zonaRef, "categorias"), selId);
        const [pSnap, catSnap] = await Promise.all([
          getDocs(collection(catRef, "partidos")),
          getDoc(catRef),
        ]);
        setPartidos(pSnap.docs.map(d => ({ docId: d.id, ...d.data() })));
        setSanciones(catSnap.data()?.sanciones || []);
      } else {
        // General: sumar todas las categorías seleccionadas
        const catsSelIds = tablaConf.tablaGeneralCategorias || [];
        if (catsSelIds.length === 0) {
          setPartidos([]);
          setSanciones(tablaConf.tablaGeneralSanciones || []);
          return;
        }
        const results = await Promise.all(
          catsSelIds.map(catId =>
            getDocs(collection(doc(collection(zonaRef, "categorias"), catId), "partidos"))
              .then(snap => snap.docs.map(d => ({ docId: d.id, ...d.data() })))
          )
        );
        setPartidos(results.flat());
        setSanciones(tablaConf.tablaGeneralSanciones || []);
      }
    } finally {
      setCargando(false);
    }
  }

  const pV = sel?.tipo === "general" ? (tablaConf.tablaGeneralPuntosVictoria ?? 3) : (zona.puntosPorVictoria ?? 3);
  const pE = zona.puntosPorEmpate ?? 1;

  const tabla = useMemo(() => {
    const m = {};
    clubes.forEach(c => { m[c.docId] = { ...c, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0, descuento: 0 }; });
    partidos
      .filter(p => !p.esLibre && p.jugado && p.golesLocal != null && p.golesVisitante != null)
      .forEach(p => {
        const loc = m[p.localId], vis = m[p.visitanteId];
        if (!loc || !vis) return;
        loc.pj++; vis.pj++;
        loc.gf += p.golesLocal; loc.gc += p.golesVisitante;
        vis.gf += p.golesVisitante; vis.gc += p.golesLocal;
        if      (p.golesLocal > p.golesVisitante) { loc.g++; vis.p++; loc.pts += pV; }
        else if (p.golesLocal < p.golesVisitante) { vis.g++; loc.p++; vis.pts += pV; }
        else                                       { loc.e++; vis.e++; loc.pts += pE; vis.pts += pE; }
      });
    sanciones.forEach(s => { if (m[s.clubId]) { m[s.clubId].pts -= s.puntos; m[s.clubId].descuento += s.puntos; } });
    return Object.values(m).sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
  }, [partidos, sanciones, pV, pE, clubes]);

  async function guardarSancion(san) {
    const nuevas = [...sanciones, san];
    if (sel.tipo === "general") {
      setTablaConf(c => ({ ...c, tablaGeneralSanciones: nuevas }));
      await updateDoc(zonaRef, { tablaGeneralSanciones: nuevas });
    } else {
      await updateDoc(doc(collection(zonaRef, "categorias"), selId), { sanciones: nuevas });
    }
    setSanciones(nuevas);
    setModalSancion(false);
  }

  async function eliminarSancion() {
    const nuevas = sanciones.filter((_, i) => i !== pendingDelSancion);
    if (sel.tipo === "general") {
      setTablaConf(c => ({ ...c, tablaGeneralSanciones: nuevas }));
      await updateDoc(zonaRef, { tablaGeneralSanciones: nuevas });
    } else {
      await updateDoc(doc(collection(zonaRef, "categorias"), selId), { sanciones: nuevas });
    }
    setSanciones(nuevas);
    setPendingDelSancion(null);
  }

  if (opciones.length === 0) return <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Agregá categorías primero" />;

  return (
    <>
      {/* Selector */}
      {opciones.length > 1 && (
        <Campo label="Ver tabla de">
          <SelectAdmin value={selId} onChange={e => setSelId(e.target.value)}>
            {opciones.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </SelectAdmin>
        </Campo>
      )}

      {cargando ? <Spinner /> : (
        <>
          <SeccionLabel>{sel?.label || "Tabla"}</SeccionLabel>
          <TablaPosicionesTablas tabla={tabla} />

          {/* Sanciones */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <SeccionLabel>Sanciones</SeccionLabel>
            <button onClick={() => setModalSancion(true)}
              style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 6, color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 8px" }}>
              − Descontar puntos
            </button>
          </div>
          {sanciones.length > 0 && (
            <Card>
              <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {sanciones.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>
                      <b>{s.clubNombre}</b> · <span style={{ color: "#dc2626", fontWeight: 700 }}>−{s.puntos} pts</span>
                      {s.motivo && <span style={{ color: "#6b7280" }}> · {s.motivo}</span>}
                    </span>
                    <button onClick={() => setPendingDelSancion(i)}
                      style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {modalSancion && (
        <SancionModal clubes={clubes} onGuardar={guardarSancion} onClose={() => setModalSancion(false)} />
      )}
      {pendingDelSancion !== null && (
        <ConfirmModal
          mensaje={`Eliminás la sanción de ${sanciones[pendingDelSancion]?.puntos} pts a ${sanciones[pendingDelSancion]?.clubNombre}.`}
          onConfirmar={eliminarSancion} onCancelar={() => setPendingDelSancion(null)} />
      )}
    </>
  );
}

// ── Tabla de posiciones ────────────────────────────────────────────────────────
function TablaPosicionesTablas({ tabla }) {
  const cols = "20px 1fr 36px 28px 24px 24px 24px 32px";
  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: cols, padding: "8px 12px", background: "#dcfce7", gap: 2 }}>
        {["#", "Club", "Pts", "PJ", "G", "E", "P", "DG"].map(h => (
          <span key={h} style={{ fontSize: 10, color: "#166534", fontWeight: 700, textAlign: h !== "Club" ? "center" : "left" }}>{h}</span>
        ))}
      </div>
      {tabla.length === 0
        ? <div style={{ padding: 16, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>Sin resultados aún</div>
        : tabla.map((r, i) => {
            const dg = r.gf - r.gc;
            return (
              <div key={r.docId} style={{ display: "grid", gridTemplateColumns: cols, padding: "9px 12px", borderTop: "1px solid #f0fdf4", gap: 2, alignItems: "center", background: i === 0 ? "#f0fdf4" : "#fff" }}>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{i + 1}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <LogoClub club={r} size={20} />
                  <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nombre}</span>
                </div>
                <Cel b center>
                  {r.pts}{r.descuento > 0 && <span style={{ fontSize: 9, color: "#dc2626" }}> −{r.descuento}</span>}
                </Cel>
                <Cel center>{r.pj}</Cel>
                <Cel center>{r.g}</Cel>
                <Cel center>{r.e}</Cel>
                <Cel center>{r.p}</Cel>
                <Cel b center color={dg > 0 ? "#15803d" : dg < 0 ? "#dc2626" : "#374151"}>{dg > 0 ? "+" : ""}{dg}</Cel>
              </div>
            );
          })
      }
    </Card>
  );
}

// ── Modal sanción ─────────────────────────────────────────────────────────────
function SancionModal({ clubes, onGuardar, onClose }) {
  const [clubId, setClubId] = useState(clubes[0]?.docId || "");
  const [puntos, setPuntos] = useState("3");
  const [motivo, setMotivo] = useState("");
  return (
    <Modal titulo="Descontar Puntos" onClose={onClose}>
      <Campo label="Club">
        <SelectAdmin value={clubId} onChange={e => setClubId(e.target.value)}>
          {clubes.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
        </SelectAdmin>
      </Campo>
      <Campo label="Puntos a descontar">
        <InputAdmin type="number" min="1" value={puntos} onChange={e => setPuntos(e.target.value)} />
      </Campo>
      <Campo label="Motivo (opcional)">
        <InputAdmin value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="W.O., infracción..." />
      </Campo>
      <BtnPrimary
        onClick={() => onGuardar({ clubId, clubNombre: clubes.find(c => c.docId === clubId)?.nombre || "", puntos: Math.max(1, parseInt(puntos) || 1), motivo: motivo.trim() })}
        fullWidth>
        Aplicar sanción
      </BtnPrimary>
    </Modal>
  );
}

// ── Micro-components ──────────────────────────────────────────────────────────
function Cel({ children, center, b, color }) {
  return <span style={{ fontSize: 12, color: color || "#374151", fontWeight: b ? 700 : 400, textAlign: center ? "center" : "left" }}>{children}</span>;
}

function BtnAccion({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
      {children}
    </button>
  );
}

function BtnFlecha({ onClick, label, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: "none", border: "1px solid #d1fae5", borderRadius: 6, width: 26, height: 26, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, color: "#374151", opacity: disabled ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {label}
    </button>
  );
}

function BtnDel({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, padding: "4px 6px", flexShrink: 0 }}>🗑</button>
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
