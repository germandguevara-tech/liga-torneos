import * as XLSX from "xlsx";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";

const TABLA_HEADERS = ["Pos", "Club", "PJ", "G", "E", "P", "GF", "GC", "DG", "Pts"];

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
  return tabla.map((r, i) => [i + 1, r.nombre, r.pj, r.g, r.e, r.p, r.gf, r.gc, r.gf - r.gc, r.pts]);
}

function safeName(nombre) {
  return (nombre || "Hoja").replace(/[\\\/\*\?\[\]\:]/g, "-").slice(0, 31);
}

export async function exportarTablasExcel({ zonaRef, zona, tipo, categorias, clubes, grupos, tablaConf, pV, pE }) {
  const wb = XLSX.utils.book_new();
  const hoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).replace(/\//g, "-");

  // Fetch partidos (y sanciones para liga) de todas las categorías en paralelo
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

  // Agregar una hoja por categoría
  catData.forEach(({ cat, partidos, sanciones }) => {
    if (tipo === "copa_club") {
      // Grupos separados dentro de la misma hoja
      const wsData = [];
      grupos.forEach(grupo => {
        const grupoClubs = (grupo.clubes || [])
          .map(id => clubes.find(c => c.docId === id))
          .filter(Boolean);
        const grupoPartidos = partidos.filter(p => p.grupoId === grupo.id);
        const tabla = computarTabla(grupoClubs, grupoPartidos, [], pV, pE);
        wsData.push([grupo.nombre]);
        wsData.push(TABLA_HEADERS);
        tablaToRows(tabla).forEach(r => wsData.push(r));
        wsData.push([]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), safeName(cat.nombre));
    } else {
      const tabla = computarTabla(clubes, partidos, sanciones, pV, pE);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([TABLA_HEADERS, ...tablaToRows(tabla)]),
        safeName(cat.nombre)
      );
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
      const tabla = computarTabla(clubes, allPartidos, tablaConf.tablaGeneralSanciones || [], pVGen, pE);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([TABLA_HEADERS, ...tablaToRows(tabla)]),
        "Tabla General"
      );
    }
  }

  if (wb.SheetNames.length === 0) throw new Error("Sin datos para exportar");

  const nombreArchivo = zona.nombre.replace(/[\\\/\*\?\[\]\:]/g, "-");
  XLSX.writeFile(wb, `${nombreArchivo} - Tablas - ${hoy}.xlsx`);
}

export async function exportarFechaExcel({ zonaRef, zona, categorias, clubes, jornada }) {
  // Cargar partidos de esa jornada para todas las categorías en paralelo
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

  // Recopilar pares únicos de partidos ordenados por 'orden'
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

  // Construir cuadro de doble entrada
  const headers = ["Partido", ...categorias.map(c => c.nombre)];
  const rows = matches.map(match => {
    const label = `${match.localNombre} vs ${match.visitanteNombre}`;
    const resultados = categorias.map(cat => {
      const catData = catPartidos.find(r => r.cat.docId === cat.docId);
      const p = catData?.partidos.find(
        p => p.localId === match.localId && p.visitanteId === match.visitanteId
      );
      if (!p || !p.jugado || p.golesLocal == null || p.golesVisitante == null) return "-";
      return `${p.golesLocal} - ${p.golesVisitante}`;
    });
    return [label, ...resultados];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeName(`Fecha ${jornada}`));

  const nombreArchivo = zona.nombre.replace(/[\\\/\*\?\[\]\:]/g, "-");
  XLSX.writeFile(wb, `${nombreArchivo} - Fecha ${jornada}.xlsx`);
}
