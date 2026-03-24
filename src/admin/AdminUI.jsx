const V = "#1a3a2a";
const VL = "#4ade80";
export const sombra = "0 1px 6px rgba(0,0,0,0.06)";

export function HeaderAdmin({ titulo, subtitulo, onBack, accionLabel, onAccion }) {
  return (
    <div style={{ background: V, padding: "14px 16px", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#bbf7d0", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0 }}>←</button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</div>
          {subtitulo && <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 }}>{subtitulo}</div>}
        </div>
        {accionLabel && (
          <button onClick={onAccion} style={{ background: VL, color: V, border: "none", borderRadius: 8, padding: "7px 13px", cursor: "pointer", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{accionLabel}</button>
        )}
      </div>
    </div>
  );
}

export function Card({ children, onClick, style = {} }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", borderRadius: 14, border: "1px solid #dcfce7", boxShadow: sombra, overflow: "hidden", cursor: onClick ? "pointer" : "default", ...style }}>
      {children}
    </div>
  );
}

export function Modal({ titulo, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600, maxHeight: "88vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f0fdf4", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{titulo}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Switch({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 26, borderRadius: 13, background: value ? VL : "#d1d5db", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
      <div style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.15s" }} />
    </div>
  );
}

export function BtnPrimary({ children, onClick, disabled, fullWidth }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: V, color: VL, border: "none", borderRadius: 10, padding: "11px 16px", cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: disabled ? 0.6 : 1, width: fullWidth ? "100%" : "auto" }}>
      {children}
    </button>
  );
}

export function Campo({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

export function InputAdmin(props) {
  return (
    <input {...props} style={{ border: "1px solid #d1fae5", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#111827", outline: "none", background: "#f0fdf4", width: "100%", boxSizing: "border-box", ...props.style }} />
  );
}

export function SelectAdmin({ children, ...props }) {
  return (
    <select {...props} style={{ border: "1px solid #d1fae5", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#111827", outline: "none", background: "#f0fdf4", width: "100%", boxSizing: "border-box" }}>
      {children}
    </select>
  );
}

export function SeccionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.2 }}>{children}</div>;
}

export function EmptyState({ emoji = "📭", titulo, descripcion }) {
  return (
    <div style={{ textAlign: "center", padding: "36px 16px", color: "#6b7280" }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#374151", marginBottom: 4 }}>{titulo}</div>
      {descripcion && <div style={{ fontSize: 13 }}>{descripcion}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 36 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #dcfce7", borderTopColor: "#4ade80", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ConfirmModal({ mensaje, onConfirmar, onCancelar }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 300, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", textAlign: "center" }}>¿Estás seguro?</div>
        {mensaje && <div style={{ fontSize: 13, color: "#6b7280", textAlign: "center" }}>{mensaje}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancelar} style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: 10, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>Cancelar</button>
          <button onClick={onConfirmar} style={{ flex: 1, padding: "10px", border: "none", borderRadius: 10, background: "#dc2626", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff" }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}
