import { duracion, formatoFecha } from '../utilidades/formato.js'

const COLOR_PRINCIPAL = 'FF1D5C63'
const COLOR_CABECERA_TEXTO = 'FFFFFFFF'
const COLOR_ZEBRA = 'FFF3F7F7'
const COLOR_BORDE = 'FFD5DEDF'

const COLOR_OBSERVACION = {
  puntual: 'FF1E7B4A',
  retardo: 'FFB4531A',
  anticipada: 'FFB4531A',
  extra: 'FF1F5FA8',
  fuera: 'FF6B7478',
}

const COLUMNAS = [
  { titulo: 'Fecha', ancho: 14 },
  { titulo: 'Código', ancho: 12 },
  { titulo: 'Colaborador', ancho: 28 },
  { titulo: 'Tipo', ancho: 11 },
  { titulo: 'Hora', ancho: 10 },
  { titulo: 'Origen', ancho: 14 },
  { titulo: 'Confianza', ancho: 14 },
  { titulo: 'Observación', ancho: 58 },
  { titulo: 'Prueba', ancho: 11 },
]

const BORDE = {
  top: { style: 'thin', color: { argb: COLOR_BORDE } },
  left: { style: 'thin', color: { argb: COLOR_BORDE } },
  bottom: { style: 'thin', color: { argb: COLOR_BORDE } },
  right: { style: 'thin', color: { argb: COLOR_BORDE } },
}

function fuente(estilo = {}) {
  return { name: 'Calibri', size: 11, ...estilo }
}

function relleno(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function fechaExcel(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

function capital(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function escribirEncabezado(hoja, desde, hasta, nombreColaborador) {
  const ultima = COLUMNAS.length
  const filas = [
    ['Centro de Salud de Guazacapán', { bold: true, size: 15, color: { argb: COLOR_PRINCIPAL } }],
    ['Reporte de marcaciones de asistencia', { bold: true, size: 12 }],
    [`Período: ${formatoFecha(desde)} al ${formatoFecha(hasta)}    Colaborador: ${nombreColaborador}`, { size: 10, color: { argb: 'FF555F63' } }],
    [`Generado: ${new Date().toLocaleString('es-GT')}`, { size: 10, color: { argb: 'FF555F63' } }],
  ]
  filas.forEach(([texto, estilo], i) => {
    hoja.mergeCells(i + 1, 1, i + 1, ultima)
    const celda = hoja.getCell(i + 1, 1)
    celda.value = texto
    celda.font = fuente(estilo)
  })
}

function escribirTotales(hoja, fila, totales) {
  const bloques = [
    ['Marcaciones', totales.marcaciones],
    ['Retardos', totales.retardos],
    ['Manuales', totales.manuales],
    ['Tiempo extra', duracion(totales.extra)],
  ]
  bloques.forEach(([titulo, valor], i) => {
    const columna = i * 2 + 1
    const etiqueta = hoja.getCell(fila, columna)
    const dato = hoja.getCell(fila + 1, columna)
    hoja.mergeCells(fila, columna, fila, columna + 1)
    hoja.mergeCells(fila + 1, columna, fila + 1, columna + 1)
    etiqueta.value = titulo
    etiqueta.font = fuente({ size: 9, color: { argb: 'FF555F63' } })
    dato.value = valor
    dato.font = fuente({ bold: true, size: 13, color: { argb: COLOR_PRINCIPAL } })
    dato.alignment = { horizontal: 'left' }
    for (const c of [etiqueta, dato]) c.fill = relleno(COLOR_ZEBRA)
  })
}

export async function descargarExcel({ filas, desde, hasta, nombreColaborador, totales, categoria }) {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Sistema de control biométrico'
  libro.created = new Date()

  const hoja = libro.addWorksheet('Marcaciones', {
    pageSetup: { orientation: 'landscape', paperSize: 1, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  hoja.columns = COLUMNAS.map((c) => ({ width: c.ancho }))

  escribirEncabezado(hoja, desde, hasta, nombreColaborador)
  escribirTotales(hoja, 6, totales)

  const filaCabecera = 9
  const cabecera = hoja.getRow(filaCabecera)
  cabecera.values = COLUMNAS.map((c) => c.titulo)
  cabecera.height = 22
  cabecera.eachCell((celda) => {
    celda.font = fuente({ bold: true, color: { argb: COLOR_CABECERA_TEXTO } })
    celda.fill = relleno(COLOR_PRINCIPAL)
    celda.alignment = { vertical: 'middle', horizontal: 'center' }
    celda.border = BORDE
  })

  filas.forEach((m, i) => {
    const fila = hoja.getRow(filaCabecera + 1 + i)
    fila.values = [
      fechaExcel(m.fecha),
      m.codigo,
      m.nombre,
      capital(m.tipo),
      m.hora.slice(0, 5),
      m.origen_biometrico ? 'Biométrico' : 'Manual',
      m.umbral_confianza != null ? Number(m.umbral_confianza) : '',
      m.observacion_horario,
      m.es_prueba ? 'Sí' : 'No',
    ]
    fila.eachCell({ includeEmpty: true }, (celda, columna) => {
      celda.border = BORDE
      celda.font = fuente()
      celda.alignment = { vertical: 'middle', horizontal: [3, 8].includes(columna) ? 'left' : 'center', wrapText: columna === 8 }
      if (i % 2 === 1) celda.fill = relleno(COLOR_ZEBRA)
    })
    fila.getCell(1).numFmt = 'dd/mm/yyyy'
    fila.getCell(7).numFmt = '0.0%'
    fila.getCell(8).font = fuente({ color: { argb: COLOR_OBSERVACION[categoria(m)] } })
  })

  const ultimaFila = filaCabecera + Math.max(filas.length, 1)
  hoja.autoFilter = { from: { row: filaCabecera, column: 1 }, to: { row: ultimaFila, column: COLUMNAS.length } }
  hoja.views = [{ state: 'frozen', ySplit: filaCabecera }]
  hoja.pageSetup.printTitlesRow = `${filaCabecera}:${filaCabecera}`

  const contenido = await libro.xlsx.writeBuffer()
  const archivo = new Blob([contenido], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(archivo)
  enlace.download = `marcaciones_${desde}_a_${hasta}.xlsx`
  enlace.click()
  URL.revokeObjectURL(enlace.href)
}