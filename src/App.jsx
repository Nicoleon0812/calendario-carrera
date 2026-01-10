import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'

// --- CONFIGURACIÓN DE SEGURIDAD ---

const DOMINIOS_PERMITIDOS = ["@alumnos.ucm.cl", "@alumn.ucm.cl", "@ucm.cl"]; 

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const BLOQUES = [
  '08:30 - 09:30', '09:35 - 10:35', '10:55 - 11:50', 
  '11:55 - 12:55', '13:10 - 14:10', '14:30 - 15:30', 
  '15:35 - 16:35', '16:55 - 17:50', '17:55 - 18:55'
];

function App() {
  // ESTADO DE SESIÓN (LOGIN)
  const [usuario, setUsuario] = useState(null) 
  const [emailInput, setEmailInput] = useState("")
  const [errorLogin, setErrorLogin] = useState("")

  // ESTADOS DEL CALENDARIO
  const [catalogoRamos, setCatalogoRamos] = useState([])
  const [busqueda, setBusqueda] = useState("")
  const [ramoSeleccionado, setRamoSeleccionado] = useState(null)
  const [horarioArmado, setHorarioArmado] = useState([])
  const [creditosTotales, setCreditosTotales] = useState(0)

  useEffect(() => {
    getAsignaturas()
  }, [])

  async function getAsignaturas() {
    const { data } = await supabase.from('asignaturas').select('*').order('id')
    if (data) setCatalogoRamos(data)
  }

  // --- FUNCIÓN DE LOGIN (ACTUALIZADA PARA VARIOS DOMINIOS) ---
  function handleLogin(e) {
    e.preventDefault(); 
    
    if (!emailInput) {
      setErrorLogin("Por favor escribe tu correo.");
      return;
    }

    // AQUI ESTA LA MAGIA: Revisa si el correo termina en ALGUNO de la lista
    const esValido = DOMINIOS_PERMITIDOS.some(dominio => 
      emailInput.toLowerCase().endsWith(dominio.toLowerCase())
    );

    if (!esValido) {
      setErrorLogin(`Acceso denegado. Solo se permiten correos: ${DOMINIOS_PERMITIDOS.join(", ")}`);
      return;
    }

    setUsuario(emailInput);
    setErrorLogin(""); 
  }
  // -----------------------------------------------------------

  function toggleSeleccionRamo(ramo) {
    if (ramoSeleccionado?.id === ramo.id) setRamoSeleccionado(null)
    else setRamoSeleccionado(ramo)
  }

  function colocarEnCelda(dia, bloque) {
    if (!ramoSeleccionado) return;
    const ramosEnEstaCelda = horarioArmado.filter(h => h.dia === dia && h.bloque === bloque);

    if (ramosEnEstaCelda.length >= 2) {
      alert("⚠️ Máximo 2 ramos por horario."); return;
    }
    if (ramosEnEstaCelda.some(h => h.ramo.id === ramoSeleccionado.id)) return;

    const yaEstabaEnHorario = horarioArmado.some(h => h.ramo.id === ramoSeleccionado.id);
    if (!yaEstabaEnHorario) {
      const nuevosCreditos = creditosTotales + ramoSeleccionado.creditos;
      if (nuevosCreditos > 30) {
        alert("⚠️ ¡Tope de créditos (30)!"); return;
      }
      setCreditosTotales(nuevosCreditos);
    }

    const nuevoItem = { id_unico: Date.now() + Math.random(), ramo: ramoSeleccionado, dia, bloque };
    setHorarioArmado([...horarioArmado, nuevoItem]);
  }

  function quitarDeCelda(itemAQuitar) {
    const nuevoHorario = horarioArmado.filter(i => i.id_unico !== itemAQuitar.id_unico);
    setHorarioArmado(nuevoHorario);
    if (!nuevoHorario.some(i => i.ramo.id === itemAQuitar.ramo.id)) {
      setCreditosTotales(creditosTotales - itemAQuitar.ramo.creditos);
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

  // --- VISTA 1: LOGIN ---
  if (!usuario) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f0f2f5', fontFamily: 'Segoe UI, sans-serif' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '350px', textAlign: 'center' }}>
          <h1 style={{ color: '#2c3e50', marginBottom: '10px' }}>🎓 Acceso Estudiantes</h1>
          <p style={{ color: '#666', marginBottom: '30px' }}>Ingresa tu correo institucional para armar tu horario.</p>
          
          <form onSubmit={handleLogin}>
            <input 
              type="email" 
              placeholder={`ejemplo${DOMINIOS_PERMITIDOS[0]}`} // Muestra el primero como ejemplo
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '5px', border: '1px solid #ccc', marginBottom: '15px', boxSizing: 'border-box' }}
            />
            
            {errorLogin && (
              <div style={{ color: '#dc3545', fontSize: '0.9rem', marginBottom: '15px', background: '#f8d7da', padding: '10px', borderRadius: '5px' }}>
                {errorLogin}
              </div>
            )}

            <button 
              type="submit" 
              style={{ width: '100%', padding: '12px', background: '#0056b3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
            >
              Ingresar al Planificador
            </button>
          </form>
        </div>
      </div>
    )
  }

  // --- VISTA 2: APLICACIÓN ---
  const ramosFiltrados = catalogoRamos.filter(r => 
    r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
    r.id.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Segoe UI, sans-serif' }}>
      
      {/* SIDEBAR */}
      <div style={{ width: '300px', padding: '20px', background: '#f8f9fa', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ color: '#2c3e50', margin: 0 }}>📚 Catálogo</h2>
          <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '5px' }}>
            Hola, {usuario} <button onClick={() => setUsuario(null)} style={{ border: 'none', background: 'transparent', color: 'red', cursor: 'pointer', textDecoration: 'underline' }}>(Salir)</button>
          </div>
        </div>
        
        <input 
          type="text" 
          placeholder="Buscar..." 
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ padding: '10px', marginBottom: '15px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }}
        />

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ramosFiltrados.map((ramo) => (
            <div 
              key={ramo.id} 
              onClick={() => toggleSeleccionRamo(ramo)}
              style={{ 
                padding: '10px', 
                background: ramoSeleccionado?.id === ramo.id ? '#cce5ff' : 'white',
                border: ramoSeleccionado?.id === ramo.id ? '2px solid #004085' : '1px solid #ddd',
                borderRadius: '6px', cursor: 'pointer', userSelect: 'none'
              }}
            >
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