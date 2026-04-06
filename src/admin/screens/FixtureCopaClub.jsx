import { useState, useMemo, useEffect } from "react";
import { collection, doc, getDocs, writeBatch, updateDoc, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { Card, Modal, Switch, BtnPrimary, Campo, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";
import { PartidoRowInline, LibreRow, GolesModal } from "./FixtureAdmin";

// ── Round-robin Berger con rotación intercalada ───────────────────────────────
function calcRondas(slots) {
  const N    = slots.length;
  const isOdd = N % 2 !== 0;
  const n    = isOdd ? N + 1 : N;
  const half = n / 2;
  const len  = n - 1;

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

function fechaLeg(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function FixtureCopaClub({ zonaRef, zona, grupos, clubes, categorias, gruposFixtureConf, setGruposFixtureConf, publicado, onPublicado, onEditarFixture, ligaId }) {
  if (publicado) {
    return (
      <PostPublicacion
        zonaRef={zonaRef} zona={zona}
        grupos={grupos} clubes={clubes} categorias={categorias}
        ligaId={ligaId} onEditarFixture={onEditarFixture}
      />
    );
  }
  return (
    <PrePublicacion
      zonaRef={zonaRef} ligaId={ligaId}
      grupos={grupos} clubes={clubes} categorias={categorias}
      gruposFixtureConf={gruposFixtureConf} setGruposFixtureConf={setGruposFixtureConf}
      onPublicado={onPublicado}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PRE-PUBLICACIÓN
// ══════════════════════════════════════════════════════════════════════════════
function PrePublicacion({ zonaRef, ligaId, grupos, clubes, categorias, gruposFixtureConf, setGruposFixtureConf, onPublicado }) {
  const [grupoSelId, setGrupoSelId] = useState(grupos[0]?.id || "");
  const [publicando, setPublicando] = useState(false);
  const [error,      setError]      = useState("");

  if (grupos.length === 0) {
    return <Aviso>Definí grupos en la pestaña "Participantes" antes de configurar el fixture.</Aviso>;
  }
  if (categorias.length === 0) {
    return <Aviso>Agregá al menos una categoría en la competencia antes de publicar.</Aviso>;
  }

  const grupoSel = grupos.find(g => g.id === grupoSelId) || grupos[0];

  // Un grupo está listo si tiene >= 2 clubes y está confirmado
  const todosConfirmados = grupos.every(g =>
    (g.clubes || []).length >= 2 && gruposFixtureConf[g.id]?.generado
  );

  async function confirmarGrupo(grupoId, assigned, idaYVuelta, fechas) {
    const nuevoConf = { ...gruposFixtureConf, [grupoId]: { assigned, idaYVuelta, fechas, generado: true } };
    await updateDoc(zonaRef, { gruposFixtureConf: nuevoConf });

    // Generar y escribir partidos en Firestore para este grupo × todas las categorías
    const grupo = grupos.find(g => g.id === grupoId);
    if (!grupo) return;
    const slots = assigned.map(id => id || null);
    let rondas = calcRondas(slots);
    if (idaYVuelta) rondas = [...rondas, ...rondas.map(r => r.map(([l, v]) => [v, l]))];

    const fixtureBase = rondas.flatMap((ronda, ji) =>
      ronda.map(([lId, vId]) => {
        const esLibre     = lId === null || vId === null;
        const realLocalId = lId ?? vId;
        const realVisId   = lId !== null && vId !== null ? vId : null;
        const lClub = clubes.find(c => c.docId === realLocalId);
        const vClub = realVisId ? clubes.find(c => c.docId === realVisId) : null;
        return {
          jornada: ji + 1, fecha: fechas[ji] || "", esLibre,
          grupoId, grupoNombre: grupo.nombre,
          localId: realLocalId ?? null, visitanteId: realVisId ?? null,
          localNombre: lClub?.nombre ?? "", visitanteNombre: vClub?.nombre ?? "",
        };
      })
    );

    for (const cat of categorias) {
      const pCol = collection(doc(collection(zonaRef, "categorias"), cat.docId), "partidos");
      // Borrar partidos existentes de este grupo (re-confirmación)
      const existSnap = await getDocs(query(pCol, where("grupoId", "==", grupoId)));
      for (let i = 0; i < existSnap.docs.length; i += 400) {
        const batch = writeBatch(db);
        existSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      // Escribir nuevos partidos
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
    // Actualizar estado DESPUÉS de que todos los partidos están escritos
    setGruposFixtureConf(nuevoConf);
  }

  async function desconfirmarGrupo(grupoId) {
    const nuevoConf = { ...gruposFixtureConf, [grupoId]: { ...gruposFixtureConf[grupoId], generado: false } };
    await updateDoc(zonaRef, { gruposFixtureConf: nuevoConf });
    setGruposFixtureConf(nuevoConf);
    // Borrar partidos de este grupo de todas las categorías
    for (const cat of categorias) {
      const pCol = collection(doc(collection(zonaRef, "categorias"), cat.docId), "partidos");
      const snap = await getDocs(query(pCol, where("grupoId", "==", grupoId)));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
  }

  async function publicar() {
    setPublicando(true);
    setError("");
    try {
      // Los partidos ya fueron escritos al confirmar cada grupo; solo publicar
      await updateDoc(zonaRef, { publicado: true });
      onPublicado();
    } catch (e) {
      setError("Error al publicar: " + e.message);
    } finally {
      setPublicando(false);
    }
  }

  return (
    <>
      {/* Selector de grupo */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {grupos.map(g => {
          const isGen      = gruposFixtureConf[g.id]?.generado;
          const isSelected = g.id === grupoSel?.id;
          return (
            <button key={g.id} onClick={() => setGrupoSelId(g.id)}
              style={{
                padding: "7px 14px", border: "none", borderRadius: 20, cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
                background: isSelected ? "#1a3a2a" : isGen ? "#dcfce7" : "#f3f4f6",
                color:      isSelected ? "#4ade80" : isGen ? "#166534" : "#374151",
              }}>
              {isGen ? "✓ " : ""}{g.nombre}
            </button>
          );
        })}
      </div>

      {/* Config del grupo seleccionado */}
      <GrupoFixtureConfig
        key={grupoSel?.id}
        grupo={grupoSel}
        clubes={clubes.filter(c => (grupoSel?.clubes || []).includes(c.docId))}
        conf={gruposFixtureConf[grupoSel?.id] || {}}
        onConfirmar={(assigned, idaYVuelta, fechas) => confirmarGrupo(grupoSel.id, assigned, idaYVuelta, fechas)}
        onDesconfirmar={() => desconfirmarGrupo(grupoSel.id)}
        zonaRef={zonaRef} categorias={categorias} ligaId={ligaId}
      />

      {/* Botón publicar — aparece solo cuando todos los grupos están confirmados */}
      {todosConfirmados && (
        <button
          onClick={publicar} disabled={publicando}
          style={{ background: publicando ? "#6b7280" : "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 12, padding: "15px 16px", cursor: publicando ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, width: "100%", marginTop: 4 }}>
          {publicando ? "Publicando..." : `🚀 Publicar torneo · ${grupos.length} grupo${grupos.length !== 1 ? "s" : ""} × ${categorias.length} categoría${categorias.length !== 1 ? "s" : ""}`}
        </button>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}
    </>
  );
}

// ── Configuración de fixture para un grupo ─────────────────────────────────────
function GrupoFixtureConfig({ grupo, clubes, conf, onConfirmar, onDesconfirmar, zonaRef, categorias, ligaId }) {
  // N = cantidad real de clubes en el grupo (no filtrado por clubes cargados)
  const N = (grupo.clubes || []).length;

  const [assigned,    setAssigned]    = useState(() => {
    if (conf.assigned?.length === N) return [...conf.assigned];
    return Array(N).fill("");
  });
  const [idaYVuelta,  setIdaYVuelta]  = useState(conf.idaYVuelta ?? false);
  const [fechas,      setFechas]      = useState(() => conf.fechas ? [...conf.fechas] : []);
  const [confirmando, setConfirmando] = useState(false);
  const [error,       setError]       = useState("");

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

  if (!grupo) return <EmptyState emoji="🏆" titulo="Seleccioná un grupo" descripcion="" />;
  if (N < 2)  return <Aviso>El {grupo.nombre} necesita al menos 2 clubes. Agregalos en la pestaña "Participantes".</Aviso>;

  const todosAsignados = assigned.every(id => id !== "");
  const totalReales    = rondas.reduce((s, r) => s + r.filter(([l, v]) => l !== null && v !== null).length, 0);

  // ── Vista de grupo confirmado: carga resultados por categoría / fecha ──────────
  if (conf.generado) {
    const confSlots = (conf.assigned || []).map(id => id || null);
    let confRondas  = calcRondas(confSlots);
    if (conf.idaYVuelta) confRondas = [...confRondas, ...confRondas.map(r => r.map(([l, v]) => [v, l]))];
    const confTotal = confRondas.reduce((s, r) => s + r.filter(([l, v]) => l !== null && v !== null).length, 0);
    return (
      <>
        <div style={{ background: "#f0fdf4", border: "1.5px solid #4ade80", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{grupo.nombre} confirmado</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {confTotal} partido{confTotal !== 1 ? "s" : ""} · {confRondas.length} fecha{confRondas.length !== 1 ? "s" : ""}
              {conf.idaYVuelta ? " (ida y vuelta)" : ""}
            </div>
          </div>
          <button onClick={onDesconfirmar}
            style={{ background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            ✏️ Re-editar
          </button>
        </div>
        <FixtureGrupoView zonaRef={zonaRef} grupoId={grupo.id} clubes={clubes} categorias={categorias} ligaId={ligaId} />
      </>
    );
  }

  // ── Vista de edición de fixture ─────────────────────────────────────────────
  async function confirmar() {
    if (!todosAsignados) { setError("Asigná un club a cada posición."); return; }
    setConfirmando(true);
    try {
      await onConfirmar(assigned, idaYVuelta, fechas);
    } catch (e) {
      setError("Error: " + e.message);
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <>
      <SeccionLabel>Asignación — {grupo.nombre}</SeccionLabel>
      <Card>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: N }, (_, i) => {
            const selId   = assigned[i];
            const selClub = clubes.find(c => c.docId === selId);
            const opts    = clubes.filter(c => !assigned.some((a, j) => j !== i && a === c.docId));
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <NumBadge n={i + 1} fijo={i === N - 1 && N % 2 !== 0} />
                <div style={{ width: 34, height: 34, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {selClub
                    ? <LogoMini club={selClub} size={32} />
                    : <div style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px dashed #d1fae5" }} />
                  }
                </div>
                <select value={selId}
                  onChange={e => { const a = [...assigned]; a[i] = e.target.value; setAssigned(a); }}
                  style={{ flex: 1, border: "1px solid #d1fae5", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: selId ? "#111827" : "#9ca3af", background: "#f0fdf4", outline: "none" }}>
                  <option value="">— Sin asignar —</option>
                  {opts.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </Card>

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

      {todosAsignados && rondas.length > 0 && (
        <>
          <SeccionLabel>Fixture — {totalReales} partido{totalReales !== 1 ? "s" : ""} · {rondas.length} fecha{rondas.length !== 1 ? "s" : ""}</SeccionLabel>
          {rondas.map((ronda, ji) => {
            const realesEnFecha = ronda.filter(([l, v]) => l !== null && v !== null);
            const libreId  = ronda.find(([l, v]) => l === null || v === null)?.find(x => x !== null) ?? null;
            const libreClub = libreId ? clubes.find(c => c.docId === libreId) : null;
            return (
              <Card key={ji}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1a3a2a", whiteSpace: "nowrap" }}>Fecha {ji + 1}</span>
                  <span style={{ color: "#9ca3af", fontSize: 14 }}>—</span>
                  <input type="date" value={fechas[ji] || ""}
                    onChange={e => { const a = [...fechas]; a[ji] = e.target.value; setFechas(a); }}
                    style={{ border: "none", background: "transparent", fontSize: 12, color: "#374151", cursor: "pointer", outline: "none", flex: 1 }} />
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

      {todosAsignados && totalReales > 0 && (
        <button onClick={confirmar} disabled={confirmando}
          style={{ background: confirmando ? "#6b7280" : "#166534", color: "#fff", border: "none", borderRadius: 12, padding: "13px 16px", cursor: confirmando ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, width: "100%" }}>
          {confirmando ? "Confirmando..." : `✓ Confirmar ${grupo.nombre} · ${totalReales} partido${totalReales !== 1 ? "s" : ""}`}
        </button>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FIXTURE DE UN GRUPO: Categoría → Fecha → Resultados (reutilizado pre y post)
// ══════════════════════════════════════════════════════════════════════════════
function FixtureGrupoView({ zonaRef, grupoId, clubes, categorias, ligaId }) {
  const [catSelId,   setCatSelId]   = useState(categorias[0]?.docId || "");
  const [partidos,   setPartidos]   = useState([]);
  const [cargando,   setCargando]   = useState(false);
  const [jornadaSel, setJornadaSel] = useState(1);
  const [modalGoles, setModalGoles] = useState(null);

  const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23166534' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`;
  const selStyle = { width: "100%", border: "1.5px solid #d1fae5", borderRadius: 10, padding: "9px 36px 9px 12px", fontSize: 13, fontWeight: 600, color: "#111827", background: "#fff", outline: "none", appearance: "none", backgroundImage: selectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", cursor: "pointer" };

  useEffect(() => {
    if (catSelId && grupoId) { setJornadaSel(1); cargarPartidos(catSelId); }
  }, [catSelId, grupoId]);

  async function cargarPartidos(catId) {
    setCargando(true);
    try {
      const pCol = collection(doc(collection(zonaRef, "categorias"), catId), "partidos");
      const snap = await getDocs(query(pCol, where("grupoId", "==", grupoId)));
      const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => a.jornada - b.jornada);
      setPartidos(items);
    } finally {
      setCargando(false);
    }
  }

  async function guardarResultado(partido, datos) {
    const pDoc = doc(collection(doc(collection(zonaRef, "categorias"), catSelId), "partidos"), partido.docId);
    await updateDoc(pDoc, datos);
    setPartidos(ps => ps.map(p => p.docId === partido.docId ? { ...p, ...datos } : p));
    setModalGoles(prev => prev?.docId === partido.docId ? { ...prev, ...datos } : prev);
  }

  const jornadaNumbers = [...new Set(partidos.map(p => p.jornada))].sort((a, b) => a - b);
  const partidosFecha  = partidos.filter(p => p.jornada === jornadaSel).sort((a, b) => (a.esLibre ? 1 : 0) - (b.esLibre ? 1 : 0));

  return (
    <>
      <Campo label="Categoría">
        <select value={catSelId} onChange={e => setCatSelId(e.target.value)} style={selStyle}>
          {categorias.map(cat => <option key={cat.docId} value={cat.docId}>{cat.nombre}</option>)}
        </select>
      </Campo>

      {cargando ? <Spinner /> : (
        <>
          {jornadaNumbers.length > 0 && (
            <Campo label="Fecha">
              <select value={jornadaSel} onChange={e => setJornadaSel(Number(e.target.value))} style={selStyle}>
                {jornadaNumbers.map(j => {
                  const pj      = partidos.filter(p => p.jornada === j);
                  const fl      = pj[0]?.fecha ? ` — ${fechaLeg(pj[0].fecha)}` : "";
                  const jugados = pj.filter(p => !p.esLibre && p.jugado).length;
                  const total   = pj.filter(p => !p.esLibre).length;
                  const sinGoles = pj.filter(p => !p.esLibre && p.jugado && (!p.goles || p.goles.length === 0)).length;
                  return (
                    <option key={j} value={j}>
                      Fecha {j}{fl} ({jugados}/{total}){sinGoles > 0 ? " ⚠️" : ""}
                    </option>
                  );
                })}
              </select>
            </Campo>
          )}
          {jornadaNumbers.length === 0 && <EmptyState emoji="📋" titulo="Sin partidos" descripcion="Este grupo no tiene partidos generados" />}
          {partidosFecha.map(p => p.esLibre
            ? <LibreRow key={p.docId} partido={p} clubes={clubes} />
            : <PartidoRowInline
                key={p.docId} partido={p} clubes={clubes}
                onGuardar={datos => guardarResultado(p, datos)}
                onAbrirGoles={() => setModalGoles(partidos.find(x => x.docId === p.docId))}
              />
          )}
        </>
      )}

      {modalGoles && (
        <GolesModal
          partido={modalGoles} clubes={clubes} ligaId={ligaId} catId={catSelId}
          onGuardar={async d => { await guardarResultado(modalGoles, d); setModalGoles(null); }}
          onClose={() => setModalGoles(null)}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// POST-PUBLICACIÓN
// ══════════════════════════════════════════════════════════════════════════════
function PostPublicacion({ zonaRef, zona, grupos, clubes, categorias, ligaId, onEditarFixture }) {
  const [grupoSelId,    setGrupoSelId]    = useState(grupos[0]?.id || "");
  const [hayResultados, setHayResultados] = useState(null);
  const [modalConfEdit, setModalConfEdit] = useState(false);
  const [editando,      setEditando]      = useState(false);

  const selectArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23166534' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`;
  const selStyle = { width: "100%", border: "1.5px solid #d1fae5", borderRadius: 10, padding: "9px 36px 9px 12px", fontSize: 13, fontWeight: 600, color: "#111827", background: "#fff", outline: "none", appearance: "none", backgroundImage: selectArrow, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", cursor: "pointer" };

  useEffect(() => { verificarResultados(); }, []);

  async function verificarResultados() {
    try {
      for (const cat of categorias) {
        const snap = await getDocs(collection(doc(collection(zonaRef, "categorias"), cat.docId), "partidos"));
        if (snap.docs.some(d => d.data().jugado === true)) { setHayResultados(true); return; }
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
      await updateDoc(zonaRef, { publicado: false, gruposFixtureConf: {} });
      onEditarFixture();
    } catch (e) { console.error("Error borrando fixture:", e); }
    finally { setEditando(false); setModalConfEdit(false); }
  }

  if (grupos.length === 0)     return <EmptyState emoji="🏆" titulo="Sin grupos"    descripcion="Este torneo no tiene grupos configurados" />;
  if (categorias.length === 0) return <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Este torneo no tiene categorías configuradas" />;

  return (
    <>
      {hayResultados === false && (
        <button onClick={() => setModalConfEdit(true)}
          style={{ background: "#fff7ed", color: "#c2410c", border: "1.5px solid #fed7aa", borderRadius: 12, padding: "11px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, width: "100%", marginBottom: 4 }}>
          ✏️ Editar fixture
        </button>
      )}
      {hayResultados === true && (
        <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12, padding: "11px 16px", fontSize: 13, color: "#991b1b", fontWeight: 600, marginBottom: 4 }}>
          ⚠️ No se puede editar el fixture porque ya hay resultados cargados.
        </div>
      )}

      {/* Selector: Grupo */}
      {grupos.length > 1 && (
        <Campo label="Grupo">
          <select value={grupoSelId} onChange={e => setGrupoSelId(e.target.value)} style={selStyle}>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </Campo>
      )}

      {/* Categoría → Fecha → Resultados para el grupo seleccionado */}
      <FixtureGrupoView
        key={grupoSelId}
        zonaRef={zonaRef} grupoId={grupoSelId}
        clubes={clubes} categorias={categorias} ligaId={ligaId}
      />

      {modalConfEdit && (
        <Modal titulo="¿Editar fixture?" onClose={() => setModalConfEdit(false)}>
          <div style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
            Se borrarán todos los partidos de todos los grupos y podrás configurar el fixture nuevamente. Esta acción no se puede deshacer.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setModalConfEdit(false)}
              style={{ flex: 1, background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              Cancelar
            </button>
            <button onClick={confirmarEditarFixture} disabled={editando}
              style={{ flex: 1, background: editando ? "#9ca3af" : "#c2410c", color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: editando ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700 }}>
              {editando ? "Borrando..." : "Sí, editar fixture"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
