import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import LoginAdmin from './admin/LoginAdmin.jsx'
import PanelAdmin from './admin/PanelAdmin.jsx'
import RutaProtegida from './admin/RutaProtegida.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin/login" element={<LoginAdmin />} />
        <Route path="/admin" element={<RutaProtegida><PanelAdmin /></RutaProtegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
