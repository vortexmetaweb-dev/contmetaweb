import type {
  Cfdi,
  Concepto,
  ImpuestoDetalle,
  Pago,
  Timbre,
  Tributos,
} from "./tipos";

// El CFDI se lee en el navegador con DOMParser (Node no lo expone) y el servidor
// revalida el resultado antes de guardarlo. Ver ESPECIFICACIONES.md, sección 3.5.
export function parsearCfdi(xml: string): Cfdi {
  const documento = new DOMParser().parseFromString(xml, "application/xml");

  if (documento.getElementsByTagName("parsererror").length > 0) {
    throw new Error("El archivo no es un XML válido.");
  }

  const comprobante = documento.documentElement;
  if (!comprobante || comprobante.localName !== "Comprobante") {
    throw new Error("El XML no corresponde a un CFDI.");
  }

  const emisor = hijo(comprobante, "Emisor");
  const receptor = hijo(comprobante, "Receptor");

  return {
    version: atributo(comprobante, "Version"),
    serie: atributo(comprobante, "Serie"),
    folio: atributo(comprobante, "Folio"),
    fecha: atributo(comprobante, "Fecha"),
    formaPago: atributo(comprobante, "FormaPago"),
    metodoPago: atributo(comprobante, "MetodoPago"),
    moneda: atributo(comprobante, "Moneda"),
    tipoCambio: atributo(comprobante, "TipoCambio"),
    lugarExpedicion: atributo(comprobante, "LugarExpedicion"),
    tipoDeComprobante: atributo(comprobante, "TipoDeComprobante"),
    exportacion: atributo(comprobante, "Exportacion"),
    condicionesDePago: atributo(comprobante, "CondicionesDePago"),
    subtotal: atributo(comprobante, "SubTotal"),
    descuento: atributo(comprobante, "Descuento"),
    total: atributo(comprobante, "Total"),
    emisor: {
      rfc: atributo(emisor, "Rfc"),
      nombre: atributo(emisor, "Nombre"),
      regimenFiscal: atributo(emisor, "RegimenFiscal"),
    },
    receptor: {
      rfc: atributo(receptor, "Rfc"),
      nombre: atributo(receptor, "Nombre"),
      domicilioFiscal: atributo(receptor, "DomicilioFiscalReceptor"),
      regimenFiscal: atributo(receptor, "RegimenFiscalReceptor"),
      usoCfdi: atributo(receptor, "UsoCFDI"),
    },
    conceptos: leerConceptos(comprobante),
    impuestos: leerTributos(hijo(comprobante, "Impuestos")),
    timbre: leerTimbre(documento),
    pagos: leerPagos(documento),
  };
}

function leerConceptos(comprobante: Element): Concepto[] {
  return hijos(hijo(comprobante, "Conceptos"), "Concepto").map((nodo) => {
    const impuestos = hijo(nodo, "Impuestos");

    return {
      claveProdServ: atributo(nodo, "ClaveProdServ"),
      noIdentificacion: atributo(nodo, "NoIdentificacion"),
      cantidad: atributo(nodo, "Cantidad"),
      claveUnidad: atributo(nodo, "ClaveUnidad"),
      unidad: atributo(nodo, "Unidad"),
      descripcion: atributo(nodo, "Descripcion"),
      valorUnitario: atributo(nodo, "ValorUnitario"),
      importe: atributo(nodo, "Importe"),
      descuento: atributo(nodo, "Descuento"),
      objetoImp: atributo(nodo, "ObjetoImp"),
      traslados: leerDetalle(impuestos, "Traslados", "Traslado"),
      retenciones: leerDetalle(impuestos, "Retenciones", "Retencion"),
    };
  });
}

function leerTributos(impuestos: Element | null): Tributos {
  return {
    totalTrasladados: atributo(impuestos, "TotalImpuestosTrasladados"),
    totalRetenidos: atributo(impuestos, "TotalImpuestosRetenidos"),
    traslados: leerDetalle(impuestos, "Traslados", "Traslado"),
    retenciones: leerDetalle(impuestos, "Retenciones", "Retencion"),
  };
}

function leerDetalle(
  impuestos: Element | null,
  grupo: string,
  nodo: string,
): ImpuestoDetalle[] {
  return hijos(hijo(impuestos, grupo), nodo).map((detalle) => ({
    base: atributo(detalle, "Base"),
    impuesto: atributo(detalle, "Impuesto"),
    tipoFactor: atributo(detalle, "TipoFactor"),
    // La versión 3.3 y anteriores usan Tasa en lugar de TasaOCuota.
    tasaOCuota: atributo(detalle, "TasaOCuota") || atributo(detalle, "Tasa"),
    importe: atributo(detalle, "Importe"),
  }));
}

function leerTimbre(documento: Document): Timbre | null {
  const nodo = documento.getElementsByTagNameNS("*", "TimbreFiscalDigital")[0];
  if (!nodo) return null;

  return {
    version: atributo(nodo, "Version"),
    uuid: atributo(nodo, "UUID"),
    fechaTimbrado: atributo(nodo, "FechaTimbrado"),
    rfcProvCertif: atributo(nodo, "RfcProvCertif"),
    noCertificadoSat: atributo(nodo, "NoCertificadoSAT"),
    selloCfd: atributo(nodo, "SelloCFD"),
    selloSat: atributo(nodo, "SelloSAT"),
  };
}

function leerPagos(documento: Document): Pago[] {
  const pagos = documento.getElementsByTagNameNS("*", "Pagos")[0];
  if (!pagos) return [];

  return hijos(pagos, "Pago").map((pago) => ({
    fechaPago: atributo(pago, "FechaPago"),
    formaDePagoP: atributo(pago, "FormaDePagoP"),
    monedaP: atributo(pago, "MonedaP"),
    monto: atributo(pago, "Monto"),
    tipoCambioP: atributo(pago, "TipoCambioP"),
    numOperacion: atributo(pago, "NumOperacion"),
    doctos: hijos(pago, "DoctoRelacionado").map((docto) => ({
      idDocumento: atributo(docto, "IdDocumento"),
      numParcialidad: atributo(docto, "NumParcialidad"),
      impSaldoAnt: atributo(docto, "ImpSaldoAnt"),
      impPagado: atributo(docto, "ImpPagado"),
      impSaldoInsoluto: atributo(docto, "ImpSaldoInsoluto"),
      objetoImpDr: atributo(docto, "ObjetoImpDR"),
      monedaDr: atributo(docto, "MonedaDR"),
      tipoCambioDr: atributo(docto, "TipoCambioDR"),
      metodoDePagoDr: atributo(docto, "MetodoDePagoDR"),
    })),
  }));
}

function hijos(elemento: Element | null, nombre: string): Element[] {
  if (!elemento) return [];
  return Array.from(elemento.children).filter((nodo) => nodo.localName === nombre);
}

function hijo(elemento: Element | null, nombre: string): Element | null {
  return hijos(elemento, nombre)[0] ?? null;
}

function atributo(elemento: Element | null, nombre: string): string {
  return elemento?.getAttribute(nombre)?.trim() ?? "";
}
