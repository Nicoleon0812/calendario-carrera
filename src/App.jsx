import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

// --- CONFIGURACIÓN ---
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const BLOQUES = [
  '08:30 - 09:30', '09:35 - 10:35', '10:50 - 11:50', 
  '11:55 - 12:55', '13:10 - 14:10', '14:30 - 15:30', 
  '15:35 - 16:35', '16:55 - 17:50', '17:55 - 18:55'
];

const PALETA = [
  '#FFCDD2', '#F8BBD0', '#E1BEE7', '#D1C4E9', '#C5CAE9', 
  '#BBDEFB', '#B3E5FC', '#B2EBF2', '#B2DFDB', '#C8E6C9', 
  '#DCEDC8', '#FFF9C4', '#FFECB3', '#FFE0B2', '#D7CCC8', '#F5F5F5'
];

function App() {
  // --- ESTADOS ---
  const [esMovil, setEsMovil] = useState(window.innerWidth < 768); // Detectar celular
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false); // Para colapsar el menú en celular
  
  const [modoOscuro, setModoOscuro] = useState(false); 
  const [usuario, setUsuario] = useState(null)
  const [nombreUsuario, setNombreUsuario] = useState(null)
  const [emailInput, setEmailInput] = useState("")
  const [errorLogin, setErrorLogin] = useState("")
  const [catalogoRamos, setCatalogoRamos] = useState([])
  const [busqueda, setBusqueda] = useState("")
  const [ramoSeleccionado, setRamoSeleccionado] = useState(null)
  const [horarioArmado, setHorarioArmado] = useState([])
  const [creditosTotales, setCreditosTotales] = useState(0)

  // Referencia para la "Cámara Fantasma"
  const tablaRef = useRef(null);

  // --- DETECTOR DE TAMAÑO DE PANTALLA ---
  useEffect(() => {
    const handleResize = () => setEsMovil(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- TEMA ---
  const tema = {
    fondo: modoOscuro ? '#121212' : '#f0f2f5',
    sidebar: modoOscuro ? '#1e1e1e' : '#f8f9fa',
    texto: modoOscuro ? '#e0e0e0' : '#2c3e50',
    textoSecundario: modoOscuro ? '#aaaaaa' : '#666',
    tarjeta: modoOscuro ? '#2d2d2d' : 'white',
    borde: modoOscuro ? '#444' : '#ddd',
    inputFondo: modoOscuro ? '#333' : 'white',
    inputTexto: modoOscuro ? 'white' : 'black',
    tablaHeader: modoOscuro ? '#333' : '#e9ecef',
    bloqueLabel: modoOscuro ? '#252525' : '#f8f9fa'
  };

  useEffect(() => {
    async function getAsignaturas() {
      const { data } = await supabase.from('asignaturas').select('*').order('id')
      if (data) setCatalogoRamos(data)
    }
    getAsignaturas()
  }, [])

  useEffect(() => {
    if (usuario && catalogoRamos.length > 0) cargarHorarioGuardado();
  }, [usuario, catalogoRamos])

  const obtenerColor = (nombre) => {
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
    return PALETA[Math.abs(hash) % PALETA.length];
  };

  async function cargarHorarioGuardado() {
    const { data: datosGuardados } = await supabase.from('mis_horarios').select('*').eq('email', usuario)
    if (datosGuardados && datosGuardados.length > 0) {
      let creditosAcumulados = 0;
      const horarioReconstruido = datosGuardados.map(item => {
        const ramoCompleto = catalogoRamos.find(r => r.id === item.ramo_id);
        return { id_unico: item.id, ramo: ramoCompleto, dia: item.dia, bloque: item.bloque };
      }).filter(item => item.ramo);

      const ramosUnicos = [...new Set(horarioReconstruido.map(h => h.ramo.id))];
      ramosUnicos.forEach(id => {
        const r = catalogoRamos.find(cata => cata.id === id);
        if (r) creditosAcumulados += r.creditos;
      });
      setHorarioArmado(horarioReconstruido);
      setCreditosTotales(creditosAcumulados);
    }
  }

  async function handleLogin(e) {
    e.preventDefault(); 
    if (!emailInput) { setErrorLogin("Escribe tu correo."); return; }
    const correoLimpio = emailInput.trim().toLowerCase();
    const { data, error } = await supabase.from('lista_blanca').select('email, nombre').eq('email', correoLimpio).maybeSingle();

    if (error) { setErrorLogin("Error de conexión."); return; }
    if (!data) { setErrorLogin("⛔ Acceso denegado: No estás en la lista."); return; }

    setUsuario(correoLimpio);
    setNombreUsuario(data.nombre); 
    setErrorLogin("");
  }

  function toggleSeleccionRamo(ramo) {
    if (ramoSeleccionado?.id === ramo.id) setRamoSeleccionado(null)
    else setRamoSeleccionado(ramo)
  }

  async function colocarEnCelda(dia, bloque) {
    if (!ramoSeleccionado) return;
    const ramosEnEstaCelda = horarioArmado.filter(h => h.dia === dia && h.bloque === bloque);
    if (ramosEnEstaCelda.length >= 2) { alert("⚠️ Máximo 2 ramos."); return; }
    if (ramosEnEstaCelda.some(h => h.ramo.id === ramoSeleccionado.id)) return;
    
    // Validacion de creditos solo si es nuevo
    const yaEstaba = horarioArmado.some(h => h.ramo.id === ramoSeleccionado.id);
    if (!yaEstaba) {
        if (creditosTotales + ramoSeleccionado.creditos > 30) { alert("⚠️ Tope de 30 créditos."); return; }
        setCreditosTotales(creditosTotales + ramoSeleccionado.creditos);
    }

    const { data, error } = await supabase.from('mis_horarios').insert({ email: usuario, ramo_id: ramoSeleccionado.id, dia: dia, bloque: bloque }).select()
    if (error) { alert("Error guardando: " + error.message); return; }
    setHorarioArmado([...horarioArmado, { id_unico: data[0].id, ramo: ramoSeleccionado, dia, bloque }]);
  }

  async function quitarDeCelda(itemAQuitar) {
    const { error } = await supabase.from('mis_horarios').delete().eq('id', itemAQuitar.id_unico)
    if (error) return;
    const nuevoHorario = horarioArmado.filter(i => i.id_unico !== itemAQuitar.id_unico);
    setHorarioArmado(nuevoHorario);
    if (!nuevoHorario.some(i => i.ramo.id === itemAQuitar.ramo.id)) setCreditosTotales(creditosTotales - itemAQuitar.ramo.creditos);
  }

  async function limpiarTodo() {
    if(!window.confirm("¿Borrar todo?")) return;
    await supabase.from('mis_horarios').delete().eq('email', usuario)
    setHorarioArmado([]); setCreditosTotales(0);
  }

  function exportarExcel() {
    const datosTabla = BLOQUES.map(bloque => {
      const fila = { Horario: bloque };
      DIAS.forEach(dia => {
        const items = horarioArmado.filter(h => h.dia === dia && h.bloque === bloque);
        fila[dia] = items.map(i => i.ramo.nombre).join(' / ');
      });
      return fila;
    });
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(datosTabla);
    XLSX.utils.book_append_sheet(libro, hoja, "Horario");
    XLSX.writeFile(libro, `Horario_${nombreUsuario || usuario}.xlsx`);
  }

  // --- LA CÁMARA FANTASMA (TRUCO DE MAGIA) 📸 ---
  // --- LA CÁMARA FANTASMA (VERSIÓN BLINDADA 3.1) 📸 ---
  async function exportarImagen() {
    const original = document.getElementById('horario-screenshot');
    if (!original) return;

    // 1. CLONAR: Creamos una copia
    const clone = original.cloneNode(true);

    // 2. PREPARAR EL QUIRÓFANO (Estilos del contenedor clon)
    // Lo hacemos invisible pero ocupando espacio real
    clone.style.position = 'absolute';
    clone.style.top = '0'; // Lo pegamos arriba para evitar desfases
    clone.style.left = '-9999px'; // Lo sacamos de la vista
    clone.style.width = '1500px'; // ANCHO FORZADO DE ESCRITORIO
    clone.style.zIndex = '-1';
    clone.style.background = tema.tarjeta; // Fondo correcto
    clone.style.borderRadius = '0'; // Sin bordes redondos en la foto
    
    // 3. LA LOBOTOMÍA (Arreglar estilos internos que rompen la foto)
    
    // A) Quitar el 'position: sticky' de la cabecera (CAUSANTE DEL ERROR GRIS)
    const thead = clone.querySelector('thead');
    if (thead) {
        thead.style.position = 'static'; // Ya no es pegajoso
        thead.style.top = 'auto';
    }

    // B) Asegurar que la tabla ocupe todo el espacio
    const table = clone.querySelector('table');
    if (table) {
        table.style.width = '100%';
        table.style.tableLayout = 'fixed'; // Fuerza a las celdas a respetar el ancho
    }
    
    // C) Asegurar colores de texto (por si acaso)
    clone.style.color = tema.texto;

    document.body.appendChild(clone);

    // 4. TOMAR LA FOTO
    try {
        const canvas = await html2canvas(clone, { 
            scale: 2, // Alta calidad (Retina)
            width: 1500, // Ancho de la captura
            windowWidth: 1500, // Simulamos una pantalla de 1500px
            backgroundColor: tema.tarjeta, // Evita fondos negros/transparentes
            scrollY: 0, // Evita que el scroll actual afecte la foto
            x: 0,
            y: 0,
            useCORS: true // Ayuda con fuentes externas
        });

        // 5. DESCARGAR
        const link = document.createElement('a');
        link.download = `Horario_${nombreUsuario ? nombreUsuario.replace(/\s+/g, '_') : 'UCM'}.png`;
        link.href = canvas.toDataURL();
        link.click();
    } catch (err) {
        console.error("Error al tomar foto:", err);
        alert("Hubo un error al crear la imagen.");
    } finally {
        // 6. LIMPIEZA
        document.body.removeChild(clone);
    }
  }

  const ramosFiltrados = catalogoRamos.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || r.id.toLowerCase().includes(busqueda.toLowerCase()));

  // --- VISTA LOGIN ---
  if (!usuario) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: tema.fondo, fontFamily: 'Segoe UI', transition: 'background 0.3s', zIndex: 9999 }}>
        <button onClick={() => setModoOscuro(!modoOscuro)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: `1px solid ${tema.borde}`, fontSize: '1.5rem', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', color: tema.texto }}>{modoOscuro ? '☀️' : '🌙'}</button>
        <div style={{ background: tema.tarjeta, padding: '40px', borderRadius: '10px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '350px', maxWidth: '90%', textAlign: 'center', border: `1px solid ${tema.borde}` }}>
          <h1 style={{ color: tema.texto, marginBottom: '10px' }}>🎓 Acceso Estudiantes</h1>
          <p style={{ color: tema.textoSecundario, marginBottom: '30px' }}>Tu horario se guardará automáticamente.</p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Ingresa tu correo UCM..." value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '5px', border: `1px solid ${tema.borde}`, marginBottom: '15px', background: tema.inputFondo, color: tema.inputTexto }} />
            {errorLogin && <div style={{ color: '#dc3545', fontSize: '0.9rem', marginBottom: '15px', background: '#f8d7da', padding: '10px', borderRadius: '5px' }}>{errorLogin}</div>}
            <button type="submit" style={{ width: '100%', padding: '12px', background: '#0056b3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Ingresar</button>
          </form>
        </div>
      </div>
    )
  }

  // --- VISTA PLANIFICADOR (RESPONSIVE) ---
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: esMovil ? 'column' : 'row', // <--- CAMBIO CLAVE: Columna en movil, Fila en PC
      height: '100vh', width: '100vw', 
      maxWidth: 'none', position: 'fixed', top: 0, left: 0, margin: 0, padding: 0, 
      fontFamily: 'Segoe UI', color: tema.texto, backgroundColor: tema.fondo, transition: 'background 0.3s' 
    }}>
      
      {/* SIDEBAR / MENÚ SUPERIOR EN MÓVIL */}
      <div style={{ 
          width: esMovil ? '100%' : '300px', 
          height: esMovil ? (menuMovilAbierto ? '50vh' : 'auto') : '100%', // Se achica o agranda en movil
          padding: '20px', 
          background: tema.sidebar, 
          borderRight: esMovil ? 'none' : `1px solid ${tema.borde}`, 
          borderBottom: esMovil ? `1px solid ${tema.borde}` : 'none',
          display: 'flex', flexDirection: 'column', 
          zIndex: 10,
          transition: 'height 0.3s'
        }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: esMovil ? '1.2rem' : '1.5rem' }}>👋 Hola, {nombreUsuario ? nombreUsuario.replace('.', ' ').split(" ")[0] : "Estudiante"}</h2>
            <div style={{ fontSize: '0.8rem', color: tema.textoSecundario }}>
              <button onClick={() => {setUsuario(null); setNombreUsuario(null);}} style={{ border: 'none', background: 'transparent', color: 'red', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>(Salir)</button>
            </div>
          </div>
          
          {/* BOTÓN HAMBURGUESA SOLO EN MOVIL */}
          {esMovil && (
            <button onClick={() => setMenuMovilAbierto(!menuMovilAbierto)} style={{ background: 'transparent', border: `1px solid ${tema.borde}`, fontSize: '1.2rem', padding: '5px 10px', borderRadius: '5px', color: tema.texto }}>
              {menuMovilAbierto ? '▲' : '▼'} Catálogo
            </button>
          )}
        </div>

        {/* CONTENIDO DEL SIDEBAR (Se oculta en movil si está cerrado) */}
        <div style={{ display: (esMovil && !menuMovilAbierto) ? 'none' : 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <input type="text" placeholder="Buscar ramo..." onChange={(e) => setBusqueda(e.target.value)} style={{ padding: '10px', marginBottom: '15px', borderRadius: '4px', border: `1px solid ${tema.borde}`, width: '100%', background: tema.inputFondo, color: tema.inputTexto }} />
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ramosFiltrados.map((ramo) => (
              <div key={ramo.id} onClick={() => toggleSeleccionRamo(ramo)} style={{ padding: '10px', background: ramoSeleccionado?.id === ramo.id ? (modoOscuro ? '#0d47a1' : '#cce5ff') : tema.tarjeta, border: ramoSeleccionado?.id === ramo.id ? '2px solid #004085' : `1px solid ${tema.borde}`, borderRadius: '6px', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: ramoSeleccionado?.id === ramo.id ? 'white' : '#0056b3' }}>{ramo.id}</div>
                <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{ramo.nombre}</div>
                <div style={{ fontSize: '0.75rem', color: tema.textoSecundario }}>💎 {ramo.creditos} Créditos</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div style={{ flex: 1, padding: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* BARRA DE HERRAMIENTAS SUPERIOR */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '10px', borderBottom: `2px solid ${tema.borde}`, gap: '10px' }}>
          <h1 style={{ margin: 0, fontSize: esMovil ? '1.2rem' : '1.5rem' }}>📅</h1>
          
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
             <div style={{ padding: '5px 10px', background: creditosTotales > 30 ? '#dc3545' : '#28a745', color: 'white', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.8rem' }}>{creditosTotales}/30</div>
             <button onClick={() => setModoOscuro(!modoOscuro)} style={{ background: 'transparent', border: `1px solid ${tema.borde}`, fontSize: '1rem', padding: '5px', borderRadius: '6px', cursor: 'pointer', color: tema.texto }}>{modoOscuro ? '☀️' : '🌙'}</button>
             <button onClick={limpiarTodo} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>🗑️</button>
             {/* En movil ocultamos Excel para ahorrar espacio, priorizamos Foto */}
             {!esMovil && <button onClick={exportarExcel} style={{ background: '#217346', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>Excel</button>}
             <button onClick={exportarImagen} style={{ background: '#7b1fa2', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>📷 Foto</button>
          </div>
        </div>

        {/* CONTENEDOR DE LA TABLA (SCROLL) */}
        <div style={{ flex: 1, overflow: 'auto', background: tema.tarjeta, borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', position: 'relative' }}>
            
          {/* DIV ESPECÍFICO PARA LA FOTO (Referencia ID) */}
          <div id="horario-screenshot" style={{ minWidth: '800px', padding: '10px', background: tema.tarjeta }}> 
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                <tr>
                  <th style={{ background: tema.tablaHeader, padding: '12px', border: `1px solid ${tema.borde}`, color: tema.texto, minWidth: '80px' }}>Bloque</th>
                  {DIAS.map(d => <th key={d} style={{ background: tema.tablaHeader, padding: '12px', border: `1px solid ${tema.borde}`, width: '14%', color: tema.texto, minWidth: '100px' }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {BLOQUES.map((bloque) => (
                  <tr key={bloque}>
                    <td style={{ padding: '8px', border: `1px solid ${tema.borde}`, fontWeight: 'bold', textAlign: 'center', background: tema.bloqueLabel, color: tema.texto }}>{bloque}</td>
                    {DIAS.map(dia => {
                      const items = horarioArmado.filter(h => h.dia === dia && h.bloque === bloque);
                      return (
                        <td key={dia} onClick={() => colocarEnCelda(dia, bloque)} style={{ border: `1px solid ${tema.borde}`, height: '85px', verticalAlign: 'top', padding: '4px', cursor: ramoSeleccionado ? 'cell' : 'default', background: items.length > 0 ? tema.tarjeta : 'transparent' }}>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', height: '100%' }}>
                            {items.map(item => (
                              <div key={item.id_unico} style={{ background: obtenerColor(item.ramo.nombre), padding: '4px 6px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                <div style={{ overflow: 'hidden' }}>
                                  <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#444' }}>{item.ramo.id}</div>
                                  <div style={{ fontSize: '0.75rem', lineHeight: '1.1', color: '#222' }}>{item.ramo.nombre}</div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); quitarDeCelda(item); }} style={{ background: 'transparent', border: 'none', color: '#444', fontWeight: 'bold', cursor: 'pointer', fontSize: '1.1rem', lineHeight: '0.5', padding: '0 0 0 4px' }}>×</button>
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
    </div>
  )
}

export default App