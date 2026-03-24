import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import Ligas from "./screens/Ligas";
import Liga from "./screens/Liga";
import Temporada from "./screens/Temporada";
import Competencia from "./screens/Competencia";
import ZonaAdmin from "./screens/ZonaAdmin";

export default function PanelAdmin() {
  const navigate = useNavigate();
  const [pantalla, setPantalla] = useState("ligas"); // ligas | liga | temporada | competencia | zona
  const [ligaSeleccionada,       setLigaSeleccionada]       = useState(null);
  const [temporadaSeleccionada,  setTemporadaSeleccionada]  = useState(null);
  const [competenciaSeleccionada,setCompetenciaSeleccionada] = useState(null);
  const [zonaSeleccionada,       setZonaSeleccionada]       = useState(null);

  async function handleCerrarSesion() {
    await signOut(auth);
    navigate("/admin/login");
  }

  function irALiga(liga) {
    setLigaSeleccionada(liga);
    setPantalla("liga");
  }

  function irATemporada(temporada) {
    setTemporadaSeleccionada(temporada);
    setPantalla("temporada");
  }

  function irACompetencia(competencia) {
    setCompetenciaSeleccionada(competencia);
    setPantalla("competencia");
  }

  function irAZona(zona) {
    setZonaSeleccionada(zona);
    setPantalla("zona");
  }

  if (pantalla === "zona") {
    return (
      <ZonaAdmin
        liga={ligaSeleccionada}
        temporada={temporadaSeleccionada}
        competencia={competenciaSeleccionada}
        zona={zonaSeleccionada}
        onBack={() => setPantalla("competencia")}
      />
    );
  }

  if (pantalla === "competencia") {
    return (
      <Competencia
        liga={ligaSeleccionada}
        temporada={temporadaSeleccionada}
        competencia={competenciaSeleccionada}
        onBack={() => setPantalla("temporada")}
        onSeleccionarZona={irAZona}
      />
    );
  }

  if (pantalla === "temporada") {
    return (
      <Temporada
        liga={ligaSeleccionada}
        temporada={temporadaSeleccionada}
        onBack={() => setPantalla("liga")}
        onSeleccionarCompetencia={irACompetencia}
      />
    );
  }

  if (pantalla === "liga") {
    return (
      <Liga
        liga={ligaSeleccionada}
        onBack={() => setPantalla("ligas")}
        onSeleccionarTemporada={irATemporada}
      />
    );
  }

  // Pantalla principal: lista de ligas con header de sesión
  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: "#1a3a2a", padding: "12px 16px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
            <img src="/icon-192.png" alt="LifHur" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 800 }}>Panel Admin</div>
            <div style={{ color: "#86efac", fontSize: 11, marginTop: 1 }}>{auth.currentUser?.email}</div>
          </div>
          <button onClick={handleCerrarSesion} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Salir
          </button>
        </div>
      </div>
      <Ligas onSeleccionar={irALiga} />
    </div>
  );
}
