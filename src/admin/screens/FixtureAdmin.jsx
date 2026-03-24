import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { Card, Modal, Switch, BtnPrimary, Campo, InputAdmin, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

// ── Round-robin: último slot fijo, los demás rotan a la izquierda ─────────────
function calcRondas(slots) {
  const arr = [...slots];
  if (arr.length % 2 !== 0) arr.push(null);
  const n = arr.length;
  const fixed = arr[n - 1];
  const rot = arr.slice(0, n - 1);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    pairs.push([rot[0], fixed]);
    for (let i = 1; i < n / 2; i++) {
      pairs.push([rot[n - 1 - i], rot[i]]);
    }
    rounds.push(pairs);
    rot.push(rot.shift());
  }
  return rounds;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FixtureAdmin({ zonaRef, zona }) {
  const [publicado,  setPublicado]  = useState(zona.publicado ?? false);
  const [clubes,     setClubes]     = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando,   setCargando]   = useState(true);

  useEffect(() => {
    (async () => {
      const [cs, cats] = await Promise.all([
        getDocs(collection(zonaRef, "clubes")),
        getDocs(collection(zonaRef, "categorias")),
      ]);
      setClubes(cs.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setCategorias(cats.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999)));
      setCargando(false);
    })();
  }, []);

  if (cargando) return <Spinner />;

  if (publicado) return <PostPublicacion zonaRef={zonaRef} zona={zona} clubes={clubes} categorias={categorias} />;
  return <PrePublicacion zonaRef={zonaRef} zona={zona} clubes={clubes} categorias={categorias} onPublicado={() => setPublicado(true)} />;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRE-PUBLICACIÓN
// ══════════════════════════════════════════════════════════════════════════════
function PrePublicacion({ zonaRef, zona, clubes, categorias, onPublicado }) {
  const N = clubes.length;

  const [assigned,   setAssigned]   = useState(() => Array(N).fill(""));
  const [idaYVuelta, setIdaYVuelta] = useState(false);
  const [fechas,     setFechas]     = useState([]);
  const [publicando, setPublicando] = useState(false);
  const [error,      setError]      = useState("");

  const rondas = useMemo(() => {
    const slots = assigned.map(id => id || null);
    const r = calcRondas(slots);
    return idaYVuelta ? [...r, ...r.map(rnd => rnd.map(([l, v]) => [v, l]))] : r;
  }, [assigned, idaYVuelta]);

  useEffect(() => {
    setFechas(prev => {
      const a = [...prev];
      while (a.length < rondas.length) a.push("");
      return a.slice(0, rondas.length);
    });
  }, [rondas.length]);

  function setAsignado(idx, clubId) {
    setAssigned(prev => { const a = [...prev]; a[idx] = clubId; return a; });
  }
  function setFecha(idx, val) {
    setFechas(prev => { const a = [...prev]; a[idx] = val; return a; });
  }

  const todosAsignados = assigned.every(id => id !== "");
  const hayPareja      = N >= 2;

  function buildFixtureBase() {
    return rondas.flatMap((ronda, ji) =>
      ronda.map(([lId, vId]) => {
        const esLibre      = lId === null || vId === null;
        const realLocalId  = lId  ?? vId;
        const realVisId    = lId !== null && vId !== null ? vId : null;
        const lClub        = clubes.find(c => c.docId === realLocalId);
        const vClub        = realVisId ? clubes.find(c => c.docId === realVisId) : null;
        return {
          jornada:         ji + 1,
          fecha:           fechas[ji] || "",
          esLibre,
          localId:         realLocalId  ?? null,
          visitanteId:     realVisId    ?? null,
          localNombre:     lClub?.nombre ?? "",
          visitanteNombre: vClub?.nombre ?? "",
        };
      })
    );
  }

  async function publicar() {
    if (!hayPareja)            { setError("Necesitás al menos 2 clubes."); return; }
    if (!todosAsignados)       { setError("Asigná un club a cada posición."); return; }
    if (categorias.length === 0) { setError("Agregá al menos una categoría antes de publicar."); return; }
    const fixtureBase = buildFixtureBase();
    const reales = fixtureBase.filter(p => !p.esLibre);
    if (reales.length === 0)   { setError("No se generaron partidos."); return; }

    setPublicando(true); setError("");
    try {
      for (const cat of categorias) {
        const pCol = collection(doc(collection(zonaRef, "categorias"), cat.docId), "partidos");
        for (let i = 0; i < fixtureBase.length; i += 400) {
          const batch = writeBatch(db);
          fixtureBase.slice(i, i + 400).forEach(p => {
            batch.set(doc(pCol), {
              ...p,
              ...(p.esLibre ? {} : { jugado: false, golesLocal: null, golesVisitante: null, goles: [], tarjetas: [] }),
            });
          });
          await batch.commit();
        }
      }
      await updateDoc(zonaRef, { publicado: true, idaYVuelta, fixtureBase });
      onPublicado();
    } catch (e) { setError("Error: " + e.message); }
    finally     { setPublicando(false); }
  }

  const totalReales = rondas.reduce((s, r) => s + r.filter(([l, v]) => l !== null && v !== null).length, 0);

  return (
    <>
      <SeccionLabel>Asignación de equipos</SeccionLabel>

      {N < 2 ? (
        <Aviso>Agregá al menos 2 clubes en la pestaña "Clubes".</Aviso>
      ) : (
        <Card>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: N }, (_, i) => {
              const selId   = assigned[i];
              const selClub = clubes.find(c => c.docId === selId);
              const opts    = clubes.filter(c => !assigned.some((a, j) => j !== i && a === c.docId));
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <NumBadge n={i + 1} fijo={i === N - 1 && N % 2 === 0} />
                  <div style={{ width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {selClub ? <LogoMini club={selClub} size={32} /> : <div style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px dashed #d1fae5" }} />}
                  </div>
                  <select
                    value={selId}
                    onChange={e => setAsignado(i, e.target.value)}
                    style={{ flex: 1, border: "1px solid #d1fae5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: selId ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}
                  >
                    <option value="">— Sin asignar —</option>
                    {opts.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
                  </select>
                </div>
              );
            })}
            {N % 2 !== 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <NumBadge n={N + 1} fijo />
                <div style={{ width: 32, height: 32 }} />
                <div style={{ flex: 1, border: "1px solid #fde047", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, color: "#854d0e", background: "#fefce8" }}>
                  LIBRE (descanso rotativo)
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {N >= 2 && (
        <Card>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <Switch value={idaYVuelta} onChange={setIdaYVuelta} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Ida y vuelta</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {idaYVuelta
                  ? `${rondas.length / 2} fechas ida + ${rondas.length / 2} vuelta = ${rondas.length} fechas`
                  : `${rondas.length} fechas`}
              </div>
            </div>
          </div>
        </Card>
      )}

      {todosAsignados && hayPareja && rondas.length > 0 && (
        <>
          <SeccionLabel>Fixture — {totalReales} partidos · {rondas.length} fechas</SeccionLabel>
          {rondas.map((ronda, ji) => {
            const realesEnFecha = ronda.filter(([l, v]) => l !== null && v !== null);
            const libreId  = ronda.find(([l, v]) => l === null || v === null)?.find(x => x !== null) ?? null;
            const libreClub = libreId ? clubes.find(c => c.docId === libreId) : null;
            return (
              <Card key={ji}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1a3a2a", whiteSpace: "nowrap" }}>Fecha {ji + 1}</span>
                  <span style={{ color: "#9ca3af", fontSize: 14 }}>—</span>
                  <input
                    type="date" value={fechas[ji] || ""} onChange={e => setFecha(ji, e.target.value)}
                    style={{ border: "none", background: "transparent", fontSize: 12, color: "#374151", cursor: "pointer", outline: "none", flex: 1 }}
                  />
                </div>
                <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {realesEnFecha.map(([lId, vId], pi) => {
                    const lClub = clubes.find(c => c.docId === lId);
                    const vClub = clubes.find(c => c.docId === vId);
                    return (
                      <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lClub?.nombre ?? "—"}</span>
                          <LogoMini club={lClub} size={24} />
                        </div>
                        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, minWidth: 24, textAlign: "center" }}>vs</span>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <LogoMini club={vClub} size={24} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vClub?.nombre ?? "—"}</span>
                        </div>
                      </div>
                    );
                  })}
                  {libreClub && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
                      <LogoMini club={libreClub} size={20} />
                      <span style={{ fontSize: 12, color: "#374151" }}>{libreClub.nombre}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, background: "#fef9c3", color: "#854d0e", padding: "2px 8px", borderRadius: 20 }}>LIBRE</span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}
      {categorias.length === 0 && (
        <Aviso>Agregá al menos una categoría en la pestaña "Categorías" antes de publicar.</Aviso>
      )}
      {todosAsignados && hayPareja && totalReales > 0 && categorias.length > 0 && (
        <button
          onClick={publicar} disabled={publicando}
          style={{ background: publicando ? "#6b7280" : "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 12, padding: "15px 16px", cursor: publicando ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, width: "100%", marginTop: 4 }}
        >
          {publicando ? "Publicando..." : `🚀 Publicar torneo · ${totalReales} partidos × ${categorias.length} categoría${categorias.length !== 1 ? "s" : ""}`}
        </button>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// POST-PUBLICACIÓN
// ══════════════════════════════════════════════════════════════════════════════
function PostPublicacion({ zonaRef, zona, clubes, categorias }) {
  const [catSelId,   setCatSelId]   = useState(categorias[0]?.docId || "");
  const [partidos,   setPartidos]   = useState([]);
  const [cargando,   setCargando]   = useState(false);
  const [jornadaSel, setJornadaSel] = useState(1);
  const [modalGoles, setModalGoles] = useState(null);

  useEffect(() => {
    if (catSelId) { setJornadaSel(1); cargarPartidos(catSelId); }
  }, [catSelId]);

  async function cargarPartidos(catId) {
    setCargando(true);
    const snap = await getDocs(collection(doc(collection(zonaRef, "categorias"), catId), "partidos"));
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.jornada - b.jornada);
    setPartidos(items);
    setCargando(false);
  }

  async function guardarResultado(partido, datos) {
    const pDoc = doc(collection(doc(collection(zonaRef, "categorias"), catSelId), "partidos"), partido.docId);
    await updateDoc(pDoc, datos);
    setPartidos(ps => ps.map(p => p.docId === partido.docId ? { ...p, ...datos } : p));
  }

  if (categorias.length === 0) return <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Este torneo no tiene categorías configuradas" />;

  const jornadaNumbers = [...new Set(partidos.map(p => p.jornada))].sort((a, b) => a - b);
  const partidosFecha  = partidos.filter(p => p.jornada === jornadaSel);

  return (
    <>
      {/* Selector de categoría */}
      {categorias.length > 1 && (
        <Campo label="Categoría">
          <SelectAdmin value={catSelId} onChange={e => setCatSelId(e.target.value)}>
            {categorias.map(cat => <option key={cat.docId} value={cat.docId}>{cat.nombre}</option>)}
          </SelectAdmin>
        </Campo>
      )}

      {cargando ? <Spinner /> : (
        <>
          {/* Selector de fecha */}
          {jornadaNumbers.length > 0 && (
            <Campo label="Fecha">
              <SelectAdmin value={jornadaSel} onChange={e => setJornadaSel(Number(e.target.value))}>
                {jornadaNumbers.map(j => {
                  const pj      = partidos.filter(p => p.jornada === j);
                  const fl      = pj[0]?.fecha ? ` — ${fechaLeg(pj[0].fecha)}` : "";
                  const jugados = pj.filter(p => !p.esLibre && p.jugado).length;
                  const total   = pj.filter(p => !p.esLibre).length;
                  return <option key={j} value={j}>Fecha {j}{fl} ({jugados}/{total})</option>;
                })}
              </SelectAdmin>
            </Campo>
          )}

          {/* Header de la fecha */}
          {partidosFecha.length > 0 && (
            <SeccionLabel>
              Fecha {jornadaSel}{partidosFecha[0]?.fecha ? ` — ${fechaLeg(partidosFecha[0].fecha)}` : ""}
            </SeccionLabel>
          )}

          {/* Partidos de la fecha */}
          {partidosFecha.map(p => p.esLibre
            ? <LibreRow key={p.docId} partido={p} clubes={clubes} />
            : <PartidoRowInline
                key={p.docId}
                partido={p}
                clubes={clubes}
                onGuardar={datos => guardarResultado(p, datos)}
                onAbrirGoles={() => setModalGoles(partidos.find(x => x.docId === p.docId))}
              />
          )}
        </>
      )}

      {modalGoles && (
        <GolesModal
          partido={modalGoles}
          clubes={clubes}
          onGuardar={async d => { await guardarResultado(modalGoles, d); setModalGoles(null); }}
          onClose={() => setModalGoles(null)}
        />
      )}
    </>
  );
}

// ── Fila partido inline ───────────────────────────────────────────────────────
function PartidoRowInline({ partido, clubes, onGuardar, onAbrirGoles }) {
  const [jugado,    setJugado]    = useState(partido.jugado ?? false);
  const [gl,        setGl]        = useState(partido.golesLocal     != null ? String(partido.golesLocal)     : "");
  const [gv,        setGv]        = useState(partido.golesVisitante != null ? String(partido.golesVisitante) : "");
  const [guardando, setGuardando] = useState(false);

  const lClub = clubes.find(c => c.docId === partido.localId);
  const vClub = clubes.find(c => c.docId === partido.visitanteId);

  const origJugado = partido.jugado ?? false;
  const origGl = partido.golesLocal     != null ? String(partido.golesLocal)     : "";
  const origGv = partido.golesVisitante != null ? String(partido.golesVisitante) : "";
  const isDirty = jugado !== origJugado || (jugado && (gl !== origGl || gv !== origGv));

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar({
        jugado,
        golesLocal:     jugado && gl !== "" ? parseInt(gl)     : null,
        golesVisitante: jugado && gv !== "" ? parseInt(gv)     : null,
        goles:    jugado ? (partido.goles    || []) : [],
        tarjetas: jugado ? (partido.tarjetas || []) : [],
      });
    } finally { setGuardando(false); }
  }

  return (
    <Card style={{ marginBottom: 6 }}>
      <div style={{ padding: "10px 12px 8px" }}>
        {/* Clubs + score */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lClub?.nombre || partido.localNombre}
            </span>
            <LogoMini club={lClub} size={22} />
          </div>
          {jugado ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <input type="number" min="0" value={gl} onChange={e => setGl(e.target.value)}
                style={{ width: 40, textAlign: "center", border: "1px solid #dcfce7", borderRadius: 6, padding: "4px", fontSize: 14, fontWeight: 700, color: "#111827", background: "#fff", outline: "none" }} />
              <span style={{ color: "#9ca3af", fontWeight: 700 }}>—</span>
              <input type="number" min="0" value={gv} onChange={e => setGv(e.target.value)}
                style={{ width: 40, textAlign: "center", border: "1px solid #dcfce7", borderRadius: 6, padding: "4px", fontSize: 14, fontWeight: 700, color: "#111827", background: "#fff", outline: "none" }} />
            </div>
          ) : (
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, minWidth: 50, textAlign: "center", flexShrink: 0 }}>vs</span>
          )}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <LogoMini club={vClub} size={22} />
            <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {vClub?.nombre || partido.visitanteNombre}
            </span>
          </div>
        </div>
        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Switch value={jugado} onChange={v => { setJugado(v); if (!v) { setGl(""); setGv(""); } }} />
          <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>Jugado</span>
          {partido.jugado && (
            <button onClick={onAbrirGoles}
              style={{ background: "none", border: "1px solid #dcfce7", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, color: "#374151", fontWeight: 600 }}>
              ⚽ Goles / Tarjetas
            </button>
          )}
          {isDirty && (
            <button onClick={guardar} disabled={guardando}
              style={{ background: guardando ? "#6b7280" : "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "5px 12px", cursor: guardando ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700 }}>
              {guardando ? "..." : "✓ Guardar"}
            </button>
          )}
        </div>
        {/* Goles/tarjetas summary */}
        {partido.jugado && (partido.goles?.length > 0 || partido.tarjetas?.length > 0) && (
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {partido.goles?.map((g, i) => (
              <span key={i} style={{ fontSize: 10, background: "#f0fdf4", color: "#374151", borderRadius: 4, padding: "2px 6px" }}>
                ⚽ {g.nombre}{g.cantidad > 1 ? ` ×${g.cantidad}` : ""}
              </span>
            ))}
            {partido.tarjetas?.map((t, i) => (
              <span key={i} style={{ fontSize: 10, background: t.tipo === "roja" ? "#fef2f2" : "#fefce8", color: t.tipo === "roja" ? "#dc2626" : "#854d0e", borderRadius: 4, padding: "2px 6px" }}>
                {t.tipo === "roja" ? "🟥" : "🟨"} {t.nombre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Fila LIBRE ────────────────────────────────────────────────────────────────
function LibreRow({ partido, clubes }) {
  const club = clubes.find(c => c.docId === partido.localId);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fefce8", border: "1px solid #fde047", borderRadius: 10, marginBottom: 6 }}>
      <LogoMini club={club} size={22} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{club?.nombre || partido.localNombre}</span>
      <span style={{ fontSize: 11, fontWeight: 700, background: "#fde047", color: "#854d0e", borderRadius: 20, padding: "2px 8px" }}>LIBRE</span>
    </div>
  );
}

// ── Modal goles y tarjetas ────────────────────────────────────────────────────
function GolesModal({ partido, clubes, onGuardar, onClose }) {
  const [goles,    setGoles]    = useState(partido.goles    || []);
  const [tarjetas, setTarjetas] = useState(partido.tarjetas || []);
  const [fGol,     setFGol]     = useState({ nombre: "", equipo: "local", cantidad: "1" });
  const [fTarj,    setFTarj]    = useState({ nombre: "", equipo: "local", tipo: "amarilla" });

  const lN = clubes.find(c => c.docId === partido.localId)?.nombre     || partido.localNombre     || "Local";
  const vN = clubes.find(c => c.docId === partido.visitanteId)?.nombre  || partido.visitanteNombre || "Visitante";
  const eqLbl = eq => eq === "local" ? lN : vN;

  const agrGol  = () => {
    if (!fGol.nombre.trim()) return;
    setGoles(g => [...g, { nombre: fGol.nombre.trim(), equipo: fGol.equipo, cantidad: Math.max(1, parseInt(fGol.cantidad) || 1) }]);
    setFGol(f => ({ ...f, nombre: "" }));
  };
  const agrTarj = () => {
    if (!fTarj.nombre.trim()) return;
    setTarjetas(t => [...t, { nombre: fTarj.nombre.trim(), equipo: fTarj.equipo, tipo: fTarj.tipo }]);
    setFTarj(f => ({ ...f, nombre: "" }));
  };

  return (
    <Modal titulo={`${lN} vs ${vN}`} onClose={onClose}>
      <SeccionLabel>Goles</SeccionLabel>
      {goles.map((g, i) => (
        <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, paddingBottom: 2, alignItems: "center" }}>
          <span style={{ flex: 1 }}>⚽ {g.nombre} <span style={{ color: "#6b7280" }}>({eqLbl(g.equipo)})</span>{g.cantidad > 1 && <b style={{ color: "#166534" }}> ×{g.cantidad}</b>}</span>
          <button onClick={() => setGoles(gs => gs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6, alignItems: "end" }}>
        <Campo label="Jugador"><InputAdmin value={fGol.nombre} onChange={e => setFGol(f => ({ ...f, nombre: e.target.value }))} onKeyDown={e => e.key === "Enter" && agrGol()} placeholder="Nombre" /></Campo>
        <Campo label="Equipo"><SelectAdmin value={fGol.equipo} onChange={e => setFGol(f => ({ ...f, equipo: e.target.value }))}><option value="local">{lN}</option><option value="visitante">{vN}</option></SelectAdmin></Campo>
        <Campo label="Cant."><InputAdmin type="number" min="1" max="9" value={fGol.cantidad} onChange={e => setFGol(f => ({ ...f, cantidad: e.target.value }))} style={{ width: 54 }} /></Campo>
        <div><button onClick={agrGol} style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, height: 40 }}>+</button></div>
      </div>

      <SeccionLabel>Tarjetas</SeccionLabel>
      {tarjetas.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 6, fontSize: 12, paddingBottom: 2, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{t.tipo === "roja" ? "🟥" : "🟨"} {t.nombre} <span style={{ color: "#6b7280" }}>({eqLbl(t.equipo)})</span></span>
          <button onClick={() => setTarjetas(ts => ts.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6, alignItems: "end" }}>
        <Campo label="Jugador"><InputAdmin value={fTarj.nombre} onChange={e => setFTarj(f => ({ ...f, nombre: e.target.value }))} onKeyDown={e => e.key === "Enter" && agrTarj()} placeholder="Nombre" /></Campo>
        <Campo label="Equipo"><SelectAdmin value={fTarj.equipo} onChange={e => setFTarj(f => ({ ...f, equipo: e.target.value }))}><option value="local">{lN}</option><option value="visitante">{vN}</option></SelectAdmin></Campo>
        <Campo label="Tipo"><SelectAdmin value={fTarj.tipo} onChange={e => setFTarj(f => ({ ...f, tipo: e.target.value }))}><option value="amarilla">Amarilla</option><option value="roja">Roja</option></SelectAdmin></Campo>
        <div><button onClick={agrTarj} style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, height: 40 }}>+</button></div>
      </div>

      <BtnPrimary onClick={() => onGuardar({ goles, tarjetas })} fullWidth>Guardar</BtnPrimary>
    </Modal>
  );
}

// ── Micro-components ──────────────────────────────────────────────────────────
function NumBadge({ n, fijo }) {
  return (
    <div style={{ minWidth: 28, height: 28, borderRadius: 8, background: fijo ? "#1a3a2a" : "#f0fdf4", border: fijo ? "none" : "1.5px solid #dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: fijo ? "#4ade80" : "#6b7280" }}>{n}</span>
    </div>
  );
}

function Aviso({ children, tipo }) {
  const isErr = tipo === "error";
  return (
    <div style={{ background: isErr ? "#fef2f2" : "#fef9c3", border: `1px solid ${isErr ? "#fecaca" : "#fde047"}`, borderRadius: 12, padding: "12px 16px", fontSize: 13, color: isErr ? "#dc2626" : "#854d0e" }}>
      {children}
    </div>
  );
}

function LogoMini({ club, size = 22 }) {
  if (!club) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#f0fdf4", flexShrink: 0 }} />;
  if (club.logoUrl) return <img src={club.logoUrl} alt={club.nombre} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid #dcfce7" }} />;
  const ini = (club.nombre || "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#f0fdf4", border: "1px solid #dcfce7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 700, color: "#1a3a2a", flexShrink: 0 }}>
      {ini}
    </div>
  );
}

function fechaLeg(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
