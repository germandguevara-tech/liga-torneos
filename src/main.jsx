import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import LoginAdmin from './admin/LoginAdmin.jsx'
import PanelAdmin from './admin/PanelAdmin.jsx'
import RutaProtegida from './admin/RutaProtegida.jsx'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "32px 24px", maxWidth: 360, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111827", marginBottom: 8 }}>Ocurrió un error</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>{this.state.error.message}</div>
            <button onClick={() => window.location.reload()} style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/admin/login" element={<LoginAdmin />} />
          <Route path="/admin" element={<RutaProtegida><PanelAdmin /></RutaProtegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
