import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'

// --- CONFIGURACIÓN ---
const DOMINIOS_PERMITIDOS = ["@alumnos.ucm.cl", "@alum.ucm.cl", "@ucm.cl"]; // Tus dominios

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const BLOQUES = [
  '08:30 - 09:30', '09:35 - 10:35', '10:55 - 11:50', 
  '11:55 - 12:55', '13:10 - 14:10', '14:30 - 15:30', 
  '15:35 - 16:35', '16:55 - 17:50', '17:55 - 18:55'
];

function App() {
  // LOGIN
  const [usuario, setUsuario] = useState(null)
  const [emailInput, setEmailInput] = useState("")
  const [errorLogin, setErrorLogin] = useState("")

  // DATOS
  const [catalogoRamos, setCatalogoRamos] = useState([])
  const [busqueda, setBusqueda] = useState("")
  const [ramoSeleccionado, setRamoSeleccionado] = useState(null)
  const [horarioArmado, setHorarioArmado] = useState([])
  const [creditosTotales, setCreditosTotales] = useState(0)

  // CARGAR CATALOGO AL INICIO
  useEffect(() => {
    async function getAsignaturas() {
      const { data } = await supabase.from('asignaturas').select('*').order('id')
      if (data) setCatalogoRamos(data)
    }
    getAsignaturas()
  }, [])

  // --- EFECTO MAGICO: CARGAR HORARIO AL LOGUEARSE ---
  useEffect(() => {
    if (usuario && catalogoRamos.length > 0) {
      cargarHorarioGuardado();
    }
  }, [usuario, catalogoRamos])

  async function cargarHorarioGuardado() {
    // 1. Buscamos en la tabla 'mis_horarios' todo lo de este email
    const { data: datosGuardados } = await supabase
      .from('mis_horarios')
      .select('*')
      .eq('email', usuario)

    if (datosGuardados && datosGuardados.length > 0) {
      // 2. Reconstruimos el horario para la app
      let creditosAcumulados = 0;
      const horarioReconstruido = datosGuardados.map(item => {
        // Buscamos el objeto ramo completo usando el ID que guardamos
        const ramoCompleto = catalogoRamos.find(r => r.id === item.ramo_id);
        
        // Sumamos créditos (con cuidado de no sumar duplicados si el código es malo, 
        // pero aquí solo sumamos para calcular el total inicial)
        // Nota: Para simplificar, recalculamos abajo.
        return {
          id_unico: item.id, // Usamos el ID real de la base de datos
          ramo: ramoCompleto,
          dia: item.dia,
          bloque: item.bloque
        };
      }).filter(item => item.ramo); // Filtramos si alguno no se encontró

      // Calcular créditos únicos
      const ramosUnicos = [...new Set(horarioReconstruido.map(h => h.ramo.id))];
      ramosUnicos.forEach(id => {
        const r = catalogoRamos.find(cata => cata.id === id);
        if (r) creditosAcumulados += r.creditos;
      });

      setHorarioArmado(horarioReconstruido);
      setCreditosTotales(creditosAcumulados);
    }
  }
  // ----------------------------------------------------

  function handleLogin(e) {
    e.preventDefault(); 
    if (!emailInput) { setErrorLogin("Escribe tu correo."); return; }
    
    const esValido = DOMINIOS_PERMITIDOS.some(d => emailInput.toLowerCase().endsWith(d));
    if (!esValido) { setErrorLogin(`Solo correos: ${DOMINIOS_PERMITIDOS.join(", ")}`); return; }

    setUsuario(emailInput);
    setErrorLogin("");
  }

  function toggleSeleccionRamo(ramo) {
    if (ramoSeleccionado?.id === ramo.id) setRamoSeleccionado(null)
    else setRamoSeleccionado(ramo)
  }

  // --- FUNCIÓN AGREGAR (CON GUARDADO EN BD) ---
  async function colocarEnCelda(dia, bloque) {
    if (!ramoSeleccionado) return;

    // Validaciones locales
    const ramosEnEstaCelda = horarioArmado.filter(h => h.dia === dia && h.bloque === bloque);
    if (ramosEnEstaCelda.length >= 2) { alert("⚠️ Máximo 2 ramos."); return; }
    if (ramosEnEstaCelda.some(h => h.ramo.id === ramoSeleccionado.id)) return;

    // Validar Créditos
    const yaEstaba = horarioArmado.some(h => h.ramo.id === ramoSeleccionado.id);
    if (!yaEstaba) {
      if (creditosTotales + ramoSeleccionado.creditos > 30) { alert("⚠️ Tope de 30 créditos."); return; }
      setCreditosTotales(creditosTotales + ramoSeleccionado.creditos);
    }

    // 1. GUARDAR EN SUPABASE PRIMERO
    const { data, error } = await supabase
      .from('mis_horarios')
      .insert({
        email: usuario,
        ramo_id: ramoSeleccionado.id,
        dia: dia,
        bloque: bloque
      })
      .select()

    if (error) {
      alert("Error guardando: " + error.message);
      return;
    }

    // 2. SI SE GUARDÓ BIEN, ACTUALIZAR PANTALLA
    const nuevoItem = {
      id_unico: data[0].id, // Usamos el ID que nos dio Supabase
      ramo: ramoSeleccionado,
      dia,
      bloque
    };
    setHorarioArmado([...horarioArmado, nuevoItem]);
  }

  // --- FUNCIÓN QUITAR (CON BORRADO EN BD) ---
  async function quitarDeCelda(itemAQuitar) {
    // 1. BORRAR DE SUPABASE
    const { error } = await supabase
      .from('mis_horarios')
      .delete()
      .eq('id', itemAQuitar.id_unico) // Borramos por el ID único de la fila

    if (error) {
      console.log("Error borrando", error);
      return;
    }

    // 2. ACTUALIZAR PANTALLA
    const nuevoHorario = horarioArmado.filter(i => i.id_unico !== itemAQuitar.id_unico);
    setHorarioArmado(nuevoHorario);

    // Recalcular créditos
    const sigueEstando = nuevoHorario.some(i => i.ramo.id === itemAQuitar.ramo.id);
    if (!sigueEstando) {
      setCreditosTotales(creditosTotales - itemAQuitar.ramo.creditos);
    }
  }

  // --- FUNCIÓN LIMPIAR TODO (RESET) ---
  async function limpiarTodo() {
    if(!window.confirm("¿Seguro que quieres borrar TODO tu horario?")) return;

    // 1. Borrar todo de la BD para este usuario
    const { error } = await supabase
      .from('mis_horarios')
      .delete()
      .eq('email', usuario)

    if (error) {
      alert("Error limpiando: " + error.message);
    } else {
      // 2. Limpiar pantalla
      setHorarioArmado([]);
      setCreditosTotales(0);
    }
  }

  function exportarExcel() {
    const datosTabla = BLOQUES.map(bloque => {
      const fila = { Horario: bloque };
      DIAS.forEach(dia => {
        const items = horarioArmado.filter(h => h.dia === dia && h.bloque === bloque);
        fila[dia] = items.map(i => `${i.ramo.id} ${i.ramo.nombre}`).join(' / ');
      });
      return fila;
    });
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(datosTabla);
    hoja['!cols'] = [{ wch: 15 }, ...DIAS.map(() => ({ wch: 25 }))];
    XLSX.utils.book_append_sheet(libro, hoja, "Horario");
    XLSX.writeFile(libro, `Horario_${usuario}.xlsx`);
  }

  const ramosFiltrados = catalogoRamos.filter(r => 
    r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
    r.id.toLowerCase().includes(busqueda.toLowerCase())
  );

  // VISTA LOGIN
  if (!usuario) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f2f5', fontFamily: 'Segoe UI' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '350px', textAlign: 'center' }}>
          <h1 style={{ color: '#2c3e50', marginBottom: '10px' }}>🎓 Acceso Estudiantes</h1>
          <p style={{ color: '#666', marginBottom: '30px' }}>Tu horario se guardará automáticamente con tu correo.</p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Ingresa tu correo UCM..." value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', marginBottom: '15px', boxSizing: 'border-box' }} />
            {errorLogin && <div style={{ color: '#dc3545', fontSize: '0.9rem', marginBottom: '15px', background: '#f8d7da', padding: '10px', borderRadius: '5px' }}>{errorLogin}</div>}
            <button type="submit" style={{ width: '100%', padding: '12px', background: '#0056b3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Ingresar</button>
          </form>
        </div>
      </div>
    )
  }

  // VISTA PLANIFICADOR
  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Segoe UI' }}>
      {/* SIDEBAR */}
      <div style={{ width: '300px', padding: '20px', background: '#f8f9fa', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ color: '#2c3e50', margin: 0 }}>📚 Catálogo</h2>
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
            {usuario} <button onClick={() => setUsuario(null)} style={{ border: 'none', background: 'transparent', color: 'red', cursor: 'pointer', textDecoration: 'underline' }}>(Salir)</button>
          </div>
        </div>
        <input type="text" placeholder="Buscar..." onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }} />
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ramosFiltrados.map((ramo) => (
            <div key={ramo.id} onClick={() => toggleSeleccionRamo(ramo)} style={{ padding: '10px', background: ramoSeleccionado?.id === ramo.id ? '#cce5ff' : 'white', border: ramoSeleccionado?.id === ramo.id ? '2px solid #004085' : '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#0056b3' }}>{ramo.id}</div>
              <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{ramo.nombre}</div>
              <div style={{ fontSize: '0.75rem', color: '#666' }}>💎 {ramo.creditos} Créditos</div>
            </div>
          ))}
        </div>
      </div>

      {/* CALENDARIO */}
      <div style={{ flex: 1, padding: '20px', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: '2px solid #eee' }}>
          <h1 style={{ margin: 0, color: '#333' }}>📅 Planificador</h1>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {/* BOTÓN LIMPIAR NUEVO */}
            <button onClick={limpiarTodo} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🗑️ Limpiar Todo
            </button>
            <button onClick={exportarExcel} style={{ background: '#217346', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📥 Excel
            </button>
            <div style={{ padding: '10px 20px', background: creditosTotales > 30 ? '#dc3545' : '#28a745', color: 'white', borderRadius: '20px', fontWeight: 'bold' }}>
              Créditos: {creditosTotales} / 30
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ background: '#e9ecef', padding: '12px', border: '1px solid #dee2e6' }}>Bloque</th>
                {DIAS.map(d => <th key={d} style={{ background: '#e9ecef', padding: '12px', border: '1px solid #dee2e6', width: '14%' }}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {BLOQUES.map((bloque) => (
                <tr key={bloque}>
                  <td style={{ padding: '8px', border: '1px solid #dee2e6', fontWeight: 'bold', textAlign: 'center', background: '#f8f9fa' }}>{bloque}</td>
                  {DIAS.map(dia => {
                    const items = horarioArmado.filter(h => h.dia === dia && h.bloque === bloque);
                    return (
                      <td key={dia} onClick={() => colocarEnCelda(dia, bloque)} style={{ border: '1px solid #dee2e6', height: '85px', verticalAlign: 'top', padding: '4px', cursor: ramoSeleccionado ? 'cell' : 'default', background: items.length > 0 ? 'white' : 'transparent' }}>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
                          {items.map(item => (
                            <div key={item.id_unico} style={{ background: '#e3f2fd', padding: '4px 6px', borderRadius: '4px', borderLeft: '3px solid #2196f3', display: 'flex', justifyContent: 'space-between', alignItems: 'start', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                              <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#1565c0' }}>{item.ramo.id}</div>
                                <div style={{ fontSize: '0.75rem', lineHeight: '1.1', color: '#0d47a1' }}>{item.ramo.nombre}</div>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); quitarDeCelda(item); }} style={{ background: 'transparent', border: 'none', color: '#d32f2f', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem', lineHeight: '0.5', padding: '0 0 0 4px' }}>×</button>
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default App