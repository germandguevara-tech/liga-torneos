import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { HeaderAdmin, Card, Modal, ConfirmModal, Switch, BtnPrimary, Campo, InputAdmin, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";
import FixtureAdmin    from "./FixtureAdmin";
import FixtureCopaClub from "./FixtureCopaClub";
import BracketAdmin   from "./BracketAdmin";

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
  // Persiste el estado publicado entre cambios de pestaña (evita que el fixture se resetee)
  const [zonaPublicada, setZonaPublicada] = useState(zona.publicado ?? false);

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
  const [grupos,                 setGrupos]                 = useState(zona.grupos || []);
  const [gruposFixtureConf,      setGruposFixtureConf]      = useState(zona.gruposFixtureConf || {});

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
    const updates = {
      categoriasParticipantes: catParticipantes,
      categoriasVisibilidad:   catVisibilidad,
    };
    if (config.tipo === "copa_club") {
      updates.grupos = grupos;
    } else {
      updates.clubesParticipantes = participantesIds;
    }
    await updateDoc(zonaRef, updates);
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
  const clubesZona = config.tipo === "copa_club"
    ? clubes.filter(c => grupos.some(g => (g.clubes || []).includes(c.docId)))
    : (participantesIds.length ? clubes.filter(c => participantesIds.includes(c.docId)) : clubes);

  // Categorías de esta zona (filtradas + visibilidad por zona aplicada)
  const categoriasZona = (catParticipantes.length ? categorias.filter(c => catParticipantes.includes(c.docId)) : categorias)
    .map(c => ({ ...c, visible: catParticipantes.length ? (catVisibilidad[c.docId] ?? c.visible) : c.visible }));

  const tieneBracket = config.tipo === "copa" || config.tipo === "copa_cat" || config.tipo === "elim_equipos";
  const tieneFixture = config.tipo === "liga" || config.tipo === "copa_club" || config.tipo === "copa";
  const tieneTablas  = config.tipo === "liga" || config.tipo === "copa_club" || config.tipo === "copa";
  const tienePlayoff = config.tipo === "copa_club" || config.tipo === "elim_club";

  const TABS = [
    { id: "config",        label: "Config"        },
    ...(config.tipoParticipantes === "clubes" ? [{ id: "participantes", label: "Participantes" }] : []),
    ...(tieneFixture ? [{ id: "fixture",  label: "Fixture"  }] : []),
    ...(tieneTablas  ? [{ id: "tablas",   label: "Tablas"   }] : []),
    ...(tieneBracket ? [{ id: "bracket",  label: "Bracket"  }] : []),
    ...(tienePlayoff ? [{ id: "playoff",  label: "Play Off" }] : []),
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
            publicado={zonaPublicada}
          />
        )}
        {tab === "participantes" && config.tipo === "copa_club" && (
          <TabParticipantesCopaClub
            clubes={clubes}
            categorias={categorias}
            cargando={cargandoClubes || cargandoCats}
            grupos={grupos}
            setGrupos={setGrupos}
            catParticipantes={catParticipantes}
            setCatParticipantes={setCatParticipantes}
            catVisibilidad={catVisibilidad}
            setCatVisibilidad={setCatVisibilidad}
            guardando={guardandoParticipantes}
            onGuardar={guardarParticipantes}
            publicado={zona.publicado ?? false}
          />
        )}
        {tab === "participantes" && config.tipo !== "copa_club" && (
          <TabParticipantes
            clubes={clubes} categorias={categorias} cargando={cargandoClubes || cargandoCats}
            participantesIds={participantesIds} setParticipantesIds={setParticipantesIds}
            catParticipantes={catParticipantes} setCatParticipantes={setCatParticipantes}
            catVisibilidad={catVisibilidad} setCatVisibilidad={setCatVisibilidad}
            guardando={guardandoParticipantes} onGuardar={guardarParticipantes}
            publicado={zona.publicado ?? false}
          />
        )}
        {tab === "fixture" && config.tipo === "copa_club" && (
          <FixtureCopaClub
            zonaRef={zonaRef} zona={zona} ligaId={liga.docId}
            grupos={grupos} clubes={clubes} categorias={categoriasZona}
            gruposFixtureConf={gruposFixtureConf} setGruposFixtureConf={setGruposFixtureConf}
            publicado={zonaPublicada}
            onPublicado={() => setZonaPublicada(true)}
            onEditarFixture={() => setZonaPublicada(false)}
          />
        )}
        {tab === "fixture" && config.tipo !== "copa_club" && tieneFixture && (
          <FixtureAdmin
            zonaRef={zonaRef} zona={zona} ligaId={liga.docId}
            clubes={clubesZona} categorias={categoriasZona}
            publicado={zonaPublicada}
            onPublicado={() => setZonaPublicada(true)}
            onEditarFixture={() => setZonaPublicada(false)}
          />
        )}
        {tab === "tablas" && tieneTablas && (
          <TabTablas
            zonaRef={zonaRef} zona={zona} grupos={grupos}
            clubes={clubesZona} categorias={categoriasZona}
            tablaConf={tablaConf} setTablaConf={setTablaConf}
            tablaAcumConf={tablaAcumConf} setTablaAcumConf={setTablaAcumConf}
            compRef={compRef}
          />
        )}
        {tab === "bracket" && (
          <BracketAdmin zonaRef={zonaRef} zona={zona} clubes={clubesZona} categorias={categoriasZona} />
        )}
        {tab === "playoff" && tienePlayoff && (
          <TabPlayOff zonaRef={zonaRef} clubes={clubesZona} categorias={categoriasZona} tipoInicial={zona.tipoPlayoff || "club"} puntosPorVictoria={config.puntosPorVictoria} />
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
function derivarTipo(formato, participantes) {
  if (formato === "copa" && participantes === "clubes") return "copa_club";
  if (formato === "copa" && participantes === "equipos") return "copa";
  if (formato === "eliminatorias" && participantes === "clubes") return "elim_club";
  if (formato === "eliminatorias" && participantes === "equipos") return "elim_equipos";
  return "liga";
}
const tipoToFormato       = { copa_club: "copa", copa: "copa", copa_cat: "eliminatorias", elim_equipos: "eliminatorias", liga: "liga", elim_club: "eliminatorias" };
const tipoToParticipantes = { copa_club: "clubes", copa: "equipos", copa_cat: "clubes", elim_equipos: "equipos", liga: "clubes", elim_club: "clubes" };

function TabConfig({ config, setConfig, tablaConf, setTablaConf, tablaAcumConf, setTablaAcumConf, zonas, zonaId, categorias, guardar, guardando, moverCriterio, publicado }) {
  const catsSelIds = tablaConf.tablaGeneralCategorias || [];
  return (
    <>
      <SeccionLabel>Tipo de torneo</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {publicado ? (
            <>
              <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#92400e", fontWeight: 600, marginBottom: 2 }}>
                🔒 Torneo publicado — formato y participantes bloqueados
              </div>
              <Campo label="Formato">
                <div style={{ padding: "9px 12px", fontSize: 13, color: "#374151", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  {tipoToFormato[config.tipo] === "copa" ? "Copa" : tipoToFormato[config.tipo] === "eliminatorias" ? "Eliminatorias" : "Liga"}
                </div>
              </Campo>
              <Campo label="Participantes">
                <div style={{ padding: "9px 12px", fontSize: 13, color: "#374151", background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  {(config.tipoParticipantes || tipoToParticipantes[config.tipo]) === "clubes" ? "Clubes con categorías" : "Equipos independientes"}
                </div>
              </Campo>
            </>
          ) : (
            <>
              <Campo label="Formato">
                <SelectAdmin value={tipoToFormato[config.tipo] || "liga"} onChange={e => {
                  const fmt = e.target.value;
                  const parts = tipoToParticipantes[config.tipo] || "clubes";
                  const nuevoTipo = derivarTipo(fmt, parts);
                  setConfig(c => ({ ...c, tipo: nuevoTipo, tipoParticipantes: nuevoTipo === "copa" || nuevoTipo === "elim_equipos" ? "equipos" : "clubes" }));
                }}>
                  <option value="liga">Liga</option>
                  <option value="copa">Copa</option>
                  <option value="eliminatorias">Eliminatorias</option>
                </SelectAdmin>
              </Campo>
              <Campo label="Participantes">
                <SelectAdmin value={config.tipoParticipantes || "clubes"} onChange={e => {
                  const parts = e.target.value;
                  const fmt = tipoToFormato[config.tipo] || "liga";
                  const nuevoTipo = derivarTipo(fmt, parts);
                  setConfig(c => ({ ...c, tipo: nuevoTipo, tipoParticipantes: parts }));
                }}>
                  <option value="clubes">Clubes con categorías</option>
                  <option value="equipos">Equipos independientes</option>
                </SelectAdmin>
              </Campo>
            </>
          )}
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

      {config.tipo !== "copa_club" && (
        <>
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
          🔒 Torneo publicado — clubes y categorías bloqueados. Solo podés cambiar la visibilidad.
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
          const visible = catVisibilidad[cat.docId] ?? (cat.visible ?? true);
          return (
            <Card key={cat.docId}>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat.nombre}</div>
                <span style={{ fontSize: 11, color: visible ? "#166534" : "#6b7280" }}>{visible ? "Visible" : "Oculta"}</span>
                <Switch value={visible} onChange={() => setCatVisibilidad(prev => ({ ...prev, [cat.docId]: !visible }))} />
              </div>
            </Card>
          );
        })}
        <BtnPrimary onClick={onGuardar} disabled={guardando} fullWidth>
          {guardando ? "Guardando..." : "Guardar visibilidad"}
        </BtnPrimary>
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
            const visible = catVisibilidad[cat.docId] ?? (cat.visible ?? true);
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
// TAB PARTICIPANTES – COPA POR CLUB
// ══════════════════════════════════════════════════════════════════════════════
function TabParticipantesCopaClub({ clubes, categorias, cargando, grupos, setGrupos, catParticipantes, setCatParticipantes, catVisibilidad, setCatVisibilidad, guardando, onGuardar, publicado }) {
  const [catSel, setCatSel] = useState("");

  if (cargando) return <Spinner />;

  if (publicado) {
    const catsMostrar = catParticipantes.length
      ? catParticipantes.map(id => categorias.find(c => c.docId === id)).filter(Boolean)
      : categorias;
    return (
      <>
        <div style={{ background: "#fef3c7", border: "1.5px solid #fcd34d", borderRadius: 12, padding: "11px 16px", fontSize: 13, color: "#92400e", fontWeight: 600 }}>
          🔒 Torneo publicado — grupos y clubes bloqueados. Solo podés cambiar la visibilidad de categorías.
        </div>
        {grupos.map(g => (
          <div key={g.id}>
            <SeccionLabel>{g.nombre}</SeccionLabel>
            {(g.clubes || []).map(clubId => {
              const club = clubes.find(c => c.docId === clubId);
              if (!club) return null;
              return (
                <Card key={clubId}>
                  <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <LogoClub club={club} size={34} />
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{club.nombre}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}
        <SeccionLabel>Categorías participantes</SeccionLabel>
        {catsMostrar.map(cat => {
          const visible = catVisibilidad[cat.docId] ?? (cat.visible ?? true);
          return (
            <Card key={cat.docId}>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#111827" }}>{cat.nombre}</div>
                <span style={{ fontSize: 11, color: visible ? "#166534" : "#6b7280" }}>{visible ? "Visible" : "Oculta"}</span>
                <Switch value={visible} onChange={() => setCatVisibilidad(prev => ({ ...prev, [cat.docId]: !visible }))} />
              </div>
            </Card>
          );
        })}
        <BtnPrimary onClick={onGuardar} disabled={guardando} fullWidth>
          {guardando ? "Guardando..." : "Guardar visibilidad"}
        </BtnPrimary>
      </>
    );
  }

  // Todos los clubes ya asignados a algún grupo
  const clubsEnGrupos = grupos.flatMap(g => g.clubes || []);

  function agregarGrupo() {
    const n = grupos.length + 1;
    setGrupos(prev => [...prev, { id: Date.now().toString(), nombre: `Grupo ${n}`, clubes: [] }]);
  }
  function eliminarGrupo(grupoId) {
    setGrupos(prev => prev.filter(g => g.id !== grupoId));
  }
  function renombrarGrupo(grupoId, nombre) {
    setGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, nombre } : g));
  }
  function agregarClubAGrupo(grupoId, clubId) {
    setGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, clubes: [...(g.clubes || []), clubId] } : g));
  }
  function quitarClubDeGrupo(grupoId, clubId) {
    setGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, clubes: (g.clubes || []).filter(id => id !== clubId) } : g));
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

  const catsDisponibles = categorias.filter(c => !catParticipantes.includes(c.docId));
  const catsAgregadas   = catParticipantes.map(id => categorias.find(c => c.docId === id)).filter(Boolean);
  const nCats = catParticipantes.length || categorias.length;

  return (
    <>
      {/* Grupos */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SeccionLabel>Grupos</SeccionLabel>
        <button onClick={agregarGrupo}
          style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          + Agregar grupo
        </button>
      </div>

      {grupos.length === 0 && (
        <EmptyState emoji="🏆" titulo="Sin grupos" descripcion="Agregá grupos para organizar los equipos de la copa" />
      )}

      {grupos.map(grupo => {
        const clubsEnOtros     = grupos.filter(g => g.id !== grupo.id).flatMap(g => g.clubes || []);
        const clubsDisponibles = clubes.filter(c => !clubsEnOtros.includes(c.docId) && !(grupo.clubes || []).includes(c.docId));
        return (
          <GrupoCard
            key={grupo.id}
            grupo={grupo}
            clubes={clubes}
            clubsDisponibles={clubsDisponibles}
            onRenombrar={nombre => renombrarGrupo(grupo.id, nombre)}
            onAgregarClub={clubId => agregarClubAGrupo(grupo.id, clubId)}
            onQuitarClub={clubId => quitarClubDeGrupo(grupo.id, clubId)}
            onEliminar={() => eliminarGrupo(grupo.id)}
          />
        );
      })}

      {/* Categorías */}
      <SeccionLabel>Categorías que participan</SeccionLabel>
      {categorias.length === 0 ? (
        <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Agregá categorías en la competencia primero" />
      ) : (
        <>
          <Card>
            <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
              <select value={catSel} onChange={e => setCatSel(e.target.value)}
                style={{ flex: 1, border: "1px solid #d1fae5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: catSel ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}>
                <option value="">— Seleccioná una categoría —</option>
                {catsDisponibles.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
              </select>
              <button onClick={agregarCat} disabled={!catSel}
                style={{ background: catSel ? "#1a3a2a" : "#d1fae5", color: catSel ? "#4ade80" : "#9ca3af", border: "none", borderRadius: 10, padding: "9px 16px", cursor: catSel ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
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
            const visible = catVisibilidad[cat.docId] ?? (cat.visible ?? true);
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
        {guardando ? "Guardando..." : `Guardar · ${grupos.length} grupo${grupos.length !== 1 ? "s" : ""} · ${clubsEnGrupos.length} club${clubsEnGrupos.length !== 1 ? "es" : ""} · ${nCats} categoría${nCats !== 1 ? "s" : ""}`}
      </BtnPrimary>
    </>
  );
}

function GrupoCard({ grupo, clubes, clubsDisponibles, onRenombrar, onAgregarClub, onQuitarClub, onEliminar }) {
  const [clubSel,    setClubSel]    = useState("");
  const [editNombre, setEditNombre] = useState(false);
  const [nombre,     setNombre]     = useState(grupo.nombre);

  return (
    <Card>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Encabezado */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {editNombre ? (
            <input
              autoFocus
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              onBlur={() => { onRenombrar(nombre); setEditNombre(false); }}
              onKeyDown={e => { if (e.key === "Enter") { onRenombrar(nombre); setEditNombre(false); } }}
              style={{ flex: 1, border: "1px solid #d1fae5", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontWeight: 700, outline: "none", background: "#f0fdf4" }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#111827" }}>{grupo.nombre}</span>
          )}
          <button onClick={() => setEditNombre(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280", padding: "2px 4px" }} title="Renombrar">✏️</button>
          <button onClick={onEliminar}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#dc2626", padding: "2px 4px" }} title="Eliminar grupo">🗑</button>
        </div>

        {/* Clubes del grupo */}
        {(grupo.clubes || []).map(clubId => {
          const club = clubes.find(c => c.docId === clubId);
          if (!club) return null;
          return (
            <div key={clubId} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
              <LogoClub club={club} size={28} />
              <span style={{ flex: 1, fontSize: 13, color: "#111827", fontWeight: 500 }}>{club.nombre}</span>
              <button onClick={() => onQuitarClub(clubId)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 16, lineHeight: 1, padding: "2px 4px" }}>×</button>
            </div>
          );
        })}

        {/* Selector para agregar club */}
        <div style={{ display: "flex", gap: 6 }}>
          <select value={clubSel} onChange={e => setClubSel(e.target.value)}
            style={{ flex: 1, border: "1px solid #d1fae5", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: clubSel ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}>
            <option value="">— Agregar club —</option>
            {clubsDisponibles.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
          </select>
          <button
            onClick={() => { if (clubSel) { onAgregarClub(clubSel); setClubSel(""); } }}
            disabled={!clubSel}
            style={{ background: clubSel ? "#1a3a2a" : "#d1fae5", color: clubSel ? "#4ade80" : "#9ca3af", border: "none", borderRadius: 8, padding: "7px 12px", cursor: clubSel ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700 }}>
            +
          </button>
        </div>
      </div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB TABLAS – COPA POR CLUB: una tabla por grupo para cada categoría
// ══════════════════════════════════════════════════════════════════════════════
function TabTablasCopaClub({ zonaRef, zona, grupos, clubes, categorias, tablaConf }) {
  const mostrarGeneral = tablaConf?.tablaGeneralActiva;
  const opciones = [
    ...categorias.map(c => ({ id: c.docId, tipo: "cat", label: c.nombre })),
    ...(mostrarGeneral ? [{ id: "__general__", tipo: "general", label: "Tabla General" }] : []),
  ];
  const [selId,    setSelId]    = useState(opciones[0]?.id || "");
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(false);

  const pV    = zona.puntosPorVictoria ?? 3;
  const pE    = zona.puntosPorEmpate ?? 1;
  const pVGen = tablaConf?.tablaGeneralPuntosVictoria ?? 3;
  const pEact = selId === "__general__" ? pE : pE;
  const pVact = selId === "__general__" ? pVGen : pV;

  useEffect(() => {
    if (opciones.length > 0 && !opciones.find(o => o.id === selId)) setSelId(opciones[0].id);
  }, [opciones.length]);

  useEffect(() => { if (selId) cargarDatos(); }, [selId]);

  async function cargarDatos() {
    setCargando(true);
    try {
      if (selId === "__general__") {
        const catIds = tablaConf?.tablaGeneralCategorias || [];
        const results = await Promise.all(
          catIds.map(catId =>
            getDocs(collection(doc(collection(zonaRef, "categorias"), catId), "partidos"))
              .then(snap => snap.docs.map(d => ({ docId: d.id, ...d.data() })))
          )
        );
        setPartidos(results.flat());
      } else {
        const snap = await getDocs(collection(doc(collection(zonaRef, "categorias"), selId), "partidos"));
        setPartidos(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
      }
    } finally {
      setCargando(false);
    }
  }

  function computarTablaGrupo(grupoClubs, grupoPartidos) {
    const m = {};
    grupoClubs.forEach(c => { m[c.docId] = { ...c, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0, descuento: 0 }; });
    grupoPartidos
      .filter(p => !p.esLibre && p.jugado && p.golesLocal != null && p.golesVisitante != null)
      .forEach(p => {
        const loc = m[p.localId], vis = m[p.visitanteId];
        if (!loc || !vis) return;
        loc.pj++; vis.pj++;
        loc.gf += p.golesLocal; loc.gc += p.golesVisitante;
        vis.gf += p.golesVisitante; vis.gc += p.golesLocal;
        if      (p.golesLocal > p.golesVisitante) { loc.g++; vis.p++; loc.pts += pVact; }
        else if (p.golesLocal < p.golesVisitante) { vis.g++; loc.p++; vis.pts += pVact; }
        else                                       { loc.e++; vis.e++; loc.pts += pEact; vis.pts += pEact; }
      });
    return Object.values(m).sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
  }

  if (grupos.length === 0) return <EmptyState emoji="📋" titulo="Sin grupos" descripcion="Definí los grupos en la pestaña Participantes" />;
  if (opciones.length === 0) return <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Agregá categorías en la competencia" />;

  return (
    <>
      {opciones.length > 1 && (
        <Campo label="Ver tabla de">
          <SelectAdmin value={selId} onChange={e => setSelId(e.target.value)}>
            {opciones.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </SelectAdmin>
        </Campo>
      )}

      {cargando ? <Spinner /> : (
        grupos.map(grupo => {
          const grupoClubs    = (grupo.clubes || []).map(id => clubes.find(c => c.docId === id)).filter(Boolean);
          const grupoPartidos = partidos.filter(p => p.grupoId === grupo.id);
          const tabla         = computarTablaGrupo(grupoClubs, grupoPartidos);
          return (
            <div key={grupo.id}>
              <SeccionLabel>{grupo.nombre}</SeccionLabel>
              <TablaPosicionesTablas tabla={tabla} />
            </div>
          );
        })
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB TABLAS
// ══════════════════════════════════════════════════════════════════════════════
function TabTablas({ zonaRef, zona, grupos, clubes, categorias, tablaConf, setTablaConf, tablaAcumConf, setTablaAcumConf, compRef }) {
  // Copa por club: tablas separadas por grupo para cada categoría
  if (zona.tipo === "copa_club") {
    return (
      <TabTablasCopaClub
        zonaRef={zonaRef} zona={zona} grupos={grupos}
        clubes={clubes} categorias={categorias} tablaConf={tablaConf}
      />
    );
  }

  const opciones = [
    ...categorias.map(c => ({ id: c.docId, label: c.nombre, tipo: "cat" })),
    ...(tablaConf.tablaGeneralActiva    ? [{ id: "__general__",  label: "Tabla General",   tipo: "general"   }] : []),
    ...(tablaAcumConf?.tablaAcumuladaActiva ? [{ id: "__acumulada__", label: "Tabla Acumulada", tipo: "acumulada" }] : []),
  ];

  const [selId,             setSelId]             = useState(opciones[0]?.id || "");
  const [partidos,          setPartidos]          = useState([]);
  const [sanciones,         setSanciones]         = useState([]);
  const [cargando,          setCargando]          = useState(false);
  const [modalSancion,      setModalSancion]      = useState(null); // null | "nueva" | index (editar)
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
    const nuevas = typeof modalSancion === "number"
      ? sanciones.map((s, i) => i === modalSancion ? san : s)
      : [...sanciones, san];
    await persistirSanciones(nuevas);
    setSanciones(nuevas);
    setModalSancion(null);
  }

  async function persistirSanciones(nuevas) {
    if (sel.tipo === "general") {
      setTablaConf(c => ({ ...c, tablaGeneralSanciones: nuevas }));
      await updateDoc(zonaRef, { tablaGeneralSanciones: nuevas });
    } else if (sel.tipo === "acumulada") {
      setTablaAcumConf(c => ({ ...c, tablaAcumuladaSanciones: nuevas }));
      await updateDoc(zonaRef, { tablaAcumuladaSanciones: nuevas });
    } else {
      await updateDoc(doc(collection(zonaRef, "categorias"), selId), { sanciones: nuevas });
    }
  }

  async function eliminarSancion() {
    const nuevas = sanciones.filter((_, i) => i !== pendingDelSancion);
    await persistirSanciones(nuevas);
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
            <SeccionLabel>Descuentos de puntos</SeccionLabel>
            <button onClick={() => setModalSancion("nueva")}
              style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 6, color: "#dc2626", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "3px 8px" }}>
              + Agregar
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
                    <button onClick={() => setModalSancion(i)}
                      style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>✏️</button>
                    <button onClick={() => setPendingDelSancion(i)}
                      style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {modalSancion !== null && (
        <SancionModal
          clubes={clubes}
          sancionInicial={typeof modalSancion === "number" ? sanciones[modalSancion] : undefined}
          onGuardar={guardarSancion}
          onClose={() => setModalSancion(null)}
        />
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
function SancionModal({ clubes, sancionInicial, onGuardar, onClose }) {
  const [clubId, setClubId] = useState(sancionInicial?.clubId || clubes[0]?.docId || "");
  const [puntos, setPuntos] = useState(sancionInicial ? String(sancionInicial.puntos) : "3");
  const [motivo, setMotivo] = useState(sancionInicial?.motivo || "");
  const esEdicion = !!sancionInicial;
  return (
    <Modal titulo={esEdicion ? "Editar descuento" : "Descontar Puntos"} onClose={onClose}>
      <Campo label="Club">
        <SelectAdmin value={clubId} onChange={e => setClubId(e.target.value)} disabled={esEdicion}>
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
        {esEdicion ? "Guardar cambios" : "Aplicar sanción"}
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
  const [filtroClub,   setFiltroClub]   = useState("");
  const [filtroCat,    setFiltroCat]    = useState("");

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

  async function deshacerCumplida(sus) {
    await updateDoc(doc(susCol, sus.docId), { cumplida: false, modoCumplida: null });
    setSuspensiones(prev =>
      prev.map(s => s.docId === sus.docId ? { ...s, cumplida: false, modoCumplida: null } : s)
    );
  }

  async function confirmarEliminar() {
    await deleteDoc(doc(susCol, pendingDel.docId));
    setPendingDel(null);
    setSuspensiones(prev => prev.filter(s => s.docId !== pendingDel.docId));
  }

  function aplicarFiltros(lista) {
    return lista.filter(s =>
      (!filtroClub || s.clubId === filtroClub) &&
      (!filtroCat  || s.categoriaId === filtroCat)
    );
  }

  const activos      = aplicarFiltros(suspensiones.filter(s => !s.cumplida));
  const cumplAuto    = aplicarFiltros(suspensiones.filter(s => s.cumplida && s.modoCumplida === "auto"));
  const cumplManual  = aplicarFiltros(suspensiones.filter(s => s.cumplida && s.modoCumplida !== "auto"));

  const clubesConSancion = [...new Map(
    suspensiones.filter(s => s.clubId).map(s => [s.clubId, { id: s.clubId, nombre: s.clubNombre }])
  ).values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const catsConSancion = [...new Map(
    suspensiones.filter(s => s.categoriaId).map(s => [s.categoriaId, { id: s.categoriaId, nombre: s.categoriaNombre }])
  ).values()].sort((a, b) => a.nombre.localeCompare(b.nombre));

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
              {" · "}F{s.fechaSancion} · {s.cantidadFechas} fecha{s.cantidadFechas !== 1 ? "s" : ""} · Vuelve F{s.fechaVuelve}
            </div>
          </div>
          <span style={{ fontSize: 11, background: badgeBg, color: badgeColor, padding: "2px 8px", borderRadius: 20, fontWeight: 600, flexShrink: 0 }}>{badge}</span>
          <button
            onClick={() => deshacerCumplida(s)}
            title="Deshacer — volver a activa"
            style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, color: "#6b7280", cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "3px 8px", flexShrink: 0 }}>
            ↩ Deshacer
          </button>
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

      {!cargando && (clubesConSancion.length > 0 || catsConSancion.length > 0) && (
        <Card>
          <div style={{ padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {clubesConSancion.length > 0 && (
              <select value={filtroClub} onChange={e => setFiltroClub(e.target.value)}
                style={{ flex: 1, minWidth: 120, border: "1px solid #d1fae5", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: filtroClub ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}>
                <option value="">Todos los clubes</option>
                {clubesConSancion.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            {catsConSancion.length > 0 && (
              <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
                style={{ flex: 1, minWidth: 120, border: "1px solid #d1fae5", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: filtroCat ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}>
                <option value="">Todas las categorías</option>
                {catsConSancion.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
          </div>
        </Card>
      )}

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
        fechaVuelve:    fsan + cant + 1,
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

  const fechaVuelvePreview = (Math.max(1, parseInt(fechaSancion) || 1)) + (Math.max(1, parseInt(cantFechas) || 1)) + 1;

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

// ══════════════════════════════════════════════════════════════════════════════
// ── Play Off ─────────────────────────────────────────────────────────────────

const btnIconStylePO = { background: "none", border: "1px solid #dcfce7", borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 13, color: "#6b7280" };

function TabPlayOff({ zonaRef, clubes, categorias, tipoInicial, puntosPorVictoria }) {
  const [tipoPlayoff, setTipoPlayoff] = useState(tipoInicial);
  const [catSelId, setCatSelId] = useState(categorias[0]?.docId || "");

  async function cambiarTipo(t) {
    setTipoPlayoff(t);
    await updateDoc(zonaRef, { tipoPlayoff: t });
  }

  const copasRefClub = collection(zonaRef, "playoffCopas");
  const copasRefCat  = catSelId
    ? collection(doc(collection(zonaRef, "playoffCategorias"), catSelId), "copas")
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ padding: "12px 16px" }}>
          <SeccionLabel>Tipo de Play Off</SeccionLabel>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {["club", "categoria"].map(t => (
              <button key={t} onClick={() => cambiarTipo(t)}
                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: tipoPlayoff === t ? "#1a3a2a" : "#f0fdf4",
                  color: tipoPlayoff === t ? "#fff" : "#1a3a2a" }}>
                {t === "club" ? "Club" : "Categoría"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {tipoPlayoff === "club" && (
        <GestorCopas key="club" copasRef={copasRefClub} zonaRef={zonaRef} clubes={clubes}
          categorias={categorias} puntosPorVictoria={puntosPorVictoria} />
      )}

      {tipoPlayoff === "categoria" && (
        categorias.length === 0 ? (
          <EmptyState icono="⚠️" texto="No hay categorías configuradas en Participantes." />
        ) : (
          <>
            <Card>
              <div style={{ padding: "12px 16px" }}>
                <SeccionLabel>Categoría</SeccionLabel>
                <SelectAdmin value={catSelId} onChange={e => setCatSelId(e.target.value)} style={{ marginTop: 8, width: "100%" }}>
                  {categorias.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
                </SelectAdmin>
              </div>
            </Card>
            {catSelId && copasRefCat && (
              <GestorCopas key={catSelId} copasRef={copasRefCat} zonaRef={zonaRef} clubes={clubes} />
            )}
          </>
        )
      )}
    </div>
  );
}

function GestorCopas({ copasRef, zonaRef, clubes, categorias, puntosPorVictoria }) {
  const [copas, setCopas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nuevaCopa, setNuevaCopa] = useState("");

  useEffect(() => { cargarCopas(); }, []);

  async function cargarCopas() {
    setCargando(true);
    try {
      const snap = await getDocs(copasRef);
      setCopas(snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)));
    } catch (_) { /* colección vacía o inexistente */ }
    setCargando(false);
  }

  async function crearCopa() {
    if (!nuevaCopa.trim()) return;
    setCreando(true);
    const ref = await addDoc(copasRef, { nombre: nuevaCopa.trim(), orden: copas.length });
    setCopas(prev => [...prev, { docId: ref.id, nombre: nuevaCopa.trim(), orden: copas.length }]);
    setNuevaCopa("");
    setCreando(false);
  }

  async function eliminarCopa(copaId) {
    try {
      const copaDocRef = doc(copasRef, copaId);
      const ramasSnap  = await getDocs(collection(copaDocRef, "ramas"));
      await Promise.all(ramasSnap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(copaDocRef);
      setCopas(prev => prev.filter(c => c.docId !== copaId));
    } catch (e) {
      console.error("Error eliminando copa:", e);
    }
  }

  if (cargando) return <Spinner />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {copas.map(copa => (
        <CopaPlayOffCard
          key={copa.docId}
          copa={copa}
          copaDocRef={doc(copasRef, copa.docId)}
          zonaRef={zonaRef}
          clubes={clubes}
          categorias={categorias}
          puntosPorVictoria={puntosPorVictoria}
          onEliminar={() => eliminarCopa(copa.docId)}
          onRenombrar={(nombre) => {
            updateDoc(doc(copasRef, copa.docId), { nombre });
            setCopas(prev => prev.map(c => c.docId === copa.docId ? { ...c, nombre } : c));
          }}
        />
      ))}
      <Card>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <SeccionLabel>Nueva Copa</SeccionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            <InputAdmin placeholder="Nombre (ej: Copa de Oro)" value={nuevaCopa}
              onChange={e => setNuevaCopa(e.target.value)}
              onKeyDown={e => e.key === "Enter" && crearCopa()} style={{ flex: 1 }} />
            <BtnPrimary onClick={crearCopa} disabled={creando || !nuevaCopa.trim()}>
              {creando ? "..." : "Crear"}
            </BtnPrimary>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CopaPlayOffCard({ copa, copaDocRef, zonaRef, clubes, categorias, puntosPorVictoria, onEliminar, onRenombrar }) {
  const [ramas, setRamas]               = useState([]);
  const [cargando, setCargando]         = useState(true);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre]             = useState(copa.nombre);
  const [nuevaRama, setNuevaRama]       = useState("");
  const [creandoRama, setCreandoRama]   = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const ramasRef = collection(copaDocRef, "ramas");

  useEffect(() => { cargarRamas(); }, []);

  async function cargarRamas() {
    const snap = await getDocs(ramasRef);
    setRamas(snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)));
    setCargando(false);
  }

  async function crearRama() {
    if (!nuevaRama.trim()) return;
    setCreandoRama(true);
    const ref = await addDoc(ramasRef, { nombre: nuevaRama.trim(), publicada: false, orden: ramas.length, partidos: [] });
    setRamas(prev => [...prev, { docId: ref.id, nombre: nuevaRama.trim(), publicada: false, orden: ramas.length, partidos: [] }]);
    setNuevaRama("");
    setCreandoRama(false);
  }

  async function eliminarRama(ramaId) {
    await deleteDoc(doc(ramasRef, ramaId));
    setRamas(prev => prev.filter(r => r.docId !== ramaId));
  }

  function guardarNombre() {
    if (nombre.trim()) onRenombrar(nombre.trim());
    setEditandoNombre(false);
  }

  return (
    <Card>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {editandoNombre ? (
            <>
              <InputAdmin value={nombre} onChange={e => setNombre(e.target.value)} style={{ flex: 1 }}
                onKeyDown={e => e.key === "Enter" && guardarNombre()} autoFocus />
              <BtnPrimary onClick={guardarNombre}>OK</BtnPrimary>
            </>
          ) : (
            <>
              <div style={{ flex: 1, fontWeight: 700, fontSize: 15, color: "#1a3a2a" }}>🏆 {copa.nombre}</div>
              <button onClick={() => setEditandoNombre(true)} style={btnIconStylePO}>✏️</button>
              <button onClick={() => setConfirmarEliminar(true)} style={btnIconStylePO}>🗑️</button>
            </>
          )}
        </div>

        {/* Ramas */}
        {cargando ? <Spinner /> : (
          <>
            {ramas.map(rama => (
              <RamaPlayOffCard
                key={rama.docId}
                rama={rama}
                ramaDocRef={doc(ramasRef, rama.docId)}
                zonaRef={zonaRef}
                clubes={clubes}
                categorias={categorias}
                puntosPorVictoria={puntosPorVictoria}
                onEliminar={() => eliminarRama(rama.docId)}
                onActualizar={(data) => setRamas(prev => prev.map(r => r.docId === rama.docId ? { ...r, ...data } : r))}
              />
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <InputAdmin placeholder="Nueva rama (ej: Final, Semifinal...)" value={nuevaRama}
                onChange={e => setNuevaRama(e.target.value)}
                onKeyDown={e => e.key === "Enter" && crearRama()} style={{ flex: 1 }} />
              <BtnPrimary onClick={crearRama} disabled={creandoRama || !nuevaRama.trim()}>
                {creandoRama ? "..." : "+ Rama"}
              </BtnPrimary>
            </div>
          </>
        )}
      </div>

      {confirmarEliminar && (
        <ConfirmModal
          mensaje={`¿Eliminar la copa "${copa.nombre}" y todas sus ramas?`}
          onConfirmar={() => { setConfirmarEliminar(false); onEliminar(); }}
          onCancelar={() => setConfirmarEliminar(false)}
        />
      )}
    </Card>
  );
}

function RamaPlayOffCard({ rama, ramaDocRef, zonaRef, clubes, categorias, puntosPorVictoria, onEliminar, onActualizar }) {
  const esModoClub = !!(categorias && categorias.length > 0);
  const tieneResultados = (rama.partidos || []).some(p =>
    esModoClub ? (p.ptsLocal != null || p.ptsLocalVuelta != null) : (p.jugado || p.jugadoVuelta)
  );
  const [modoEdicion, setModoEdicion]         = useState(!rama.publicada);
  const [partidos, setPartidos]               = useState(rama.partidos || []);
  const [guardando, setGuardando]             = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [modalResultado, setModalResultado]   = useState(null);
  const [formLocal, setFormLocal]             = useState("");
  const [formVisitante, setFormVisitante]     = useState("");
  const [formIdaVuelta, setFormIdaVuelta]     = useState(false);
  const [editandoNombre, setEditandoNombre]   = useState(false);
  const [nombreEdit, setNombreEdit]           = useState(rama.nombre);

  async function guardarYPublicar() {
    setGuardando(true);
    await updateDoc(ramaDocRef, { partidos, publicada: true });
    if (zonaRef) await updateDoc(zonaRef, { playoffPublicado: true });
    onActualizar({ partidos, publicada: true });
    setModoEdicion(false);
    setGuardando(false);
  }

  async function sincPartidos(nuevos) {
    setPartidos(nuevos);
    await updateDoc(ramaDocRef, { partidos: nuevos });
    onActualizar({ partidos: nuevos });
  }

  function agregarPartido() {
    if (!formLocal || !formVisitante || formLocal === formVisitante) return;
    const clubLocal     = clubes.find(c => c.docId === formLocal);
    const clubVisitante = clubes.find(c => c.docId === formVisitante);
    const nuevo = {
      id: crypto.randomUUID(),
      localId: formLocal,       localNombre: clubLocal?.nombre || "",
      visitanteId: formVisitante, visitanteNombre: clubVisitante?.nombre || "",
      idaVuelta: formIdaVuelta,
      jugado: false, golesLocal: null, golesVisitante: null,
      jugadoVuelta: false, golesLocalVuelta: null, golesVisitanteVuelta: null,
    };
    setPartidos(prev => [...prev, nuevo]);
    setFormLocal(""); setFormVisitante(""); setFormIdaVuelta(false);
  }

  // Desmarcar resultado modo Club
  async function desmarcarResultadoClub(partidoId, pierna) {
    const nuevos = partidos.map(p => {
      if (p.id !== partidoId) return p;
      return pierna === "ida"
        ? { ...p, jugado: false, catResultados: null, ptsLocal: null, ptsVis: null, gfLocal: null, gfVis: null }
        : { ...p, jugadoVuelta: false, catResultadosVuelta: null, ptsLocalVuelta: null, ptsVisVuelta: null, gfLocalVuelta: null, gfVisVuelta: null };
    });
    await sincPartidos(nuevos);
    setModalResultado(null);
  }

  // Desmarcar resultado modo Categoría
  async function desmarcarResultadoCat(partidoId, pierna) {
    const nuevos = partidos.map(p => {
      if (p.id !== partidoId) return p;
      return pierna === "ida"
        ? { ...p, jugado: false, golesLocal: null, golesVisitante: null, tienePenales: false, penalesLocal: null, penalesVisitante: null }
        : { ...p, jugadoVuelta: false, golesLocalVuelta: null, golesVisitanteVuelta: null, tienePenalesVuelta: false, penalesLocalVuelta: null, penalesVisitanteVuelta: null };
    });
    await sincPartidos(nuevos);
    setModalResultado(null);
  }

  // Guardar resultado modo Club (por categoría → calcular pts y GF totales)
  async function guardarResultadoClub(partidoId, pierna, catResultados) {
    let ptsLocal = 0, ptsVis = 0, gfLocal = 0, gfVis = 0;
    for (const cat of categorias) {
      const r = catResultados[cat.docId];
      if (!r) continue;
      const gL = r.golesLocal, gV = r.golesVisitante;
      gfLocal += gL; gfVis += gV;
      if (gL > gV) { ptsLocal += puntosPorVictoria; }
      else if (gL < gV) { ptsVis += puntosPorVictoria; }
      else if (r.tienePenales && r.penalesLocal != null && r.penalesVisitante != null) {
        if (r.penalesLocal > r.penalesVisitante) ptsLocal += puntosPorVictoria;
        else ptsVis += puntosPorVictoria;
      } else {
        ptsLocal += 1; ptsVis += 1;
      }
    }
    const nuevos = partidos.map(p => {
      if (p.id !== partidoId) return p;
      return pierna === "ida"
        ? { ...p, jugado: true, catResultados, ptsLocal, ptsVis, gfLocal, gfVis }
        : { ...p, jugadoVuelta: true, catResultadosVuelta: catResultados, ptsLocalVuelta: ptsLocal, ptsVisVuelta: ptsVis, gfLocalVuelta: gfLocal, gfVisVuelta: gfVis };
    });
    await sincPartidos(nuevos);
    setModalResultado(null);
  }

  // Guardar resultado modo Categoría (con penales opcionales)
  async function guardarResultadoCat(partidoId, pierna, gL, gV, tienePenales, penL, penV) {
    const nuevos = partidos.map(p => {
      if (p.id !== partidoId) return p;
      return pierna === "ida"
        ? { ...p, jugado: true, golesLocal: gL, golesVisitante: gV, tienePenales, penalesLocal: penL, penalesVisitante: penV }
        : { ...p, jugadoVuelta: true, golesLocalVuelta: gL, golesVisitanteVuelta: gV, tienePenalesVuelta: tienePenales, penalesLocalVuelta: penL, penalesVisitanteVuelta: penV };
    });
    await sincPartidos(nuevos);
    setModalResultado(null);
  }

  const clubLocalForm     = formLocal     ? clubes.find(c => c.docId === formLocal)     : null;
  const clubVisitanteForm = formVisitante ? clubes.find(c => c.docId === formVisitante) : null;
  // Clubs ya usados en otros partidos de esta rama (no se pueden repetir)
  const clubsUsados = useMemo(() => new Set(partidos.flatMap(p => [p.localId, p.visitanteId])), [partidos]);
  const clubsDisponibles = clubes.filter(c => !clubsUsados.has(c.docId));

  return (
    <div style={{ background: "#f9fafb", borderRadius: 10, border: "1px solid #dcfce7", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {editandoNombre ? (
          <input
            value={nombreEdit}
            onChange={e => setNombreEdit(e.target.value)}
            onBlur={async () => {
              const nuevo = nombreEdit.trim();
              if (nuevo && nuevo !== rama.nombre) {
                await updateDoc(ramaDocRef, { nombre: nuevo });
                onActualizar({ nombre: nuevo });
              }
              setEditandoNombre(false);
            }}
            onKeyDown={async e => {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") { setNombreEdit(rama.nombre); setEditandoNombre(false); }
            }}
            autoFocus
            style={{ flex: 1, fontWeight: 600, fontSize: 13, border: "1px solid #6ee7b7", borderRadius: 6, padding: "2px 6px", outline: "none" }}
          />
        ) : (
          <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "#1a3a2a" }}>
            {nombreEdit}
            {rama.publicada && <span style={{ marginLeft: 8, fontSize: 10, background: "#dcfce7", color: "#166534", borderRadius: 10, padding: "2px 7px", fontWeight: 600 }}>Publicada</span>}
          </div>
        )}
        <button onClick={() => { setNombreEdit(rama.nombre); setEditandoNombre(v => !v); }} style={btnIconStylePO} title="Renombrar rama">✏️</button>
        {!tieneResultados && (
          <button onClick={() => setModoEdicion(v => !v)} style={btnIconStylePO}>
            {modoEdicion ? "Ver" : "Editar"}
          </button>
        )}
        <button onClick={() => setConfirmarEliminar(true)} style={{ ...btnIconStylePO, color: "#ef4444" }} title="Eliminar rama">🗑️</button>
      </div>

      {/* Modo edición */}
      {modoEdicion && (
        <>
          {partidos.map(p => {
            const lc = clubes.find(c => c.docId === p.localId);
            const vc = clubes.find(c => c.docId === p.visitanteId);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", borderRadius: 8, padding: "6px 10px", border: "1px solid #f0fdf4" }}>
                <LogoClub club={lc || { nombre: p.localNombre }} size={26} />
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.localNombre}</span>
                <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>vs</span>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{p.visitanteNombre}</span>
                <LogoClub club={vc || { nombre: p.visitanteNombre }} size={26} />
                {p.idaVuelta && <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>↕</span>}
                <button onClick={() => sincPartidos(partidos.filter(x => x.id !== p.id))}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#ef4444", padding: "0 2px", flexShrink: 0 }}>✕</button>
              </div>
            );
          })}

          {/* Form nuevo partido */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#fff", borderRadius: 8, padding: 8, border: "1px solid #e5e7eb" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ width: 24, flexShrink: 0 }}>
                {clubLocalForm && <LogoClub club={clubLocalForm} size={24} />}
              </div>
              <SelectAdmin value={formLocal} onChange={e => setFormLocal(e.target.value)} style={{ flex: 1 }}>
                <option value="">Local...</option>
                {clubsDisponibles.filter(c => c.docId !== formVisitante).map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
              </SelectAdmin>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ width: 24, flexShrink: 0 }}>
                {clubVisitanteForm && <LogoClub club={clubVisitanteForm} size={24} />}
              </div>
              <SelectAdmin value={formVisitante} onChange={e => setFormVisitante(e.target.value)} style={{ flex: 1 }}>
                <option value="">Visitante...</option>
                {clubsDisponibles.filter(c => c.docId !== formLocal).map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
              </SelectAdmin>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Switch value={formIdaVuelta} onChange={() => setFormIdaVuelta(v => !v)} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>Ida y vuelta</span>
              <div style={{ flex: 1 }} />
              <BtnPrimary onClick={agregarPartido} disabled={!formLocal || !formVisitante || formLocal === formVisitante}>
                + Partido
              </BtnPrimary>
            </div>
          </div>

          {!rama.publicada && partidos.length > 0 && (
            <BtnPrimary onClick={guardarYPublicar} disabled={guardando} fullWidth>
              {guardando ? "Publicando..." : "Publicar rama"}
            </BtnPrimary>
          )}
        </>
      )}

      {/* Modo vista / resultados */}
      {!modoEdicion && partidos.map(p => {
        const lc = clubes.find(c => c.docId === p.localId);
        const vc = clubes.find(c => c.docId === p.visitanteId);
        const btnEliminar = (
          <button
            onClick={e => { e.stopPropagation(); sincPartidos(partidos.filter(x => x.id !== p.id)); }}
            style={{ background: "none", border: "none", borderLeft: "1px solid #e5e7eb", padding: "0 10px", cursor: "pointer", color: "#ef4444", fontSize: 14, flexShrink: 0, alignSelf: "stretch", display: "flex", alignItems: "center" }}
          >✕</button>
        );
        if (p.idaVuelta) {
          return (
            <div key={p.id} style={{ border: "1px solid #dcfce7", borderRadius: 10, overflow: "hidden", display: "flex", alignItems: "stretch" }}>
              <div style={{ flex: 1 }}>
                <PartidoPlayOffRow partido={p} clubLocal={lc} clubVisitante={vc} pierna="ida"
                  esModoClub={esModoClub} sinBorde
                  onClick={() => setModalResultado({ partidoId: p.id, pierna: "ida" })} />
                <div style={{ height: 1, background: "#e5e7eb" }} />
                <PartidoPlayOffRow partido={p} clubLocal={vc} clubVisitante={lc} pierna="vuelta"
                  esModoClub={esModoClub} sinBorde
                  onClick={() => setModalResultado({ partidoId: p.id, pierna: "vuelta" })} />
              </div>
              {btnEliminar}
            </div>
          );
        }
        return (
          <div key={p.id} style={{ border: "1px solid #f0fdf4", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "stretch" }}>
            <div style={{ flex: 1 }}>
              <PartidoPlayOffRow partido={p} clubLocal={lc} clubVisitante={vc} pierna="ida"
                esModoClub={esModoClub} sinBorde
                onClick={() => setModalResultado({ partidoId: p.id, pierna: "ida" })} />
            </div>
            {btnEliminar}
          </div>
        );
      })}

      {confirmarEliminar && (
        <ConfirmModal
          mensaje={`¿Eliminar la rama "${rama.nombre}"?`}
          onConfirmar={() => { setConfirmarEliminar(false); onEliminar(); }}
          onCancelar={() => setConfirmarEliminar(false)}
        />
      )}

      {modalResultado && (() => {
        const p = partidos.find(x => x.id === modalResultado.partidoId);
        if (!p) return null;
        if (esModoClub) {
          return (
            <ResultadoClubesModal
              partido={p} pierna={modalResultado.pierna} clubes={clubes}
              categorias={categorias} puntosPorVictoria={puntosPorVictoria}
              onGuardar={(catRes) => guardarResultadoClub(modalResultado.partidoId, modalResultado.pierna, catRes)}
              onDesmarcar={() => desmarcarResultadoClub(modalResultado.partidoId, modalResultado.pierna)}
              onCerrar={() => setModalResultado(null)}
            />
          );
        }
        return (
          <ResultadoPlayOffModal
            partido={p} pierna={modalResultado.pierna} clubes={clubes}
            onGuardar={(gL, gV, tienePen, penL, penV) => guardarResultadoCat(modalResultado.partidoId, modalResultado.pierna, gL, gV, tienePen, penL, penV)}
            onDesmarcar={() => desmarcarResultadoCat(modalResultado.partidoId, modalResultado.pierna)}
            onCerrar={() => setModalResultado(null)}
          />
        );
      })()}
    </div>
  );
}

function PartidoPlayOffRow({ partido, clubLocal, clubVisitante, pierna, esModoClub, sinBorde, onClick }) {
  const jugado   = pierna === "ida" ? partido.jugado : partido.jugadoVuelta;
  const nomLocal = clubLocal?.nombre  || partido.localNombre;
  const nomVis   = clubVisitante?.nombre || partido.visitanteNombre;

  let resultNode;
  if (jugado && esModoClub) {
    const ptsL   = pierna === "ida" ? partido.ptsLocal    : partido.ptsLocalVuelta;
    const ptsV   = pierna === "ida" ? partido.ptsVis      : partido.ptsVisVuelta;
    const gfL    = pierna === "ida" ? partido.gfLocal     : partido.gfLocalVuelta;
    const gfV    = pierna === "ida" ? partido.gfVis       : partido.gfVisVuelta;
    const catRes = pierna === "ida" ? partido.catResultados : partido.catResultadosVuelta;
    const penCats = catRes ? Object.values(catRes).filter(r => r.tienePenales) : [];
    resultNode = (
      <div style={{ minWidth: 68, textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{ptsL ?? 0}pt - {ptsV ?? 0}pt</div>
        <div style={{ fontSize: 10, color: "#9ca3af" }}>{gfL ?? 0}GF - {gfV ?? 0}GF</div>
        {penCats.map((r, i) => (
          <div key={i} style={{ fontSize: 9, color: "#6b7280" }}>Pen {r.penalesLocal}-{r.penalesVisitante}{r.nombre ? ` en ${r.nombre}` : ""}</div>
        ))}
      </div>
    );
  } else if (jugado) {
    const gL  = pierna === "ida" ? partido.golesLocal       : partido.golesLocalVuelta;
    const gV  = pierna === "ida" ? partido.golesVisitante   : partido.golesVisitanteVuelta;
    const pen = pierna === "ida" ? partido.tienePenales     : partido.tienePenalesVuelta;
    const pL  = pierna === "ida" ? partido.penalesLocal     : partido.penalesLocalVuelta;
    const pV  = pierna === "ida" ? partido.penalesVisitante : partido.penalesVisitanteVuelta;
    resultNode = (
      <div style={{ minWidth: 64, textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{gL} - {gV}</div>
        {pen && <div style={{ fontSize: 10, color: "#9ca3af" }}>({pL}-{pV} pen)</div>}
      </div>
    );
  } else {
    resultNode = <div style={{ minWidth: 64, textAlign: "center", fontSize: 12, color: "#9ca3af" }}>vs</div>;
  }

  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: sinBorde ? 0 : 8, padding: "8px 10px", border: sinBorde ? "none" : "1px solid #f0fdf4", cursor: "pointer" }}>
      <LogoClub club={clubLocal || { nombre: nomLocal }} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomLocal}</div>
        {partido.idaVuelta && <div style={{ fontSize: 10, color: "#9ca3af" }}>{pierna === "ida" ? "Ida" : "Vuelta"}</div>}
      </div>
      {resultNode}
      <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomVis}</div>
      </div>
      <LogoClub club={clubVisitante || { nombre: nomVis }} size={28} />
      <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>›</span>
    </div>
  );
}

function ResultadoClubesModal({ partido, pierna, clubes, categorias, puntosPorVictoria, onGuardar, onDesmarcar, onCerrar }) {
  const clubL    = clubes.find(c => c.docId === partido.localId);
  const clubV    = clubes.find(c => c.docId === partido.visitanteId);
  const esVuelta = pierna === "vuelta";
  const clubA    = esVuelta ? clubV : clubL;
  const clubB    = esVuelta ? clubL : clubV;
  const nomA     = clubA?.nombre || (esVuelta ? partido.visitanteNombre : partido.localNombre);
  const nomB     = clubB?.nombre || (esVuelta ? partido.localNombre     : partido.visitanteNombre);

  const existing = esVuelta ? partido.catResultadosVuelta : partido.catResultados;
  const jugadoInicial = esVuelta ? !!partido.jugadoVuelta : !!partido.jugado;
  const [jugado, setJugado]     = useState(jugadoInicial);
  const [resCats, setResCats] = useState(() => {
    const init = {};
    categorias.forEach(cat => {
      const ex = existing?.[cat.docId];
      init[cat.docId] = {
        gL: ex?.golesLocal    != null ? String(ex.golesLocal)    : "",
        gV: ex?.golesVisitante != null ? String(ex.golesVisitante) : "",
        tienePenales: ex?.tienePenales || false,
        penL: ex?.penalesLocal    != null ? String(ex.penalesLocal)    : "",
        penV: ex?.penalesVisitante != null ? String(ex.penalesVisitante) : "",
      };
    });
    return init;
  });
  const [guardando, setGuardando] = useState(false);

  function setField(catId, field, value) {
    setResCats(prev => ({ ...prev, [catId]: { ...prev[catId], [field]: value } }));
  }

  async function toggleJugado() {
    if (guardando) return;
    setGuardando(true);
    if (!jugado) {
      const catResultados = {};
      for (const cat of categorias) {
        const r = resCats[cat.docId];
        if (r.gL === "" || r.gV === "") continue;
        catResultados[cat.docId] = {
          nombre: cat.nombre,
          golesLocal: Number(r.gL), golesVisitante: Number(r.gV),
          tienePenales: r.tienePenales,
          penalesLocal:      r.tienePenales && r.penL !== "" ? Number(r.penL) : null,
          penalesVisitante:  r.tienePenales && r.penV !== "" ? Number(r.penV) : null,
        };
      }
      if (Object.keys(catResultados).length > 0) {
        await onGuardar(catResultados); // cierra el modal vía sincPartidos
      } else {
        setGuardando(false);
      }
    } else {
      await onDesmarcar(); // cierra el modal vía sincPartidos
    }
  }

  return (
    <Modal titulo={partido.idaVuelta ? `Resultado – ${pierna === "ida" ? "Ida" : "Vuelta"}` : "Resultado"} onClose={onCerrar}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Clubs header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, borderBottom: "1px solid #f0fdf4" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <LogoClub club={clubA || { nombre: nomA }} size={36} />
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a3a2a", textAlign: "center", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomA}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>vs</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <LogoClub club={clubB || { nombre: nomB }} size={36} />
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1a3a2a", textAlign: "center", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomB}</div>
          </div>
        </div>

        {/* Fila por categoría */}
        {categorias.map(cat => {
          const r = resCats[cat.docId];
          return (
            <div key={cat.docId} style={{ borderTop: "1px solid #f0fdf4", paddingTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{cat.nombre}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <InputAdmin type="number" min="0" value={r.gL}
                  onChange={e => setField(cat.docId, "gL", e.target.value)}
                  style={{ width: 60, textAlign: "center", fontSize: 22, fontWeight: 700, padding: "4px 0" }} />
                <span style={{ fontSize: 18, color: "#9ca3af", fontWeight: 700 }}>-</span>
                <InputAdmin type="number" min="0" value={r.gV}
                  onChange={e => setField(cat.docId, "gV", e.target.value)}
                  style={{ width: 60, textAlign: "center", fontSize: 22, fontWeight: 700, padding: "4px 0" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                  <Switch value={r.tienePenales} onChange={() => setField(cat.docId, "tienePenales", !r.tienePenales)} />
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>Pen</span>
                  {r.tienePenales && (
                    <>
                      <InputAdmin type="number" min="0" value={r.penL}
                        onChange={e => setField(cat.docId, "penL", e.target.value)}
                        style={{ width: 60, textAlign: "center", fontSize: 20, fontWeight: 700, padding: "4px 0" }} />
                      <span style={{ fontSize: 16, color: "#9ca3af", fontWeight: 700 }}>-</span>
                      <InputAdmin type="number" min="0" value={r.penV}
                        onChange={e => setField(cat.docId, "penV", e.target.value)}
                        style={{ width: 60, textAlign: "center", fontSize: 20, fontWeight: 700, padding: "4px 0" }} />
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f9fafb", borderRadius: 8, marginTop: 4 }}>
          <Switch value={jugado} onChange={toggleJugado} />
          <span style={{ fontSize: 14, fontWeight: 600, color: guardando ? "#9ca3af" : "#374151" }}>
            {guardando ? "Guardando..." : "Jugado"}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function ResultadoPlayOffModal({ partido, pierna, clubes, onGuardar, onDesmarcar, onCerrar }) {
  const jugadoInicial = pierna === "ida" ? !!partido.jugado          : !!partido.jugadoVuelta;
  const gLInicial     = pierna === "ida" ? partido.golesLocal         : partido.golesLocalVuelta;
  const gVInicial     = pierna === "ida" ? partido.golesVisitante     : partido.golesVisitanteVuelta;
  const penInicial    = pierna === "ida" ? partido.tienePenales       : partido.tienePenalesVuelta;
  const penLIn        = pierna === "ida" ? partido.penalesLocal        : partido.penalesLocalVuelta;
  const penVIn        = pierna === "ida" ? partido.penalesVisitante   : partido.penalesVisitanteVuelta;

  const [jugado,       setJugado]       = useState(jugadoInicial);
  const [gLocal,       setGLocal]       = useState(jugadoInicial ? String(gLInicial ?? "") : "");
  const [gVis,         setGVis]         = useState(jugadoInicial ? String(gVInicial ?? "") : "");
  const [tienePenales, setTienePenales] = useState(jugadoInicial ? (penInicial || false) : false);
  const [penL,         setPenL]         = useState(jugadoInicial && penInicial ? String(penLIn ?? "") : "");
  const [penV,         setPenV]         = useState(jugadoInicial && penInicial ? String(penVIn ?? "") : "");
  const [guardando,    setGuardando]    = useState(false);

  const clubL    = clubes.find(c => c.docId === partido.localId);
  const clubV    = clubes.find(c => c.docId === partido.visitanteId);
  const esVuelta = pierna === "vuelta";
  const clubA    = esVuelta ? clubV : clubL;
  const clubB    = esVuelta ? clubL : clubV;
  const nomA     = clubA?.nombre || (esVuelta ? partido.visitanteNombre : partido.localNombre);
  const nomB     = clubB?.nombre || (esVuelta ? partido.localNombre     : partido.visitanteNombre);

  async function toggleJugado() {
    if (guardando) return;
    if (!jugado) {
      if (gLocal === "" || gVis === "") return;
      if (tienePenales && (penL === "" || penV === "")) return;
      setGuardando(true);
      await onGuardar(
        Number(gLocal), Number(gVis),
        tienePenales,
        tienePenales ? Number(penL) : null,
        tienePenales ? Number(penV) : null,
      ); // cierra el modal vía sincPartidos
    } else {
      setGuardando(true);
      await onDesmarcar(); // cierra el modal vía sincPartidos
    }
  }

  return (
    <Modal titulo={partido.idaVuelta ? `Resultado – ${pierna === "ida" ? "Ida" : "Vuelta"}` : "Resultado"} onClose={onCerrar}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <LogoClub club={clubA || { nombre: nomA }} size={40} />
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, color: "#1a3a2a" }}>{nomA}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <InputAdmin type="number" min="0" value={gLocal} onChange={e => setGLocal(e.target.value)}
              style={{ width: 54, textAlign: "center", fontSize: 20, fontWeight: 700 }} />
            <span style={{ fontWeight: 700, color: "#9ca3af" }}>-</span>
            <InputAdmin type="number" min="0" value={gVis} onChange={e => setGVis(e.target.value)}
              style={{ width: 54, textAlign: "center", fontSize: 20, fontWeight: 700 }} />
          </div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <LogoClub club={clubB || { nombre: nomB }} size={40} />
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, color: "#1a3a2a" }}>{nomB}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#f9fafb", borderRadius: 8 }}>
          <Switch value={tienePenales} onChange={() => { setTienePenales(v => !v); setPenL(""); setPenV(""); }} />
          <span style={{ fontSize: 13, color: "#374151" }}>Definición por penales</span>
        </div>
        {tienePenales && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Penales:</span>
            <InputAdmin type="number" min="0" value={penL} onChange={e => setPenL(e.target.value)}
              style={{ width: 46, textAlign: "center", fontSize: 16, fontWeight: 700 }} />
            <span style={{ fontWeight: 700, color: "#9ca3af" }}>-</span>
            <InputAdmin type="number" min="0" value={penV} onChange={e => setPenV(e.target.value)}
              style={{ width: 46, textAlign: "center", fontSize: 16, fontWeight: 700 }} />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f9fafb", borderRadius: 8 }}>
          <Switch value={jugado} onChange={toggleJugado} />
          <span style={{ fontSize: 14, fontWeight: 600, color: guardando ? "#9ca3af" : "#374151" }}>
            {guardando ? "Guardando..." : "Jugado"}
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

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
