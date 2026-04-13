import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, updateDoc, writeBatch, addDoc, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { Card, Modal, Switch, BtnPrimary, Campo, InputAdmin, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

// ── Round-robin Berger con rotación intercalada ───────────────────────────────
// El elemento fijo (slot más alto, o null/LIBRE para N impar) alterna local/visitante.
// Secuencia de shifts para n=14: 0,7,1,8,2,9,3,10,4,11,5,12,6
//   Ronda r par   (0,2,4…): shift = r/2,           fijo es VISITANTE
//   Ronda r impar (1,3,5…): shift = (r-1)/2 + half, fijo es LOCAL
// Para otros N el patrón se extrapola automáticamente.
function calcRondas(slots) {
  const N    = slots.length;
  const isOdd = N % 2 !== 0;
  const n    = isOdd ? N + 1 : N;   // n siempre par
  const half = n / 2;
  const len  = n - 1;               // tamaño del círculo

  // Elemento fijo: último slot real (N par) o null=LIBRE (N impar)
  const fixed  = isOdd ? null : slots[N - 1];
  const circle = isOdd ? [...slots] : slots.slice(0, N - 1);

  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const fixedEsVisitante = r % 2 === 0;
    const shift = fixedEsVisitante
      ? Math.floor(r / 2)
      : Math.floor((r - 1) / 2) + half;

    const rot = Array.from({ length: len }, (_, j) => circle[(j + shift) % len]);

    const pairs = [];
    pairs.push(fixedEsVisitante ? [rot[0], fixed] : [fixed, rot[0]]);
    for (let i = 1; i < half; i++) {
      pairs.push([rot[i], rot[len - i]]);
    }
    rounds.push(pairs);
  }
  return rounds;
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FixtureAdmin({ zonaRef, zona, ligaId, clubes, categorias, publicado, onPublicado, onEditarFixture }) {
  const sortedClubes = [...clubes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sortedCats   = [...categorias].sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));

  if (publicado) {
    return (
      <PostPublicacion
        zonaRef={zonaRef} zona={zona} clubes={sortedClubes} categorias={sortedCats}
        ligaId={ligaId}
        onEditarFixture={onEditarFixture}
      />
    );
  }
  return (
    <PrePublicacion
      zonaRef={zonaRef} zona={zona} clubes={sortedClubes} categorias={sortedCats}
      onPublicado={onPublicado}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PRE-PUBLICACIÓN
// ══════════════════════════════════════════════════════════════════════════════
function PrePublicacion({ zonaRef, zona, clubes, categorias, onPublicado }) {
  const N     = clubes.length;
  const realN = N; // calcRondas agrega null interno para impar — todos los equipos necesitan slot

  const [assigned,   setAssigned]   = useState(() => Array(realN).fill(""));
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
  const hayPareja      = realN >= 2;

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
    ).map((p, idx) => ({ ...p, orden: idx }));
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
        <Aviso>Agregá clubes a la competencia y asigná participantes en la pestaña "Participantes".</Aviso>
      ) : (
        <Card>
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: realN }, (_, i) => {
              const selId   = assigned[i];
              const selClub = clubes.find(c => c.docId === selId);
              const opts    = clubes.filter(c => !assigned.some((a, j) => j !== i && a === c.docId));
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <NumBadge n={i + 1} fijo={N % 2 === 0 && i === realN - 1} />
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
            {N !== realN && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <NumBadge n={N} fijo />
                <div style={{ width: 32, height: 32 }} />
                <div style={{ flex: 1, border: "1px solid #fde047", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, color: "#854d0e", background: "#fefce8" }}>
                  LIBRE (el número más alto no juega)
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
        <Aviso>Agregá al menos una categoría en la competencia antes de publicar.</Aviso>
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
function PostPublicacion({ zonaRef, zona, clubes, categorias, ligaId, onEditarFixture }) {
  const [catSelId,      setCatSelId]      = useState(categorias[0]?.docId || "");
  const [partidos,      setPartidos]      = useState([]);
  const [cargando,      setCargando]      = useState(false);
  const [jornadaSel,    setJornadaSel]    = useState(1);
  const [modalGoles,    setModalGoles]    = useState(null);
  const [hayResultados, setHayResultados] = useState(null);
  const [modalConfEdit, setModalConfEdit] = useState(false);
  const [editando,      setEditando]      = useState(false);

  useEffect(() => {
    verificarResultados();
  }, []);

  // Carga partidos cuando cambia la categoría seleccionada
  useEffect(() => {
    if (catSelId) { setJornadaSel(1); cargarPartidos(catSelId); }
  }, [catSelId]);

  async function verificarResultados() {
    try {
      for (const cat of categorias) {
        const snap = await getDocs(collection(doc(collection(zonaRef, "categorias"), cat.docId), "partidos"));
        if (snap.docs.some(d => d.data().jugado === true)) {
          setHayResultados(true);
          return;
        }
      }
      setHayResultados(false);
    } catch { setHayResultados(false); }
  }

  async function confirmarEditarFixture() {
    setEditando(true);
    try {
      for (const cat of categorias) {
        const catRef = doc(collection(zonaRef, "categorias"), cat.docId);
        const snap   = await getDocs(collection(catRef, "partidos"));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await updateDoc(zonaRef, { publicado: false, fixtureBase: [] });
      onEditarFixture();
    } catch (e) { console.error("Error borrando fixture:", e); }
    finally { setEditando(false); setModalConfEdit(false); }
  }

  async function cargarPartidos(catId) {
    setCargando(true);
    const snap = await getDocs(collection(doc(collection(zonaRef, "categorias"), catId), "partidos"));
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.jornada - b.jornada || (a.orden ?? 0) - (b.orden ?? 0));
    setPartidos(items);
    setCargando(false);
  }

  async function guardarResultado(partido, datos) {
    const pDoc = doc(collection(doc(collection(zonaRef, "categorias"), catSelId), "partidos"), partido.docId);
    await updateDoc(pDoc, datos);
    setPartidos(ps => ps.map(p => p.docId === partido.docId ? { ...p, ...datos } : p));
    // Actualizar el partido dentro del modal de goles si está abierto
    setModalGoles(prev => prev?.docId === partido.docId ? { ...prev, ...datos } : prev);
  }

  if (categorias.length === 0) return <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Este torneo no tiene categorías configuradas" />;

  const jornadaNumbers = [...new Set(partidos.map(p => p.jornada))].sort((a, b) => a - b);
  const partidosFecha  = partidos.filter(p => p.jornada === jornadaSel)
    .sort((a, b) => (a.esLibre ? 1 : 0) - (b.esLibre ? 1 : 0));

  return (
    <>
      {/* Editar fixture */}
      {hayResultados === false && (
        <button
          onClick={() => setModalConfEdit(true)}
          style={{ background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 12, padding: "11px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, width: "100%", marginBottom: 4 }}
        >
          ✏️ Editar fixture
        </button>
      )}
      {hayResultados === true && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12, padding: "11px 16px", fontSize: 13, color: "#991b1b", fontWeight: 600, marginBottom: 4 }}>
          ⚠️ No se puede editar el fixture porque ya hay resultados cargados.
        </div>
      )}

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
                  const sinGoles = pj.filter(p => !p.esLibre && p.jugado && (p.goles || []).reduce((s, g) => s + (g.cantidad || 1), 0) !== (p.golesLocal ?? 0) + (p.golesVisitante ?? 0)).length;
                  return (
                    <option key={j} value={j}>
                      Fecha {j}{fl} ({jugados}/{total}){sinGoles > 0 ? " ⚠️" : ""}
                    </option>
                  );
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
          ligaId={ligaId}
          catId={catSelId}
          onGuardar={async d => { await guardarResultado(modalGoles, d); setModalGoles(null); }}
          onClose={() => setModalGoles(null)}
        />
      )}

      {modalConfEdit && (
        <Modal titulo="¿Editar fixture?" onClose={() => setModalConfEdit(false)}>
          <div style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
            Se borrarán todos los partidos generados y podrás configurar el fixture nuevamente. Esta acción no se puede deshacer.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setModalConfEdit(false)}
              style={{ flex: 1, background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              Cancelar
            </button>
            <button
              onClick={confirmarEditarFixture}
              disabled={editando}
              style={{ flex: 1, background: editando ? "#9ca3af" : "#c2410c", color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: editando ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700 }}
            >
              {editando ? "Borrando..." : "Sí, editar fixture"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Fila partido inline ───────────────────────────────────────────────────────
export function PartidoRowInline({ partido, clubes, onGuardar, onAbrirGoles }) {
  const [jugado,       setJugado]       = useState(partido.jugado ?? false);
  const [gl,           setGl]           = useState(partido.golesLocal     != null ? String(partido.golesLocal)     : "");
  const [gv,           setGv]           = useState(partido.golesVisitante != null ? String(partido.golesVisitante) : "");
  const [perdidoAmbos, setPerdidoAmbos] = useState(partido.perdidoAmbos ?? false);
  const [guardando,    setGuardando]    = useState(false);
  const [error,        setError]        = useState("");

  const lClub = clubes.find(c => c.docId === partido.localId);
  const vClub = clubes.find(c => c.docId === partido.visitanteId);

  const origJugado       = partido.jugado ?? false;
  const origGl           = partido.golesLocal     != null ? String(partido.golesLocal)     : "";
  const origGv           = partido.golesVisitante != null ? String(partido.golesVisitante) : "";
  const origPerdidoAmbos = partido.perdidoAmbos ?? false;
  const isDirty = jugado !== origJugado || (jugado && (gl !== origGl || gv !== origGv || perdidoAmbos !== origPerdidoAmbos));

  const totalResultado = (partido.golesLocal ?? 0) + (partido.golesVisitante ?? 0);
  const sinGoles = partido.jugado && (partido.goles || []).reduce((s, g) => s + (g.cantidad || 1), 0) !== totalResultado;

  async function guardar() {
    if (jugado && (gl === "" || gv === "")) {
      setError("Ingresá el resultado completo antes de guardar.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await onGuardar({
        jugado,
        golesLocal:     jugado && gl !== "" ? parseInt(gl)     : null,
        golesVisitante: jugado && gv !== "" ? parseInt(gv)     : null,
        perdidoAmbos:   jugado ? perdidoAmbos : false,
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
              <input type="number" min="0" value={gl} onChange={e => { setGl(e.target.value); setError(""); }}
                style={{ width: 40, textAlign: "center", border: "1px solid #dcfce7", borderRadius: 6, padding: "4px", fontSize: 14, fontWeight: 700, color: "#111827", background: "#fff", outline: "none" }} />
              <span style={{ color: "#9ca3af", fontWeight: 700 }}>—</span>
              <input type="number" min="0" value={gv} onChange={e => { setGv(e.target.value); setError(""); }}
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
        {/* Partido perdido para ambos */}
        {jugado && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, background: perdidoAmbos ? "#fef2f2" : "#f9fafb", borderRadius: 8, padding: "6px 10px", border: `1px solid ${perdidoAmbos ? "#fecaca" : "#e5e7eb"}` }}>
            <Switch value={perdidoAmbos} onChange={v => { setPerdidoAmbos(v); setError(""); }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: perdidoAmbos ? "#dc2626" : "#374151" }}>Partido perdido para ambos</div>
              {perdidoAmbos && <div style={{ fontSize: 10, color: "#6b7280" }}>Ambos equipos pierden (0 puntos)</div>}
            </div>
          </div>
        )}
        {/* Error */}
        {error && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{error}</div>}
        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Switch value={jugado} onChange={v => { setJugado(v); if (!v) { setGl(""); setGv(""); setPerdidoAmbos(false); } setError(""); }} />
          <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>Jugado</span>
          {sinGoles && (
            <span title="Sin goles/tarjetas cargados" style={{ fontSize: 14 }}>⚠️</span>
          )}
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
      </div>
    </Card>
  );
}

// ── Fila LIBRE ────────────────────────────────────────────────────────────────
export function LibreRow({ partido, clubes }) {
  const club = clubes.find(c => c.docId === partido.localId);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fefce8", border: "1px solid #fde047", borderRadius: 10, marginBottom: 6 }}>
      <LogoMini club={club} size={22} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{club?.nombre || partido.localNombre}</span>
      <span style={{ fontSize: 11, fontWeight: 700, background: "#fde047", color: "#854d0e", borderRadius: 20, padding: "2px 8px" }}>LIBRE</span>
    </div>
  );
}

// ── Modal goles y tarjetas (2 columnas por equipo) ────────────────────────────
export function GolesModal({ partido, clubes, ligaId, catId, onGuardar, onClose }) {
  const lClub = clubes.find(c => c.docId === partido.localId);
  const vClub = clubes.find(c => c.docId === partido.visitanteId);
  const lN = lClub?.nombre || partido.localNombre || "Local";
  const vN = vClub?.nombre || partido.visitanteNombre || "Visitante";

  const [localJugs,  setLocalJugs]  = useState([]);
  const [visitJugs,  setVisitJugs]  = useState([]);
  const [stats,      setStats]      = useState({});    // { docId: { goles, amarilla, roja } }
  const [searchL,    setSearchL]    = useState("");
  const [searchV,    setSearchV]    = useState("");
  const [cargando,   setCargando]   = useState(true);
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState("");

  // Estado para agregar jugador por DNI
  const [dniL,       setDniL]       = useState("");
  const [dniV,       setDniV]       = useState("");
  const [buscandoL,  setBuscandoL]  = useState(false);
  const [buscandoV,  setBuscandoV]  = useState(false);
  const [formNuevoJug, setFormNuevoJug] = useState(null); // { side, apellido, nombre, dni, fechaNac }
  const [guardandoJug, setGuardandoJug] = useState(false);

  useEffect(() => {
    cargarJugadores();
  }, []);

  async function cargarJugadores() {
    setCargando(true);
    try {
      const baseQuery = collection(db, "ligas", ligaId, "jugadores");
      const [lSnap, vSnap] = await Promise.all([
        getDocs(query(baseQuery, where("clubId", "==", partido.localId), ...(catId ? [where("categoriaId", "==", catId)] : []))),
        getDocs(query(baseQuery, where("clubId", "==", partido.visitanteId), ...(catId ? [where("categoriaId", "==", catId)] : []))),
      ]);
      const lJugs = lSnap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.apellido.localeCompare(b.apellido));
      const vJugs = vSnap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.apellido.localeCompare(b.apellido));
      setLocalJugs(lJugs);
      setVisitJugs(vJugs);

      // Pre-cargar stats desde los datos existentes
      const initStats = {};
      const allJugs = [...lJugs, ...vJugs];
      allJugs.forEach(j => { initStats[j.docId] = { goles: 0, amarilla: false, roja: false }; });

      // Mapear goles existentes por nombre
      (partido.goles || []).forEach(g => {
        const side = g.equipo === "local" ? lJugs : vJugs;
        const jug = side.find(j => `${j.apellido}, ${j.nombre}` === g.nombre);
        if (jug) initStats[jug.docId] = { ...(initStats[jug.docId] || { amarilla: false, roja: false }), goles: g.cantidad || 1 };
      });
      // Mapear tarjetas existentes
      (partido.tarjetas || []).forEach(t => {
        const side = t.equipo === "local" ? lJugs : vJugs;
        const jug = side.find(j => `${j.apellido}, ${j.nombre}` === t.nombre);
        if (jug) {
          const key = t.tipo === "amarilla" ? "amarilla" : "roja";
          initStats[jug.docId] = { ...(initStats[jug.docId] || { goles: 0, amarilla: false, roja: false }), [key]: true };
        }
      });

      setStats(initStats);
    } finally {
      setCargando(false);
    }
  }

  function setStat(docId, field, value) {
    setStats(prev => ({ ...prev, [docId]: { ...(prev[docId] || { goles: 0, amarilla: false, roja: false }), [field]: value } }));
  }

  function totalGolesEquipo(jugs) {
    return jugs.reduce((s, j) => s + (stats[j.docId]?.goles || 0), 0);
  }

  async function guardar() {
    const totalL = totalGolesEquipo(localJugs);
    const totalV = totalGolesEquipo(visitJugs);
    const resL = partido.golesLocal ?? 0;
    const resV = partido.golesVisitante ?? 0;

    if (totalL > resL) { setError(`Los goles del local (${totalL}) superan el resultado (${resL}).`); return; }
    if (totalV > resV) { setError(`Los goles del visitante (${totalV}) superan el resultado (${resV}).`); return; }

    setError("");
    setGuardando(true);

    const goles = [];
    const tarjetas = [];
    const process = (jugs, equipo) => {
      jugs.forEach(j => {
        const s = stats[j.docId];
        if (!s) return;
        const nombre = `${j.apellido}, ${j.nombre}`;
        if (s.goles > 0) goles.push({ nombre, equipo, cantidad: s.goles });
        if (s.amarilla)  tarjetas.push({ nombre, equipo, tipo: "amarilla" });
        if (s.roja)      tarjetas.push({ nombre, equipo, tipo: "roja" });
      });
    };
    process(localJugs, "local");
    process(visitJugs, "visitante");

    try {
      await onGuardar({ goles, tarjetas });
    } finally {
      setGuardando(false);
    }
  }

  async function buscarPorDni(dni, side) {
    if (dni.length < 7) return;
    const setBuscando = side === "local" ? setBuscandoL : setBuscandoV;
    setBuscando(true);
    try {
      const snap = await getDocs(query(collection(db, "ligas", ligaId, "jugadores"), where("dni", "==", dni)));
      if (!snap.empty) {
        const j = { docId: snap.docs[0].id, ...snap.docs[0].data() };
        // Agregar a la lista correspondiente si no está ya
        if (side === "local") {
          setLocalJugs(prev => prev.some(x => x.docId === j.docId) ? prev : [...prev, j].sort((a, b) => a.apellido.localeCompare(b.apellido)));
        } else {
          setVisitJugs(prev => prev.some(x => x.docId === j.docId) ? prev : [...prev, j].sort((a, b) => a.apellido.localeCompare(b.apellido)));
        }
        setStats(prev => ({ ...prev, [j.docId]: prev[j.docId] || { goles: 0, amarilla: false, roja: false } }));
        if (side === "local") setDniL("");
        else setDniV("");
      } else {
        // Mostrar formulario para crear jugador
        setFormNuevoJug({ side, apellido: "", nombre: "", dni, fechaNac: "", fotoFile: null, fotoPreview: "" });
        if (side === "local") setDniL("");
        else setDniV("");
      }
    } finally {
      setBuscando(false);
    }
  }

  async function crearYAgregarJugador() {
    if (!formNuevoJug?.apellido || !formNuevoJug?.nombre) return;
    setGuardandoJug(true);
    try {
      const clubId = formNuevoJug.side === "local" ? partido.localId : partido.visitanteId;
      const newRef = await addDoc(collection(db, "ligas", ligaId, "jugadores"), {
        apellido: formNuevoJug.apellido.trim(),
        nombre: formNuevoJug.nombre.trim(),
        dni: formNuevoJug.dni,
        fechaNacimiento: formNuevoJug.fechaNac || "",
        fotoUrl: "",
        clubId,
        categoriaId: catId || "",
      });
      let fotoUrl = "";
      if (formNuevoJug.fotoFile) {
        const storRef = ref(storage, `jugadores/${ligaId}/${newRef.id}`);
        await uploadBytes(storRef, formNuevoJug.fotoFile);
        fotoUrl = await getDownloadURL(storRef);
        await updateDoc(newRef, { fotoUrl });
      }
      const j = { docId: newRef.id, apellido: formNuevoJug.apellido.trim(), nombre: formNuevoJug.nombre.trim(), dni: formNuevoJug.dni, fotoUrl, clubId };
      if (formNuevoJug.side === "local") {
        setLocalJugs(prev => [...prev, j].sort((a, b) => a.apellido.localeCompare(b.apellido)));
      } else {
        setVisitJugs(prev => [...prev, j].sort((a, b) => a.apellido.localeCompare(b.apellido)));
      }
      setStats(prev => ({ ...prev, [j.docId]: { goles: 0, amarilla: false, roja: false } }));
      setFormNuevoJug(null);
    } finally {
      setGuardandoJug(false);
    }
  }

  const filtL = localJugs.filter(j => !searchL || `${j.apellido} ${j.nombre}`.toLowerCase().includes(searchL.toLowerCase()));
  const filtV = visitJugs.filter(j => !searchV || `${j.apellido} ${j.nombre}`.toLowerCase().includes(searchV.toLowerCase()));

  const totalL = totalGolesEquipo(localJugs);
  const totalV = totalGolesEquipo(visitJugs);
  const resL = partido.golesLocal ?? 0;
  const resV = partido.golesVisitante ?? 0;

  return (
    <Modal titulo={`${lN} ${resL} - ${resV} ${vN}`} onClose={onClose}>
      {cargando ? <Spinner /> : (
        <>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", color: "#dc2626", fontSize: 12 }}>{error}</div>}

          {/* Advertencia de goles */}
          {(partido.golesLocal !== null || partido.golesVisitante !== null) && (
            <div style={{ background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#374151" }}>
              Resultado: <b>{lN} {resL} - {resV} {vN}</b> ·
              Cargados: <span style={{ color: totalL > resL ? "#dc2626" : "#166534" }}>{totalL}</span> - <span style={{ color: totalV > resV ? "#dc2626" : "#166534" }}>{totalV}</span>
            </div>
          )}

          {/* Dos columnas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Local */}
            <ColEquipo
              titulo={lN}
              jugs={filtL}
              stats={stats}
              setStat={setStat}
              search={searchL}
              setSearch={setSearchL}
              dniInput={dniL}
              setDniInput={setDniL}
              buscando={buscandoL}
              onBuscarDni={() => buscarPorDni(dniL, "local")}
            />
            {/* Visitante */}
            <ColEquipo
              titulo={vN}
              jugs={filtV}
              stats={stats}
              setStat={setStat}
              search={searchV}
              setSearch={setSearchV}
              dniInput={dniV}
              setDniInput={setDniV}
              buscando={buscandoV}
              onBuscarDni={() => buscarPorDni(dniV, "visitante")}
            />
          </div>

          {/* Formulario nuevo jugador */}
          {formNuevoJug && (
            <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#854d0e", marginBottom: 8 }}>
                DNI {formNuevoJug.dni} no encontrado — Crear jugador ({formNuevoJug.side === "local" ? lN : vN})
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                {formNuevoJug.fotoPreview
                  ? <img src={formNuevoJug.fotoPreview} alt="foto" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "1.5px solid #dcfce7", flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f0fdf4", border: "1.5px dashed #86efac", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>👤</div>
                }
                <label style={{ background: "#f0fdf4", border: "1px solid #dcfce7", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#166534" }}>
                  📷 Foto
                  <input type="file" accept="image/*" onChange={e => {
                    const file = e.target.files[0];
                    if (file) setFormNuevoJug(f => ({ ...f, fotoFile: file, fotoPreview: URL.createObjectURL(file) }));
                  }} style={{ display: "none" }} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Campo label="Apellido *">
                  <InputAdmin value={formNuevoJug.apellido} onChange={e => setFormNuevoJug(f => ({ ...f, apellido: e.target.value }))} placeholder="García" />
                </Campo>
                <Campo label="Nombre *">
                  <InputAdmin value={formNuevoJug.nombre} onChange={e => setFormNuevoJug(f => ({ ...f, nombre: e.target.value }))} placeholder="Juan" />
                </Campo>
              </div>
              <Campo label="Fecha de nacimiento">
                <InputAdmin type="date" value={formNuevoJug.fechaNac} onChange={e => setFormNuevoJug(f => ({ ...f, fechaNac: e.target.value }))} />
              </Campo>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setFormNuevoJug(null)} style={{ flex: 1, background: "#f3f4f6", border: "none", borderRadius: 8, padding: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>Cancelar</button>
                <button onClick={crearYAgregarJugador} disabled={guardandoJug} style={{ flex: 1, background: guardandoJug ? "#9ca3af" : "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: 9, cursor: guardandoJug ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700 }}>
                  {guardandoJug ? "Creando..." : "Crear y agregar"}
                </button>
              </div>
            </div>
          )}

          <BtnPrimary onClick={guardar} disabled={guardando} fullWidth>
            {guardando ? "Guardando..." : "Guardar goles y tarjetas"}
          </BtnPrimary>
        </>
      )}
    </Modal>
  );
}

// ── Columna de equipo en GolesModal ───────────────────────────────────────────
function ColEquipo({ titulo, jugs, stats, setStat, search, setSearch, dniInput, setDniInput, buscando, onBuscarDni }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", background: "#dcfce7", borderRadius: 6, padding: "4px 8px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {titulo}
      </div>
      <input
        placeholder="Buscar jugador..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ border: "1px solid #dcfce7", borderRadius: 8, padding: "6px 10px", fontSize: 12, outline: "none", background: "#f9fafb" }}
      />
      <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {jugs.length === 0 && (
          <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", padding: "12px 4px" }}>Sin jugadores</div>
        )}
        {jugs.map(j => {
          const s = stats[j.docId] || { goles: 0, amarilla: false, roja: false };
          const tieneAlgo = s.goles > 0 || s.amarilla || s.roja;
          return (
            <div key={j.docId} style={{ background: tieneAlgo ? "#f0fdf4" : "#fff", border: `1px solid ${tieneAlgo ? "#4ade80" : "#f3f4f6"}`, borderRadius: 8, padding: "6px 8px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#111827", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {j.apellido}, {j.nombre}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* Goles */}
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 11 }}>⚽</span>
                  <input
                    type="number" min="0" max="20"
                    value={s.goles}
                    onChange={e => setStat(j.docId, "goles", Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: 34, textAlign: "center", border: "1px solid #dcfce7", borderRadius: 5, padding: "2px 4px", fontSize: 12, fontWeight: 700, outline: "none" }}
                  />
                </div>
                {/* Amarilla */}
                <label style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer" }}>
                  <input type="checkbox" checked={s.amarilla} onChange={e => setStat(j.docId, "amarilla", e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: "#ca8a04" }} />
                  <span style={{ fontSize: 13 }}>🟨</span>
                </label>
                {/* Roja */}
                <label style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer" }}>
                  <input type="checkbox" checked={s.roja} onChange={e => setStat(j.docId, "roja", e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: "#dc2626" }} />
                  <span style={{ fontSize: 13 }}>🟥</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {/* Agregar por DNI */}
      <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
        <input
          placeholder="DNI..."
          value={dniInput}
          onChange={e => setDniInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onBuscarDni()}
          style={{ flex: 1, border: "1px solid #dcfce7", borderRadius: 8, padding: "5px 8px", fontSize: 11, outline: "none" }}
        />
        <button onClick={onBuscarDni} disabled={buscando || dniInput.length < 7}
          style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "5px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
          {buscando ? "..." : "+ DNI"}
        </button>
      </div>
    </div>
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
