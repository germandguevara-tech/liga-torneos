import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

const ligas = [
  { id: "lifhur", nombre: "LifHur", descripcion: "Liga de Fútbol Hurlingam" },
];

const accesos = [
  { id: "equipos",    emoji: "🏟️", label: "Equipos",    color: "#86efac" },
  { id: "jugadores",  emoji: "👤", label: "Jugadores",  color: "#f9a8d4" },
  { id: "torneos",    emoji: "🏆", label: "Torneos",    color: "#fde68a" },
  { id: "resultados", emoji: "⚽", label: "Resultados", color: "#c4b5fd" },
];

export default function PanelAdmin() {
  const navigate = useNavigate();
  const user = auth.currentUser;

  async function handleCerrarSesion() {
    await signOut(auth);
    navigate("/admin/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1a3a2a", padding: "16px 20px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
            <img src="/icon-192.png" alt="LifHur" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>Panel Admin</div>
            <div style={{ color: "#86efac", fontSize: 11, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email}</div>
          </div>
          <button onClick={handleCerrarSesion}
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            Salir
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Ligas */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Ligas</div>
          {ligas.map(liga => (
            <div key={liga.id} style={{ background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #dcfce7", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", flexShrink: 0, border: "1.5px solid #4ade8040" }}>
                <img src="/icon-192.png" alt={liga.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{liga.nombre}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{liga.descripcion}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "3px 10px", borderRadius: 20 }}>Activa</span>
            </div>
          ))}
        </div>

        {/* Accesos rápidos */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Gestión</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {accesos.map(a => (
              <div key={a.id}
                style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1px solid #dcfce7", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => alert(`Sección "${a.label}" próximamente`)}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: a.color + "40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{a.emoji}</div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
