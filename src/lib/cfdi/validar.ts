import type {
  Cfdi,
  Concepto,
  DoctoRelacionado,
  Emisor,
  ImpuestoDetalle,
  Pago,
  Receptor,
  Timbre,
  Tributos,
} from "./tipos";

// Validación en el servidor del CFDI que llega desde el navegador. El cliente ya
// leyó el XML, pero nada de lo que envía se usa sin revalidar y reconstruir aquí
// (ESPECIFICACIONES.md, secciones 3.5 y 3.6).

export const MAX_XML = 1024 * 1024;
export const MAX_PDF = 5 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_CONCEPTOS = 2000;
const MAX_IMPUESTOS = 500;
const MAX_PAGOS = 500;
const MAX_DOCTOS = 500;

const RFC = /^([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}|XAXX010101000|XEXX010101000)$/;
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/;
const MONEDA = /^[A-Z]{3}$/;
const TIPOS = ["I", "E", "T", "N", "P"];

export type CfdiValidado =
  | { ok: true; xml: string; pdf: string | null; datos: Cfdi }
  | { ok: false; mensaje: string };

class CfdiInvalido extends Error {}

export function validarCfdi(entrada: unknown): CfdiValidado {
  if (!esObjeto(entrada)) {
    return { ok: false, mensaje: "No se recibieron datos del CFDI." };
  }

  if (typeof entrada.xml !== "string" || !entrada.xml.trim()) {
    return { ok: false, mensaje: "Falta el archivo XML del CFDI." };
  }

  const xml = entrada.xml.trim();

  if (xml.length > MAX_XML) {
    return { ok: false, mensaje: "El XML del CFDI supera el tamaño máximo de 1 MB." };
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return { ok: false, mensaje: "El XML contiene declaraciones no permitidas." };
  }
  if (!/<([A-Za-z]\w*:)?Comprobante[\s>]/.test(xml)) {
    return { ok: false, mensaje: "El XML no corresponde a un CFDI." };
  }

  let pdf: string | null = null;
  if (entrada.pdf !== undefined && entrada.pdf !== null) {
    if (typeof entrada.pdf !== "string") {
      return { ok: false, mensaje: "El archivo PDF no es válido." };
    }
    const limpioPdf = entrada.pdf.trim();
    if (!limpioPdf) {
      return { ok: false, mensaje: "El archivo PDF está vacío." };
    }
    // El PDF se recibe como base64. Verificamos que empiece con la firma PDF.
    const bytes = base64ABytes(limpioPdf).slice(0, 5);
    const firma = String.fromCharCode(...bytes);
    if (firma !== "%PDF-") {
      return { ok: false, mensaje: "El archivo no es un PDF válido." };
    }
    // El tamaño en bytes del base64 es aproximadamente 3/4 del largo.
    if ((limpioPdf.length * 3) / 4 > MAX_PDF) {
      return { ok: false, mensaje: "El PDF supera el tamaño máximo de 5 MB." };
    }
    pdf = limpioPdf;
  }

  if (!esObjeto(entrada.datos)) {
    return { ok: false, mensaje: "No se pudieron leer los datos del CFDI." };
  }
  if (JSON.stringify(entrada.datos).length > MAX_JSON) {
    return { ok: false, mensaje: "El contenido del CFDI es demasiado extenso." };
  }

  try {
    return { ok: true, xml, pdf, datos: limpiar(entrada.datos) };
  } catch (error) {
    return {
      ok: false,
      mensaje:
        error instanceof CfdiInvalido
          ? error.message
          : "El CFDI no tiene los datos obligatorios.",
    };
  }
}

export function numeroOpcional(valor: string): number | null {
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function limpiar(entrada: Record<string, unknown>): Cfdi {
  const version = requerido(texto(entrada.version, 10), "El CFDI no indica su versión.");

  const tipoDeComprobante = texto(entrada.tipoDeComprobante, 1).toUpperCase();
  if (!TIPOS.includes(tipoDeComprobante)) {
    throw new CfdiInvalido("El tipo de comprobante del CFDI no es válido.");
  }

  const fecha = requerido(texto(entrada.fecha, 19), "El CFDI no indica la fecha de emisión.");
  if (!FECHA.test(fecha)) {
    throw new CfdiInvalido("La fecha de emisión del CFDI no es válida.");
  }

  const moneda = texto(entrada.moneda, 3).toUpperCase();
  if (!MONEDA.test(moneda)) {
    throw new CfdiInvalido("La moneda del CFDI no es válida.");
  }

  return {
    version,
    serie: texto(entrada.serie, 25),
    folio: texto(entrada.folio, 40),
    fecha,
    formaPago: texto(entrada.formaPago, 2),
    metodoPago: texto(entrada.metodoPago, 3),
    moneda,
    tipoCambio: importe(entrada.tipoCambio, "El tipo de cambio no es un número válido."),
    lugarExpedicion: texto(entrada.lugarExpedicion, 5),
    tipoDeComprobante,
    exportacion: texto(entrada.exportacion, 2),
    condicionesDePago: texto(entrada.condicionesDePago, 1000),
    subtotal: requerido(
      importe(entrada.subtotal, "El subtotal del CFDI no es un número válido."),
      "El CFDI no indica el subtotal.",
    ),
    descuento: importe(entrada.descuento, "El descuento del CFDI no es un número válido."),
    total: requerido(
      importe(entrada.total, "El total del CFDI no es un número válido."),
      "El CFDI no indica el total.",
    ),
    emisor: limpiarEmisor(entrada.emisor),
    receptor: limpiarReceptor(entrada.receptor),
    conceptos: limpiarConceptos(entrada.conceptos),
    impuestos: limpiarTributos(entrada.impuestos),
    timbre: limpiarTimbre(entrada.timbre),
    pagos: limpiarPagos(entrada.pagos),
  };
}

function limpiarEmisor(valor: unknown): Emisor {
  if (!esObjeto(valor)) {
    throw new CfdiInvalido("El CFDI no incluye los datos del emisor.");
  }

  return {
    rfc: rfc(valor.rfc, "El RFC del emisor no es válido."),
    nombre: requerido(texto(valor.nombre, 300), "El CFDI no incluye el nombre del emisor."),
    regimenFiscal: texto(valor.regimenFiscal, 3),
  };
}

function limpiarReceptor(valor: unknown): Receptor {
  if (!esObjeto(valor)) {
    throw new CfdiInvalido("El CFDI no incluye los datos del receptor.");
  }

  return {
    rfc: rfc(valor.rfc, "El RFC del receptor no es válido."),
    nombre: requerido(texto(valor.nombre, 300), "El CFDI no incluye el nombre del receptor."),
    domicilioFiscal: texto(valor.domicilioFiscal, 5),
    regimenFiscal: texto(valor.regimenFiscal, 3),
    usoCfdi: texto(valor.usoCfdi, 5),
  };
}

function limpiarConceptos(valor: unknown): Concepto[] {
  if (!Array.isArray(valor)) return [];

  return valor.slice(0, MAX_CONCEPTOS).map((bruto) => {
    if (!esObjeto(bruto)) {
      throw new CfdiInvalido("Un concepto del CFDI no tiene datos válidos.");
    }

    return {
      claveProdServ: texto(bruto.claveProdServ, 8),
      noIdentificacion: texto(bruto.noIdentificacion, 100),
      cantidad: importe(bruto.cantidad, "La cantidad de un concepto no es un número válido."),
      claveUnidad: texto(bruto.claveUnidad, 3),
      unidad: texto(bruto.unidad, 100),
      descripcion: requerido(
        texto(bruto.descripcion, 1000),
        "Un concepto del CFDI no tiene descripción.",
      ),
      valorUnitario: importe(
        bruto.valorUnitario,
        "El valor unitario de un concepto no es un número válido.",
      ),
      importe: importe(bruto.importe, "El importe de un concepto no es un número válido."),
      descuento: importe(bruto.descuento, "El descuento de un concepto no es un número válido."),
      objetoImp: texto(bruto.objetoImp, 2),
      traslados: limpiarDetalle(bruto.traslados),
      retenciones: limpiarDetalle(bruto.retenciones),
    };
  });
}

function limpiarDetalle(valor: unknown): ImpuestoDetalle[] {
  if (!Array.isArray(valor)) return [];

  return valor.slice(0, MAX_IMPUESTOS).map((bruto) => {
    if (!esObjeto(bruto)) {
      throw new CfdiInvalido("Los impuestos del CFDI no tienen datos válidos.");
    }

    return {
      base: importe(bruto.base, "La base de un impuesto no es un número válido."),
      impuesto: texto(bruto.impuesto, 3),
      tipoFactor: texto(bruto.tipoFactor, 10),
      // Con tipo de factor Exento la tasa llega como texto, no como número.
      tasaOCuota: texto(bruto.tasaOCuota, 20),
      importe: importe(bruto.importe, "El importe de un impuesto no es un número válido."),
    };
  });
}

function limpiarTributos(valor: unknown): Tributos {
  if (!esObjeto(valor)) {
    return { totalTrasladados: "", totalRetenidos: "", traslados: [], retenciones: [] };
  }

  return {
    totalTrasladados: importe(
      valor.totalTrasladados,
      "El total de impuestos trasladados no es un número válido.",
    ),
    totalRetenidos: importe(
      valor.totalRetenidos,
      "El total de impuestos retenidos no es un número válido.",
    ),
    traslados: limpiarDetalle(valor.traslados),
    retenciones: limpiarDetalle(valor.retenciones),
  };
}

function limpiarTimbre(valor: unknown): Timbre | null {
  if (!esObjeto(valor)) return null;

  const uuid = texto(valor.uuid, 36).toUpperCase();
  if (!uuid) return null;
  if (!UUID.test(uuid)) {
    throw new CfdiInvalido("El UUID del timbre fiscal no es válido.");
  }

  const fechaTimbrado = texto(valor.fechaTimbrado, 19);

  return {
    version: texto(valor.version, 10),
    uuid,
    fechaTimbrado: FECHA.test(fechaTimbrado) ? fechaTimbrado : "",
    rfcProvCertif: texto(valor.rfcProvCertif, 13),
    noCertificadoSat: texto(valor.noCertificadoSat, 20),
    selloCfd: texto(valor.selloCfd, 2000),
    selloSat: texto(valor.selloSat, 2000),
  };
}

function limpiarPagos(valor: unknown): Pago[] {
  if (!Array.isArray(valor)) return [];

  return valor.slice(0, MAX_PAGOS).map((bruto) => {
    if (!esObjeto(bruto)) {
      throw new CfdiInvalido("Un pago del complemento no tiene datos válidos.");
    }

    return {
      fechaPago: texto(bruto.fechaPago, 19),
      formaDePagoP: texto(bruto.formaDePagoP, 2),
      monedaP: texto(bruto.monedaP, 3),
      monto: importe(bruto.monto, "El monto de un pago no es un número válido."),
      tipoCambioP: importe(bruto.tipoCambioP, "El tipo de cambio del pago no es un número válido."),
      numOperacion: texto(bruto.numOperacion, 100),
      doctos: limpiarDoctos(bruto.doctos),
    };
  });
}

function limpiarDoctos(valor: unknown): DoctoRelacionado[] {
  if (!Array.isArray(valor)) return [];

  return valor.slice(0, MAX_DOCTOS).map((bruto) => {
    if (!esObjeto(bruto)) {
      throw new CfdiInvalido("Un documento relacionado no tiene datos válidos.");
    }

    return {
      // Se normaliza a mayúsculas para poder cruzar con el UUID de la factura.
      idDocumento: texto(bruto.idDocumento, 36).toUpperCase(),
      numParcialidad: texto(bruto.numParcialidad, 5),
      impSaldoAnt: importe(bruto.impSaldoAnt, "El saldo anterior no es un número válido."),
      impPagado: importe(bruto.impPagado, "El importe pagado no es un número válido."),
      impSaldoInsoluto: importe(
        bruto.impSaldoInsoluto,
        "El saldo insoluto no es un número válido.",
      ),
      objetoImpDr: texto(bruto.objetoImpDr, 2),
      monedaDr: texto(bruto.monedaDr, 3),
      tipoCambioDr: importe(
        bruto.tipoCambioDr,
        "El tipo de cambio del documento no es un número válido.",
      ),
      metodoDePagoDr: texto(bruto.metodoDePagoDr, 3),
    };
  });
}

function rfc(valor: unknown, mensaje: string): string {
  const limpio = texto(valor, 50).toUpperCase().replace(/\s/g, "");
  if (limpio.length > 13 || !RFC.test(limpio)) {
    throw new CfdiInvalido(mensaje);
  }
  return limpio;
}

function requerido(valor: string, mensaje: string): string {
  if (!valor) throw new CfdiInvalido(mensaje);
  return valor;
}

function texto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function importe(valor: unknown, mensaje: string): string {
  const limpio = texto(valor, 32);
  if (!limpio) return "";
  if (!Number.isFinite(Number(limpio))) {
    throw new CfdiInvalido(mensaje);
  }
  return limpio;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

// Convierte una cadena base64 a un arreglo de bytes. Se usa para verificar la
// firma del PDF sin cargar todo el archivo en memoria.
function base64ABytes(base64: string): number[] {
  const binario = atob(base64);
  const bytes: number[] = [];
  const limite = Math.min(binario.length, 5);
  for (let i = 0; i < limite; i++) {
    bytes.push(binario.charCodeAt(i));
  }
  return bytes;
}
