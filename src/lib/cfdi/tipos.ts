// Datos de un CFDI (SAT, México), versión 4.0 y anteriores.
// Los importes y las fechas se conservan como texto para no perder precisión:
// se convierten a número solo al persistir en la base de datos.

export type ImpuestoDetalle = {
  base: string;
  impuesto: string;
  tipoFactor: string;
  tasaOCuota: string;
  importe: string;
};

export type Concepto = {
  claveProdServ: string;
  noIdentificacion: string;
  cantidad: string;
  claveUnidad: string;
  unidad: string;
  descripcion: string;
  valorUnitario: string;
  importe: string;
  descuento: string;
  objetoImp: string;
  traslados: ImpuestoDetalle[];
  retenciones: ImpuestoDetalle[];
};

export type Emisor = {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
};

export type Receptor = {
  rfc: string;
  nombre: string;
  domicilioFiscal: string;
  regimenFiscal: string;
  usoCfdi: string;
};

export type Tributos = {
  totalTrasladados: string;
  totalRetenidos: string;
  traslados: ImpuestoDetalle[];
  retenciones: ImpuestoDetalle[];
};

// Documentos que paga un complemento de pago (CFDI tipo P). Cada uno referencia
// una factura por su UUID (IdDocumento).
export type DoctoRelacionado = {
  idDocumento: string;
  numParcialidad: string;
  impSaldoAnt: string;
  impPagado: string;
  impSaldoInsoluto: string;
  objetoImpDr: string;
  monedaDr: string;
  tipoCambioDr: string;
  metodoDePagoDr: string;
};

export type Pago = {
  fechaPago: string;
  formaDePagoP: string;
  monedaP: string;
  monto: string;
  tipoCambioP: string;
  numOperacion: string;
  doctos: DoctoRelacionado[];
};

export type Timbre = {
  version: string;
  uuid: string;
  fechaTimbrado: string;
  rfcProvCertif: string;
  noCertificadoSat: string;
  selloCfd: string;
  selloSat: string;
};

export type Cfdi = {
  version: string;
  serie: string;
  folio: string;
  fecha: string;
  formaPago: string;
  metodoPago: string;
  moneda: string;
  tipoCambio: string;
  lugarExpedicion: string;
  tipoDeComprobante: string;
  exportacion: string;
  condicionesDePago: string;
  subtotal: string;
  descuento: string;
  total: string;
  emisor: Emisor;
  receptor: Receptor;
  conceptos: Concepto[];
  impuestos: Tributos;
  timbre: Timbre | null;
  // Vacío en comprobantes que no son complementos de pago (tipo distinto de P).
  pagos: Pago[];
};
