import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "../../firebase";
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
  const clubesCol = collection(compRef, "clubes");
  const catsCol   = collection(compRef, "categorias");

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
  const [clubes,         setClubes]         = useState([]);
  const [cargandoClubes, setCargandoClubes] = useState(false);

  // ── Participantes ─────────────────────────────────────────────────────────
  const [participantesIds,       setParticipantesIds]       = useState(zona.clubesParticipantes     || []);
  const [catParticipantes,       setCatParticipantes]       = useState(zona.categoriasParticipantes  || []);
  const [catVisibilidad,         setCatVisibilidad]         = useState(zona.categoriasVisibilidad    || {});
  const [guardandoParticipantes, setGuardandoParticipantes] = useState(false);

  // ── Categorías ────────────────────────────────────────────────────────────
  const [categorias,   setCategorias]   = useState([]);
  const [cargandoCats, setCargandoCats] = useState(true);

  // ── Tabla General config ───────────────────────────────────────────────────
  const [tablaConf, setTablaConf] = useState({
    tablaGeneralActiva:         zona.tablaGeneralActiva         ?? false,
    tablaGeneralVisible:        zona.tablaGeneralVisible        ?? false,
    tablaGeneralPuntosVictoria: zona.tablaGeneralPuntosVictoria ?? 3,
    tablaGeneralCategorias:     zona.tablaGeneralCategorias     || [],
    tablaGeneralSanciones:      zona.tablaGeneralSanciones      || [],
  });

  // ── Tabla Acumulada config ─────────────────────────────────────────────────
  const [tablaAcumConf, setTablaAcumConf] = useState({
    tablaAcumuladaActiva:     zona.tablaAcumuladaActiva     ?? false,
    tablaAcumuladaVisible:    zona.tablaAcumuladaVisible    ?? false,
    tablaAcumuladaZonas:      zona.tablaAcumuladaZonas      || [],
    tablaAcumuladaSanciones:  zona.tablaAcumuladaSanciones  || [],
  });

  // ── Todas las zonas de la competencia (para selector acumulada) ────────────
  const [todasZonas, setTodasZonas] = useState([]);

  // ── Loaders ───────────────────────────────────────────────────────────────
  useEffect(() => {
    cargarCategorias();
    if (zona.tipoParticipantes === "clubes") cargarClubes();
    getDocs(collection(compRef, "zonas"))
      .then(snap => setTodasZonas(snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? a.creadoEn ?? 0) - (b.orden ?? b.creadoEn ?? 0))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "participantes" && config.tipoParticipantes === "clubes" && clubes.length === 0) cargarClubes();
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
    await updateDoc(zonaRef, { ...config, ...tablaConf, ...tablaAcumConf });
    setGuardandoConfig(false);
  }

  async function guardarParticipantes() {
    setGuardandoParticipantes(true);
    await updateDoc(zonaRef, {
      clubesParticipantes:    participantesIds,
      categoriasParticipantes: catParticipantes,
      categoriasVisibilidad:  catVisibilidad,
    });
    setGuardandoParticipantes(false);
  }

  function moverCriterio(idx, dir) {
    const arr = [...config.criteriosDesempate];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    setConfig(c => ({ ...c, criteriosDesempate: arr }));
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const clubesZona = participantesIds.length
    ? clubes.filter(c => participantesIds.includes(c.docId))
    : clubes;

  // Categorías de esta zona (filtradas + visibilidad por zona aplicada)
  const categoriasZona = (catParticipantes.length ? categorias.filter(c => catParticipantes.includes(c.docId)) : categorias)
    .map(c => ({ ...c, visible: catParticipantes.length ? (catVisibilidad[c.docId] ?? c.visible) : c.visible }));

  const TABS = [
    { id: "config",        label: "Config"        },
    ...(config.tipoParticipantes === "clubes" ? [{ id: "participantes", label: "Participantes" }] : []),
    { id: "fixture",       label: "Fixture"       },
    { id: "tablas",        label: "Tablas"        },
    { id: "sanciones",     label: "Sanciones"     },
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
            tablaAcumConf={tablaAcumConf} setTablaAcumConf={setTablaAcumConf}
            zonas={todasZonas} zonaId={zona.docId}
            categorias={categorias}
            guardar={guardarConfig} guardando={guardandoConfig}
            moverCriterio={moverCriterio}
          />
        )}
        {tab === "participantes" && (
          <TabParticipantes
            clubes={clubes} categorias={categorias} cargando={cargandoClubes || cargandoCats}
            participantesIds={participantesIds} setParticipantesIds={setParticipantesIds}
            catParticipantes={catParticipantes} setCatParticipantes={setCatParticipantes}
            catVisibilidad={catVisibilidad} setCatVisibilidad={setCatVisibilidad}
            guardando={guardandoParticipantes} onGuardar={guardarParticipantes}
            publicado={zona.publicado ?? false}
          />
        )}
        {tab === "fixture" && (
          <FixtureAdmin zonaRef={zonaRef} zona={zona} ligaId={liga.docId} clubes={clubesZona} categorias={categoriasZona} />
        )}
        {tab === "tablas" && (
          <TabTablas
            zonaRef={zonaRef} zona={zona}
            clubes={clubesZona} categorias={categoriasZona}
            tablaConf={tablaConf} setTablaConf={setTablaConf}
            tablaAcumConf={tablaAcumConf} setTablaAcumConf={setTablaAcumConf}
            compRef={compRef}
          />
        )}
        {tab === "sanciones" && (
          <TabSanciones
            zonaRef={zonaRef}
            ligaId={liga.docId}
            clubes={clubesZona}
            categorias={categoriasZona}
          />
        )}
      </div>

    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB CONFIG
// ══════════════════════════════════════════════════════════════════════════════
function TabConfig({ config, setConfig, tablaConf, setTablaConf, tablaAcumConf, setTablaAcumConf, zonas, zonaId, categorias, guardar, guardando, moverCriterio }) {
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

      <SeccionLabel>Tabla acumulada entre zonas</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch value={tablaAcumConf.tablaAcumuladaActiva} onChange={v => setTablaAcumConf(c => ({ ...c, tablaAcumuladaActiva: v }))} />
            <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>Tabla acumulada activa</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Switch value={tablaAcumConf.tablaAcumuladaVisible} onChange={v => setTablaAcumConf(c => ({ ...c, tablaAcumuladaVisible: v }))} />
            <span style={{ fontSize: 13, color: "#374151" }}>Visible al público</span>
          </div>
        </div>
      </Card>

      {tablaAcumConf.tablaAcumuladaActiva && zonas.length > 0 && (
        <>
          <SeccionLabel>Zonas que suman a la tabla acumulada</SeccionLabel>
          <Card>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
              {zonas.map(z => {
                const checked = (tablaAcumConf.tablaAcumuladaZonas || []).includes(z.docId);
                return (
                  <div key={z.docId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Switch value={checked} onChange={() => setTablaAcumConf(c => ({
                      ...c,
                      tablaAcumuladaZonas: checked
                        ? (c.tablaAcumuladaZonas || []).filter(id => id !== z.docId)
                        : [...(c.tablaAcumuladaZonas || []), z.docId],
                    }))} />
                    <span style={{ fontSize: 13, color: "#374151" }}>
                      {z.nombre}{z.docId === zonaId ? <span style={{ fontSize: 11, color: "#9ca3af" }}> (esta zona)</span> : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      <BtnPrimary onClick={guardar} disabled={guardando} fullWidth>
        {guardando ? "Guardando..." : "Guardar configuración"}
      </BtnPrimary>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB PARTICIPANTES
// ══════════════════════════════════════════════════════════════════════════════
function TabParticipantes({ clubes, categorias, cargando, participantesIds, setParticipantesIds, catParticipantes, setCatParticipantes, catVisibilidad, setCatVisibilidad, guardando, onGuardar, publicado }) {
  const [clubSel, setClubSel] = useState("");
  const [catSel,  setCatSel]  = useState("");

  if (cargando) return <Spinner />;

  if (publicado) {
    const clubesMostrar = participantesIds.length
      ? participantesIds.map(id => clubes.find(c => c.docId === id)).filter(Boolean)
      : clubes;
    const catsMostrar = catParticipantes.length
      ? catParticipantes.map(id => categorias.find(c => c.docId === id)).filter(Boolean)
      : categorias;
    return (
      <>
        <div style={{ background: "#fef3c7", border: "1.5px solid #fcd34d", borderRadius: 12, padding: "11px 16px", fontSize: 13, color: "#92400e", fontWeight: 600 }}>
          🔒 Torneo publicado — los participantes no se pueden modificar.
        </div>
        <SeccionLabel>Clubes participantes</SeccionLabel>
        {clubesMostrar.map(club => (
          <Card key={club.docId}>
            <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <LogoClub club={club} size={34} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{club.nombre}</div>
            </div>
          </Card>
        ))}
        <SeccionLabel>Categorías participantes</SeccionLabel>
        {catsMostrar.map(cat => {
          const visible = catVisibilidad[cat.docId] ?? cat.visible;
          return (
            <Card key={cat.docId}>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat.nombre}</div>
                <span style={{ fontSize: 11, color: visible ? "#166534" : "#6b7280" }}>{visible ? "Visible" : "Oculta"}</span>
              </div>
            </Card>
          );
        })}
      </>
    );
  }

  const clubesDisponibles = clubes.filter(c => !participantesIds.includes(c.docId));
  const clubesAgregados   = participantesIds.map(id => clubes.find(c => c.docId === id)).filter(Boolean);
  const catsDisponibles   = categorias.filter(c => !catParticipantes.includes(c.docId));
  const catsAgregadas     = catParticipantes.map(id => categorias.find(c => c.docId === id)).filter(Boolean);

  function agregarClub() {
    if (!clubSel) return;
    setParticipantesIds(prev => [...prev, clubSel]);
    setClubSel("");
  }

  function quitarClub(id) {
    setParticipantesIds(prev => prev.filter(x => x !== id));
  }

  function agregarCat() {
    if (!catSel) return;
    setCatParticipantes(prev => [...prev, catSel]);
    setCatSel("");
  }

  function quitarCat(id) {
    setCatParticipantes(prev => prev.filter(x => x !== id));
    setCatVisibilidad(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function toggleVisibleCat(catId, currentVisible) {
    setCatVisibilidad(prev => ({ ...prev, [catId]: !currentVisible }));
  }

  const nClubes = participantesIds.length || clubes.length;
  const nCats   = catParticipantes.length  || categorias.length;

  return (
    <>
      {/* ── Clubes ── */}
      <SeccionLabel>Clubes que participan en esta zona</SeccionLabel>
      {clubes.length === 0 ? (
        <EmptyState emoji="🏟" titulo="Sin clubes" descripcion="Agregá clubes en la competencia primero" />
      ) : (
        <>
          <Card>
            <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
              <select
                value={clubSel}
                onChange={e => setClubSel(e.target.value)}
                style={{ flex: 1, border: "1px solid #d1fae5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: clubSel ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}
              >
                <option value="">— Seleccioná un club —</option>
                {clubesDisponibles.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
              </select>
              <button
                onClick={agregarClub}
                disabled={!clubSel}
                style={{ background: clubSel ? "#1a3a2a" : "#d1fae5", color: clubSel ? "#4ade80" : "#9ca3af", border: "none", borderRadius: 10, padding: "9px 16px", cursor: clubSel ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, flexShrink: 0 }}
              >
                Agregar
              </button>
            </div>
          </Card>
          {clubesAgregados.length === 0 && (
            <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "6px 0" }}>
              Sin restricción — todos los clubes de la competencia participan
            </div>
          )}
          {clubesAgregados.map(club => (
            <Card key={club.docId}>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <LogoClub club={club} size={34} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{club.nombre}</div>
                <button onClick={() => quitarClub(club.docId)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
              </div>
            </Card>
          ))}
        </>
      )}

      {/* ── Categorías ── */}
      <SeccionLabel>Categorías que participan en esta zona</SeccionLabel>
      {categorias.length === 0 ? (
        <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Agregá categorías en la competencia primero" />
      ) : (
        <>
          <Card>
            <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
              <select
                value={catSel}
                onChange={e => setCatSel(e.target.value)}
                style={{ flex: 1, border: "1px solid #d1fae5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: catSel ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}
              >
                <option value="">— Seleccioná una categoría —</option>
                {catsDisponibles.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
              </select>
              <button
                onClick={agregarCat}
                disabled={!catSel}
                style={{ background: catSel ? "#1a3a2a" : "#d1fae5", color: catSel ? "#4ade80" : "#9ca3af", border: "none", borderRadius: 10, padding: "9px 16px", cursor: catSel ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, flexShrink: 0 }}
              >
                Agregar
              </button>
            </div>
          </Card>
          {catsAgregadas.length === 0 && (
            <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "6px 0" }}>
              Sin restricción — todas las categorías de la competencia participan
            </div>
          )}
          {catsAgregadas.map(cat => {
            const visible = catVisibilidad[cat.docId] ?? cat.visible;
            return (
              <Card key={cat.docId}>
                <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat.nombre}</div>
                  <span style={{ fontSize: 11, color: visible ? "#166534" : "#6b7280" }}>{visible ? "Visible" : "Oculta"}</span>
                  <Switch value={visible} onChange={() => toggleVisibleCat(cat.docId, visible)} />
                  <button onClick={() => quitarCat(cat.docId)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 20, lineHeight: 1, padding: "2px 6px" }}>×</button>
                </div>
              </Card>
            );
          })}
        </>
      )}

      <BtnPrimary onClick={onGuardar} disabled={guardando} fullWidth>
        {guardando ? "Guardando..." : `Guardar · ${nClubes} club${nClubes !== 1 ? "es" : ""} · ${nCats} categoría${nCats !== 1 ? "s" : ""}`}
      </BtnPrimary>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB TABLAS
// ══════════════════════════════════════════════════════════════════════════════
function TabTablas({ zonaRef, zona, clubes, categorias, tablaConf, setTablaConf, tablaAcumConf, setTablaAcumConf, compRef }) {
  const opciones = [
    ...categorias.map(c => ({ id: c.docId, label: c.nombre, tipo: "cat" })),
    ...(tablaConf.tablaGeneralActiva    ? [{ id: "__general__",  label: "Tabla General",   tipo: "general"   }] : []),
    ...(tablaAcumConf?.tablaAcumuladaActiva ? [{ id: "__acumulada__", label: "Tabla Acumulada", tipo: "acumulada" }] : []),
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
      } else if (sel.tipo === "general") {
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
      } else {
        // Acumulada: sumar partidos de todas las zonas seleccionadas × todas las categorías
        const zonaIds = tablaAcumConf?.tablaAcumuladaZonas || [];
        if (zonaIds.length === 0 || categorias.length === 0) {
          setPartidos([]);
          setSanciones(tablaAcumConf?.tablaAcumuladaSanciones || []);
          return;
        }
        const results = await Promise.all(
          zonaIds.flatMap(zId =>
            categorias.map(cat => {
              const zRef   = doc(collection(compRef, "zonas"), zId);
              const catRef = doc(collection(zRef, "categorias"), cat.docId);
              return getDocs(collection(catRef, "partidos"))
                .then(snap => snap.docs.map(d => ({ docId: d.id, ...d.data() })))
                .catch(() => []);
            })
          )
        );
        setPartidos(results.flat());
        setSanciones(tablaAcumConf?.tablaAcumuladaSanciones || []);
      }
    } finally {
      setCargando(false);
    }
  }

  const pV = sel?.tipo === "general" ? (tablaConf.tablaGeneralPuntosVictoria ?? 3) : (zona.puntosPorVictoria ?? 3);
  // Para acumulada se usan los puntos de esta zona
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
    } else if (sel.tipo === "acumulada") {
      setTablaAcumConf(c => ({ ...c, tablaAcumuladaSanciones: nuevas }));
      await updateDoc(zonaRef, { tablaAcumuladaSanciones: nuevas });
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
    } else if (sel.tipo === "acumulada") {
      setTablaAcumConf(c => ({ ...c, tablaAcumuladaSanciones: nuevas }));
      await updateDoc(zonaRef, { tablaAcumuladaSanciones: nuevas });
    } else {
      await updateDoc(doc(collection(zonaRef, "categorias"), selId), { sanciones: nuevas });
    }
    setSanciones(nuevas);
    setPendingDelSancion(null);
  }

  if (opciones.length === 0) return <EmptyState emoji="📋" titulo="Sin datos" descripcion="Agregá categorías o activá la tabla acumulada" />;

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

// ══════════════════════════════════════════════════════════════════════════════
// TAB SANCIONES
// ══════════════════════════════════════════════════════════════════════════════
function TabSanciones({ zonaRef, ligaId, clubes, categorias }) {
  const susCol = collection(zonaRef, "suspensiones");
  const [suspensiones, setSuspensiones] = useState([]);
  const [cargando,     setCargando]     = useState(true);
  const [modal,        setModal]        = useState(false);
  const [pendingDel,   setPendingDel]   = useState(null);

  async function obtenerJornadaActual() {
    if (categorias.length === 0) return 0;
    const maxPorCat = await Promise.all(
      categorias.map(cat =>
        getDocs(collection(doc(collection(zonaRef, "categorias"), cat.docId), "partidos"))
          .then(snap =>
            snap.docs
              .map(d => d.data())
              .filter(p => p.jugado)
              .reduce((m, p) => Math.max(m, p.jornada || 0), 0)
          )
          .catch(() => 0)
      )
    );
    return Math.max(0, ...maxPorCat);
  }

  async function cargar() {
    setCargando(true);
    try {
      const [snap, jornadaActual] = await Promise.all([
        getDocs(susCol),
        obtenerJornadaActual(),
      ]);

      let items = snap.docs.map(d => ({ docId: d.id, ...d.data() }));

      // Auto-marcar cumplidas cuando la fecha en que vuelve ya pasó
      const aAutoMarcar = items.filter(
        s => !s.cumplida && jornadaActual > 0 && s.fechaVuelve <= jornadaActual
      );
      if (aAutoMarcar.length > 0) {
        await Promise.all(
          aAutoMarcar.map(s =>
            updateDoc(doc(susCol, s.docId), { cumplida: true, modoCumplida: "auto" })
          )
        );
        items = items.map(s =>
          aAutoMarcar.find(a => a.docId === s.docId)
            ? { ...s, cumplida: true, modoCumplida: "auto" }
            : s
        );
      }

      items.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
      setSuspensiones(items);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function marcarCumplida(sus) {
    await updateDoc(doc(susCol, sus.docId), { cumplida: true, modoCumplida: "manual" });
    setSuspensiones(prev =>
      prev.map(s => s.docId === sus.docId ? { ...s, cumplida: true, modoCumplida: "manual" } : s)
    );
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(susCol, pendingDel.docId));
    setPendingDel(null);
    setSuspensiones(prev => prev.filter(s => s.docId !== pendingDel.docId));
  }

  const activos      = suspensiones.filter(s => !s.cumplida);
  const cumplAuto    = suspensiones.filter(s => s.cumplida && s.modoCumplida === "auto");
  const cumplManual  = suspensiones.filter(s => s.cumplida && s.modoCumplida !== "auto");

  function ChipsSancion({ s }) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
          Sancionado F{s.fechaSancion}
        </span>
        <span style={{ fontSize: 11, background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
          {s.cantidadFechas} fecha{s.cantidadFechas !== 1 ? "s" : ""}
        </span>
        <span style={{ fontSize: 11, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>
          Vuelve F{s.fechaVuelve}
        </span>
      </div>
    );
  }

  function FilaHistorial({ s, badge, badgeBg, badgeColor }) {
    return (
      <Card key={s.docId} style={{ opacity: 0.75 }}>
        <div style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{s.jugadorNombre}</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
              {s.clubNombre}{s.categoriaNombre ? ` · ${s.categoriaNombre}` : ""}
              {" · "}F{s.fechaSancion} · {s.cantidadFechas} fecha{s.cantidadFechas !== 1 ? "s" : ""}
            </div>
          </div>
          <span style={{ fontSize: 11, background: badgeBg, color: badgeColor, padding: "2px 8px", borderRadius: 20, fontWeight: 600, flexShrink: 0 }}>{badge}</span>
          <BtnDel onClick={() => setPendingDel(s)} />
        </div>
      </Card>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BtnAccion onClick={() => setModal(true)}>+ Sanción</BtnAccion>
      </div>

      {cargando ? <Spinner /> : (
        <>
          {/* ── Activos ── */}
          <SeccionLabel>Activos</SeccionLabel>
          {activos.length === 0
            ? <EmptyState emoji="✅" titulo="Sin sancionados activos" descripcion="No hay jugadores con suspensiones pendientes" />
            : activos.map(s => (
              <Card key={s.docId}>
                <div style={{ padding: "13px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{s.jugadorNombre}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {s.clubNombre}{s.categoriaNombre ? ` · ${s.categoriaNombre}` : ""}
                      </div>
                      <ChipsSancion s={s} />
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => marcarCumplida(s)}
                        style={{ background: "#dcfce7", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#166534" }}>
                        ✓ Cumplida
                      </button>
                      <BtnDel onClick={() => setPendingDel(s)} />
                    </div>
                  </div>
                </div>
              </Card>
            ))
          }

          {/* ── Cumplidas automáticamente ── */}
          {cumplAuto.length > 0 && (
            <>
              <SeccionLabel>Cumplidas automáticamente</SeccionLabel>
              {cumplAuto.map(s => (
                <FilaHistorial key={s.docId} s={s} badge="Auto ✓" badgeBg="#e0f2fe" badgeColor="#0369a1" />
              ))}
            </>
          )}

          {/* ── Cumplidas manualmente ── */}
          {cumplManual.length > 0 && (
            <>
              <SeccionLabel>Cumplidas manualmente</SeccionLabel>
              {cumplManual.map(s => (
                <FilaHistorial key={s.docId} s={s} badge="Manual ✓" badgeBg="#f0fdf4" badgeColor="#166534" />
              ))}
            </>
          )}
        </>
      )}

      {modal && (
        <ModalNuevaSancion
          zonaRef={zonaRef}
          ligaId={ligaId}
          clubes={clubes}
          categorias={categorias}
          onGuardar={() => { setModal(false); cargar(); }}
          onClose={() => setModal(false)}
        />
      )}
      {pendingDel && (
        <ConfirmModal
          mensaje={`Eliminás la sanción de "${pendingDel.jugadorNombre}".`}
          onConfirmar={confirmarEliminar}
          onCancelar={() => setPendingDel(null)}
        />
      )}
    </>
  );
}

function ModalNuevaSancion({ zonaRef, ligaId, clubes, categorias, onGuardar, onClose }) {
  const [dni,           setDni]           = useState("");
  const [jugador,       setJugador]       = useState(null);
  const [buscando,      setBuscando]      = useState(false);
  const [errBusqueda,   setErrBusqueda]   = useState("");
  const [cantFechas,    setCantFechas]    = useState("1");
  const [fechaSancion,  setFechaSancion]  = useState("1");
  const [guardando,     setGuardando]     = useState(false);

  async function buscarJugador() {
    const dniBuscar = dni.trim();
    if (!dniBuscar) return;
    setBuscando(true);
    setErrBusqueda("");
    setJugador(null);
    try {
      const q    = query(collection(db, "ligas", ligaId, "jugadores"), where("dni", "==", dniBuscar));
      const snap = await getDocs(q);
      if (snap.empty) {
        setErrBusqueda("No se encontró ningún jugador con ese DNI");
      } else {
        setJugador({ docId: snap.docs[0].id, ...snap.docs[0].data() });
      }
    } catch (e) {
      setErrBusqueda("Error al buscar: " + e.message);
    } finally {
      setBuscando(false);
    }
  }

  async function guardar() {
    if (!jugador) return;
    setGuardando(true);
    try {
      const club = clubes.find(c => c.docId === jugador.clubId);
      const cat  = categorias.find(c => c.docId === jugador.categoriaId);
      const cant = Math.max(1, parseInt(cantFechas) || 1);
      const fsan = Math.max(1, parseInt(fechaSancion) || 1);
      await addDoc(collection(zonaRef, "suspensiones"), {
        jugadorDocId:   jugador.docId,
        jugadorDni:     dni.trim(),
        jugadorNombre:  `${jugador.apellido}, ${jugador.nombre}`,
        clubId:         jugador.clubId   || "",
        clubNombre:     club?.nombre     || "",
        categoriaId:    jugador.categoriaId || "",
        categoriaNombre: cat?.nombre    || "",
        cantidadFechas: cant,
        fechaSancion:   fsan,
        fechaVuelve:    fsan + cant,
        cumplida:       false,
        creadoEn:       Date.now(),
      });
      onGuardar();
    } catch (e) {
      setErrBusqueda("Error al guardar: " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  const fechaVuelvePreview = (Math.max(1, parseInt(fechaSancion) || 1)) + (Math.max(1, parseInt(cantFechas) || 1));

  return (
    <Modal titulo="Nueva Sanción" onClose={onClose}>
      <Campo label="DNI del jugador">
        <div style={{ display: "flex", gap: 8 }}>
          <InputAdmin
            placeholder="12345678"
            value={dni}
            onChange={e => { setDni(e.target.value); setJugador(null); setErrBusqueda(""); }}
            onKeyDown={e => e.key === "Enter" && buscarJugador()}
            style={{ flex: 1 }}
          />
          <button
            onClick={buscarJugador}
            disabled={buscando || !dni.trim()}
            style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "0 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, flexShrink: 0, opacity: buscando || !dni.trim() ? 0.5 : 1 }}>
            {buscando ? "..." : "Buscar"}
          </button>
        </div>
      </Campo>

      {errBusqueda && <div style={{ color: "#dc2626", fontSize: 13 }}>{errBusqueda}</div>}

      {jugador && (
        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{jugador.apellido}, {jugador.nombre}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {clubes.find(c => c.docId === jugador.clubId)?.nombre || "—"}
            {categorias.find(c => c.docId === jugador.categoriaId)?.nombre ? ` · ${categorias.find(c => c.docId === jugador.categoriaId)?.nombre}` : ""}
          </div>
        </div>
      )}

      <Campo label="Fecha del fixture en que fue sancionado">
        <InputAdmin
          type="number" min="1"
          value={fechaSancion}
          onChange={e => setFechaSancion(e.target.value)}
        />
      </Campo>

      <Campo label="Fechas de suspensión">
        <InputAdmin
          type="number" min="1"
          value={cantFechas}
          onChange={e => setCantFechas(e.target.value)}
        />
      </Campo>

      <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#166534", fontWeight: 600 }}>
        Vuelve a jugar en la fecha {fechaVuelvePreview}
      </div>

      <BtnPrimary onClick={guardar} disabled={!jugador || guardando} fullWidth>
        {guardando ? "Guardando..." : "Guardar sanción"}
      </BtnPrimary>
    </Modal>
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
