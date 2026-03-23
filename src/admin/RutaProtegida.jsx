import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Navigate } from "react-router-dom";

export default function RutaProtegida({ children }) {
  const [estado, setEstado] = useState("cargando"); // "cargando" | "autenticado" | "noAutenticado"

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setEstado(user ? "autenticado" : "noAutenticado");
    });
    return unsub;
  }, []);

  if (estado === "cargando") {
    return (
      <div style={{ minHeight: "100vh", background: "#1a3a2a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #dcfce7", borderTopColor: "#4ade80", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (estado === "noAutenticado") return <Navigate to="/admin/login" replace />;

  return children;
}
