import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabase'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

// --- CONFIGURACIÓN ---
const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const BLOQUES = [
  '08:30 - 09:30', '09:35 - 10:35', '10:55 - 11:50', 
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
  const [esMovil, setEsMovil] = useState(window.innerWidth < 768); 
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false); 
  
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

  // Referencia para la cámara
  const tablaRef = useRef(null);

  // --- DETECTOR DE TAMAÑO ---
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

  // --- LA CÁMARA FANTASMA (VERSIÓN BLINDADA 3.1) 📸 ---
  async function exportarImagen() {
    const original = document.getElementById('horario-screenshot');
    if (!original) return;

    // 1. CLONAR
    const clone = original.cloneNode(true);

    // 2. PREPARAR ESTILOS
    clone.style.position = 'absolute';
    clone.style.top = '0'; 
    clone.style.left = '-9999px'; 
    clone.style.width = '1500px'; 
    clone.style.zIndex = '-1';
    clone.style.background = tema.tarjeta; 
    clone.style.borderRadius = '0'; 
    
    // 3. ARREGLAR CSS INTERNO
    const thead = clone.querySelector('thead');
    if (thead) {
        thead.style.position = 'static'; // FIX: Quitar sticky
        thead.style.top = 'auto';
    }
    const table = clone.querySelector('table');
    if (table) {
        table.style.width = '100%';
        table.style.tableLayout = 'fixed';
    }
    clone.style.color = tema.texto;

    document.body.appendChild(clone);

    // 4. FOTO
    try {
        const canvas = await html2canvas(clone, { 
            scale: 2, 
            width: 1500, 
            windowWidth: 1500, 
            backgroundColor: tema.tarjeta, 
            scrollY: 0, 
            x: 0,
            y: 0,
            useCORS: true
        });

        const link = document.createElement('a');
        link.download = `Horario_${nombreUsuario ? nombreUsuario.replace(/\s+/g, '_') : 'UCM'}.png`;
        link.href = canvas.toDataURL();
        link.click();
    } catch (err) {
        console.error("Error al tomar foto:", err);
        alert("Hubo un error al crear la imagen.");
    } finally {
        document.body.removeChild(clone);
    }
  }

  const ramosFiltrados = catalogoRamos.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()) || r.id.toLowerCase().includes(busqueda.toLowerCase()));

  // --- VISTA LOGIN ---
  if (!usuario) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: tema.fondo, fontFamily: 'Segoe UI', transition: 'background 0.3s', zIndex: 9999 }}>
        <button onClick={() => setModoOscuro(!modoOscuro)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: `1px solid ${tema.borde}`, fontSize: '1.5rem', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', color: tema.texto }}>{modoOscuro ? '☀️' : '🌙'}</button>
        <div style={{ background: tema.tarjeta, padding: '40px', borderRadius: '10px', boxShadow: '0 4px 15px rgba(0,0,0