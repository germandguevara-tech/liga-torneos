import { useState, useEffect, useMemo, createContext, useContext } from "react";
import { db } from "./firebase";
import { collection, doc, getDocs, getDoc, query, where } from "firebase/firestore";

const LIGA_ID = import.meta.env.VITE_LIGA_ID || "lifhur";
const CFG_DEFAULT = { nombre: "LifHur", color: "#1a3a2a", acento: "#4ade80", suave: "#f0fdf4", logoUrl: null };
const CfgCtx = createContext(CFG_DEFAULT);
const sombra = "0 1px 6px rgba(0,0,0,0.06)";

// ── Utilidades ────────────────────────────────────────────────────────────────
function iniciales(nombre) {
  if (!nombre) return "?";
  const p = nombre.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

// ── Componentes base ──────────────────────────────────────────────────────────
function Escudo({ club, size = 28 }) {
  if (!club) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#f0fdf4", flexShrink: 0 }} />;
  if (club.logoUrl) return <img src={club.logoUrl} alt={club.nombre} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid #4ade8070" }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#4ade8035", border: "1.5px solid #4ade8070", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a1a", fontWeight: 700, fontSize: size * 0.3, flexShrink: 0 }}>
      {iniciales(club.nombre)}
    </div>
  );
}

function Badge({ color, bg, children }) {
  return <span style={{ background: bg, color, fontSize: 11, padding: "2px 9px", borderRadius: 20, fontWeight: 600 }}>{children}</span>;
}

function Header({ onBack, titulo, subtitulo }) {
  const cfg = useContext(CfgCtx);
  return (
    <div style={{ background: cfg.color, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 10, padding: "5px 11px", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>←</button>}
        <div>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{titulo}</div>
          {subtitulo && <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>{subtitulo}</div>}
        </div>
      </div>
    </div>
  );
}

function Card({ children, style = {} }) {
  return <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", boxShadow: sombra, overflow: "hidden", ...style }}>{children}</div>;
}

function FilaHeader({ cols, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols, padding: "9px 14px", background: "#dcfce7", gap: 2 }}>{children}</div>;
}

function FilaData({ cols, bg, onClick, children }) {
  return <div onClick={onClick} style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 14px", borderTop: "1px solid #f0fdf4", alignItems: "center", gap: 2, background: bg || "#fff", cursor: onClick ? "pointer" : "default" }}>{children}</div>;
}

function Th({ children, center }) {
  return <span style={{ fontSize: 10, color: "#166534", fontWeight: 700, textAlign: center ? "center" : "left" }}>{children}</span>;
}

function Td({ children, center, bold, color }) {
  return <span style={{ fontSize: 12, color: color || "#111827", fontWeight: bold ? 700 : 400, textAlign: center ? "center" : "left" }}>{children}</span>;
}

function Spinner() {
  const { acento } = useContext(CfgCtx);
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #dcfce7", borderTopColor: acento, animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

// ── Orden de categorías ───────────────────────────────────────────────────────
const JERARQUIA = ["cuarta", "quinta", "reserva", "primera", "senior"];
function sortCategorias(cats) {
  return [...cats].sort((a, b) => {
    const aN = parseInt(a.nombre), bN = parseInt(b.nombre);
    const aAnio = !isNaN(aN) && aN > 1000, bAnio = !isNaN(bN) && bN > 1000;
    if (aAnio && bAnio) return aN - bN;
    const aJ = JERARQUIA.indexOf(a.nombre.toLowerCase());
    const bJ = JERARQUIA.indexOf(b.nombre.toLowerCase());
    if (aJ !== -1 && bJ !== -1) return aJ - bJ;
    return a.nombre.localeCompare(b.nombre);
  });
}

// ── Lógica de tabla ───────────────────────────────────────────────────────────
function calcularTabla(clubes, partidos, sanciones = [], pV = 3, pE = 1) {
  return clubes.map(club => {
    const jugados = partidos.filter(p => p.jugado && !p.esLibre && (p.localId === club.docId || p.visitanteId === club.docId));
    let g = 0, e = 0, p = 0, gf = 0, gc = 0;
    jugados.forEach(par => {
      const esLocal = par.localId === club.docId;
      const propios = esLocal ? (par.golesLocal ?? 0) : (par.golesVisitante ?? 0);
      const ajenos  = esLocal ? (par.golesVisitante ?? 0) : (par.golesLocal ?? 0);
      gf += propios; gc += ajenos;
      if (propios > ajenos) g++;
      else if (propios === ajenos) e++;
      else p++;
    });
    const san      = sanciones.find(s => s.clubId === club.docId);
    const descuento = san ? (san.pts || 0) : 0;
    const pts       = Math.max(0, g * pV + e * pE - descuento);
    return { ...club, pj: jugados.length, g, e, p, gf, gc, dg: gf - gc, descuento, pts };
  }).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
}

// ── Perfil desde goleadores: carga el doc del jugador y delega a VistaJugador ──
function VistaGoleadorPerfil({ nombre, clubId, partidos, clubes, ligaId, onBack }) {
  const [jugador,  setJugador]  = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const partes   = nombre.split(", ");
    const apellido = partes[0] || nombre;
    const nombreJ  = partes.slice(1).join(", ") || "";
    getDocs(query(collection(db, "ligas", ligaId, "jugadores"), where("clubId", "==", clubId)))
      .then(snap => {
        const docs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        const match = docs.find(j => `${j.apellido}, ${j.nombre}` === nombre) || docs.find(j => j.apellido === apellido);
        setJugador(match || { apellido, nombre: nombreJ, clubId, fotoUrl: null });
      })
      .catch(() => {
        const partes2  = nombre.split(", ");
        setJugador({ apellido: partes2[0] || nombre, nombre: partes2.slice(1).join(", ") || "", clubId, fotoUrl: null });
      })
      .finally(() => setCargando(false));
  }, [nombre, clubId]);

  if (cargando) return (
    <div>
      <Header onBack={onBack} titulo={nombre} subtitulo="Perfil del jugador" />
      <Spinner />
    </div>
  );
  return <VistaJugador jugador={jugador} partidos={partidos} clubes={clubes} onBack={onBack} />;
}

// ── Perfil del jugador ────────────────────────────────────────────────────────
function VistaJugador({ jugador, partidos, clubes, onBack }) {
  const nombreCompleto = `${jugador.apellido}, ${jugador.nombre}`;

  // Construir detalle de goles: una entrada por partido (agrupado)
  const detalleGoles = partidos
    .filter(p => p.jugado && Array.isArray(p.goles))
    .flatMap(p => {
      const esLocal = jugador.clubId === p.localId;
      const rivalId = esLocal ? p.visitanteId : p.localId;
      const rival = (clubes || []).find(c => c.docId === rivalId);
      const cantidad = (p.goles || [])
        .filter(g => {
          const clubId = g.equipo === "local" ? p.localId : p.visitanteId;
          return g.nombre === nombreCompleto && clubId === jugador.clubId;
        })
        .reduce((s, g) => s + (g.cantidad || 1), 0);
      return cantidad > 0 ? [{ rival: rival?.nombre || "—", jornada: p.jornada, cantidad }] : [];
    });
  const totalGoles = detalleGoles.reduce((s, g) => s + g.cantidad, 0);

  // Detalle de tarjetas amarillas
  const detalleAmarillas = partidos
    .filter(p => p.jugado && Array.isArray(p.tarjetas))
    .flatMap(p => {
      const esLocal = jugador.clubId === p.localId;
      const rivalId = esLocal ? p.visitanteId : p.localId;
      const rival = (clubes || []).find(c => c.docId === rivalId);
      return (p.tarjetas || [])
        .filter(t => {
          const clubId = t.equipo === "local" ? p.localId : p.visitanteId;
          return t.nombre === nombreCompleto && clubId === jugador.clubId && t.tipo === "amarilla";
        })
        .map(() => ({ rival: rival?.nombre || "—", jornada: p.jornada }));
    });

  // Detalle de tarjetas rojas
  const detalleRojas = partidos
    .filter(p => p.jugado && Array.isArray(p.tarjetas))
    .flatMap(p => {
      const esLocal = jugador.clubId === p.localId;
      const rivalId = esLocal ? p.visitanteId : p.localId;
      const rival = (clubes || []).find(c => c.docId === rivalId);
      return (p.tarjetas || [])
        .filter(t => {
          const clubId = t.equipo === "local" ? p.localId : p.visitanteId;
          return t.nombre === nombreCompleto && clubId === jugador.clubId && t.tipo === "roja";
        })
        .map(() => ({ rival: rival?.nombre || "—", jornada: p.jornada }));
    });

  const ini = ((jugador.apellido?.[0] || "") + (jugador.nombre?.[0] || "")).toUpperCase();

  function SeccionStat({ emoji, titulo, items, accentBg, accentColor, total }) {
    const count = total ?? items.length;
    if (count === 0) return null;
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          {emoji} {titulo} ({count})
        </div>
        <Card>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none" }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: accentBg, color: accentColor, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                {item.cantidad != null ? item.cantidad : ""}{emoji}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  vs {item.rival}
                </div>
              </div>
              {item.jornada != null && (
                <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>Fecha {item.jornada}</span>
              )}
            </div>
          ))}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Header onBack={onBack} titulo={`${jugador.apellido}, ${jugador.nombre}`} subtitulo="Perfil del jugador" />
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Foto / avatar */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
          {jugador.fotoUrl
            ? <img src={jugador.fotoUrl} alt={jugador.nombre} style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "3px solid #4ade80" }} />
            : <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#dcfce7", border: "3px solid #4ade80", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 32, color: "#1a3a2a" }}>{ini}</div>
          }
        </div>
        {/* Nombre y club */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{jugador.apellido}, {jugador.nombre}</div>
          {(() => { const club = (clubes || []).find(c => c.docId === jugador.clubId); return club ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6 }}>
              <Escudo club={club} size={20} />
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{club.nombre}</span>
            </div>
          ) : null; })()}</div>
        {/* Resumen stats */}
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {[
              { emoji: "⚽", valor: totalGoles,               label: "Goles" },
              { emoji: "🟡", valor: detalleAmarillas.length, label: "Amarillas" },
              { emoji: "🔴", valor: detalleRojas.length,     label: "Rojas" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "16px 8px", textAlign: "center", borderLeft: i > 0 ? "1px solid #f0fdf4" : "none" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{s.emoji}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>{s.valor}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>
        {/* Detalle por sección */}
        <SeccionStat emoji="⚽" titulo="Goles" items={detalleGoles} accentBg="#f0fdf4" accentColor="#166534" total={totalGoles} />
        <SeccionStat emoji="🟡" titulo="Tarjetas amarillas" items={detalleAmarillas} accentBg="#fefce8" accentColor="#854d0e" />
        <SeccionStat emoji="🔴" titulo="Tarjetas rojas" items={detalleRojas} accentBg="#fef2f2" accentColor="#dc2626" />
      </div>
    </div>
  );
}

// ── Vista equipo (plantel público) ────────────────────────────────────────────
function VistaEquipo({ club, ligaId, catId, partidos, clubes, onBack }) {
  const [jugadores, setJugadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [jugadorSel, setJugadorSel] = useState(null);

  useEffect(() => {
    getDocs(query(collection(db, "ligas", ligaId, "jugadores"), where("clubId", "==", club.docId)))
      .then(snap => {
        const todos = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
        const lista = (catId ? todos.filter(j => j.categoriaId === catId) : todos)
          .sort((a, b) => a.apellido.localeCompare(b.apellido));
        setJugadores(lista);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, [club.docId, catId, ligaId]);

  if (jugadorSel) {
    return <VistaJugador jugador={jugadorSel} partidos={partidos || []} clubes={clubes} onBack={() => setJugadorSel(null)} />;
  }

  const partidosEquipo = (partidos || [])
    .filter(p => p.jugado && !p.esLibre && (p.localId === club.docId || p.visitanteId === club.docId))
    .sort((a, b) => (a.jornada || 0) - (b.jornada || 0));

  return (
    <div>
      <Header onBack={onBack} titulo={club.nombre} subtitulo="Vista del equipo" />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Escudo y nombre */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 8 }}>
          <Escudo club={club} size={72} />
          <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{club.nombre}</div>
        </div>

        {/* Partidos jugados */}
        {partidosEquipo.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Partidos jugados</div>
            <Card>
              {partidosEquipo.map((p, i) => {
                const esLocal = p.localId === club.docId;
                const rivalId = esLocal ? p.visitanteId : p.localId;
                const rival = (clubes || []).find(c => c.docId === rivalId);
                const propios = esLocal ? p.golesLocal : p.golesVisitante;
                const ajenos  = esLocal ? p.golesVisitante : p.golesLocal;
                const res = propios > ajenos ? "G" : propios < ajenos ? "P" : "E";
                const resStyle = res === "G"
                  ? { background: "#dcfce7", color: "#166534" }
                  : res === "P"
                  ? { background: "#fee2e2", color: "#dc2626" }
                  : { background: "#f3f4f6", color: "#374151" };
                return (
                  <div key={p.docId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", flexShrink: 0, ...resStyle }}>{res}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        vs {rival?.nombre || "—"}
                      </div>
                      {p.jornada != null && <div style={{ fontSize: 11, color: "#6b7280" }}>Fecha {p.jornada}</div>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", background: "#f0fdf4", padding: "3px 9px", borderRadius: 7, flexShrink: 0 }}>
                      {propios} - {ajenos}
                    </span>
                  </div>
                );
              })}
            </Card>
          </>
        )}

        {/* Jugadores */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Jugadores</div>
        {cargando ? <Spinner /> : jugadores.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin jugadores registrados</div>
        ) : (
          <Card>
            {jugadores.map((j, i) => (
              <div key={j.docId} onClick={() => setJugadorSel(j)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", cursor: "pointer" }}>
                {j.fotoUrl
                  ? <img src={j.fotoUrl} alt={j.nombre} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid #dcfce7" }} />
                  : <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#4ade8035", border: "1.5px solid #4ade8070", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color: "#1a3a2a", flexShrink: 0 }}>
                      {(j.apellido?.[0] || "").toUpperCase()}{(j.nombre?.[0] || "").toUpperCase()}
                    </div>
                }
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#111827" }}>{j.apellido}, {j.nombre}</div>
                <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Tabs de contenido ─────────────────────────────────────────────────────────
function TabPosiciones({ clubes, partidos, sanciones, pV, onVerEquipo }) {
  const tabla = useMemo(() => calcularTabla(clubes, partidos, sanciones, pV), [clubes, partidos, sanciones, pV]);
  const cols  = "20px 1fr 36px 28px 24px 24px 24px 32px";
  if (clubes.length === 0) return <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin clubes registrados</div>;
  return (
    <Card>
      <FilaHeader cols={cols}>
        <Th>#</Th><Th>Club</Th>
        {["Pts", "PJ", "G", "E", "P", "DG"].map(h => <Th key={h} center>{h}</Th>)}
      </FilaHeader>
      {tabla.map((club, i) => (
        <FilaData key={club.docId} cols={cols} bg={i === 0 ? "#f0fdf4" : "#fff"} onClick={onVerEquipo ? () => onVerEquipo(club) : undefined}>
          <Td color="#9ca3af">{i + 1}</Td>
          <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden", minWidth: 0 }}>
            <Escudo club={club} size={22} />
            <span style={{ fontWeight: 600, fontSize: 12, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club.nombre}</span>
          </div>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{club.pts}</span>
            {club.descuento > 0 && <span style={{ fontSize: 9, color: "#dc2626" }}> −{club.descuento}</span>}
          </div>
          <Td center color="#374151">{club.pj}</Td>
          <Td center color="#374151">{club.g}</Td>
          <Td center color="#374151">{club.e}</Td>
          <Td center color="#374151">{club.p}</Td>
          <Td center bold color={club.dg > 0 ? "#15803d" : club.dg < 0 ? "#dc2626" : "#374151"}>
            {club.dg > 0 ? "+" : ""}{club.dg}
          </Td>
        </FilaData>
      ))}
    </Card>
  );
}

function PartidoLineal({ partido, clubes, onClick }) {
  const local     = clubes.find(c => c.docId === partido.localId);
  const visitante = clubes.find(c => c.docId === partido.visitanteId);
  if (!local || !visitante) return null;
  return (
    <div onClick={() => onClick(partido)} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #f0fdf4", gap: 8, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end", overflow: "hidden", minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#111827", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{local.nombre}</span>
        <Escudo club={local} size={22} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0, minWidth: 76 }}>
        {partido.jugado
          ? <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", background: "#f0fdf4", padding: "3px 10px", borderRadius: 8, letterSpacing: 1 }}>{partido.golesLocal} - {partido.golesVisitante}</span>
          : <span style={{ fontSize: 12, color: "#6b7280", background: "#f9fafb", padding: "3px 10px", borderRadius: 8 }}>vs</span>
        }
        <span style={{ fontSize: 10, fontWeight: 600, color: partido.jugado ? "#166534" : "#6b7280", background: partido.jugado ? "#dcfce7" : "#f3f4f6", padding: "1px 7px", borderRadius: 20 }}>
          {partido.jugado ? "Jugado" : (partido.fecha || "Pendiente")}
        </span>
        {partido.jugado && (!partido.goles || partido.goles.length === 0) && (
          <span style={{ fontSize: 10, color: "#d97706" }} title="Sin goles cargados">⚠️</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden", minWidth: 0 }}>
        <Escudo club={visitante} size={22} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{visitante.nombre}</span>
      </div>
    </div>
  );
}

function TabFixture({ partidos, clubes, onVerPartido }) {
  const jornadas = useMemo(() =>
    [...new Set(partidos.filter(p => !p.esLibre).map(p => p.jornada))]
      .filter(v => v != null).sort((a, b) => a - b),
    [partidos]
  );
  const [jornadaSel, setJornadaSel] = useState(null);

  useEffect(() => {
    setJornadaSel(prev => (prev != null && jornadas.includes(prev)) ? prev : (jornadas[0] ?? null));
  }, [jornadas]);

  if (jornadas.length === 0) return <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin partidos cargados</div>;

  const grupo   = partidos.filter(p => p.jornada === jornadaSel && !p.esLibre);
  const libres  = partidos.filter(p => p.jornada === jornadaSel && p.esLibre);
  const jugados = grupo.filter(p => p.jugado).length;
  const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23166534' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <select
        value={jornadaSel ?? ""}
        onChange={e => setJornadaSel(Number(e.target.value))}
        style={{
          width: "100%", background: "#fff", color: "#111827",
          border: "1.5px solid #dcfce7", borderRadius: 10,
          padding: "8px 36px 8px 12px", fontSize: 13, fontWeight: 600,
          cursor: "pointer", outline: "none", appearance: "none",
          backgroundImage: selectArrow, backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}
      >
        {jornadas.map(j => {
          const gr = partidos.filter(p => p.jornada === j && !p.esLibre);
          return <option key={j} value={j}>Fecha {j} · {gr.filter(p => p.jugado).length}/{gr.length} jugados</option>;
        })}
      </select>
      {jornadaSel != null && (
        <Card>
          <div style={{ padding: "9px 14px", background: "#dcfce7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Fecha {jornadaSel}</span>
            <span style={{ fontSize: 11, color: "#166534", background: "#bbf7d0", padding: "2px 8px", borderRadius: 20 }}>
              {jugados}/{grupo.length} jugados
            </span>
          </div>
          {grupo.map(p => <PartidoLineal key={p.docId} partido={p} clubes={clubes} onClick={onVerPartido} />)}
          {libres.map(p => {
            const club = clubes.find(c => c.docId === (p.localId || p.visitanteId));
            return (
              <div key={p.docId} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #f0fdf4", gap: 8 }}>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", overflow: "hidden", minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club?.nombre || "—"}</span>
                  <Escudo club={club} size={22} />
                </div>
                <div style={{ flexShrink: 0, minWidth: 76, textAlign: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#854d0e", background: "#fef9c3", border: "1px solid #fde047", padding: "2px 10px", borderRadius: 20 }}>LIBRE</span>
                </div>
                <div style={{ flex: 1 }} />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function TabFairPlay({ partidos, clubes }) {
  const tabla = useMemo(() => {
    const mapa = {};
    clubes.forEach(c => { mapa[c.docId] = { ...c, amarillas: 0, rojas: 0 }; });
    partidos.filter(p => p.jugado && Array.isArray(p.tarjetas)).forEach(p => {
      p.tarjetas.forEach(t => {
        const clubId = t.equipo === "local" ? p.localId : p.visitanteId;
        if (mapa[clubId]) {
          if (t.tipo === "amarilla") mapa[clubId].amarillas++;
          else if (t.tipo === "roja") mapa[clubId].rojas++;
        }
      });
    });
    return Object.values(mapa).sort((a, b) => (a.amarillas + a.rojas * 3) - (b.amarillas + b.rojas * 3));
  }, [partidos, clubes]);

  const cols = "20px 1fr 44px 44px 44px";
  return (
    <Card>
      <FilaHeader cols={cols}>
        <Th>#</Th><Th>Club</Th>
        {["🟡", "🔴", "Pts"].map(h => <Th key={h} center>{h}</Th>)}
      </FilaHeader>
      {tabla.map((club, i) => {
        const pts = club.amarillas + club.rojas * 3;
        return (
          <FilaData key={club.docId} cols={cols} bg={i === 0 ? "#f0fdf4" : "#fff"}>
            <Td color="#9ca3af">{i + 1}</Td>
            <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden", minWidth: 0 }}>
              <Escudo club={club} size={22} />
              <span style={{ fontWeight: 600, fontSize: 12, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club.nombre}</span>
            </div>
            <Td center bold color="#d97706">{club.amarillas}</Td>
            <Td center bold color="#dc2626">{club.rojas}</Td>
            <Td center bold color={pts === 0 ? "#15803d" : "#111827"}>{pts}</Td>
          </FilaData>
        );
      })}
      <div style={{ padding: "7px 14px", fontSize: 11, color: "#6b7280", background: "#f0fdf4" }}>
        Menor puntaje = mejor fair play · Roja vale 3 pts
      </div>
    </Card>
  );
}

function TabGoleadores({ partidos, clubes, onVerJugador }) {
  const lista = useMemo(() => {
    const mapa = {};
    partidos.filter(p => p.jugado && Array.isArray(p.goles)).forEach(p => {
      p.goles.forEach(g => {
        const clubId = g.equipo === "local" ? p.localId : p.visitanteId;
        const key = `${g.nombre}||${clubId}`;
        if (!mapa[key]) mapa[key] = { nombre: g.nombre, clubId, cantidad: 0 };
        mapa[key].cantidad += (g.cantidad || 1);
      });
    });
    return Object.values(mapa).filter(x => x.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad);
  }, [partidos]);

  if (lista.length === 0) return <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin goles registrados</div>;
  return (
    <Card>
      <div style={{ padding: "9px 14px", background: "#dcfce7" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Tabla de goleadores</span>
      </div>
      {lista.map((g, i) => {
        const club = clubes.find(c => c.docId === g.clubId);
        const medalColor = i === 0 ? "#d97706" : i === 1 ? "#6b7280" : i === 2 ? "#b45309" : "#d1d5db";
        return (
          <div key={i} onClick={() => onVerJugador?.({ nombre: g.nombre, clubId: g.clubId })}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", cursor: onVerJugador ? "pointer" : "default" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: medalColor, width: 16, textAlign: "center" }}>{i + 1}</span>
            <Escudo club={club} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nombre}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{club?.nombre || "—"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f0fdf4", borderRadius: 20, padding: "3px 10px", flexShrink: 0 }}>
              <span style={{ fontSize: 12 }}>⚽</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{g.cantidad}</span>
            </div>
            {onVerJugador && <span style={{ fontSize: 12, color: "#9ca3af" }}>›</span>}
          </div>
        );
      })}
    </Card>
  );
}

function TabVallas({ partidos, clubes }) {
  const tabla = useMemo(() => {
    return clubes.map(club => {
      const jugados = partidos.filter(p => p.jugado && !p.esLibre && (p.localId === club.docId || p.visitanteId === club.docId));
      let gc = 0;
      jugados.forEach(p => {
        const esLocal = p.localId === club.docId;
        gc += esLocal ? (p.golesVisitante ?? 0) : (p.golesLocal ?? 0);
      });
      return { ...club, pj: jugados.length, gc };
    }).sort((a, b) => a.gc - b.gc || b.pj - a.pj);
  }, [partidos, clubes]);

  const cols = "20px 1fr 44px 44px 50px";
  if (clubes.length === 0) return null;
  return (
    <Card>
      <FilaHeader cols={cols}>
        <Th>#</Th><Th>Club</Th>
        {["PJ", "GC", "Prom"].map(h => <Th key={h} center>{h}</Th>)}
      </FilaHeader>
      {tabla.map((club, i) => {
        const prom = club.pj > 0 ? (club.gc / club.pj).toFixed(1) : "—";
        return (
          <FilaData key={club.docId} cols={cols} bg={i === 0 ? "#f0fdf4" : "#fff"}>
            <Td color="#9ca3af">{i + 1}</Td>
            <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden", minWidth: 0 }}>
              <Escudo club={club} size={22} />
              <span style={{ fontWeight: 600, fontSize: 12, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club.nombre}</span>
            </div>
            <Td center color="#374151">{club.pj}</Td>
            <Td center bold color={i === 0 ? "#15803d" : "#111827"}>{club.gc}</Td>
            <Td center color="#374151">{prom}</Td>
          </FilaData>
        );
      })}
      <div style={{ padding: "7px 14px", fontSize: 11, color: "#6b7280", background: "#f0fdf4" }}>
        GC = goles recibidos · Prom = promedio por partido
      </div>
    </Card>
  );
}

function TabSancionados({ zonaRef }) {
  const [activos,   setActivos]   = useState([]);
  const [cargando,  setCargando]  = useState(true);

  useEffect(() => {
    getDocs(collection(zonaRef, "suspensiones"))
      .then(snap => {
        const items = snap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(s => !s.cumplida)
          .sort((a, b) => (a.fechaVuelve || 0) - (b.fechaVuelve || 0));
        setActivos(items);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Spinner />;

  if (activos.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 28, color: "#9ca3af", fontSize: 13 }}>
        Sin sancionados activos
      </div>
    );
  }

  return (
    <Card>
      <div style={{ padding: "9px 14px", background: "#dcfce7", display: "flex", alignItems: "center", gap: 6 }}>
        <span>🚫</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Sancionados</span>
      </div>
      {activos.map((s, i) => (
        <div key={s.docId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.jugadorNombre}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
              {s.clubNombre}{s.categoriaNombre ? ` · ${s.categoriaNombre}` : ""}
            </div>
          </div>
          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", background: "#fee2e2", padding: "2px 8px", borderRadius: 20 }}>
              Vuelve fecha {s.fechaVuelve}
            </div>
            <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>
              {s.cantidadFechas} fecha{s.cantidadFechas !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}

// ── Vista partido ─────────────────────────────────────────────────────────────
function VistaPartido({ partido, clubes, onBack }) {
  const local     = clubes.find(c => c.docId === partido.localId);
  const visitante = clubes.find(c => c.docId === partido.visitanteId);

  function GolesPorEquipo({ equipo }) {
    const goles = (partido.goles || []).filter(g => g.equipo === equipo);
    if (goles.length === 0) return <div style={{ fontSize: 12, color: "#d1d5db" }}>—</div>;
    return goles.map((g, i) => (
      <div key={i} style={{ fontSize: 13, padding: "2px 0", color: "#111827" }}>
        ⚽ {g.nombre}{g.cantidad > 1 ? ` (${g.cantidad})` : ""}
      </div>
    ));
  }

  function TarjetasPorEquipo({ equipo }) {
    const tarjetas = (partido.tarjetas || []).filter(t => t.equipo === equipo);
    if (tarjetas.length === 0) return <div style={{ fontSize: 12, color: "#d1d5db" }}>—</div>;
    return tarjetas.map((t, i) => (
      <div key={i} style={{ fontSize: 13, padding: "2px 0", color: "#111827" }}>
        {t.tipo === "amarilla" ? "🟡" : "🔴"} {t.nombre}
      </div>
    ));
  }

  return (
    <div>
      <Header onBack={onBack} titulo={`Fecha ${partido.jornada}`} subtitulo={partido.fecha || ""} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 }}>
              <Escudo club={local} size={48} />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: "#111827", lineHeight: 1.3 }}>{local?.nombre}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {partido.jugado
                ? <span style={{ fontSize: 32, fontWeight: 700, color: "#111827", letterSpacing: 2 }}>{partido.golesLocal} - {partido.golesVisitante}</span>
                : <span style={{ fontSize: 18, color: "#6b7280" }}>vs</span>
              }
              <Badge color={partido.jugado ? "#166534" : "#6b7280"} bg={partido.jugado ? "#dcfce7" : "#f3f4f6"}>
                {partido.jugado ? "Jugado" : "Pendiente"}
              </Badge>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 }}>
              <Escudo club={visitante} size={48} />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: "#111827", lineHeight: 1.3 }}>{visitante?.nombre}</span>
            </div>
          </div>
        </Card>
        {partido.jugado && (
          <>
            <Card>
              <div style={{ padding: "9px 14px", background: "#dcfce7", fontSize: 12, fontWeight: 700, color: "#111827" }}>⚽ Goles</div>
              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, padding: "11px 14px", borderRight: "1px solid #f0fdf4" }}><GolesPorEquipo equipo="local" /></div>
                <div style={{ flex: 1, padding: "11px 14px" }}><GolesPorEquipo equipo="visitante" /></div>
              </div>
            </Card>
            {(partido.tarjetas || []).length > 0 && (
              <Card>
                <div style={{ padding: "9px 14px", background: "#dcfce7", fontSize: 12, fontWeight: 700, color: "#111827" }}>Tarjetas</div>
                <div style={{ display: "flex" }}>
                  <div style={{ flex: 1, padding: "11px 14px", borderRight: "1px solid #f0fdf4" }}><TarjetasPorEquipo equipo="local" /></div>
                  <div style={{ flex: 1, padding: "11px 14px" }}><TarjetasPorEquipo equipo="visitante" /></div>
                </div>
              </Card>
            )}
          </>
        )}
        {!partido.jugado && (
          <Card style={{ padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Partido pendiente{partido.fecha ? ` · ${partido.fecha}` : ""}</div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Bracket público ───────────────────────────────────────────────────────────
function TabBracket({ zonaRef, zona, clubes, categorias }) {
  if (zona.tipo === "copa_club")    return <BracketPorRama zonaRef={zonaRef} clubes={clubes} tipo={zona.tipo} categorias={categorias} />;
  if (zona.tipo === "copa")         return <BracketPorRama zonaRef={zonaRef} clubes={clubes} tipo={zona.tipo} />;
  if (zona.tipo === "copa_cat")     return <BracketPorCat  zonaRef={zonaRef} clubes={clubes} categorias={categorias} />;
  if (zona.tipo === "elim_equipos") return <BracketSimplePublico zonaRef={zonaRef} clubes={clubes} />;
  return null;
}

function BracketPorRama({ zonaRef, clubes, tipo, categorias }) {
  const [ramas,     setRamas]     = useState([]);
  const [ramaSelId, setRamaSelId] = useState(null);
  const [cargando,  setCargando]  = useState(true);

  useEffect(() => {
    getDocs(collection(zonaRef, "ramas"))
      .then(snap => {
        const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        setRamas(items);
        if (items.length > 0) setRamaSelId(items[0].docId);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <Spinner />;
  if (ramas.length === 0) return <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin ramas configuradas</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {ramas.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ramas.map(r => (
            <button key={r.docId} onClick={() => setRamaSelId(r.docId)}
              style={{ padding: "6px 14px", borderRadius: 20, border: ramaSelId === r.docId ? "2px solid #4ade80" : "1.5px solid #dcfce7", background: ramaSelId === r.docId ? "#1a3a2a" : "#fff", color: ramaSelId === r.docId ? "#4ade80" : "#374151", cursor: "pointer", fontSize: 12, fontWeight: ramaSelId === r.docId ? 700 : 500 }}>
              {r.nombre}
            </button>
          ))}
        </div>
      )}
      {ramaSelId && (
        <FasesColumnas
          key={ramaSelId}
          parentRef={doc(collection(zonaRef, "ramas"), ramaSelId)}
          clubes={clubes}
          tipo={tipo}
          categorias={categorias}
        />
      )}
    </div>
  );
}

function BracketSimplePublico({ zonaRef, clubes }) {
  return (
    <FasesColumnas parentRef={zonaRef} clubes={clubes} />
  );
}

function BracketPorCat({ zonaRef, clubes, categorias }) {
  const [catSelId, setCatSelId] = useState(categorias[0]?.docId || "");
  const cfg = useContext(CfgCtx);

  if (categorias.length === 0) return <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin categorías</div>;

  const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23166534' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {categorias.length > 1 && (
        <select value={catSelId} onChange={e => setCatSelId(e.target.value)}
          style={{ width: "100%", background: "#fff", color: "#111827", border: "1.5px solid #dcfce7", borderRadius: 10, padding: "8px 36px 8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", appearance: "none", backgroundImage: selectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
          {categorias.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
        </select>
      )}
      {catSelId && (
        <FasesColumnas
          key={catSelId}
          parentRef={doc(collection(zonaRef, "categorias"), catSelId)}
          clubes={clubes}
        />
      )}
    </div>
  );
}

function FasesColumnas({ parentRef, clubes, tipo, categorias }) {
  const [fases,     setFases]     = useState([]);
  const [crucesMap, setCrucesMap] = useState({});
  const [cargando,  setCargando]  = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        const fasesCol  = collection(parentRef, "fases");
        const fasesSnap = await getDocs(fasesCol);
        const fasesData = fasesSnap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        const results   = await Promise.all(
          fasesData.map(f =>
            getDocs(collection(doc(fasesCol, f.docId), "cruces"))
              .then(snap => [f.docId, snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))])
          )
        );
        const mapa = {};
        results.forEach(([id, cruces]) => { mapa[id] = cruces; });
        setFases(fasesData);
        setCrucesMap(mapa);
      } catch {}
      setCargando(false);
    }
    cargar();
  }, []);

  if (cargando) return <Spinner />;
  if (fases.length === 0) return <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin fases configuradas</div>;

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <div style={{ display: "flex", gap: 10, minWidth: fases.length * 190 }}>
        {fases.map(fase => (
          <div key={fase.docId} style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "#1a3a2a", color: "#4ade80", borderRadius: 10, padding: "8px 12px", textAlign: "center", fontWeight: 700, fontSize: 13 }}>
              {fase.nombre}
            </div>
            {(crucesMap[fase.docId] || []).length === 0 ? (
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: "16px 8px", textAlign: "center", color: "#d1d5db", fontSize: 12 }}>Sin cruces</div>
            ) : (
              (crucesMap[fase.docId] || []).map(cruce => (
                <CruceCardPublico key={cruce.docId} cruce={cruce} fase={fase} clubes={clubes} tipo={tipo} categorias={categorias} />
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function calcGanadorClub(cruce) {
  let ptL = 0, ptV = 0, gfL = 0, gfV = 0;
  for (const r of Object.values(cruce.catResultados || {})) {
    const gl = r.golL ?? 0, gv = r.golV ?? 0;
    gfL += gl; gfV += gv;
    if (gl > gv) ptL += 3;
    else if (gl < gv) ptV += 3;
    else { ptL += 1; ptV += 1; }
  }
  if (ptL > ptV) return { ganadorId: cruce.localId, ptL, ptV, gfL, gfV };
  if (ptV > ptL) return { ganadorId: cruce.visitanteId, ptL, ptV, gfL, gfV };
  if (gfL > gfV) return { ganadorId: cruce.localId, ptL, ptV, gfL, gfV };
  if (gfV > gfL) return { ganadorId: cruce.visitanteId, ptL, ptV, gfL, gfV };
  if (cruce.catPenalesId) {
    const r = (cruce.catResultados || {})[cruce.catPenalesId];
    if (r) {
      const pl = r.penL ?? 0, pv = r.penV ?? 0;
      if (pl > pv) return { ganadorId: cruce.localId, ptL, ptV, gfL, gfV, pen: { l: pl, v: pv } };
      if (pv > pl) return { ganadorId: cruce.visitanteId, ptL, ptV, gfL, gfV, pen: { l: pl, v: pv } };
    }
  }
  return { ganadorId: null, ptL, ptV, gfL, gfV };
}

function CruceCardPublico({ cruce, fase, clubes, tipo, categorias }) {
  const lClub = clubes.find(c => c.docId === cruce.localId);
  const vClub = clubes.find(c => c.docId === cruce.visitanteId);

  if (tipo === "copa_club") {
    const { ganadorId, ptL, ptV, gfL, gfV, pen } = cruce.jugado ? calcGanadorClub(cruce) : { ganadorId: null, ptL: 0, ptV: 0, gfL: 0, gfV: 0 };
    return (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #dcfce7", overflow: "hidden", boxShadow: sombra }}>
        <ClubFilaBracket club={lClub} nombre={cruce.localNombre} ganador={ganadorId === cruce.localId}
          extra={cruce.jugado ? `${ptL}pts · ${gfL}gf` : null} />
        <div style={{ padding: "3px 10px", background: "#f9fafb", display: "flex", alignItems: "center", gap: 6 }}>
          {cruce.jugado ? (
            <>
              <span style={{ fontSize: 10, color: "#6b7280", flex: 1, textAlign: "center" }}>Puntos totales</span>
              {pen && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#854d0e", background: "#fef9c3", border: "1px solid #fde047", padding: "1px 5px", borderRadius: 20 }}>
                  Pen {pen.l}–{pen.v}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 11, color: "#9ca3af", flex: 1, textAlign: "center" }}>Pendiente</span>
          )}
        </div>
        <ClubFilaBracket club={vClub} nombre={cruce.visitanteNombre} ganador={ganadorId === cruce.visitanteId}
          extra={cruce.jugado ? `${ptV}pts · ${gfV}gf` : null} />
      </div>
    );
  }

  let ganadorId = null;
  if (cruce.jugado) {
    if (cruce.hayPenales) {
      ganadorId = (cruce.penalesLocal ?? 0) > (cruce.penalesVisitante ?? 0) ? cruce.localId : cruce.visitanteId;
    } else if (fase.idaYVuelta) {
      const tL = (cruce.golesLocal ?? 0) + (cruce.golesLocalVuelta ?? 0);
      const tV = (cruce.golesVisitante ?? 0) + (cruce.golesVisitanteVuelta ?? 0);
      if (tL > tV) ganadorId = cruce.localId;
      else if (tV > tL) ganadorId = cruce.visitanteId;
    } else {
      if ((cruce.golesLocal ?? 0) > (cruce.golesVisitante ?? 0)) ganadorId = cruce.localId;
      else if ((cruce.golesVisitante ?? 0) > (cruce.golesLocal ?? 0)) ganadorId = cruce.visitanteId;
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #dcfce7", overflow: "hidden", boxShadow: sombra }}>
      <ClubFilaBracket club={lClub} nombre={cruce.localNombre} ganador={ganadorId === cruce.localId} />
      <div style={{ padding: "3px 10px", background: "#f9fafb", display: "flex", alignItems: "center", gap: 6 }}>
        {cruce.jugado ? (
          <>
            {fase.idaYVuelta ? (
              <span style={{ fontSize: 10, color: "#6b7280", flex: 1 }}>
                {cruce.golesLocal ?? "—"}–{cruce.golesVisitante ?? "—"} · {cruce.golesLocalVuelta ?? "—"}–{cruce.golesVisitanteVuelta ?? "—"}
              </span>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", flex: 1, textAlign: "center", letterSpacing: 1 }}>
                {cruce.golesLocal} — {cruce.golesVisitante}
              </span>
            )}
            {cruce.hayPenales && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#854d0e", background: "#fef9c3", border: "1px solid #fde047", padding: "1px 5px", borderRadius: 20, flexShrink: 0 }}>
                Pen {cruce.penalesLocal}–{cruce.penalesVisitante}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 11, color: "#9ca3af", flex: 1, textAlign: "center" }}>Pendiente</span>
        )}
      </div>
      <ClubFilaBracket club={vClub} nombre={cruce.visitanteNombre} ganador={ganadorId === cruce.visitanteId} />
    </div>
  );
}

function ClubFilaBracket({ club, nombre, ganador, extra }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", background: ganador ? "#f0fdf4" : "#fff" }}>
      <Escudo club={club} size={18} />
      <span style={{ fontSize: 11, fontWeight: ganador ? 700 : 400, color: ganador ? "#166534" : "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {club?.nombre || nombre}
      </span>
      {extra && <span style={{ fontSize: 10, color: "#6b7280", flexShrink: 0 }}>{extra}</span>}
      {ganador && <span style={{ fontSize: 10, color: "#166534" }}>✓</span>}
    </div>
  );
}

// ── Fixture Copa Clubs: Grupo → Categoría → Fecha ────────────────────────────
function TabFixtureCopaClub({ zonaRef, grupos, clubes, categorias, onVerPartido }) {
  const [grupoSelId, setGrupoSelId] = useState(grupos[0]?.id || "");
  const [catSelId,   setCatSelId]   = useState(categorias[0]?.docId || "");
  const [partidos,   setPartidos]   = useState([]);
  const [cargando,   setCargando]   = useState(false);
  const [jornadaSel, setJornadaSel] = useState(null);

  const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23166534' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`;
  const selStyle = { width: "100%", background: "#fff", color: "#111827", border: "1.5px solid #dcfce7", borderRadius: 10, padding: "8px 36px 8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", appearance: "none", backgroundImage: selectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" };

  // Si los props llegan vacíos al montar (carga async), inicializar los selectores cuando lleguen
  useEffect(() => {
    if (!catSelId && categorias.length > 0) setCatSelId(categorias[0].docId);
  }, [categorias]);

  useEffect(() => {
    if (!grupoSelId && grupos.length > 0) setGrupoSelId(grupos[0].id);
  }, [grupos]);

  useEffect(() => {
    if (catSelId && grupoSelId) cargarPartidos();
  }, [catSelId, grupoSelId]);

  async function cargarPartidos() {
    setCargando(true);
    try {
      const pCol = collection(doc(collection(zonaRef, "categorias"), catSelId), "partidos");
      const snap = await getDocs(query(collection(doc(collection(zonaRef, "categorias"), catSelId), "partidos"), where("grupoId", "==", grupoSelId)));
      const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.jornada - b.jornada);
      setPartidos(items);
    } finally {
      setCargando(false);
    }
  }

  const jornadas = useMemo(() =>
    [...new Set(partidos.filter(p => !p.esLibre).map(p => p.jornada))].filter(v => v != null).sort((a, b) => a - b),
    [partidos]
  );

  useEffect(() => {
    setJornadaSel(prev => (prev != null && jornadas.includes(prev)) ? prev : (jornadas[0] ?? null));
  }, [jornadas]);

  const grupo  = partidos.filter(p => p.jornada === jornadaSel && !p.esLibre);
  const libres = partidos.filter(p => p.jornada === jornadaSel && p.esLibre);
  const jugados = grupo.filter(p => p.jugado).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {grupos.length > 1 && (
        <select value={grupoSelId} onChange={e => { setGrupoSelId(e.target.value); setJornadaSel(null); }} style={selStyle}>
          {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      )}
      {categorias.length > 1 && (
        <select value={catSelId} onChange={e => setCatSelId(e.target.value)} style={selStyle}>
          {categorias.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
        </select>
      )}
      {cargando ? <Spinner /> : jornadas.length === 0
        ? <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 13 }}>Sin partidos cargados</div>
        : (
          <>
            <select value={jornadaSel ?? ""} onChange={e => setJornadaSel(Number(e.target.value))} style={selStyle}>
              {jornadas.map(j => {
                const gr = partidos.filter(p => p.jornada === j && !p.esLibre);
                return <option key={j} value={j}>Fecha {j} · {gr.filter(p => p.jugado).length}/{gr.length} jugados</option>;
              })}
            </select>
            {jornadaSel != null && (
              <Card>
                <div style={{ padding: "9px 14px", background: "#dcfce7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Fecha {jornadaSel}</span>
                  <span style={{ fontSize: 11, color: "#166534", background: "#bbf7d0", padding: "2px 8px", borderRadius: 20 }}>{jugados}/{grupo.length} jugados</span>
                </div>
                {grupo.map(p => <PartidoLineal key={p.docId} partido={p} clubes={clubes} onClick={onVerPartido} />)}
                {libres.map(p => {
                  const club = clubes.find(c => c.docId === (p.localId || p.visitanteId));
                  return (
                    <div key={p.docId} style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #f0fdf4", gap: 8 }}>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", overflow: "hidden", minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club?.nombre || "—"}</span>
                        <Escudo club={club} size={22} />
                      </div>
                      <div style={{ flexShrink: 0, minWidth: 76, textAlign: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#854d0e", background: "#fef9c3", border: "1px solid #fde047", padding: "2px 10px", borderRadius: 20 }}>LIBRE</span>
                      </div>
                      <div style={{ flex: 1 }} />
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        )
      }
    </div>
  );
}

// ── Tablas Copa Clubs: Categoría → Tabla por Grupo ────────────────────────────
function TabTablasCopaClub({ zonaRef, zona, grupos, clubes, categorias }) {
  const mostrarGeneral = zona.tablaGeneralActiva && zona.tablaGeneralVisible;
  const opciones = [
    ...categorias.map(c => ({ id: c.docId, tipo: "cat", label: c.nombre })),
    ...(mostrarGeneral ? [{ id: "__general__", tipo: "general", label: "Tabla General" }] : []),
  ];
  const [selId,    setSelId]    = useState(opciones[0]?.id || "");
  const [partidos, setPartidos] = useState([]);
  const [cargando, setCargando] = useState(false);

  const pV    = zona.puntosPorVictoria ?? 3;
  const pVGen = zona.tablaGeneralPuntosVictoria ?? 3;

  const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23166534' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`;
  const selStyle = { width: "100%", background: "#fff", color: "#111827", border: "1.5px solid #dcfce7", borderRadius: 10, padding: "8px 36px 8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", outline: "none", appearance: "none", backgroundImage: selectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" };

  useEffect(() => { if (selId) cargarPartidos(); }, [selId]);

  async function cargarPartidos() {
    setCargando(true);
    try {
      if (selId === "__general__") {
        const catIds = zona.tablaGeneralCategorias || [];
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

  const pVActivo = selId === "__general__" ? pVGen : pV;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {opciones.length > 1 && (
        <select value={selId} onChange={e => setSelId(e.target.value)} style={selStyle}>
          {opciones.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
      {cargando ? <Spinner /> : grupos.map(grupo => {
        const grupoClubs    = (grupo.clubes || []).map(id => clubes.find(c => c.docId === id)).filter(Boolean);
        const grupoPartidos = partidos.filter(p => p.grupoId === grupo.id);
        return (
          <div key={grupo.id}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{grupo.nombre}</div>
            <TabPosiciones clubes={grupoClubs} partidos={grupoPartidos} sanciones={[]} pV={pVActivo} />
          </div>
        );
      })}
    </div>
  );
}

// ── Vista zona ────────────────────────────────────────────────────────────────
const TABS_LIGA      = ["Posiciones", "Fixture", "Fair Play", "Goleadores", "Vallas", "Sancionados"];
const TABS_COPA      = ["Bracket", "Posiciones", "Fixture", "Goleadores", "Sancionados"];
const TABS_COPA_CLUB = ["Fixture", "Tablas", "Play Off", "Sancionados"];
const TABS_ELIM      = ["Bracket", "Sancionados"];
const TABS_ELIM_CLUB = ["Play Off"];

function VistaZona({ liga, temporada, competencia, zona, onBack }) {
  const cfg       = useContext(CfgCtx);
  const esCopa     = zona.tipo !== "liga";
  const esElim     = zona.tipo === "copa_cat" || zona.tipo === "elim_equipos";
  const esCopaClub = zona.tipo === "copa_club";
  const esElimClub = zona.tipo === "elim_club";
  const [clubes,             setClubes]             = useState([]);
  const [categorias,         setCategorias]         = useState([]);   // visibles, para Tablas/Posiciones
  const [categoriasFixture,  setCategoriasFixture]  = useState([]);   // todas las participantes, para Fixture
  const [catSel,             setCatSel]             = useState(null);
  const [partidos,   setPartidos]   = useState([]);
  const [sanciones,  setSanciones]  = useState([]);
  const [cargando,   setCargando]   = useState(false);
  const [tab,          setTab]          = useState(esElimClub ? "Play Off" : esCopaClub ? "Fixture" : esCopa ? "Bracket" : "Posiciones");
  const [partidoSel,   setPartidoSel]   = useState(null);
  const [clubSel,      setClubSel]      = useState(null);
  const [goleadorSel,  setGoleadorSel]  = useState(null); // { nombre, clubId }

  const zonaRef = doc(db, "ligas", liga.docId, "temporadas", temporada.docId, "competencias", competencia.docId, "zonas", zona.docId);
  const compRef = doc(db, "ligas", liga.docId, "temporadas", temporada.docId, "competencias", competencia.docId);

  useEffect(() => {
    async function cargar() {
      const [cs, cats] = await Promise.all([
        getDocs(collection(compRef, "clubes")),
        getDocs(collection(compRef, "categorias")),
      ]);
      const allClubes = cs.docs.map(d => ({ docId: d.id, ...d.data() }));
      // Para copa_club mostrar todos los clubes que están en algún grupo
      const grupos = zona.grupos || [];
      if (esCopaClub) {
        const gruposClubIds = new Set(grupos.flatMap(g => g.clubes || []));
        setClubes(allClubes.filter(c => gruposClubIds.has(c.docId)));
      } else {
        const partIds = zona.clubesParticipantes;
        setClubes(partIds?.length ? allClubes.filter(c => partIds.includes(c.docId)) : allClubes);
      }

      const allCats  = cats.docs.map(d => ({ docId: d.id, ...d.data() }));
      const catPart  = zona.categoriasParticipantes;
      const catVis   = zona.categoriasVisibilidad || {};
      const catsZona = catPart?.length ? allCats.filter(c => catPart.includes(c.docId)) : allCats;
      const catsConVis = sortCategorias(catsZona.map(c => ({ ...c, visible: catVis[c.docId] ?? (c.visible ?? true) })));
      const catsData   = catsConVis.filter(c => c.visible);
      setCategoriasFixture(catsConVis); // todas las participantes (para Fixture copa_club)
      setCategorias(catsData);          // solo visibles (para Tablas/Posiciones)

      if (!esCopaClub && !esElimClub) {
        if (catsData.length > 0) {
          setCatSel(catsData[0].docId);
        } else if (zona.tablaGeneralActiva && zona.tablaGeneralVisible) {
          setCatSel("__general__");
        } else if (zona.tablaAcumuladaActiva && zona.tablaAcumuladaVisible) {
          setCatSel("__acumulada__");
        }
      }
    }
    cargar();
  }, []);

  // Carga de partidos (solo para no copa_club / no elim_club)
  useEffect(() => {
    if (!catSel || esCopaClub || esElimClub) return;
    async function cargarPartidos() {
      setCargando(true);
      try {
        if (catSel === "__general__") {
          const catIds = zona.tablaGeneralCategorias || [];
          const results = await Promise.all(
            catIds.map(catId =>
              getDocs(collection(doc(collection(zonaRef, "categorias"), catId), "partidos"))
                .then(snap => snap.docs.map(d => ({ docId: d.id, ...d.data() })))
            )
          );
          setPartidos(results.flat());
          setSanciones(zona.tablaGeneralSanciones || []);
        } else if (catSel === "__acumulada__") {
          const zonaIds = zona.tablaAcumuladaZonas || [];
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
          setSanciones(zona.tablaAcumuladaSanciones || []);
        } else {
          const catRef = doc(collection(zonaRef, "categorias"), catSel);
          const [pSnap, catSnap] = await Promise.all([
            getDocs(collection(catRef, "partidos")),
            getDoc(catRef),
          ]);
          setPartidos(pSnap.docs.map(d => ({ docId: d.id, ...d.data() })));
          setSanciones(catSnap.data()?.sanciones || []);
        }
      } finally {
        setCargando(false);
      }
    }
    cargarPartidos();
  }, [catSel]);

  const mostrarGeneral   = zona.tablaGeneralActiva   && zona.tablaGeneralVisible;
  const mostrarAcumulada = zona.tablaAcumuladaActiva && zona.tablaAcumuladaVisible;
  const opciones = [
    ...sortCategorias(categorias).map(c => ({ id: c.docId, label: c.nombre })),
    ...(mostrarGeneral   ? [{ id: "__general__",  label: "Tabla General"   }] : []),
    ...(mostrarAcumulada ? [{ id: "__acumulada__", label: "Tabla Acumulada" }] : []),
  ];
  const esResumen    = catSel === "__general__" || catSel === "__acumulada__";
  const tabsBase     = esElimClub ? TABS_ELIM_CLUB
    : esCopaClub ? TABS_COPA_CLUB.filter(t => t !== "Play Off" || zona.playoffPublicado)
    : esElim ? TABS_ELIM : esCopa ? TABS_COPA : TABS_LIGA;
  const tabsVisibles = (!esCopaClub && !esElimClub && esResumen) ? ["Posiciones"] : tabsBase;
  const pV = catSel === "__general__" ? (zona.tablaGeneralPuntosVictoria ?? 3) : (zona.puntosPorVictoria ?? 3);

  if (partidoSel) return <VistaPartido partido={partidoSel} clubes={clubes} onBack={() => setPartidoSel(null)} />;
  if (goleadorSel) {
    return (
      <VistaGoleadorPerfil
        nombre={goleadorSel.nombre} clubId={goleadorSel.clubId}
        partidos={partidos} clubes={clubes} ligaId={liga.docId}
        onBack={() => setGoleadorSel(null)}
      />
    );
  }
  if (clubSel) {
    return (
      <VistaEquipo
        club={clubSel} ligaId={liga.docId}
        catId={esResumen ? null : catSel}
        partidos={partidos} clubes={clubes}
        onBack={() => setClubSel(null)}
      />
    );
  }

  return (
    <div>
      <div style={{ background: cfg.color, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ padding: "13px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <button onClick={onBack} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 10, padding: "5px 11px", cursor: "pointer", fontSize: 14 }}>←</button>
            <div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{zona.nombre}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 1 }}>{competencia.nombre}</div>
            </div>
          </div>
          {/* Selector de categoría en header — solo para no copa_club / no elim_club */}
          {!esCopaClub && !esElimClub && opciones.length > 1 && !esElim && (
            <div style={{ paddingBottom: 8 }}>
              <select
                value={catSel || ""}
                onChange={e => { setCatSel(e.target.value); setTab("Posiciones"); }}
                style={{
                  width: "100%", background: "rgba(255,255,255,0.12)", color: "#fff",
                  border: "1.5px solid rgba(255,255,255,0.25)", borderRadius: 10,
                  padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  outline: "none", appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='${encodeURIComponent(cfg.acento)}' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
                  paddingRight: 36,
                }}
              >
                {opciones.map(o => (
                  <option key={o.id} value={o.id} style={{ background: cfg.color, color: "#fff" }}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="tabs-scroll" style={{ display: "flex", gap: 0, overflowX: "auto", msOverflowStyle: "none", scrollbarWidth: "none" }}>
            {tabsVisibles.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "7px 11px", borderRadius: "8px 8px 0 0", border: "none", fontSize: 11,
                cursor: "pointer", whiteSpace: "nowrap", fontWeight: tab === t ? 700 : 500,
                background: "transparent",
                color: tab === t ? cfg.acento : "rgba(255,255,255,0.55)",
                borderBottom: tab === t ? `2px solid ${cfg.acento}` : "2px solid transparent",
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        {/* Copa por club: tabs manejados internamente */}
        {esCopaClub && tab === "Fixture" && (
          <TabFixtureCopaClub
            zonaRef={zonaRef}
            grupos={zona.grupos || []}
            clubes={clubes}
            categorias={categoriasFixture.length ? categoriasFixture : categorias}
            onVerPartido={setPartidoSel}
          />
        )}
        {esCopaClub && tab === "Tablas" && (
          <TabTablasCopaClub
            zonaRef={zonaRef}
            zona={zona}
            grupos={zona.grupos || []}
            clubes={clubes}
            categorias={categorias}
          />
        )}
        {(esCopaClub || esElimClub) && tab === "Play Off" && (
          <TabPlayOffCopaClub zonaRef={zonaRef} zona={zona} clubes={clubes} categorias={categorias} />
        )}
        {esCopaClub && tab === "Sancionados" && <TabSancionados zonaRef={zonaRef} />}

        {/* Todos los demás tipos */}
        {!esCopaClub && !esElimClub && (cargando ? <Spinner /> : (
          <>
            {tab === "Posiciones" && (
              <TabPosiciones
                clubes={clubes} partidos={partidos} sanciones={sanciones} pV={pV}
                onVerEquipo={catSel !== "__general__" ? setClubSel : undefined}
              />
            )}
            {tab === "Bracket" && <TabBracket zonaRef={zonaRef} zona={zona} clubes={clubes} categorias={categorias} />}
            {tab === "Fixture" && <TabFixture partidos={partidos} clubes={clubes} onVerPartido={setPartidoSel} />}
            {tab === "Fair Play"   && <TabFairPlay partidos={partidos} clubes={clubes} />}
            {tab === "Goleadores"  && <TabGoleadores partidos={partidos} clubes={clubes} onVerJugador={setGoleadorSel} />}
            {tab === "Vallas"      && <TabVallas partidos={partidos} clubes={clubes} />}
            {tab === "Sancionados" && <TabSancionados zonaRef={zonaRef} />}
          </>
        ))}
      </div>
    </div>
  );
}

// ── Play Off Copa Club (público) ──────────────────────────────────────────────
function TabPlayOffCopaClub({ zonaRef, clubes, categorias }) {
  const [tieneClub, setTieneClub]       = useState(false);
  const [catIds, setCatIds]             = useState([]);
  const [vistaActiva, setVistaActiva]   = useState(null); // "club" | "categoria"
  const [catSelId, setCatSelId]         = useState("");
  const [verificado, setVerificado]     = useState(false);

  useEffect(() => {
    // Re-verificar cuando cambia la lista de categorías (el primer render puede
    // ocurrir con categorias=[] si la pestaña Play Off es la inicial, como en elim_club)
    setVerificado(false);
    let cancelado = false;

    async function verificar() {
      // Verificar si hay copas por club publicadas
      let hayClub = false;
      try {
        const copasClubSnap = await getDocs(collection(zonaRef, "playoffCopas"));
        for (const copaDoc of copasClubSnap.docs) {
          const ramasSnap = await getDocs(collection(copaDoc.ref, "ramas"));
          if (ramasSnap.docs.some(r => r.data().publicada)) { hayClub = true; break; }
        }
      } catch (_) {}

      // Verificar qué categorías tienen al menos una rama publicada.
      // Se itera sobre las categorías conocidas (no se consulta la colección playoffCategorias
      // porque sus documentos son implícitos en Firestore y getDocs los omite).
      const ids = [];
      await Promise.all(categorias.map(async cat => {
        try {
          const copasRef  = collection(doc(collection(zonaRef, "playoffCategorias"), cat.docId), "copas");
          const copasSnap = await getDocs(copasRef);
          for (const copaDoc of copasSnap.docs) {
            const ramasSnap = await getDocs(collection(copaDoc.ref, "ramas"));
            if (ramasSnap.docs.some(r => r.data().publicada)) { ids.push(cat.docId); break; }
          }
        } catch (_) {}
      }));

      if (cancelado) return;
      setTieneClub(hayClub);
      setCatIds(ids);
      if (ids.length > 0) setCatSelId(prev => prev || ids[0]);
      // Vista activa por defecto: club primero, si no la primera categoría
      setVistaActiva(prev => {
        if (prev) return prev;
        if (hayClub) return "club";
        if (ids.length > 0) return "categoria";
        return null;
      });
      setVerificado(true);
    }
    verificar();
    return () => { cancelado = true; };
  }, [categorias]);

  function nombreCat(id) {
    return categorias.find(c => c.docId === id)?.nombre || id;
  }

  if (!verificado) return <Spinner />;

  const tieneCategoria = catIds.length > 0;

  if (!tieneClub && !tieneCategoria) {
    return <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Sin play off publicado aún</div>;
  }

  const btnBase = { flex: 1, padding: "13px 0", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 700, fontSize: 15, transition: "background 0.15s, color 0.15s" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Botones de navegación — solo los que tienen contenido */}
      {(tieneClub || tieneCategoria) && (
        <div style={{ display: "flex", gap: 10 }}>
          {tieneClub && (
            <button onClick={() => setVistaActiva("club")}
              style={{ ...btnBase,
                background: vistaActiva === "club" ? "#1a3a2a" : "#f0fdf4",
                color:      vistaActiva === "club" ? "#4ade80" : "#374151",
                boxShadow:  vistaActiva === "club" ? "0 2px 8px rgba(26,58,42,0.18)" : "none" }}>
              Club
            </button>
          )}
          {tieneCategoria && (
            <button onClick={() => setVistaActiva("categoria")}
              style={{ ...btnBase,
                background: vistaActiva === "categoria" ? "#1a3a2a" : "#f0fdf4",
                color:      vistaActiva === "categoria" ? "#4ade80" : "#374151",
                boxShadow:  vistaActiva === "categoria" ? "0 2px 8px rgba(26,58,42,0.18)" : "none" }}>
              Categoría
            </button>
          )}
        </div>
      )}

      {/* Contenido: Por Club */}
      {vistaActiva === "club" && (
        <CopasPlayOffPublico key="club"
          copasRef={collection(zonaRef, "playoffCopas")}
          clubes={clubes} />
      )}

      {/* Contenido: Por Categoría */}
      {vistaActiva === "categoria" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {catIds.length > 1 && (
            <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
              {catIds.map(id => (
                <button key={id} onClick={() => setCatSelId(id)}
                  style={{ flexShrink: 0, padding: "7px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
                    fontWeight: catSelId === id ? 700 : 500,
                    color: catSelId === id ? "#1a3a2a" : "#6b7280",
                    borderBottom: catSelId === id ? "2px solid #4ade80" : "2px solid transparent" }}>
                  {nombreCat(id)}
                </button>
              ))}
            </div>
          )}
          {catSelId && (
            <CopasPlayOffPublico key={catSelId}
              copasRef={collection(doc(collection(zonaRef, "playoffCategorias"), catSelId), "copas")}
              clubes={clubes} />
          )}
        </div>
      )}
    </div>
  );
}

function CopasPlayOffPublico({ copasRef, clubes, hideEmpty, titulo }) {
  const cfg = useContext(CfgCtx);
  const [copas, setCopas]               = useState([]);
  const [ramasPorCopa, setRamasPorCopa] = useState({});
  const [cargando, setCargando]         = useState(true);
  const [detalle, setDetalle]           = useState(null); // { partido, pierna, clubLocal, clubVisitante }

  useEffect(() => {
    async function cargar() {
      try {
        const copasSnap = await getDocs(copasRef);
        const copasData = copasSnap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .sort((a, b) => (a.orden || 0) - (b.orden || 0));
        setCopas(copasData);
        const mapa = {};
        await Promise.all(copasData.map(async copa => {
          const copaDocRef = doc(copasRef, copa.docId);
          const ramasSnap  = await getDocs(collection(copaDocRef, "ramas"));
          mapa[copa.docId] = ramasSnap.docs
            .map(d => ({ docId: d.id, ...d.data() }))
            .filter(r => r.publicada)
            .sort((a, b) => (a.orden || 0) - (b.orden || 0));
        }));
        setRamasPorCopa(mapa);
      } catch (_) { /* colección vacía */ }
      setCargando(false);
    }
    cargar();
  }, []);

  if (cargando) return <Spinner />;

  const copasConRamas = copas.filter(c => (ramasPorCopa[c.docId] || []).length > 0);
  if (copasConRamas.length === 0) {
    if (hideEmpty) return null;
    return <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Sin play off publicado aún</div>;
  }

  return (
    <>
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {titulo && <div style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>{titulo}</div>}
      {copasConRamas.map(copa => (
        <div key={copa.docId}>
          <div style={{ fontWeight: 700, fontSize: 15, color: cfg.color, marginBottom: 10 }}>
            🏆 {copa.nombre}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(ramasPorCopa[copa.docId] || []).map(rama => (
              <Card key={rama.docId}>
                <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 2 }}>{rama.nombre}</div>
                  {(rama.partidos || []).map(p => {
                    const lc = clubes.find(c => c.docId === p.localId);
                    const vc = clubes.find(c => c.docId === p.visitanteId);
                    const onDetalle = (pierna, cL, cV) => setDetalle({ partido: p, pierna, clubLocal: cL, clubVisitante: cV });
                    if (p.idaVuelta) {
                      return (
                        <div key={p.id} style={{ border: "1px solid #f0fdf4", borderRadius: 8, overflow: "hidden" }}>
                          <PartidoPlayOffPublico partido={p} clubLocal={lc} clubVisitante={vc} pierna="ida" sinBorde
                            onDetalle={p.jugado ? () => onDetalle("ida", lc, vc) : undefined} />
                          <div style={{ height: 1, background: "#f0fdf4" }} />
                          <PartidoPlayOffPublico partido={p} clubLocal={vc} clubVisitante={lc} pierna="vuelta" sinBorde
                            onDetalle={p.jugadoVuelta ? () => onDetalle("vuelta", vc, lc) : undefined} />
                        </div>
                      );
                    }
                    return (
                      <PartidoPlayOffPublico key={p.id} partido={p} clubLocal={lc} clubVisitante={vc} pierna="ida"
                        onDetalle={p.jugado ? () => onDetalle("ida", lc, vc) : undefined} />
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
    {detalle && (
      <DetallePartidoClubModal
        partido={detalle.partido} pierna={detalle.pierna}
        clubLocal={detalle.clubLocal} clubVisitante={detalle.clubVisitante}
        onCerrar={() => setDetalle(null)}
      />
    )}
    </>
  );
}

function DetallePartidoClubModal({ partido, pierna, clubLocal, clubVisitante, onCerrar }) {
  const catRes   = pierna === "ida" ? partido.catResultados : partido.catResultadosVuelta;
  const nomLocal = clubLocal?.nombre  || partido.localNombre;
  const nomVis   = clubVisitante?.nombre || partido.visitanteNombre;
  const entries  = catRes
    ? Object.entries(catRes).sort(([, a], [, b]) => (a.nombre || "").localeCompare(b.nombre || ""))
    : [];

  // Modo categoría: el partido tiene goles directos (no catResultados)
  const gL  = pierna === "ida" ? partido.golesLocal        : partido.golesLocalVuelta;
  const gV  = pierna === "ida" ? partido.golesVisitante    : partido.golesVisitanteVuelta;
  const pen = pierna === "ida" ? partido.tienePenales      : partido.tienePenalesVuelta;
  const pL  = pierna === "ida" ? partido.penalesLocal      : partido.penalesLocalVuelta;
  const pV  = pierna === "ida" ? partido.penalesVisitante  : partido.penalesVisitanteVuelta;
  const esModoCat = entries.length === 0 && gL != null;

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto", paddingBottom: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 10px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a3a2a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "42%" }}>{nomLocal}</span>
              <span style={{ color: "#9ca3af", fontWeight: 400, flexShrink: 0 }}>vs</span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "42%" }}>{nomVis}</span>
            </div>
            {partido.idaVuelta && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{pierna === "ida" ? "Ida" : "Vuelta"}</div>}
          </div>
          <button onClick={onCerrar} style={{ background: "none", border: "none", fontSize: 18, color: "#9ca3af", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
        {/* Contenido */}
        <div style={{ padding: "0 16px" }}>
          {esModoCat ? (
            /* Resultado simple (modo categoría) */
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "20px 0" }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#374151", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomLocal}</span>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", letterSpacing: 2 }}>{gL} - {gV}</div>
                {pen && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>({pL}-{pV} pen)</div>}
              </div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#374151", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomVis}</span>
            </div>
          ) : entries.length === 0 ? (
            <div style={{ padding: "16px 0", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>Sin resultados cargados</div>
          ) : (
            /* Resultados por categorías (modo club) */
            entries.map(([catId, r]) => (
              <div key={catId} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#374151" }}>{r.nombre || catId}</div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#111827", minWidth: 22, textAlign: "right" }}>{r.golesLocal}</span>
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>-</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#111827", minWidth: 22 }}>{r.golesVisitante}</span>
                  </div>
                  {r.tienePenales && (
                    <div style={{ fontSize: 11, color: "#6b7280" }}>pen {r.penalesLocal}-{r.penalesVisitante}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PartidoPlayOffPublico({ partido, clubLocal, clubVisitante, pierna, sinBorde, onDetalle }) {
  const jugado   = pierna === "ida" ? partido.jugado : partido.jugadoVuelta;
  const esModoClub = partido.ptsLocal != null || partido.ptsLocalVuelta != null;

  const escudoLocal = pierna === "ida" ? clubLocal    : clubVisitante;
  const escudoVis   = pierna === "ida" ? clubVisitante : clubLocal;
  const nomLocal = pierna === "ida"
    ? (clubLocal?.nombre    || partido.localNombre)
    : (clubVisitante?.nombre || partido.visitanteNombre);
  const nomVis = pierna === "ida"
    ? (clubVisitante?.nombre || partido.visitanteNombre)
    : (clubLocal?.nombre    || partido.localNombre);

  let resultNode;
  if (jugado && esModoClub) {
    const ptsL   = pierna === "ida" ? partido.ptsLocal : partido.ptsLocalVuelta;
    const ptsV   = pierna === "ida" ? partido.ptsVis   : partido.ptsVisVuelta;
    const gfL    = pierna === "ida" ? partido.gfLocal  : partido.gfLocalVuelta;
    const gfV    = pierna === "ida" ? partido.gfVis    : partido.gfVisVuelta;
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
    resultNode = <div style={{ fontSize: 12, color: "#9ca3af", minWidth: 64, textAlign: "center" }}>vs</div>;
  }

  return (
    <div onClick={onDetalle || undefined}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
        borderTop: sinBorde ? "none" : "1px solid #f0fdf4",
        cursor: onDetalle ? "pointer" : "default" }}>
      <Escudo club={escudoLocal} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomLocal}</div>
        {partido.idaVuelta && <div style={{ fontSize: 10, color: "#9ca3af" }}>{pierna === "ida" ? "Ida" : "Vuelta"}</div>}
      </div>
      {resultNode}
      <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomVis}</div>
      </div>
      <Escudo club={escudoVis} size={28} />
      {onDetalle && <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>›</span>}
    </div>
  );
}

// ── Banner instalar ───────────────────────────────────────────────────────────
function BannerInstalar() {
  const cfg = useContext(CfgCtx);
  const [visible, setVisible] = useState(() => localStorage.getItem(`${LIGA_ID}-banner-cerrado`) !== "1");
  if (!visible) return null;
  function cerrar() { localStorage.setItem(`${LIGA_ID}-banner-cerrado`, "1"); setVisible(false); }
  const esIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esAndroid = /android/i.test(navigator.userAgent);
  return (
    <div style={{ background: cfg.color, border: `1px solid ${cfg.acento}40`, borderRadius: 14, padding: "13px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ fontSize: 22, flexShrink: 0 }}>📲</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: cfg.acento, marginBottom: 5 }}>Instalá {cfg.nombre} en tu celu</div>
        {esIOS ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Tocá <span style={{ color: cfg.acento, fontWeight: 600 }}>Compartir</span> y elegí <span style={{ color: cfg.acento, fontWeight: 600 }}>"Agregar a pantalla de inicio"</span>
          </div>
        ) : esAndroid ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Tocá los <span style={{ color: cfg.acento, fontWeight: 600 }}>3 puntitos</span> y elegí <span style={{ color: cfg.acento, fontWeight: 600 }}>"Agregar a pantalla de inicio"</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            <div>📱 <span style={{ fontWeight: 600, color: cfg.acento }}>Android:</span> 3 puntitos → "Agregar a pantalla de inicio"</div>
            <div style={{ marginTop: 3 }}>🍎 <span style={{ fontWeight: 600, color: cfg.acento }}>iPhone:</span> Compartir → "Agregar a pantalla de inicio"</div>
          </div>
        )}
      </div>
      <button onClick={cerrar} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [cfg,          setCfg]          = useState(CFG_DEFAULT);
  const [pantalla,     setPantalla]     = useState("competencias");
  const [temporadas,   setTemporadas]   = useState([]);   // activas (para selección)
  const [tempSel,      setTempSel]      = useState(null);
  const [competencias, setCompetencias] = useState([]);
  const [compSel,      setCompSel]      = useState(null);
  const [zonas,        setZonas]        = useState([]);
  const [zonaSel,      setZonaSel]      = useState(null);
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState("");

  useEffect(() => {
    async function cargar() {
      try {
        const [ligaSnap, tempsSnap] = await Promise.all([
          getDoc(doc(db, "ligas", LIGA_ID)),
          getDocs(collection(db, "ligas", LIGA_ID, "temporadas")),
        ]);

        if (ligaSnap.exists()) {
          const d    = ligaSnap.data();
          const conf = d.configuracion || {};
          setCfg({
            nombre:  conf.nombre         || d.nombre  || CFG_DEFAULT.nombre,
            color:   conf.colorPrincipal              || CFG_DEFAULT.color,
            acento:  conf.colorAcento                 || CFG_DEFAULT.acento,
            suave:   conf.colorFondo                  || CFG_DEFAULT.suave,
            logoUrl: conf.logoUrl        || d.logoUrl || null,
          });
        }

        // Solo temporadas activas
        const activas = tempsSnap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(t => t.activa === true)
          .sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || (b.anio || 0) - (a.anio || 0));

        if (activas.length === 0) {
          // Sin temporadas activas — mostrar mensaje
          setCargando(false);
          return;
        }

        if (activas.length === 1) {
          // Una sola activa — ir directo a competencias
          const temp = activas[0];
          setTempSel(temp);
          const compsSnap = await getDocs(
            collection(db, "ligas", LIGA_ID, "temporadas", temp.docId, "competencias")
          );
          const comps = compsSnap.docs
            .map(d => ({ docId: d.id, ...d.data() }))
            .filter(c => c.visible !== false);
          setCompetencias(comps);
          setPantalla("competencias");
        } else {
          // Varias activas — mostrar pantalla de selección
          setTemporadas(activas);
          setPantalla("temporadas");
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  async function seleccionarTemporada(temp) {
    setCargando(true);
    try {
      setTempSel(temp);
      const compsSnap = await getDocs(
        collection(db, "ligas", LIGA_ID, "temporadas", temp.docId, "competencias")
      );
      const comps = compsSnap.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter(c => c.visible !== false);
      setCompetencias(comps);
      setPantalla("competencias");
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function cargarZonas(temp, comp) {
    const snap = await getDocs(
      collection(db, "ligas", LIGA_ID, "temporadas", temp.docId, "competencias", comp.docId, "zonas")
    );
    setZonas(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
  }

  async function seleccionarComp(comp) {
    setCompSel(comp);
    await cargarZonas(tempSel, comp);
    setPantalla("zonas");
  }

  // ── Spinner inicial ──
  if (cargando) {
    return (
      <>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #dcfce7", borderTopColor: "#4ade80", animation: "spin 0.8s linear infinite" }} />
        </div>
      </>
    );
  }

  // ── Render zona ──
  if (pantalla === "zona" && zonaSel) {
    return (
      <CfgCtx.Provider value={cfg}>
        <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <VistaZona
            liga={{ docId: LIGA_ID }}
            temporada={tempSel}
            competencia={compSel}
            zona={zonaSel}
            onBack={() => { setZonaSel(null); setPantalla("zonas"); }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } } .tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
        </div>
      </CfgCtx.Provider>
    );
  }

  const subtitulo =
    pantalla === "zonas"        ? compSel?.nombre :
    pantalla === "competencias" && tempSel ? (tempSel.nombre || String(tempSel.anio)) :
    "";

  const backDesdeZonas = () => {
    setZonaSel(null);
    setZonas([]);
    setCompSel(null);
    setPantalla("competencias");
  };

  const backDesdeCompetencias = () => {
    setCompetencias([]);
    setTempSel(null);
    setPantalla("temporadas");
  };

  return (
    <CfgCtx.Provider value={cfg}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: cfg.color, padding: "26px 16px 22px" }}>
          {(pantalla === "zonas" || (pantalla === "competencias" && temporadas.length > 1)) && (
            <button
              onClick={pantalla === "zonas" ? backDesdeZonas : backDesdeCompetencias}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 10, padding: "5px 11px", cursor: "pointer", fontSize: 14, marginBottom: 10, display: "block" }}>←</button>
          )}
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: 0 }}>{cfg.nombre}</h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "4px 0 0" }}>{subtitulo}</p>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {pantalla === "competencias" && <BannerInstalar />}

          {error && <div style={{ textAlign: "center", padding: 24, color: "#dc2626", fontSize: 13 }}>{error}</div>}

          {/* Sin temporadas activas */}
          {pantalla === "competencias" && !tempSel && !error && (
            <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontSize: 13 }}>
              No hay temporadas activas en este momento.
            </div>
          )}

          {/* Selección de temporada (2+ activas) */}
          {pantalla === "temporadas" && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Seleccioná una temporada</div>
              {temporadas.map(temp => (
                <div key={temp.docId} onClick={() => seleccionarTemporada(temp)}
                  style={{ background: "#fff", borderRadius: 14, padding: "16px 14px", border: "1px solid #dcfce7", boxShadow: sombra, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.suave, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>📅</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{temp.nombre || String(temp.anio)}</div>
                    {temp.nombre && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{temp.anio}</div>}
                  </div>
                  <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
                </div>
              ))}
            </>
          )}

          {/* Competencias */}
          {pantalla === "competencias" && tempSel && (
            competencias.length === 0
              ? <div style={{ textAlign: "center", padding: 32, color: "#9ca3af", fontSize: 13 }}>No hay competencias disponibles</div>
              : competencias.map(comp => (
                  <div key={comp.docId} onClick={() => seleccionarComp(comp)}
                    style={{ background: "#fff", borderRadius: 14, padding: "13px 14px", border: "1px solid #dcfce7", boxShadow: sombra, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.suave, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, overflow: "hidden" }}>
                      {comp.logoUrl
                        ? <img src={comp.logoUrl} alt={comp.nombre} style={{ width: 44, height: 44, objectFit: "cover" }} />
                        : "🏆"
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{comp.nombre}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{tempSel.nombre || String(tempSel.anio)}</div>
                    </div>
                    <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
                  </div>
                ))
          )}

          {/* Zonas */}
          {pantalla === "zonas" && zonas.map(zona => {
            const estaPublicada = zona.tipo === "elim_club" ? !!zona.playoffPublicado : !!zona.publicado;
            return (
              <div key={zona.docId}
                onClick={() => { if (!estaPublicada) return; setZonaSel(zona); setPantalla("zona"); }}
                style={{ background: "#fff", borderRadius: 14, padding: "13px 14px", border: "1px solid #dcfce7", boxShadow: sombra, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: estaPublicada ? "pointer" : "default", opacity: estaPublicada ? 1 : 0.6 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{zona.nombre}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                    {estaPublicada ? compSel?.nombre : "Próximamente"}
                  </div>
                </div>
                {estaPublicada
                  ? <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
                  : <span style={{ fontSize: 11, color: "#9ca3af", background: "#f3f4f6", padding: "3px 8px", borderRadius: 20 }}>Próximamente</span>
                }
              </div>
            );
          })}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } .tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
      </div>
    </CfgCtx.Provider>
  );
}
