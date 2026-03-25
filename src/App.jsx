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

// ── Perfil del jugador ────────────────────────────────────────────────────────
function VistaJugador({ jugador, partidos, onBack }) {
  const goles = partidos
    .filter(p => p.jugado && Array.isArray(p.goles))
    .reduce((acc, p) => acc + p.goles
      .filter(g => g.nombre === jugador.nombre && g.equipo === jugador.clubId)
      .reduce((s, g) => s + (g.cantidad || 1), 0), 0);

  const amarillas = partidos
    .filter(p => p.jugado && Array.isArray(p.tarjetas))
    .reduce((acc, p) => acc + p.tarjetas
      .filter(t => t.nombre === jugador.nombre && t.equipo === jugador.clubId && t.tipo === "amarilla").length, 0);

  const rojas = partidos
    .filter(p => p.jugado && Array.isArray(p.tarjetas))
    .reduce((acc, p) => acc + p.tarjetas
      .filter(t => t.nombre === jugador.nombre && t.equipo === jugador.clubId && t.tipo === "roja").length, 0);

  const ini = ((jugador.apellido?.[0] || "") + (jugador.nombre?.[0] || "")).toUpperCase();

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
        {/* Nombre */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{jugador.apellido}, {jugador.nombre}</div>
        </div>
        {/* Stats */}
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {[
              { emoji: "⚽", valor: goles,     label: "Goles" },
              { emoji: "🟡", valor: amarillas, label: "Amarillas" },
              { emoji: "🔴", valor: rojas,     label: "Rojas" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "16px 8px", textAlign: "center", borderLeft: i > 0 ? "1px solid #f0fdf4" : "none" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{s.emoji}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#111827" }}>{s.valor}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Vista equipo (plantel público) ────────────────────────────────────────────
function VistaEquipo({ club, ligaId, catId, partidos, onBack }) {
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
    return <VistaJugador jugador={jugadorSel} partidos={partidos || []} onBack={() => setJugadorSel(null)} />;
  }

  return (
    <div>
      <Header onBack={onBack} titulo={club.nombre} subtitulo="Plantel" />
      <div style={{ padding: 14 }}>
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
        if (mapa[t.equipo]) {
          if (t.tipo === "amarilla") mapa[t.equipo].amarillas++;
          else if (t.tipo === "roja") mapa[t.equipo].rojas++;
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

function TabGoleadores({ partidos, clubes }) {
  const lista = useMemo(() => {
    const mapa = {};
    partidos.filter(p => p.jugado && Array.isArray(p.goles)).forEach(p => {
      p.goles.forEach(g => {
        const key = `${g.nombre}||${g.equipo}`;
        if (!mapa[key]) mapa[key] = { nombre: g.nombre, clubId: g.equipo, cantidad: 0 };
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
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none" }}>
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

  function GolesPorEquipo({ equipoId }) {
    const goles = (partido.goles || []).filter(g => g.equipo === equipoId);
    if (goles.length === 0) return <div style={{ fontSize: 12, color: "#d1d5db" }}>—</div>;
    return goles.map((g, i) => (
      <div key={i} style={{ fontSize: 13, padding: "2px 0", color: "#111827" }}>
        ⚽ {g.nombre}{g.cantidad > 1 ? ` (${g.cantidad})` : ""}
      </div>
    ));
  }

  function TarjetasPorEquipo({ equipoId }) {
    const tarjetas = (partido.tarjetas || []).filter(t => t.equipo === equipoId);
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
                <div style={{ flex: 1, padding: "11px 14px", borderRight: "1px solid #f0fdf4" }}><GolesPorEquipo equipoId={partido.localId} /></div>
                <div style={{ flex: 1, padding: "11px 14px" }}><GolesPorEquipo equipoId={partido.visitanteId} /></div>
              </div>
            </Card>
            {(partido.tarjetas || []).length > 0 && (
              <Card>
                <div style={{ padding: "9px 14px", background: "#dcfce7", fontSize: 12, fontWeight: 700, color: "#111827" }}>Tarjetas</div>
                <div style={{ display: "flex" }}>
                  <div style={{ flex: 1, padding: "11px 14px", borderRight: "1px solid #f0fdf4" }}><TarjetasPorEquipo equipoId={partido.localId} /></div>
                  <div style={{ flex: 1, padding: "11px 14px" }}><TarjetasPorEquipo equipoId={partido.visitanteId} /></div>
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

// ── Vista zona ────────────────────────────────────────────────────────────────
const TABS = ["Posiciones", "Fixture", "Fair Play", "Goleadores", "Vallas", "Sancionados"];

function VistaZona({ liga, temporada, competencia, zona, onBack }) {
  const cfg = useContext(CfgCtx);
  const [clubes,    setClubes]    = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [catSel,    setCatSel]    = useState(null);
  const [partidos,  setPartidos]  = useState([]);
  const [sanciones, setSanciones] = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [tab,       setTab]       = useState("Posiciones");
  const [partidoSel, setPartidoSel] = useState(null);
  const [clubSel,   setClubSel]   = useState(null);

  const zonaRef = doc(db, "ligas", liga.docId, "temporadas", temporada.docId, "competencias", competencia.docId, "zonas", zona.docId);

  useEffect(() => {
    async function cargar() {
      const [cs, cats] = await Promise.all([
        getDocs(collection(zonaRef, "clubes")),
        getDocs(collection(zonaRef, "categorias")),
      ]);
      const catsData = sortCategorias(cats.docs.map(d => ({ docId: d.id, ...d.data() })));
      setClubes(cs.docs.map(d => ({ docId: d.id, ...d.data() })));
      setCategorias(catsData);
      // Categorías primero; Tabla General solo si no hay categorías
      if (catsData.length > 0) {
        setCatSel(catsData[0].docId);
      } else if (zona.tablaGeneralActiva && zona.tablaGeneralVisible) {
        setCatSel("__general__");
      }
    }
    cargar();
  }, []);

  useEffect(() => {
    if (!catSel) return;
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

  const mostrarGeneral = zona.tablaGeneralActiva && zona.tablaGeneralVisible;
  const opciones = [
    ...sortCategorias(categorias).map(c => ({ id: c.docId, label: c.nombre })),
    ...(mostrarGeneral ? [{ id: "__general__", label: "Tabla General" }] : []),
  ];
  const tabsVisibles = catSel === "__general__" ? ["Posiciones"] : TABS;
  const pV = catSel === "__general__" ? (zona.tablaGeneralPuntosVictoria ?? 3) : (zona.puntosPorVictoria ?? 3);

  if (partidoSel) return <VistaPartido partido={partidoSel} clubes={clubes} onBack={() => setPartidoSel(null)} />;

  if (clubSel) {
    return (
      <VistaEquipo
        club={clubSel}
        ligaId={liga.docId}
        catId={catSel !== "__general__" ? catSel : null}
        partidos={partidos}
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
          {opciones.length > 1 && (
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
        {cargando ? <Spinner /> : (
          <>
            {tab === "Posiciones" && (
              <TabPosiciones
                clubes={clubes} partidos={partidos} sanciones={sanciones} pV={pV}
                onVerEquipo={catSel !== "__general__" ? setClubSel : undefined}
              />
            )}
            {tab === "Fixture" && <TabFixture partidos={partidos} clubes={clubes} onVerPartido={setPartidoSel} />}
            {tab === "Fair Play"   && <TabFairPlay partidos={partidos} clubes={clubes} />}
            {tab === "Goleadores"  && <TabGoleadores partidos={partidos} clubes={clubes} />}
            {tab === "Vallas"      && <TabVallas partidos={partidos} clubes={clubes} />}
            {tab === "Sancionados" && <TabSancionados zonaRef={zonaRef} />}
          </>
        )}
      </div>
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
        // Carga config de la liga y temporadas en paralelo
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

        const temps = tempsSnap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(t => t.visible !== false)
          .sort((a, b) => (b.anio || 0) - (a.anio || 0));

        if (temps.length === 0) return;
        const temp = temps[0];
        setTempSel(temp);

        const compsSnap = await getDocs(
          collection(db, "ligas", LIGA_ID, "temporadas", temp.docId, "competencias")
        );
        const comps = compsSnap.docs
          .map(d => ({ docId: d.id, ...d.data() }))
          .filter(c => c.visible !== false);
        setCompetencias(comps);
      } catch (e) {
        setError(e.message);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

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

  // ── Spinner inicial hasta que Firebase responda ──
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

  // ── Render listas ──
  const subtitulo =
    pantalla === "zonas"        ? compSel?.nombre :
    tempSel                    ? `Temporada ${tempSel.anio}` :
    "";

  const backDesdeZonas = () => {
    setZonaSel(null);
    setZonas([]);
    if (competencias.length <= 1) { setCompSel(null); setPantalla("competencias"); }
    else { setCompSel(null); setPantalla("competencias"); }
  };

  return (
    <CfgCtx.Provider value={cfg}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: cfg.color, padding: "26px 16px 22px" }}>
          {pantalla === "zonas" && (
            <button onClick={backDesdeZonas} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 10, padding: "5px 11px", cursor: "pointer", fontSize: 14, marginBottom: 10, display: "block" }}>←</button>
          )}
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: 0 }}>{cfg.nombre}</h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "4px 0 0" }}>{subtitulo}</p>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {pantalla === "competencias" && <BannerInstalar />}

          {error && <div style={{ textAlign: "center", padding: 24, color: "#dc2626", fontSize: 13 }}>{error}</div>}

          {/* Competencias */}
          {pantalla === "competencias" && (
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
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{tempSel?.anio}</div>
                    </div>
                    <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
                  </div>
                ))
          )}

          {/* Zonas */}
          {pantalla === "zonas" && zonas.map(zona => (
            <div key={zona.docId}
              onClick={() => { if (!zona.publicado) return; setZonaSel(zona); setPantalla("zona"); }}
              style={{ background: "#fff", borderRadius: 14, padding: "13px 14px", border: "1px solid #dcfce7", boxShadow: sombra, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: zona.publicado ? "pointer" : "default", opacity: zona.publicado ? 1 : 0.6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{zona.nombre}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  {zona.publicado ? compSel?.nombre : "Próximamente"}
                </div>
              </div>
              {zona.publicado
                ? <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
                : <span style={{ fontSize: 11, color: "#9ca3af", background: "#f3f4f6", padding: "3px 8px", borderRadius: 20 }}>Próximamente</span>
              }
            </div>
          ))}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } .tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
      </div>
    </CfgCtx.Provider>
  );
}
