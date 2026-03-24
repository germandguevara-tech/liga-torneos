import { useState } from "react";
import { addDoc } from "firebase/firestore";
import { BtnPrimary, Campo, InputAdmin, Switch, SeccionLabel } from "../AdminUI";

const V = "#1a3a2a";
const VL = "#4ade80";

const CRITERIOS = [
  { id: "puntos",                label: "Puntos" },
  { id: "gd",                    label: "Diferencia de goles" },
  { id: "gf",                    label: "Goles a favor" },
  { id: "enfrentamientoDirecto", label: "Resultado entre ellos" },
  { id: "menosGC",               label: "Menos goles en contra" },
];

const TIPOS = [
  {
    id: "clubes",
    emoji: "🏟️",
    label: "Clubes con categorías",
    desc: "Los clubes participan con equipos organizados por categoría (Sub-12, Sub-14, etc.)",
  },
  {
    id: "equipos",
    emoji: "⚽",
    label: "Equipos independientes",
    desc: "Equipos que compiten directamente, sin pertenecer a un club",
  },
];

const FORMATOS = {
  clubes: [
    { id: "ligaCat",     emoji: "📊", label: "Liga por categorías",  desc: "Tabla por categoría. Tabla general opcional (suma de puntos entre categorías)." },
    { id: "copaPorClub", emoji: "🏆", label: "Copa por club",        desc: "Fase eliminatoria entre clubes. Tabla general visible calculada automáticamente." },
    { id: "copaPorCat",  emoji: "🥇", label: "Copa por categoría",   desc: "Fase eliminatoria independiente por cada categoría." },
  ],
  equipos: [
    { id: "liga", emoji: "📊", label: "Liga", desc: "Todos contra todos, tabla de posiciones por zona." },
    { id: "copa", emoji: "🏆", label: "Copa", desc: "Zonas + fase eliminatoria con bracket visual." },
  ],
};

const CONFIG_INICIAL = {
  nombre: "",
  tipoParticipantes: "",  // "clubes" | "equipos"
  formato: "",            // "ligaCat" | "copaPorClub" | "copaPorCat" | "liga" | "copa"
  // Puntos (formatos liga)
  puntosPorVictoria: 3,
  puntosPorEmpate: 1,
  // Tabla general (ligaCat)
  tablaGeneralActiva: false,
  tablaGeneralVisible: true,
  tablaGeneralPuntosVictoria: 3,
  // Copa: partidos
  idaYVuelta: false,
  // General
  criteriosDesempate: ["puntos", "gd", "gf", "enfrentamientoDirecto"],
  amarillasParaSuspension: 5,
  advertenciaFaltanAmarillas: 1,
};

const TOTAL_PASOS = 5;

export default function CrearTorneoWizard({ torneosCol, onCreado, onCancelar }) {
  const [paso, setPaso] = useState(1);
  const [config, setConfig] = useState(CONFIG_INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  function upd(campo, valor) {
    setConfig(c => ({ ...c, [campo]: valor }));
  }

  function puedeAvanzar() {
    if (paso === 1) return config.nombre.trim().length > 0;
    if (paso === 2) return config.tipoParticipantes !== "";
    if (paso === 3) return config.formato !== "";
    return true;
  }

  async function crear() {
    if (!config.nombre.trim()) { setError("El nombre es requerido"); return; }
    setGuardando(true);
    try {
      const data = { ...config, nombre: config.nombre.trim(), creadoEn: Date.now() };
      const ref = await addDoc(torneosCol, data);
      onCreado({ docId: ref.id, ...data });
    } catch (e) {
      setError("Error al guardar: " + e.message);
      setGuardando(false);
    }
  }

  function handleBack() {
    if (paso === 1) { onCancelar(); return; }
    setPaso(p => p - 1);
    setError("");
  }

  function handleNext() {
    if (paso === TOTAL_PASOS) { crear(); return; }
    setPaso(p => p + 1);
    setError("");
  }

  const esUltimo = paso === TOTAL_PASOS;

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header con barra de progreso */}
      <div style={{ background: V, padding: "14px 16px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={handleBack} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Nuevo torneo</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 }}>Paso {paso} de {TOTAL_PASOS}</div>
          </div>
        </div>
        <div style={{ marginTop: 10, height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2 }}>
          <div style={{ height: "100%", background: VL, borderRadius: 2, width: `${(paso / TOTAL_PASOS) * 100}%`, transition: "width 0.3s ease" }} />
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 600, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14, paddingBottom: 32 }}>

        {/* ── PASO 1: Nombre ── */}
        {paso === 1 && (
          <>
            <SeccionLabel>Nombre del torneo</SeccionLabel>
            <Campo label="Nombre">
              <InputAdmin
                placeholder="Liga Apertura, Copa Clausura..."
                value={config.nombre}
                onChange={e => upd("nombre", e.target.value)}
                autoFocus
                onKeyDown={e => e.key === "Enter" && puedeAvanzar() && handleNext()}
              />
            </Campo>
          </>
        )}

        {/* ── PASO 2: Tipo de participantes ── */}
        {paso === 2 && (
          <>
            <SeccionLabel>Tipo de participantes</SeccionLabel>
            {TIPOS.map(t => (
              <OpcionCard
                key={t.id}
                emoji={t.emoji}
                label={t.label}
                desc={t.desc}
                seleccionado={config.tipoParticipantes === t.id}
                onClick={() => { upd("tipoParticipantes", t.id); upd("formato", ""); }}
              />
            ))}
          </>
        )}

        {/* ── PASO 3: Formato ── */}
        {paso === 3 && (
          <>
            <SeccionLabel>Formato de competencia</SeccionLabel>
            {(FORMATOS[config.tipoParticipantes] || []).map(f => (
              <OpcionCard
                key={f.id}
                emoji={f.emoji}
                label={f.label}
                desc={f.desc}
                seleccionado={config.formato === f.id}
                onClick={() => upd("formato", f.id)}
              />
            ))}
          </>
        )}

        {/* ── PASO 4: Config específica del formato ── */}
        {paso === 4 && <PasoConfigEspecifica config={config} upd={upd} />}

        {/* ── PASO 5: Config general ── */}
        {paso === 5 && <PasoConfigGeneral config={config} upd={upd} />}

        {/* Error */}
        {error && <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>}

        {/* Botón avanzar / crear */}
        <BtnPrimary onClick={handleNext} disabled={!puedeAvanzar() || guardando} fullWidth>
          {esUltimo ? (guardando ? "Creando..." : "Crear torneo") : "Continuar →"}
        </BtnPrimary>

      </div>
    </div>
  );
}

// ─── Tarjeta de opción seleccionable ────────────────────────────────────────

function OpcionCard({ emoji, label, desc, seleccionado, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        borderRadius: 14,
        border: seleccionado ? `2px solid ${VL}` : "1px solid #dcfce7",
        boxShadow: seleccionado ? `0 0 0 3px ${VL}22` : "0 1px 6px rgba(0,0,0,0.06)",
        padding: "16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        transition: "border 0.15s, box-shadow 0.15s",
      }}
    >
      <div style={{ width: 46, height: 46, borderRadius: 12, background: seleccionado ? VL + "30" : "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, transition: "background 0.15s" }}>
        {emoji}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.45 }}>{desc}</div>
      </div>
      {seleccionado && <span style={{ color: VL, fontSize: 20, flexShrink: 0, marginTop: 2 }}>✓</span>}
    </div>
  );
}

// ─── Paso 4: Configuración específica por formato ───────────────────────────

function PasoConfigEspecifica({ config, upd }) {
  const { formato } = config;
  const esLiga = formato === "ligaCat" || formato === "liga";
  const esCopa = !esLiga;

  return (
    <>
      <SeccionLabel>Configuración del formato</SeccionLabel>

      {/* Puntos (todos los formatos de liga) */}
      {esLiga && (
        <Seccion titulo="Puntuación">
          <div style={{ display: "flex", gap: 12 }}>
            <Campo label="Puntos por victoria" style={{ flex: 1 }}>
              <InputAdmin type="number" min={0} max={9} value={config.puntosPorVictoria}
                onChange={e => upd("puntosPorVictoria", parseInt(e.target.value) || 0)} />
            </Campo>
            <Campo label="Puntos por empate" style={{ flex: 1 }}>
              <InputAdmin type="number" min={0} max={9} value={config.puntosPorEmpate}
                onChange={e => upd("puntosPorEmpate", parseInt(e.target.value) || 0)} />
            </Campo>
          </div>
        </Seccion>
      )}

      {/* Liga por categorías: tabla general */}
      {formato === "ligaCat" && (
        <Seccion titulo="Tabla general">
          <FilaSwitch
            label="Activar tabla general"
            desc="Suma de puntos entre todas las categorías"
            valor={config.tablaGeneralActiva}
            onChange={v => upd("tablaGeneralActiva", v)}
          />
          {config.tablaGeneralActiva && (
            <>
              <Divisor />
              <FilaSwitch
                label="Visible para usuarios"
                desc="Si está desactivado, solo la ven los admins"
                valor={config.tablaGeneralVisible}
                onChange={v => upd("tablaGeneralVisible", v)}
              />
              <Campo label="Puntos por victoria en tabla general">
                <InputAdmin type="number" min={0} max={9} value={config.tablaGeneralPuntosVictoria}
                  onChange={e => upd("tablaGeneralPuntosVictoria", parseInt(e.target.value) || 0)} />
              </Campo>
            </>
          )}
        </Seccion>
      )}

      {/* Liga de equipos: ida y vuelta */}
      {formato === "liga" && (
        <Seccion titulo="Modalidad">
          <FilaSwitch
            label="Ida y vuelta"
            desc="Desactivado = solo ida"
            valor={config.idaYVuelta}
            onChange={v => upd("idaYVuelta", v)}
          />
        </Seccion>
      )}

      {/* Copa por club */}
      {formato === "copaPorClub" && (
        <Seccion titulo="Fase eliminatoria">
          <FilaSwitch
            label="Ida y vuelta"
            desc="Desactivado = partido único"
            valor={config.idaYVuelta}
            onChange={v => upd("idaYVuelta", v)}
          />
          <Divisor />
          <Nota>Las tablas por categoría se usan solo para cargar resultados y no son visibles. La tabla general es visible y se calcula automáticamente de los partidos.</Nota>
        </Seccion>
      )}

      {/* Copa por categoría */}
      {formato === "copaPorCat" && (
        <Seccion titulo="Fase eliminatoria">
          <FilaSwitch
            label="Ida y vuelta"
            desc="Desactivado = partido único"
            valor={config.idaYVuelta}
            onChange={v => upd("idaYVuelta", v)}
          />
          <Divisor />
          <Nota>Las tablas por categoría son visibles. Los partidos admiten resultado por penales (ej: 1-1, pen. 4-3). Sin tabla general.</Nota>
        </Seccion>
      )}

      {/* Copa de equipos */}
      {formato === "copa" && (
        <Seccion titulo="Fase eliminatoria">
          <FilaSwitch
            label="Ida y vuelta"
            desc="Desactivado = partido único"
            valor={config.idaYVuelta}
            onChange={v => upd("idaYVuelta", v)}
          />
          <Divisor />
          <Nota>Los partidos admiten resultado por penales (ej: 1-1, pen. 4-3). Bracket visual por zona.</Nota>
        </Seccion>
      )}
    </>
  );
}

// ─── Paso 5: Configuración general ──────────────────────────────────────────

function PasoConfigGeneral({ config, upd }) {
  function moverCriterio(idx, dir) {
    const arr = [...config.criteriosDesempate];
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    upd("criteriosDesempate", arr);
  }

  function toggleCriterio(id) {
    const arr = config.criteriosDesempate;
    upd("criteriosDesempate", arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  }

  return (
    <>
      <SeccionLabel>Criterios de desempate</SeccionLabel>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {CRITERIOS.map(op => {
          const idx = config.criteriosDesempate.indexOf(op.id);
          const activo = idx !== -1;
          return (
            <div key={op.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderRadius: 8, background: activo ? "#f0fdf4" : "transparent" }}>
              <Switch value={activo} onChange={() => toggleCriterio(op.id)} />
              <span style={{ flex: 1, fontSize: 13, color: activo ? "#111827" : "#9ca3af", fontWeight: activo ? 600 : 400 }}>
                {activo ? `${idx + 1}. ` : ""}{op.label}
              </span>
              {activo && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => moverCriterio(idx, -1)} disabled={idx === 0}
                    style={{ background: "#e5e7eb", border: "none", borderRadius: 6, width: 28, height: 28, cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.3 : 1, fontSize: 12 }}>↑</button>
                  <button onClick={() => moverCriterio(idx, 1)} disabled={idx === config.criteriosDesempate.length - 1}
                    style={{ background: "#e5e7eb", border: "none", borderRadius: 6, width: 28, height: 28, cursor: idx === config.criteriosDesempate.length - 1 ? "default" : "pointer", opacity: idx === config.criteriosDesempate.length - 1 ? 0.3 : 1, fontSize: 12 }}>↓</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SeccionLabel>Tarjetas amarillas</SeccionLabel>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Campo label="Amarillas para suspensión" style={{ flex: 1 }}>
            <InputAdmin type="number" min={1} max={20} value={config.amarillasParaSuspension}
              onChange={e => upd("amarillasParaSuspension", parseInt(e.target.value) || 1)} />
          </Campo>
          <Campo label="Advertencia (faltan X)" style={{ flex: 1 }}>
            <InputAdmin type="number" min={0} max={5} value={config.advertenciaFaltanAmarillas}
              onChange={e => upd("advertenciaFaltanAmarillas", parseInt(e.target.value) || 0)} />
          </Campo>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Se advertirá cuando falten {config.advertenciaFaltanAmarillas} amarilla{config.advertenciaFaltanAmarillas !== 1 ? "s" : ""} para llegar a la suspensión ({config.amarillasParaSuspension}).
        </div>
      </div>
    </>
  );
}

// ─── Helpers de UI ───────────────────────────────────────────────────────────

function Seccion({ titulo, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{titulo}</div>
      {children}
    </div>
  );
}

function FilaSwitch({ label, desc, valor, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{desc}</div>}
      </div>
      <Switch value={valor} onChange={onChange} />
    </div>
  );
}

function Divisor() {
  return <div style={{ height: 1, background: "#f0fdf4" }} />;
}

function Nota({ children }) {
  return <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, background: "#f0fdf4", borderRadius: 8, padding: "8px 10px" }}>{children}</div>;
}
