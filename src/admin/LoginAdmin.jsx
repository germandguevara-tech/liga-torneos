import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function LoginAdmin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/admin");
    } catch (err) {
      setError(mensajeError(err.code));
    } finally {
      setCargando(false);
    }
  }

  function mensajeError(code) {
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
      return "Email o contraseña incorrectos";
    if (code === "auth/too-many-requests")
      return "Demasiados intentos. Intentá más tarde";
    return "Error al iniciar sesión";
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Header */}
        <div style={{ background: "#1a3a2a", borderRadius: "16px 16px 0 0", padding: "32px 24px 24px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden", margin: "0 auto 14px", border: "2px solid #4ade8040" }}>
            <img src="/icon-192.png" alt="LifHur" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 800 }}>LifHur</div>
          <div style={{ color: "#86efac", fontSize: 13, marginTop: 4 }}>Panel de administración</div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ background: "#fff", borderRadius: "0 0 16px 16px", padding: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email" placeholder="admin@ejemplo.com"
              style={{ border: "1px solid #d1fae5", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#111827", outline: "none", background: "#f0fdf4" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required autoComplete="current-password" placeholder="••••••••"
              style={{ border: "1px solid #d1fae5", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#111827", outline: "none", background: "#f0fdf4" }}
            />
          </div>

          {error && (
            <div style={{ background: "#fee2e2", color: "#991b1b", fontSize: 13, padding: "9px 12px", borderRadius: 10, textAlign: "center" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={cargando}
            style={{ background: "#1a3a2a", color: "#4ade80", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, cursor: cargando ? "not-allowed" : "pointer", opacity: cargando ? 0.7 : 1, marginTop: 4 }}>
            {cargando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
