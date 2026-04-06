import { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { Card, Modal, Switch, BtnPrimary, Campo, InputAdmin, SelectAdmin, SeccionLabel, EmptyState, Spinner } from "../AdminUI";

export default function BracketAdmin({ zonaRef, zona, clubes, categorias }) {
  if (zona.tipo === "copa_club")    return <BracketClubCat zonaRef={zonaRef} clubes={clubes} categorias={categorias} />;
  if (zona.tipo === "copa")         return <BracketClub    zonaRef={zonaRef} clubes={clubes} />;
  if (zona.tipo === "copa_cat")     return <BracketCat     zonaRef={zonaRef} clubes={clubes} categorias={categorias} />;
  if (zona.tipo === "elim_equipos") return <BracketSimple  zonaRef={zonaRef} clubes={clubes} />;
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// COPA_CLUB — Ramas → Fases → Cruces con resultados por categoría
// ══════════════════════════════════════════════════════════════════════════════
function BracketClubCat({ zonaRef, clubes, categorias }) {
  const ramasCol = collection(zonaRef, "ramas");
  const [ramas,      setRamas]      = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [ramaSelId,  setRamaSelId]  = useState(null);
  const [modalRama,  setModalRama]  = useState(false);
  const [nombreRama, setNombreRama] = useState("");
  const [guardando,  setGuardando]  = useState(false);

  useEffect(() => { cargarRamas(); }, []);

  async function cargarRamas() {
    setCargando(true);
    const snap  = await getDocs(ramasCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    setRamas(items);
    if (items.length > 0) setRamaSelId(prev => prev || items[0].docId);
    setCargando(false);
  }

  async function crearRama() {
    if (!nombreRama.trim()) return;
    setGuardando(true);
    await addDoc(ramasCol, { nombre: nombreRama.trim(), orden: ramas.length });
    setModalRama(false); setNombreRama("");
    setGuardando(false);
    await cargarRamas();
  }

  async function eliminarRama(rama) {
    await deleteDoc(doc(ramasCol, rama.docId));
    setRamas(prev => {
      const nuevas = prev.filter(r => r.docId !== rama.docId);
      setRamaSelId(nuevas[0]?.docId || null);
      return nuevas;
    });
  }

  if (cargando) return <Spinner />;
  const ramaSel = ramas.find(r => r.docId === ramaSelId);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setModalRama(true)}
          style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          + Rama
        </button>
      </div>

      {ramas.length === 0 ? (
        <EmptyState emoji="🏆" titulo="Sin ramas" descripcion="Creá las ramas del torneo (Copa Oro, Copa Plata...)" />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ramas.map(r => (
              <button key={r.docId} onClick={() => setRamaSelId(r.docId)}
                style={{ padding: "7px 14px", borderRadius: 20, border: ramaSelId === r.docId ? "2px solid #4ade80" : "1.5px solid #d1fae5", background: ramaSelId === r.docId ? "#1a3a2a" : "#fff", color: ramaSelId === r.docId ? "#4ade80" : "#374151", cursor: "pointer", fontSize: 13, fontWeight: ramaSelId === r.docId ? 700 : 500 }}>
                {r.nombre}
              </button>
            ))}
          </div>
          {ramaSel && (
            <FasesSection
              key={ramaSel.docId}
              parentRef={doc(ramasCol, ramaSel.docId)}
              clubes={clubes}
              categorias={categorias}
              useCatResults={true}
              onEliminarParent={() => eliminarRama(ramaSel)}
            />
          )}
        </>
      )}

      {modalRama && (
        <Modal titulo="Nueva Rama" onClose={() => { setModalRama(false); setNombreRama(""); }}>
          <Campo label="Nombre (ej: Copa Oro, Copa Plata)">
            <InputAdmin placeholder="Copa Oro" value={nombreRama} onChange={e => setNombreRama(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && crearRama()} />
          </Campo>
          <BtnPrimary onClick={crearRama} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear"}</BtnPrimary>
        </Modal>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ELIM_EQUIPOS — Fases → Cruces directamente en zonaRef
// ══════════════════════════════════════════════════════════════════════════════
function BracketSimple({ zonaRef, clubes }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <FasesSection parentRef={zonaRef} clubes={clubes} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COPA POR CLUB — Ramas → Fases → Cruces
// ══════════════════════════════════════════════════════════════════════════════
function BracketClub({ zonaRef, clubes }) {
  const ramasCol = collection(zonaRef, "ramas");
  const [ramas,      setRamas]      = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [ramaSelId,  setRamaSelId]  = useState(null);
  const [modalRama,  setModalRama]  = useState(false);
  const [nombreRama, setNombreRama] = useState("");
  const [guardando,  setGuardando]  = useState(false);

  useEffect(() => { cargarRamas(); }, []);

  async function cargarRamas() {
    setCargando(true);
    const snap  = await getDocs(ramasCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    setRamas(items);
    if (items.length > 0) setRamaSelId(prev => prev || items[0].docId);
    setCargando(false);
  }

  async function crearRama() {
    if (!nombreRama.trim()) return;
    setGuardando(true);
    await addDoc(ramasCol, { nombre: nombreRama.trim(), orden: ramas.length });
    setModalRama(false); setNombreRama("");
    setGuardando(false);
    await cargarRamas();
  }

  async function eliminarRama(rama) {
    await deleteDoc(doc(ramasCol, rama.docId));
    setRamas(prev => {
      const nuevas = prev.filter(r => r.docId !== rama.docId);
      setRamaSelId(nuevas[0]?.docId || null);
      return nuevas;
    });
  }

  if (cargando) return <Spinner />;
  const ramaSel = ramas.find(r => r.docId === ramaSelId);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => setModalRama(true)}
          style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          + Rama
        </button>
      </div>

      {ramas.length === 0 ? (
        <EmptyState emoji="🏆" titulo="Sin ramas" descripcion="Creá las ramas del torneo (Copa Oro, Copa Plata...)" />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ramas.map(r => (
              <button key={r.docId} onClick={() => setRamaSelId(r.docId)}
                style={{ padding: "7px 14px", borderRadius: 20, border: ramaSelId === r.docId ? "2px solid #4ade80" : "1.5px solid #d1fae5", background: ramaSelId === r.docId ? "#1a3a2a" : "#fff", color: ramaSelId === r.docId ? "#4ade80" : "#374151", cursor: "pointer", fontSize: 13, fontWeight: ramaSelId === r.docId ? 700 : 500 }}>
                {r.nombre}
              </button>
            ))}
          </div>
          {ramaSel && (
            <FasesSection
              key={ramaSel.docId}
              parentRef={doc(ramasCol, ramaSel.docId)}
              clubes={clubes}
              onEliminarParent={() => eliminarRama(ramaSel)}
            />
          )}
        </>
      )}

      {modalRama && (
        <Modal titulo="Nueva Rama" onClose={() => { setModalRama(false); setNombreRama(""); }}>
          <Campo label="Nombre (ej: Copa Oro, Copa Plata)">
            <InputAdmin placeholder="Copa Oro" value={nombreRama} onChange={e => setNombreRama(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && crearRama()} />
          </Campo>
          <BtnPrimary onClick={crearRama} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear"}</BtnPrimary>
        </Modal>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COPA POR CATEGORÍA — Categoría → Fases → Cruces
// ══════════════════════════════════════════════════════════════════════════════
function BracketCat({ zonaRef, clubes, categorias }) {
  const [catSelId, setCatSelId] = useState(categorias[0]?.docId || "");

  if (categorias.length === 0) return <EmptyState emoji="📋" titulo="Sin categorías" descripcion="Agregá categorías en la competencia primero" />;

  return (
    <>
      {categorias.length > 1 && (
        <Campo label="Categoría">
          <SelectAdmin value={catSelId} onChange={e => setCatSelId(e.target.value)}>
            {categorias.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
          </SelectAdmin>
        </Campo>
      )}
      {catSelId && (
        <FasesSection
          key={catSelId}
          parentRef={doc(collection(zonaRef, "categorias"), catSelId)}
          clubes={clubes}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FASES dentro de una Rama o Categoría
// ══════════════════════════════════════════════════════════════════════════════
function FasesSection({ parentRef, clubes, categorias, useCatResults, onEliminarParent }) {
  const fasesCol  = collection(parentRef, "fases");
  const [fases,             setFases]             = useState([]);
  const [primeraFaseCruces, setPrimeraFaseCruces] = useState([]);
  const [cargando,          setCargando]          = useState(true);
  const [faseSelId,         setFaseSelId]         = useState(null);
  const [modalFase,         setModalFase]         = useState(false);
  const [nombreFase,        setNombreFase]        = useState("");
  const [guardando,         setGuardando]         = useState(false);

  useEffect(() => { cargarFases(); }, []);

  async function cargarFases() {
    setCargando(true);
    const snap  = await getDocs(fasesCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    setFases(items);
    if (items.length > 0) {
      setFaseSelId(prev => prev || items[0].docId);
      // Load primera fase cruces for restriction in subsequent phases
      const cSnap = await getDocs(collection(doc(fasesCol, items[0].docId), "cruces"));
      setPrimeraFaseCruces(cSnap.docs.map(d => d.data()));
    }
    setCargando(false);
  }

  async function crearFase() {
    if (!nombreFase.trim()) return;
    setGuardando(true);
    await addDoc(fasesCol, { nombre: nombreFase.trim(), orden: fases.length, idaYVuelta: false });
    setModalFase(false); setNombreFase("");
    setGuardando(false);
    await cargarFases();
  }

  async function eliminarFase(fase) {
    await deleteDoc(doc(fasesCol, fase.docId));
    setFases(prev => {
      const nuevas = prev.filter(f => f.docId !== fase.docId);
      setFaseSelId(nuevas[0]?.docId || null);
      return nuevas;
    });
  }

  async function toggleIdaVuelta(fase) {
    const nuevo = !fase.idaYVuelta;
    await updateDoc(doc(fasesCol, fase.docId), { idaYVuelta: nuevo });
    setFases(prev => prev.map(f => f.docId === fase.docId ? { ...f, idaYVuelta: nuevo } : f));
  }

  if (cargando) return <Spinner />;
  const faseSel = fases.find(f => f.docId === faseSelId);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <SeccionLabel>Fases</SeccionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          {onEliminarParent && (
            <button onClick={onEliminarParent}
              style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
              Eliminar rama
            </button>
          )}
          <button onClick={() => setModalFase(true)}
            style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
            + Fase
          </button>
        </div>
      </div>

      {fases.length === 0 ? (
        <EmptyState emoji="🗂" titulo="Sin fases" descripcion="Creá las fases (Cuartos, Semis, Final...)" />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fases.map(f => (
              <button key={f.docId} onClick={() => setFaseSelId(f.docId)}
                style={{ padding: "7px 14px", borderRadius: 20, border: faseSelId === f.docId ? "2px solid #4ade80" : "1.5px solid #d1fae5", background: faseSelId === f.docId ? "#1a3a2a" : "#fff", color: faseSelId === f.docId ? "#4ade80" : "#374151", cursor: "pointer", fontSize: 13, fontWeight: faseSelId === f.docId ? 700 : 500 }}>
                {f.nombre}
              </button>
            ))}
          </div>

          {faseSel && (
            <>
              <Card>
                <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Switch value={faseSel.idaYVuelta} onChange={() => toggleIdaVuelta(faseSel)} />
                  <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>Ida y vuelta</span>
                  <button onClick={() => eliminarFase(faseSel)}
                    style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13, padding: "2px 6px" }}>
                    Eliminar fase
                  </button>
                </div>
              </Card>
              {(() => {
                const faseSelIdx = fases.findIndex(f => f.docId === faseSelId);
                const clubesFase = faseSelIdx > 0 && primeraFaseCruces.length > 0
                  ? clubes.filter(c => primeraFaseCruces.some(cr => cr.localId === c.docId || cr.visitanteId === c.docId))
                  : clubes;
                return (
                  <>
                    {faseSelIdx > 0 && primeraFaseCruces.length > 0 && (
                      <div style={{ fontSize: 11, color: "#6b7280", background: "#f0fdf4", borderRadius: 8, padding: "5px 10px" }}>
                        Solo se muestran equipos que participaron en la primera fase
                      </div>
                    )}
                    <CrucesSection
                      key={faseSel.docId}
                      faseRef={doc(fasesCol, faseSel.docId)}
                      fase={faseSel}
                      clubes={clubesFase}
                      categorias={categorias}
                      useCatResults={useCatResults}
                    />
                  </>
                );
              })()}
            </>
          )}
        </>
      )}

      {modalFase && (
        <Modal titulo="Nueva Fase" onClose={() => { setModalFase(false); setNombreFase(""); }}>
          <Campo label="Nombre (ej: Cuartos de Final, Semis, Final)">
            <InputAdmin placeholder="Cuartos de Final" value={nombreFase} onChange={e => setNombreFase(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && crearFase()} />
          </Campo>
          <BtnPrimary onClick={crearFase} disabled={guardando} fullWidth>{guardando ? "Creando..." : "Crear"}</BtnPrimary>
        </Modal>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CRUCES dentro de una Fase
// ══════════════════════════════════════════════════════════════════════════════
function CrucesSection({ faseRef, fase, clubes, categorias, useCatResults }) {
  const crucesCol = collection(faseRef, "cruces");
  const [cruces,        setCruces]        = useState([]);
  const [cargando,      setCargando]      = useState(true);
  const [modalCruce,    setModalCruce]    = useState(false);
  const [nuevoLocal,    setNuevoLocal]    = useState("");
  const [nuevoVisitante,setNuevoVisitante]= useState("");
  const [guardando,     setGuardando]     = useState(false);

  useEffect(() => { cargarCruces(); }, []);

  async function cargarCruces() {
    setCargando(true);
    const snap  = await getDocs(crucesCol);
    const items = snap.docs.map(d => ({ docId: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    setCruces(items);
    setCargando(false);
  }

  async function crearCruce() {
    if (!nuevoLocal || !nuevoVisitante) return;
    setGuardando(true);
    const lClub = clubes.find(c => c.docId === nuevoLocal);
    const vClub = clubes.find(c => c.docId === nuevoVisitante);
    await addDoc(crucesCol, {
      orden: cruces.length,
      localId:          nuevoLocal,
      visitanteId:      nuevoVisitante,
      localNombre:      lClub?.nombre || "",
      visitanteNombre:  vClub?.nombre || "",
      jugado:           false,
      golesLocal:       null,
      golesVisitante:   null,
      golesLocalVuelta:       null,
      golesVisitanteVuelta:   null,
      hayPenales:       false,
      penalesLocal:     null,
      penalesVisitante: null,
    });
    setModalCruce(false); setNuevoLocal(""); setNuevoVisitante("");
    setGuardando(false);
    await cargarCruces();
  }

  async function guardarResultado(cruce, datos) {
    await updateDoc(doc(crucesCol, cruce.docId), datos);
    setCruces(prev => prev.map(c => c.docId === cruce.docId ? { ...c, ...datos } : c));
  }

  async function eliminarCruce(cruce) {
    await deleteDoc(doc(crucesCol, cruce.docId));
    setCruces(prev => prev.filter(c => c.docId !== cruce.docId));
  }

  if (cargando) return <Spinner />;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <SeccionLabel>Cruces — {fase.nombre}</SeccionLabel>
        <button onClick={() => setModalCruce(true)}
          style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
          + Cruce
        </button>
      </div>

      {cruces.length === 0 ? (
        <EmptyState emoji="⚔️" titulo="Sin cruces" descripcion="Cargá los cruces de esta fase" />
      ) : (
        cruces.map(cruce => (
          useCatResults
            ? <CruceRowClub
                key={cruce.docId}
                cruce={cruce}
                fase={fase}
                clubes={clubes}
                categorias={categorias}
                onGuardar={datos => guardarResultado(cruce, datos)}
                onEliminar={() => eliminarCruce(cruce)}
              />
            : <CruceRow
                key={cruce.docId}
                cruce={cruce}
                fase={fase}
                clubes={clubes}
                onGuardar={datos => guardarResultado(cruce, datos)}
                onEliminar={() => eliminarCruce(cruce)}
              />
        ))
      )}

      {modalCruce && (
        <Modal titulo="Nuevo Cruce" onClose={() => { setModalCruce(false); setNuevoLocal(""); setNuevoVisitante(""); }}>
          <Campo label="Local">
            <SelectAdmin value={nuevoLocal} onChange={e => setNuevoLocal(e.target.value)}>
              <option value="">— Seleccioná —</option>
              {clubes.map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
            </SelectAdmin>
          </Campo>
          <Campo label="Visitante">
            <SelectAdmin value={nuevoVisitante} onChange={e => setNuevoVisitante(e.target.value)}>
              <option value="">— Seleccioná —</option>
              {clubes.filter(c => c.docId !== nuevoLocal).map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
            </SelectAdmin>
          </Campo>
          <BtnPrimary onClick={crearCruce} disabled={!nuevoLocal || !nuevoVisitante || guardando} fullWidth>
            {guardando ? "Guardando..." : "Agregar cruce"}
          </BtnPrimary>
        </Modal>
      )}
    </>
  );
}

// ── Fila de cruce con resultado inline ────────────────────────────────────────
function CruceRow({ cruce, fase, clubes, onGuardar, onEliminar }) {
  const [jugado,  setJugado]  = useState(cruce.jugado ?? false);
  const [gl,      setGl]      = useState(cruce.golesLocal        != null ? String(cruce.golesLocal)        : "");
  const [gv,      setGv]      = useState(cruce.golesVisitante    != null ? String(cruce.golesVisitante)    : "");
  const [glV,     setGlV]     = useState(cruce.golesLocalVuelta  != null ? String(cruce.golesLocalVuelta)  : "");
  const [gvV,     setGvV]     = useState(cruce.golesVisitanteVuelta != null ? String(cruce.golesVisitanteVuelta) : "");
  const [hayPen,  setHayPen]  = useState(cruce.hayPenales ?? false);
  const [pl,      setPl]      = useState(cruce.penalesLocal      != null ? String(cruce.penalesLocal)      : "");
  const [pv,      setPv]      = useState(cruce.penalesVisitante  != null ? String(cruce.penalesVisitante)  : "");
  const [guardando, setGuardando] = useState(false);

  const lClub = clubes.find(c => c.docId === cruce.localId);
  const vClub = clubes.find(c => c.docId === cruce.visitanteId);

  async function guardar() {
    setGuardando(true);
    try {
      await onGuardar({
        jugado,
        golesLocal:             jugado && gl  !== "" ? parseInt(gl)  : null,
        golesVisitante:         jugado && gv  !== "" ? parseInt(gv)  : null,
        golesLocalVuelta:       jugado && fase.idaYVuelta && glV !== "" ? parseInt(glV) : null,
        golesVisitanteVuelta:   jugado && fase.idaYVuelta && gvV !== "" ? parseInt(gvV) : null,
        hayPenales:             jugado && hayPen,
        penalesLocal:           jugado && hayPen && pl !== "" ? parseInt(pl) : null,
        penalesVisitante:       jugado && hayPen && pv !== "" ? parseInt(pv) : null,
      });
    } finally { setGuardando(false); }
  }

  return (
    <Card>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Ida */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#111827", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lClub?.nombre || cruce.localNombre}
          </span>
          {jugado ? (
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <NumInput value={gl} onChange={setGl} />
              <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>—</span>
              <NumInput value={gv} onChange={setGv} />
            </div>
          ) : (
            <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, minWidth: 48, textAlign: "center", flexShrink: 0 }}>
              {fase.idaYVuelta ? "Ida" : "vs"}
            </span>
          )}
          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {vClub?.nombre || cruce.visitanteNombre}
          </span>
        </div>

        {/* Vuelta */}
        {fase.idaYVuelta && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1, fontSize: 11, color: "#9ca3af", textAlign: "right" }}>Vuelta</span>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              {jugado ? (
                <>
                  <NumInput value={glV} onChange={setGlV} />
                  <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>—</span>
                  <NumInput value={gvV} onChange={setGvV} />
                </>
              ) : (
                <span style={{ fontSize: 11, color: "#d1d5db", minWidth: 48, textAlign: "center" }}>—</span>
              )}
            </div>
            <span style={{ flex: 1 }} />
          </div>
        )}

        {/* Penales */}
        {jugado && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Switch value={hayPen} onChange={v => { setHayPen(v); if (!v) { setPl(""); setPv(""); } }} />
            <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>Penales</span>
            {hayPen && (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <NumInput value={pl} onChange={setPl} />
                <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 12 }}>—</span>
                <NumInput value={pv} onChange={setPv} />
              </div>
            )}
          </div>
        )}

        {/* Controles */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Switch value={jugado} onChange={v => {
            setJugado(v);
            if (!v) { setGl(""); setGv(""); setGlV(""); setGvV(""); setHayPen(false); setPl(""); setPv(""); }
          }} />
          <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{jugado ? "Jugado" : "Pendiente"}</span>
          <button onClick={onEliminar}
            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 15, padding: "2px 4px" }}>🗑</button>
          <button onClick={guardar} disabled={guardando}
            style={{ background: guardando ? "#9ca3af" : "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "5px 12px", cursor: guardando ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700 }}>
            {guardando ? "..." : "Guardar"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function NumInput({ value, onChange, disabled }) {
  return (
    <input
      type="number" min="0" value={value} onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{ width: 36, textAlign: "center", border: "1px solid #dcfce7", borderRadius: 6, padding: "3px", fontSize: 14, fontWeight: 700, color: "#111827", background: disabled ? "#f9fafb" : "#fff", outline: "none" }}
    />
  );
}

// ── Fila de cruce con resultados por categoría (copa_club) ───────────────────
function calcularGanadorClub(cruce, categorias) {
  if (!cruce.jugado) return null;
  let ptL = 0, ptV = 0, gfL = 0, gfV = 0;
  for (const [catId, r] of Object.entries(cruce.catResultados || {})) {
    const gl = r.golL ?? 0, gv = r.golV ?? 0;
    gfL += gl; gfV += gv;
    if (gl > gv) ptL += 3;
    else if (gl < gv) ptV += 3;
    else { ptL += 1; ptV += 1; }
  }
  if (ptL > ptV) return cruce.localId;
  if (ptV > ptL) return cruce.visitanteId;
  if (gfL > gfV) return cruce.localId;
  if (gfV > gfL) return cruce.visitanteId;
  if (cruce.catPenalesId) {
    const r = (cruce.catResultados || {})[cruce.catPenalesId];
    if (r && r.penL != null && r.penV != null) {
      if (r.penL > r.penV) return cruce.localId;
      if (r.penV > r.penL) return cruce.visitanteId;
    }
  }
  return null;
}

function CruceRowClub({ cruce, fase, clubes, categorias, onGuardar, onEliminar }) {
  const [jugado,       setJugado]       = useState(cruce.jugado ?? false);
  const [catPenalesId, setCatPenalesId] = useState(cruce.catPenalesId || "");
  const [catResultados, setCatResultados] = useState(() => {
    const init = {};
    (categorias || []).forEach(c => {
      init[c.docId] = cruce.catResultados?.[c.docId] || { golL: "", golV: "", penL: "", penV: "" };
    });
    return init;
  });
  const [guardando, setGuardando] = useState(false);

  const lClub = clubes.find(c => c.docId === cruce.localId);
  const vClub = clubes.find(c => c.docId === cruce.visitanteId);

  let ptL = 0, ptV = 0, gfL = 0, gfV = 0;
  if (jugado) {
    (categorias || []).forEach(cat => {
      const r = catResultados[cat.docId] || {};
      const gl = parseInt(r.golL) || 0, gv = parseInt(r.golV) || 0;
      gfL += gl; gfV += gv;
      if (gl > gv) ptL += 3;
      else if (gl < gv) ptV += 3;
      else { ptL += 1; ptV += 1; }
    });
  }

  function setGol(catId, lado, val) {
    setCatResultados(prev => ({ ...prev, [catId]: { ...prev[catId], [lado]: val } }));
  }

  async function guardar() {
    setGuardando(true);
    try {
      const finalResultados = {};
      (categorias || []).forEach(cat => {
        const r = catResultados[cat.docId] || {};
        finalResultados[cat.docId] = {
          golL: jugado && r.golL !== "" ? parseInt(r.golL) : null,
          golV: jugado && r.golV !== "" ? parseInt(r.golV) : null,
          penL: jugado && cat.docId === catPenalesId && r.penL !== "" ? parseInt(r.penL) : null,
          penV: jugado && cat.docId === catPenalesId && r.penV !== "" ? parseInt(r.penV) : null,
        };
      });
      await onGuardar({ jugado, catPenalesId: catPenalesId || null, catResultados: finalResultados });
    } finally { setGuardando(false); }
  }

  return (
    <Card>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Header: club names */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#111827", textAlign: "right" }}>{lClub?.nombre || cruce.localNombre}</span>
          <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>vs</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#111827" }}>{vClub?.nombre || cruce.visitanteNombre}</span>
        </div>

        {/* Summary pts + goals when jugado */}
        {jugado && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>{ptL}pts {gfL}gf</span>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>—</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>{ptV}pts {gfV}gf</span>
          </div>
        )}

        {/* Per-category result inputs */}
        {(categorias || []).map(cat => {
          const r = catResultados[cat.docId] || {};
          const esPenCat = cat.docId === catPenalesId;
          return (
            <div key={cat.docId} style={{ background: "#f9fafb", borderRadius: 8, padding: "6px 8px" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>
                {cat.nombre}{esPenCat && jugado && " 🥅"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <NumInput value={r.golL ?? ""} onChange={v => setGol(cat.docId, "golL", v)} disabled={!jugado} />
                <span style={{ color: "#9ca3af", fontWeight: 700, fontSize: 11 }}>—</span>
                <NumInput value={r.golV ?? ""} onChange={v => setGol(cat.docId, "golV", v)} disabled={!jugado} />
                {esPenCat && jugado && (
                  <>
                    <span style={{ fontSize: 10, color: "#854d0e", marginLeft: 4 }}>Pen:</span>
                    <NumInput value={r.penL ?? ""} onChange={v => setGol(cat.docId, "penL", v)} />
                    <span style={{ color: "#9ca3af", fontSize: 11 }}>—</span>
                    <NumInput value={r.penV ?? ""} onChange={v => setGol(cat.docId, "penV", v)} />
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Categoría penales selector */}
        {(categorias || []).length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0 }}>Cat. penales:</span>
            <select value={catPenalesId} onChange={e => setCatPenalesId(e.target.value)}
              style={{ flex: 1, fontSize: 11, border: "1px solid #dcfce7", borderRadius: 6, padding: "3px 6px", outline: "none", background: "#fff" }}>
              <option value="">— Ninguna —</option>
              {(categorias || []).map(c => <option key={c.docId} value={c.docId}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4, borderTop: "1px solid #f0fdf4" }}>
          <Switch value={jugado} onChange={v => {
            setJugado(v);
            if (!v) {
              setCatResultados(prev => {
                const reset = {};
                Object.keys(prev).forEach(k => { reset[k] = { golL: "", golV: "", penL: "", penV: "" }; });
                return reset;
              });
            }
          }} />
          <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{jugado ? "Jugado" : "Pendiente"}</span>
          <button onClick={onEliminar}
            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 15, padding: "2px 4px" }}>🗑</button>
          <button onClick={guardar} disabled={guardando}
            style={{ background: guardando ? "#9ca3af" : "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 8, padding: "5px 12px", cursor: guardando ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700 }}>
            {guardando ? "..." : "Guardar"}
          </button>
        </div>
      </div>
    </Card>
  );
}
