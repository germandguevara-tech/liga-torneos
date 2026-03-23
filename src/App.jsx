import { useState, useEffect, useContext, createContext } from "react";
import { db } from "./firebase";
import { collection, doc, getDocs } from "firebase/firestore";

const DatosContext = createContext({});

const config = { nombre: "LifHur", color: "#1a3a2a", acento: "#4ade80", suave: "#f0fdf4" };

const sombra = "0 1px 6px rgba(0,0,0,0.06)";

function calcularPosiciones(clubes, jugadores, partidos) {
  return clubes.map((club) => {
    const jugados = partidos.filter(p => p.jugado && (p.local === club.id || p.visitante === club.id));
    let g = 0, e = 0, p = 0, gf = 0, gc = 0, amarillas = 0, rojas = 0;
    jugados.forEach(partido => {
      const esLocal = partido.local === club.id;
      const propios = esLocal ? partido.golesLocal : partido.golesVisitante;
      const ajenos = esLocal ? partido.golesVisitante : partido.golesLocal;
      gf += propios; gc += ajenos;
      if (propios > ajenos) g++;
      else if (propios === ajenos) e++;
      else p++;
    });
    jugadores.filter(j => j.club === club.id).forEach(j => { amarillas += j.amarillas; rojas += j.rojas; });
    return { ...club, pj: jugados.length, g, e, p, gf, gc, pts: g * 3 + e, amarillas, rojas };
  }).sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc));
}

function Escudo({ club, size = 28 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: club.color + "35", border: `1.5px solid ${club.color}70`, display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a1a", fontWeight: 700, fontSize: size * 0.3, flexShrink: 0 }}>
      {club.siglas}
    </div>
  );
}

function Badge({ color, bg, children }) {
  return (
    <span style={{ background: bg, color, fontSize: 11, padding: "2px 9px", borderRadius: 20, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function Header({ onBack, titulo, subtitulo }) {
  return (
    <div style={{ background: config.color, padding: "13px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 10, padding: "5px 11px", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>←</button>
        )}
        <div>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{titulo}</div>
          {subtitulo && <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>{subtitulo}</div>}
        </div>
      </div>
    </div>
  );
}

function SeccionTitulo({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.2 }}>{children}</div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", boxShadow: sombra, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function FilaHeader({ cols, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, padding: "9px 14px", background: "#dcfce7", gap: 2 }}>
      {children}
    </div>
  );
}

function FilaData({ cols, bg, onClick, children }) {
  return (
    <div onClick={onClick} style={{ display: "grid", gridTemplateColumns: cols, padding: "10px 14px", borderTop: "1px solid #f0fdf4", alignItems: "center", gap: 2, background: bg || "#fff", cursor: onClick ? "pointer" : "default" }}>
      {children}
    </div>
  );
}

function Th({ children, center }) {
  return <span style={{ fontSize: 10, color: "#166534", fontWeight: 700, textAlign: center ? "center" : "left" }}>{children}</span>;
}

function Td({ children, center, bold, color }) {
  return <span style={{ fontSize: 12, color: color || "#111827", fontWeight: bold ? 700 : 400, textAlign: center ? "center" : "left" }}>{children}</span>;
}

function Posiciones({ onVerEquipo }) {
  const { clubes, jugadores, partidos } = useContext(DatosContext);
  const tabla = calcularPosiciones(clubes, jugadores, partidos);
  const cols = "20px 1fr 26px 26px 26px 26px 32px 32px";
  return (
    <Card>
      <FilaHeader cols={cols}>
        <Th>#</Th><Th>Club</Th>
        {["PJ","G","E","P","DG","Pts"].map(h => <Th key={h} center>{h}</Th>)}
      </FilaHeader>
      {tabla.map((club, i) => {
        const dg = club.gf - club.gc;
        return (
          <FilaData key={club.id} cols={cols} bg={i === 0 ? "#f0fdf4" : "#fff"} onClick={() => onVerEquipo(club)}>
            <Td color="#9ca3af">{i + 1}</Td>
            <div style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden", minWidth: 0 }}>
              <Escudo club={club} size={22} />
              <span style={{ fontWeight: 600, fontSize: 12, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{club.nombre}</span>
            </div>
            {[club.pj, club.g, club.e, club.p].map((v, j) => <Td key={j} center color="#374151">{v}</Td>)}
            <Td center bold color={dg > 0 ? "#15803d" : dg < 0 ? "#dc2626" : "#374151"}>{dg > 0 ? "+" : ""}{dg}</Td>
            <Td center bold color="#111827">{club.pts}</Td>
          </FilaData>
        );
      })}
    </Card>
  );
}

function PartidoLineal({ partido, onClick }) {
  const { clubes } = useContext(DatosContext);
  const local = clubes.find(c => c.id === partido.local);
  const visitante = clubes.find(c => c.id === partido.visitante);
  return (
    <div onClick={() => onClick(partido)}
      style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderTop: "1px solid #f0fdf4", gap: 8, cursor: "pointer" }}>
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
          {partido.jugado ? "Jugado" : partido.dia}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, overflow: "hidden", minWidth: 0 }}>
        <Escudo club={visitante} size={22} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{visitante.nombre}</span>
      </div>
    </div>
  );
}

function Fixture({ onVerPartido }) {
  const { partidos } = useContext(DatosContext);
  const fechas = [...new Set(partidos.map(p => p.fecha))];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {fechas.map(f => {
        const grupo = partidos.filter(p => p.fecha === f);
        const info = grupo[0];
        return (
          <Card key={f}>
            <div style={{ padding: "9px 14px", background: "#dcfce7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{info.fechaNombre}</span>
              <span style={{ fontSize: 11, color: "#166534", background: "#bbf7d0", padding: "2px 8px", borderRadius: 20 }}>{info.dia}</span>
            </div>
            {grupo.map(p => <PartidoLineal key={p.id} partido={p} onClick={onVerPartido} />)}
          </Card>
        );
      })}
    </div>
  );
}

function FairPlay() {
  const { clubes, jugadores, partidos } = useContext(DatosContext);
  const tabla = calcularPosiciones(clubes, jugadores, partidos).sort((a, b) => (a.amarillas + a.rojas * 3) - (b.amarillas + b.rojas * 3));
  const cols = "20px 1fr 44px 44px 44px";
  return (
    <Card>
      <FilaHeader cols={cols}>
        <Th>#</Th><Th>Club</Th>
        {["🟡","🔴","Pts"].map(h => <Th key={h} center>{h}</Th>)}
      </FilaHeader>
      {tabla.map((club, i) => {
        const pts = club.amarillas + club.rojas * 3;
        return (
          <FilaData key={club.id} cols={cols} bg={i === 0 ? "#f0fdf4" : "#fff"}>
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

function Goleadores({ onVerJugador }) {
  const { jugadores, clubes } = useContext(DatosContext);
  const lista = [...jugadores].filter(j => j.goles > 0).sort((a, b) => b.goles - a.goles);
  return (
    <Card>
      <div style={{ padding: "9px 14px", background: "#dcfce7" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Tabla de goleadores</span>
      </div>
      {lista.map((j, i) => {
        const club = clubes.find(c => c.id === j.club);
        const medalColor = i === 0 ? "#d97706" : i === 1 ? "#6b7280" : i === 2 ? "#b45309" : "#d1d5db";
        return (
          <div key={j.id} onClick={() => onVerJugador(j)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", cursor: "pointer" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: medalColor, width: 16, textAlign: "center" }}>{i + 1}</span>
            <Escudo club={club} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.apellido}, {j.nombre}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{club.nombre}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f0fdf4", borderRadius: 20, padding: "3px 10px", flexShrink: 0 }}>
              <span style={{ fontSize: 12 }}>⚽</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{j.goles}</span>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function VallasInvictas() {
  const { clubes, jugadores, partidos } = useContext(DatosContext);
  const tabla = calcularPosiciones(clubes, jugadores, partidos).sort((a, b) => a.gc - b.gc || b.pj - a.pj);
  const cols = "20px 1fr 40px 40px 50px";
  return (
    <Card>
      <FilaHeader cols={cols}>
        <Th>#</Th><Th>Club</Th>
        {["PJ","GC","Prom"].map(h => <Th key={h} center>{h}</Th>)}
      </FilaHeader>
      {tabla.map((club, i) => {
        const prom = club.pj > 0 ? (club.gc / club.pj).toFixed(1) : "—";
        return (
          <FilaData key={club.id} cols={cols} bg={i === 0 ? "#f0fdf4" : "#fff"}>
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

function VistaPartido({ partido, onBack }) {
  const { clubes, jugadores } = useContext(DatosContext);
  const local = clubes.find(c => c.id === partido.local);
  const visitante = clubes.find(c => c.id === partido.visitante);
  const golesPorEquipo = (equipoId) =>
    partido.goles.filter(g => g.equipo === equipoId).map(g => {
      const j = jugadores.find(x => x.id === g.jugador);
      return `${j.apellido} ${g.minuto}'`;
    });
  const tarjetasPorEquipo = (equipoId, tipo) =>
    partido[tipo].filter(t => t.equipo === equipoId).map(t => {
      const j = jugadores.find(x => x.id === t.jugador);
      return `${j.apellido} ${t.minuto}'`;
    });
  return (
    <div>
      <Header onBack={onBack} titulo={partido.fechaNombre} subtitulo={partido.dia} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 }}>
              <Escudo club={local} size={48} />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: "#111827", lineHeight: 1.3 }}>{local.nombre}</span>
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
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: "center", color: "#111827", lineHeight: 1.3 }}>{visitante.nombre}</span>
            </div>
          </div>
        </Card>
        {partido.jugado && (
          <>
            <Card>
              <div style={{ padding: "9px 14px", background: "#dcfce7", fontSize: 12, fontWeight: 700, color: "#111827" }}>⚽ Goles</div>
              <div style={{ display: "flex" }}>
                <div style={{ flex: 1, padding: "11px 14px", borderRight: "1px solid #f0fdf4" }}>
                  {golesPorEquipo(local.id).length > 0 ? golesPorEquipo(local.id).map((g, i) => <div key={i} style={{ fontSize: 13, padding: "2px 0", color: "#111827" }}>{g}</div>) : <div style={{ fontSize: 12, color: "#d1d5db" }}>—</div>}
                </div>
                <div style={{ flex: 1, padding: "11px 14px" }}>
                  {golesPorEquipo(visitante.id).length > 0 ? golesPorEquipo(visitante.id).map((g, i) => <div key={i} style={{ fontSize: 13, padding: "2px 0", color: "#111827" }}>{g}</div>) : <div style={{ fontSize: 12, color: "#d1d5db" }}>—</div>}
                </div>
              </div>
            </Card>
            {(partido.amarillas.length > 0 || partido.rojas.length > 0) && (
              <Card>
                <div style={{ padding: "9px 14px", background: "#dcfce7", fontSize: 12, fontWeight: 700, color: "#111827" }}>Tarjetas</div>
                <div style={{ display: "flex" }}>
                  <div style={{ flex: 1, padding: "11px 14px", borderRight: "1px solid #f0fdf4" }}>
                    {[...tarjetasPorEquipo(local.id, "amarillas").map(t => ({ t, tipo: "🟡" })), ...tarjetasPorEquipo(local.id, "rojas").map(t => ({ t, tipo: "🔴" }))].length > 0
                      ? [...tarjetasPorEquipo(local.id, "amarillas").map(t => ({ t, tipo: "🟡" })), ...tarjetasPorEquipo(local.id, "rojas").map(t => ({ t, tipo: "🔴" }))].map((x, i) => <div key={i} style={{ fontSize: 13, padding: "2px 0", color: "#111827" }}>{x.tipo} {x.t}</div>)
                      : <div style={{ fontSize: 12, color: "#d1d5db" }}>—</div>}
                  </div>
                  <div style={{ flex: 1, padding: "11px 14px" }}>
                    {[...tarjetasPorEquipo(visitante.id, "amarillas").map(t => ({ t, tipo: "🟡" })), ...tarjetasPorEquipo(visitante.id, "rojas").map(t => ({ t, tipo: "🔴" }))].length > 0
                      ? [...tarjetasPorEquipo(visitante.id, "amarillas").map(t => ({ t, tipo: "🟡" })), ...tarjetasPorEquipo(visitante.id, "rojas").map(t => ({ t, tipo: "🔴" }))].map((x, i) => <div key={i} style={{ fontSize: 13, padding: "2px 0", color: "#111827" }}>{x.tipo} {x.t}</div>)
                      : <div style={{ fontSize: 12, color: "#d1d5db" }}>—</div>}
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
        {!partido.jugado && (
          <Card style={{ padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>Partido pendiente · {partido.dia}</div>
          </Card>
        )}
      </div>
    </div>
  );
}

function VistaEquipo({ club, onVerJugador, onBack }) {
  const { jugadores, partidos, clubes } = useContext(DatosContext);
  const misJugadores = jugadores.filter(j => j.club === club.id).sort((a, b) => a.apellido.localeCompare(b.apellido));
  const misPartidos = partidos.filter(p => p.jugado && (p.local === club.id || p.visitante === club.id));
  return (
    <div>
      <Header onBack={onBack} titulo={club.nombre} subtitulo={`${misJugadores.length} jugadores`} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {misPartidos.length > 0 && (
          <div>
            <SeccionTitulo>Partidos jugados</SeccionTitulo>
            <Card>
              {misPartidos.map((p, i) => {
                const localC = clubes.find(c => c.id === p.local);
                const visitanteC = clubes.find(c => c.id === p.visitante);
                const esLocal = p.local === club.id;
                const propio = esLocal ? p.golesLocal : p.golesVisitante;
                const ajeno = esLocal ? p.golesVisitante : p.golesLocal;
                const resultado = propio > ajeno ? "G" : propio === ajeno ? "E" : "P";
                const resColor = resultado === "G" ? "#166534" : resultado === "E" ? "#92400e" : "#991b1b";
                const resBg = resultado === "G" ? "#dcfce7" : resultado === "E" ? "#fef3c7" : "#fee2e2";
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "8px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#9ca3af", width: 50, flexShrink: 0 }}>{p.fechaNombre}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, justifyContent: "flex-end", overflow: "hidden", minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827" }}>{localC.nombre}</span>
                      <Escudo club={localC} size={18} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, background: "#f0fdf4", padding: "2px 7px", borderRadius: 6, flexShrink: 0, letterSpacing: 1, color: "#111827" }}>{p.golesLocal} - {p.golesVisitante}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, overflow: "hidden", minWidth: 0 }}>
                      <Escudo club={visitanteC} size={18} />
                      <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827" }}>{visitanteC.nombre}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: resColor, background: resBg, padding: "2px 6px", borderRadius: 6, flexShrink: 0 }}>{resultado}</span>
                  </div>
                );
              })}
            </Card>
          </div>
        )}
        <div>
          <SeccionTitulo>Jugadores</SeccionTitulo>
          <Card>
            {misJugadores.map((j, i) => (
              <div key={j.id} onClick={() => onVerJugador(j)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i > 0 ? "1px solid #f0fdf4" : "none", cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: club.color + "35", border: `1.5px solid ${club.color}70`, display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a1a", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                  {j.nombre[0]}{j.apellido[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{j.apellido}, {j.nombre}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{j.posicion} · #{j.numero}</div>
                </div>
                <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function VistaJugador({ jugador, onBack }) {
  const { clubes, partidos } = useContext(DatosContext);
  const club = clubes.find(c => c.id === jugador.club);

  const golesDetalle = partidos
    .filter(p => p.jugado && p.goles.some(g => g.jugador === jugador.id))
    .flatMap(p => p.goles
      .filter(g => g.jugador === jugador.id)
      .map(g => {
        const rivalId = p.local === jugador.club ? p.visitante : p.local;
        return { rival: clubes.find(c => c.id === rivalId), fechaNombre: p.fechaNombre, minuto: g.minuto };
      })
    )
    .sort((a, b) => a.minuto - b.minuto);
  const stats = [
    { label: "Goles", valor: jugador.goles, color: "#166534", bg: "#dcfce7", emoji: "⚽" },
    { label: "Amarillas", valor: jugador.amarillas, color: "#92400e", bg: "#fef3c7", emoji: "🟡" },
    { label: "Rojas", valor: jugador.rojas, color: "#991b1b", bg: "#fee2e2", emoji: "🔴" },
  ];
  return (
    <div>
      <Header onBack={onBack} titulo={`${jugador.apellido}, ${jugador.nombre}`} subtitulo={club.nombre} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <Card style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div style={{ width: 68, height: 68, borderRadius: "50%", background: club.color + "35", border: `2px solid ${club.color}70`, display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a1a", fontWeight: 700, fontSize: 22, flexShrink: 0 }}>
              {jugador.nombre[0]}{jugador.apellido[0]}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, color: "#111827" }}>{jugador.apellido}, {jugador.nombre}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>{jugador.posicion}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                <Badge color="#166534" bg="#dcfce7">{club.nombre}</Badge>
                <Badge color="#374151" bg="#f3f4f6">#{jugador.numero}</Badge>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {stats.map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "14px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>{s.emoji}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color, marginTop: 5 }}>{s.valor}</div>
                <div style={{ fontSize: 10, color: s.color, marginTop: 2, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>
        {golesDetalle.length > 0 && (
          <Card>
            <div style={{ padding: "9px 14px", background: "#dcfce7" }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>⚽ Goles</span>
            </div>
            {golesDetalle.map((g, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid #f0fdf4" }}>
                <Escudo club={g.rival} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>vs {g.rival.nombre}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{g.fechaNombre}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", background: "#f0fdf4", padding: "3px 10px", borderRadius: 20, flexShrink: 0 }}>{g.minuto}'</span>
              </div>
            ))}
          </Card>
        )}
        <Card style={{ padding: "10px 14px" }}>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>La foto se podrá cargar cuando conectemos la base de datos.</div>
        </Card>
      </div>
    </div>
  );
}

function Sancionados() {
  const { jugadores, clubes } = useContext(DatosContext);

  const suspendidos = jugadores.filter(j => j.rojas > 0).sort((a, b) => b.rojas - a.rojas);
  const acumuladores = jugadores.filter(j => j.amarillas >= 3).sort((a, b) => b.amarillas - a.amarillas);

  function FilaJugador({ jugador, etiqueta, etiquetaColor, etiquetaBg, detalle }) {
    const club = clubes.find(c => c.id === jugador.club);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: "1px solid #f0fdf4" }}>
        <Escudo club={club} size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jugador.apellido}, {jugador.nombre}</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{club.nombre}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: etiquetaColor, background: etiquetaBg, padding: "2px 8px", borderRadius: 20 }}>{etiqueta}</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{detalle}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card>
        <div style={{ padding: "9px 14px", background: "#dcfce7", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>🔴</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Suspendidos</span>
        </div>
        {suspendidos.length === 0
          ? <div style={{ padding: "14px", fontSize: 12, color: "#9ca3af", textAlign: "center" }}>Sin jugadores suspendidos</div>
          : suspendidos.map(j => (
            <FilaJugador key={j.id} jugador={j}
              etiqueta="Suspendido"
              etiquetaColor="#991b1b"
              etiquetaBg="#fee2e2"
              detalle={`${j.rojas} fecha${j.rojas > 1 ? "s" : ""} restante${j.rojas > 1 ? "s" : ""}`}
            />
          ))
        }
      </Card>
      <Card>
        <div style={{ padding: "9px 14px", background: "#dcfce7", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13 }}>🟡</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>Amarillas acumuladas</span>
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>3 o más</span>
        </div>
        {acumuladores.length === 0
          ? <div style={{ padding: "14px", fontSize: 12, color: "#9ca3af", textAlign: "center" }}>Sin jugadores en zona de sanción</div>
          : acumuladores.map(j => (
            <FilaJugador key={j.id} jugador={j}
              etiqueta={`${j.amarillas} 🟡`}
              etiquetaColor="#92400e"
              etiquetaBg="#fef3c7"
              detalle={j.amarillas >= 5 ? "¡Atención!" : "En riesgo"}
            />
          ))
        }
        <div style={{ padding: "7px 14px", fontSize: 11, color: "#6b7280", background: "#f0fdf4" }}>
          Al llegar a 5 amarillas se cumple fecha de suspensión
        </div>
      </Card>
    </div>
  );
}

const tabs = ["Posiciones", "Fixture", "Fair Play", "Goleadores", "Vallas", "Sancionados"];

function VistaTorneo({ torneo, zona, categoria, onBack }) {
  const [tab, setTab] = useState("Posiciones");
  const [equipoSel, setEquipoSel] = useState(null);
  const [jugadorSel, setJugadorSel] = useState(null);
  const [partidoSel, setPartidoSel] = useState(null);

  if (jugadorSel) return <VistaJugador jugador={jugadorSel} onBack={() => setJugadorSel(null)} />;
  if (equipoSel) return <VistaEquipo club={equipoSel} onVerJugador={setJugadorSel} onBack={() => setEquipoSel(null)} />;
  if (partidoSel) return <VistaPartido partido={partidoSel} onBack={() => setPartidoSel(null)} />;

  return (
    <div>
      <div style={{ background: config.color, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ padding: "13px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={onBack} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 10, padding: "5px 11px", cursor: "pointer", fontSize: 14 }}>←</button>
            <div>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{torneo.nombre}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 1 }}>{zona} · Categoría {categoria}</div>
            </div>
          </div>
          <div className="tabs-scroll" style={{ display: "flex", gap: 0, overflowX: "auto", msOverflowStyle: "none", scrollbarWidth: "none" }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "7px 11px", borderRadius: "8px 8px 0 0", border: "none", fontSize: 11,
                cursor: "pointer", whiteSpace: "nowrap", fontWeight: tab === t ? 700 : 500,
                background: "transparent",
                color: tab === t ? "#4ade80" : "rgba(255,255,255,0.55)",
                borderBottom: tab === t ? "2px solid #4ade80" : "2px solid transparent",
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        {tab === "Posiciones" && <Posiciones onVerEquipo={setEquipoSel} />}
        {tab === "Fixture" && <Fixture onVerPartido={setPartidoSel} />}
        {tab === "Fair Play" && <FairPlay />}
        {tab === "Goleadores" && <Goleadores onVerJugador={setJugadorSel} />}
        {tab === "Vallas" && <VallasInvictas />}
        {tab === "Sancionados" && <Sancionados />}
      </div>
    </div>
  );
}

const TORNEOS_DEFAULT = [
  { id: "FIM", nombre: "Fútbol Infantil Masculino", color: "#86efac", orden: 1 },
  { id: "FIF", nombre: "Fútbol Infantil Femenino", color: "#f9a8d4", orden: 2 },
  { id: "FJF", nombre: "Fútbol Juvenil Femenino", color: "#c4b5fd", orden: 3 },
];
const CATEGORIAS_DEFAULT = {
  FIM: ["2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019", "2020"],
  FIF: ["2011-2012", "2013-2014", "2015-2016", "2017-2018", "2019-2020"],
  FJF: ["Cuarta", "Reserva", "Primera", "Senior"],
};
const ZONAS_DEFAULT = ["Zona A", "Zona B", "Zona C"];

const LIGA_ID = "lifhur";

async function fetchDatos(ligaId = LIGA_ID) {
  const ligaRef = doc(db, "ligas", ligaId);
  const col = (nombre) => collection(ligaRef, nombre);

  const [clubesSnap, jugadoresSnap, partidosSnap, torneosSnap, categoriasSnap, zonasSnap] = await Promise.all([
    getDocs(col("clubes")),
    getDocs(col("jugadores")),
    getDocs(col("partidos")),
    getDocs(col("torneos")),
    getDocs(col("categorias")),
    getDocs(col("zonas")),
  ]);

  const torneosFS = torneosSnap.docs.map(d => d.data()).sort((a, b) => a.orden - b.orden);
  const categoriasFS = Object.fromEntries(categoriasSnap.docs.map(d => [d.id, d.data().lista]));
  const zonasFS = zonasSnap.docs.map(d => d.data()).sort((a, b) => a.orden - b.orden).map(z => z.nombre);

  return {
    clubes: clubesSnap.docs.map(d => d.data()).sort((a, b) => a.id - b.id),
    jugadores: jugadoresSnap.docs.map(d => d.data()).sort((a, b) => a.id - b.id),
    partidos: partidosSnap.docs.map(d => d.data()).sort((a, b) => a.id - b.id),
    torneos: torneosFS.length > 0 ? torneosFS : TORNEOS_DEFAULT,
    categorias: Object.keys(categoriasFS).length > 0 ? categoriasFS : CATEGORIAS_DEFAULT,
    zonas: zonasFS.length > 0 ? zonasFS : ZONAS_DEFAULT,
  };
}

function BannerInstalar() {
  const [visible, setVisible] = useState(() => localStorage.getItem('lifhur-banner-cerrado') !== '1');

  if (!visible) return null;

  function cerrar() {
    localStorage.setItem('lifhur-banner-cerrado', '1');
    setVisible(false);
  }

  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const esAndroid = /android/i.test(navigator.userAgent);

  return (
    <div style={{ background: "#1a3a2a", border: "1px solid #4ade8040", borderRadius: 14, padding: "13px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ fontSize: 22, flexShrink: 0 }}>📲</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", marginBottom: 5 }}>Instalá LifHur en tu celu</div>
        {esIOS ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Tocá el botón <span style={{ color: "#4ade80", fontWeight: 600 }}>Compartir</span> del navegador y elegí <span style={{ color: "#4ade80", fontWeight: 600 }}>"Agregar a pantalla de inicio"</span>
          </div>
        ) : esAndroid ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Tocá los <span style={{ color: "#4ade80", fontWeight: 600 }}>3 puntitos</span> del navegador y elegí <span style={{ color: "#4ade80", fontWeight: 600 }}>"Agregar a pantalla de inicio"</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            <div>📱 <span style={{ fontWeight: 600, color: "#4ade80" }}>Android:</span> tocá los 3 puntitos → "Agregar a pantalla de inicio"</div>
            <div style={{ marginTop: 3 }}>🍎 <span style={{ fontWeight: 600, color: "#4ade80" }}>iPhone:</span> tocá Compartir → "Agregar a pantalla de inicio"</div>
          </div>
        )}
      </div>
      <button onClick={cerrar} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

export default function App() {
  const [pantalla, setPantalla] = useState("inicio");
  const [torneoSel, setTorneoSel] = useState(null);
  const [zonaSel, setZonaSel] = useState(null);
  const [categoriaSel, setCategoriaSel] = useState(null);
  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);

  useEffect(() => {
    fetchDatos().then(setDatos).catch(err => setErrorCarga(err.message));
  }, []);

  if (errorCarga) {
    return (
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div style={{ color: "#dc2626", fontSize: 14, marginBottom: 12 }}>Error al conectar con Firestore</div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>{errorCarga}</div>
      </div>
    );
  }

  if (!datos) {
    return (
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: config.color, padding: "26px 16px 22px" }}>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: 0 }}>{config.nombre}</h1>
          <p style={{ color: "#86efac", fontSize: 13, margin: "4px 0 0" }}>Cargando datos...</p>
        </div>
        <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #dcfce7", borderTopColor: "#4ade80", animation: "spin 0.8s linear infinite" }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } .tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
      </div>
    );
  }

  const { torneos, categorias, zonas } = datos;

  if (pantalla === "torneo") {
    return (
      <DatosContext.Provider value={datos}>
        <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <VistaTorneo torneo={torneoSel} zona={zonaSel} categoria={categoriaSel}
            onBack={() => { setPantalla("categoria"); setCategoriaSel(null); }} />
        </div>
      </DatosContext.Provider>
    );
  }

  return (
    <DatosContext.Provider value={datos}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: config.color, padding: "26px 16px 22px" }}>
          {pantalla !== "inicio" && (
            <button onClick={() => {
              if (pantalla === "zona") { setPantalla("inicio"); setTorneoSel(null); }
              if (pantalla === "categoria") { setPantalla("zona"); setZonaSel(null); }
            }} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 10, padding: "5px 11px", cursor: "pointer", fontSize: 14, marginBottom: 10, display: "block" }}>←</button>
          )}
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: 0 }}>{config.nombre}</h1>
          <p style={{ color: "#86efac", fontSize: 13, margin: "4px 0 0" }}>
            {pantalla === "inicio" && "Seleccioná un torneo"}
            {pantalla === "zona" && torneoSel?.nombre}
            {pantalla === "categoria" && `${torneoSel?.nombre} · ${zonaSel}`}
          </p>
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {pantalla === "inicio" && <BannerInstalar />}
          {pantalla === "inicio" && torneos.map(t => (
            <div key={t.id} onClick={() => { setTorneoSel(t); setPantalla("zona"); }}
              style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #dcfce7", boxShadow: sombra, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: t.color + "50", border: `1.5px solid ${t.color}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#111827", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{t.id}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{t.nombre}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{categorias[t.id]?.length ?? 0} categorías</div>
              </div>
              <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
            </div>
          ))}
          {pantalla === "zona" && zonas.map(zona => (
            <div key={zona} onClick={() => { setZonaSel(zona); setPantalla("categoria"); }}
              style={{ background: "#fff", borderRadius: 14, padding: "13px 14px", border: "1px solid #dcfce7", boxShadow: sombra, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{zona}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{torneoSel?.nombre}</div>
              </div>
              <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
            </div>
          ))}
          {pantalla === "categoria" && categorias[torneoSel.id].map(cat => (
            <div key={cat} onClick={() => { setCategoriaSel(cat); setPantalla("torneo"); }}
              style={{ background: "#fff", borderRadius: 14, padding: "13px 14px", border: "1px solid #dcfce7", boxShadow: sombra, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Categoría {cat}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{torneoSel?.nombre} · {zonaSel}</div>
              </div>
              <span style={{ fontSize: 16, color: "#d1d5db" }}>›</span>
            </div>
          ))}
        </div>
      </div>
    </DatosContext.Provider>
  );
}
