import * as XLSX from "xlsx";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";

const TABLA_HEADERS = ["Pos", "Club", "Pts", "PJ", "G", "E", "P", "GF", "GC", "DG"];

// Anchos de columna para hoja de tabla de posiciones
const TABLA_COLS = [
  { wch: 5  }, // Pos
  { wch: 26 }, // Club
  { wch: 6  }, // Pts
  { wch: 6  }, // PJ
  { wch: 6  }, // G
  { wch: 6  }, // E
  { wch: 6  }, // P
  { wch: 6  }, // GF
  { wch: 6  }, // GC
  { wch: 6  }, // DG
];

function boldRow(ws, rowIdx, numCols) {
  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true } };
  }
}

function computarTabla(clubes, partidos, sanciones = [], pV = 3, pE = 1) {
  const m = {};
  clubes.forEach(c => {
    m[c.docId] = { nombre: c.nombre, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 };
  });
  partidos
    .filter(p => !p.esLibre && p.jugado && p.golesLocal != null && p.golesVisitante != null)
    .forEach(p => {
      const loc = m[p.localId], vis = m[p.visitanteId];
      if (!loc || !vis) return;
      loc.pj++; vis.pj++;
      loc.gf += p.golesLocal; loc.gc += p.golesVisitante;
      vis.gf += p.golesVisitante; vis.gc += p.golesLocal;
      if (p.perdidoAmbos)                        { loc.p++; vis.p++; }
      else if (p.golesLocal > p.golesVisitante)  { loc.g++; vis.p++; loc.pts += pV; }
      else if (p.golesLocal < p.golesVisitante)  { vis.g++; loc.p++; vis.pts += pV; }
      else                                        { loc.e++; vis.e++; loc.pts += pE; vis.pts += pE; }
    });
  sanciones.forEach(s => { if (m[s.clubId]) m[s.clubId].pts -= s.puntos; });
  return Object.values(m).sort((a, b) =>
    b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf
  );
}

function tablaToRows(tabla) {
  return tabla.map((r, i) => [i + 1, r.nombre, r.pts, r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc]);
}

function safeName(nombre) {
  return (nombre || "Hoja").replace(/[\\\/\*\?\[\]\:]/g, "-").slice(0, 31);
}

export async function exportarTablasExcel({ zonaRef, zona, tipo, categorias, clubes, grupos, tablaConf, pV, pE }) {
  const wb = XLSX.utils.book_new();
  const hoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).replace(/\//g, "-");

  const catData = await Promise.all(
    categorias.map(async cat => {
      const catRef = doc(collection(zonaRef, "categorias"), cat.docId);
      const pSnap = await getDocs(collection(catRef, "partidos"));
      const partidos = pSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
      let sanciones = [];
      if (tipo !== "copa_club") {
        try {
          const catDoc = await getDoc(catRef);
          sanciones = catDoc.data()?.sanciones || [];
        } catch (_) {}
      }
      return { cat, partidos, sanciones };
    })
  );

  catData.forEach(({ cat, partidos, sanciones }) => {
    if (tipo === "copa_club") {
      const wsData = [];
      const headerRows = []; // filas que deben ir en negrita

      grupos.forEach(grupo => {
        headerRows.push(wsData.length);           // nombre del grupo
        wsData.push([grupo.nombre]);
        headerRows.push(wsData.length);           // columnas de la tabla
        wsData.push(TABLA_HEADERS);

        const grupoClubs = (grupo.clubes || [])
          .map(id => clubes.find(c => c.docId === id))
          .filter(Boolean);
        const grupoPartidos = partidos.filter(p => p.grupoId === grupo.id);
        tablaToRows(computarTabla(grupoClubs, grupoPartidos, [], pV, pE))
          .forEach(r => wsData.push(r));
        wsData.push([]);
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      headerRows.forEach(r => boldRow(ws, r, TABLA_HEADERS.length));
      ws['!cols'] = TABLA_COLS;
      XLSX.utils.book_append_sheet(wb, ws, safeName(cat.nombre));
    } else {
      const wsData = [TABLA_HEADERS, ...tablaToRows(computarTabla(clubes, partidos, sanciones, pV, pE))];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      boldRow(ws, 0, TABLA_HEADERS.length);
      ws['!cols'] = TABLA_COLS;
      XLSX.utils.book_append_sheet(wb, ws, safeName(cat.nombre));
    }
  });

  // Hoja de tabla general si está activa
  if (tablaConf?.tablaGeneralActiva) {
    const catIds = tablaConf.tablaGeneralCategorias || [];
    if (catIds.length > 0) {
      const allPartidos = (await Promise.all(
        catIds.map(cId =>
          getDocs(collection(doc(collection(zonaRef, "categorias"), cId), "partidos"))
            .then(s => s.docs.map(d => ({ docId: d.id, ...d.data() })))
        )
      )).flat();
      const pVGen = tablaConf.tablaGeneralPuntosVictoria ?? 3;
      const sanciones = tablaConf.tablaGeneralSanciones || [];

      let ws;
      if (tipo === "copa_club" && grupos.length > 0) {
        // Separar por grupo igual que las hojas por categoría
        const wsData = [];
        const headerRows = [];
        grupos.forEach(grupo => {
          headerRows.push(wsData.length);
          wsData.push([grupo.nombre]);
          headerRows.push(wsData.length);
          wsData.push(TABLA_HEADERS);
          const grupoClubs = (grupo.clubes || [])
            .map(id => clubes.find(c => c.docId === id))
            .filter(Boolean);
          const grupoPartidos = allPartidos.filter(p => p.grupoId === grupo.id);
          tablaToRows(computarTabla(grupoClubs, grupoPartidos, sanciones, pVGen, pE))
            .forEach(r => wsData.push(r));
          wsData.push([]);
        });
        ws = XLSX.utils.aoa_to_sheet(wsData);
        headerRows.forEach(r => boldRow(ws, r, TABLA_HEADERS.length));
      } else {
        const wsData = [TABLA_HEADERS, ...tablaToRows(computarTabla(clubes, allPartidos, sanciones, pVGen, pE))];
        ws = XLSX.utils.aoa_to_sheet(wsData);
        boldRow(ws, 0, TABLA_HEADERS.length);
      }
      ws['!cols'] = TABLA_COLS;
      XLSX.utils.book_append_sheet(wb, ws, "Tabla General");
    }
  }

  if (wb.SheetNames.length === 0) throw new Error("Sin datos para exportar");

  const nombreArchivo = zona.nombre.replace(/[\\\/\*\?\[\]\:]/g, "-");
  XLSX.writeFile(wb, `${nombreArchivo} - Tablas - ${hoy}.xlsx`);
}

export async function exportarFechaExcel({ zonaRef, zona, categorias, clubes, jornada }) {
  const catPartidos = await Promise.all(
    categorias.map(async cat => {
      const snap = await getDocs(
        collection(doc(collection(zonaRef, "categorias"), cat.docId), "partidos")
      );
      const partidos = snap.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter(p => Number(p.jornada) === jornada && !p.esLibre);
      return { cat, partidos };
    })
  );

  const seenKeys = new Set();
  const matches = [];
  for (const { partidos } of catPartidos) {
    for (const p of [...partidos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))) {
      const key = `${p.localId}_${p.visitanteId}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        matches.push({
          localId: p.localId,
          visitanteId: p.visitanteId,
          localNombre:
            p.localNombre || clubes.find(c => c.docId === p.localId)?.nombre || "Local",
          visitanteNombre:
            p.visitanteNombre || clubes.find(c => c.docId === p.visitanteId)?.nombre || "Visitante",
          orden: p.orden ?? 0,
        });
      }
    }
  }

  if (matches.length === 0) throw new Error("No hay partidos para esta fecha");

  const headers = ["Equipo", ...categorias.map(c => c.nombre)];
  const rows = [headers];
  for (const match of matches) {
    const golesLocal = categorias.map(cat => {
      const catData = catPartidos.find(r => r.cat.docId === cat.docId);
      const p = catData?.partidos.find(
        p => p.localId === match.localId && p.visitanteId === match.visitanteId
      );
      if (!p || !p.jugado || p.golesLocal == null) return "-";
      return p.golesLocal;
    });
    const golesVisitante = categorias.map(cat => {
      const catData = catPartidos.find(r => r.cat.docId === cat.docId);
      const p = catData?.partidos.find(
        p => p.localId === match.localId && p.visitanteId === match.visitanteId
      );
      if (!p || !p.jugado || p.golesVisitante == null) return "-";
      return p.golesVisitante;
    });
    rows.push([`${match.localNombre} (L)`,    ...golesLocal]);
    rows.push([`${match.visitanteNombre} (V)`, ...golesVisitante]);
    rows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Negrita en la fila de encabezado
  boldRow(ws, 0, headers.length);

  // Ancho de columnas: equipo más ancho, categorías según largo del nombre
  const catWidth = Math.max(...categorias.map(c => c.nombre.length), 8) + 2;
  ws['!cols'] = [{ wch: 28 }, ...categorias.map(() => ({ wch: catWidth }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeName(`Fecha ${jornada}`));

  const nombreArchivo = zona.nombre.replace(/[\\\/\*\?\[\]\:]/g, "-");
  XLSX.writeFile(wb, `${nombreArchivo} - Fecha ${jornada}.xlsx`);
}
