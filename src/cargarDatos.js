import { db } from "./firebase";
import { collection, doc, setDoc } from "firebase/firestore";

const torneos = [
  { id: "FIM", nombre: "Fútbol Infantil Masculino", color: "#86efac", orden: 1 },
  { id: "FIF", nombre: "Fútbol Infantil Femenino", color: "#f9a8d4", orden: 2 },
  { id: "FJF", nombre: "Fútbol Juvenil Femenino", color: "#c4b5fd", orden: 3 },
];

// Cada doc tiene id=torneoId y campo lista=[...]
const categorias = [
  { id: "FIM", lista: ["2012", "2013", "2014", "2015", "2016", "2017", "2018", "2019", "2020"] },
  { id: "FIF", lista: ["2011-2012", "2013-2014", "2015-2016", "2017-2018", "2019-2020"] },
  { id: "FJF", lista: ["Cuarta", "Reserva", "Primera", "Senior"] },
];

const zonas = [
  { nombre: "Zona A", orden: 1 },
  { nombre: "Zona B", orden: 2 },
  { nombre: "Zona C", orden: 3 },
];

const clubes = [
  { id: 1, nombre: "Club Atlético Norte", siglas: "CAN", color: "#f87171" },
  { id: 2, nombre: "Deportivo Sur", siglas: "DS", color: "#60a5fa" },
  { id: 3, nombre: "Club Social Este", siglas: "CSE", color: "#fbbf24" },
  { id: 4, nombre: "Unión Oeste", siglas: "UO", color: "#a78bfa" },
  { id: 5, nombre: "Atlético Centro", siglas: "AC", color: "#34d399" },
  { id: 6, nombre: "Racing Barrial", siglas: "RB", color: "#fb923c" },
];

const jugadores = [
  { id: 1, nombre: "Tomás", apellido: "González", club: 1, numero: 9, posicion: "Delantero", goles: 7, amarillas: 2, rojas: 0 },
  { id: 2, nombre: "Facundo", apellido: "Romero", club: 1, numero: 5, posicion: "Mediocampista", goles: 3, amarillas: 1, rojas: 0 },
  { id: 3, nombre: "Ezequiel", apellido: "Paz", club: 1, numero: 1, posicion: "Arquero", goles: 0, amarillas: 0, rojas: 0 },
  { id: 4, nombre: "Nicolás", apellido: "Díaz", club: 2, numero: 11, posicion: "Delantero", goles: 5, amarillas: 3, rojas: 1 },
  { id: 5, nombre: "Lucas", apellido: "Castro", club: 2, numero: 7, posicion: "Extremo", goles: 4, amarillas: 0, rojas: 0 },
  { id: 6, nombre: "Agustín", apellido: "Vera", club: 3, numero: 3, posicion: "Defensor", goles: 1, amarillas: 4, rojas: 1 },
  { id: 7, nombre: "Carlos", apellido: "Ruiz", club: 3, numero: 8, posicion: "Mediocampista", goles: 6, amarillas: 1, rojas: 0 },
  { id: 8, nombre: "Juan", apellido: "Peñalba", club: 4, numero: 10, posicion: "Enganche", goles: 5, amarillas: 2, rojas: 0 },
  { id: 9, nombre: "Diego", apellido: "Soria", club: 5, numero: 1, posicion: "Arquero", goles: 0, amarillas: 1, rojas: 0 },
  { id: 10, nombre: "Ramiro", apellido: "López", club: 6, numero: 9, posicion: "Delantero", goles: 8, amarillas: 2, rojas: 1 },
  // Suspendidos por roja
  { id: 11, nombre: "Matías", apellido: "Herrera", club: 1, numero: 4, posicion: "Defensor", goles: 0, amarillas: 1, rojas: 2 },
  { id: 12, nombre: "Sebastián", apellido: "Molina", club: 4, numero: 6, posicion: "Mediocampista", goles: 2, amarillas: 2, rojas: 1 },
  { id: 13, nombre: "Leandro", apellido: "Torres", club: 5, numero: 5, posicion: "Defensor", goles: 0, amarillas: 0, rojas: 1 },
  // Amarillas acumuladas (>= 3)
  { id: 14, nombre: "Bruno", apellido: "Acosta", club: 2, numero: 8, posicion: "Mediocampista", goles: 1, amarillas: 5, rojas: 0 },
  { id: 15, nombre: "Rodrigo", apellido: "Mendez", club: 6, numero: 3, posicion: "Defensor", goles: 0, amarillas: 4, rojas: 0 },
  { id: 16, nombre: "Iván", apellido: "Quiroga", club: 3, numero: 2, posicion: "Defensor", goles: 0, amarillas: 3, rojas: 0 },
  { id: 17, nombre: "Franco", apellido: "Ibáñez", club: 4, numero: 7, posicion: "Extremo", goles: 3, amarillas: 3, rojas: 0 },
];

const partidos = [
  { id: 1, fecha: 1, fechaNombre: "Fecha 1", dia: "15 mar", local: 1, visitante: 2, golesLocal: 2, golesVisitante: 1, jugado: true,
    goles: [{ jugador: 1, equipo: 1, minuto: 23 }, { jugador: 1, equipo: 1, minuto: 67 }, { jugador: 4, equipo: 2, minuto: 45 }],
    amarillas: [{ jugador: 2, equipo: 1, minuto: 55 }], rojas: [] },
  { id: 2, fecha: 1, fechaNombre: "Fecha 1", dia: "15 mar", local: 3, visitante: 4, golesLocal: 1, golesVisitante: 1, jugado: true,
    goles: [{ jugador: 7, equipo: 3, minuto: 30 }, { jugador: 8, equipo: 4, minuto: 78 }],
    amarillas: [{ jugador: 6, equipo: 3, minuto: 40 }, { jugador: 8, equipo: 4, minuto: 60 }], rojas: [] },
  { id: 3, fecha: 1, fechaNombre: "Fecha 1", dia: "15 mar", local: 5, visitante: 6, golesLocal: 0, golesVisitante: 2, jugado: true,
    goles: [{ jugador: 10, equipo: 6, minuto: 12 }, { jugador: 10, equipo: 6, minuto: 88 }],
    amarillas: [], rojas: [{ jugador: 9, equipo: 5, minuto: 70 }] },
  { id: 4, fecha: 2, fechaNombre: "Fecha 2", dia: "22 mar", local: 2, visitante: 3, golesLocal: null, golesVisitante: null, jugado: false, goles: [], amarillas: [], rojas: [] },
  { id: 5, fecha: 2, fechaNombre: "Fecha 2", dia: "22 mar", local: 4, visitante: 5, golesLocal: null, golesVisitante: null, jugado: false, goles: [], amarillas: [], rojas: [] },
  { id: 6, fecha: 2, fechaNombre: "Fecha 2", dia: "22 mar", local: 6, visitante: 1, golesLocal: null, golesVisitante: null, jugado: false, goles: [], amarillas: [], rojas: [] },
  { id: 7, fecha: 3, fechaNombre: "Fecha 3", dia: "29 mar", local: 1, visitante: 3, golesLocal: null, golesVisitante: null, jugado: false, goles: [], amarillas: [], rojas: [] },
  { id: 8, fecha: 3, fechaNombre: "Fecha 3", dia: "29 mar", local: 2, visitante: 5, golesLocal: null, golesVisitante: null, jugado: false, goles: [], amarillas: [], rojas: [] },
  { id: 9, fecha: 3, fechaNombre: "Fecha 3", dia: "29 mar", local: 4, visitante: 6, golesLocal: null, golesVisitante: null, jugado: false, goles: [], amarillas: [], rojas: [] },
];

export async function cargarDatosPrueba() {
  try {
    for (const torneo of torneos) {
      await setDoc(doc(collection(db, "torneos"), torneo.id), torneo);
    }
    for (const cat of categorias) {
      await setDoc(doc(collection(db, "categorias"), cat.id), { lista: cat.lista });
    }
    for (const zona of zonas) {
      await setDoc(doc(collection(db, "zonas"), zona.nombre), zona);
    }
    for (const club of clubes) {
      await setDoc(doc(collection(db, "clubes"), String(club.id)), club);
    }
    for (const jugador of jugadores) {
      await setDoc(doc(collection(db, "jugadores"), String(jugador.id)), jugador);
    }
    for (const partido of partidos) {
      await setDoc(doc(collection(db, "partidos"), String(partido.id)), partido);
    }
    console.log("Datos de prueba cargados correctamente.");
    return { ok: true };
  } catch (error) {
    console.error("Error al cargar datos:", error);
    return { ok: false, error };
  }
}
