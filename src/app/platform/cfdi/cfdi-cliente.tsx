"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2Icon,
  FileDownIcon,
  FileIcon,
  FileTextIcon,
  FileUpIcon,
  ReceiptTextIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { sileo } from "sileo";
import JSZip from "jszip";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parsearCfdi } from "@/lib/cfdi/parsear";
import type { Cfdi, ImpuestoDetalle } from "@/lib/cfdi/tipos";

import { guardarCfdi } from "./actions";

export type CfdiGuardado = {
  id: string;
  uuid_fiscal: string | null;
  serie: string | null;
  folio: string | null;
  fecha: string | null;
  tipo_comprobante: string | null;
  moneda: string | null;
  total: number | null;
  emisor_nombre: string | null;
  receptor_nombre: string | null;
  creado_en: string;
  xml: string;
  pdf: string | null;
  relacionado_id: string | null;
};

const MAX_XML = 1024 * 1024;
const MAX_PDF = 5 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  I: "Ingreso",
  E: "Egreso",
  T: "Traslado",
  N: "Nómina",
  P: "Pago",
};

function SubidaArchivo({
  id,
  etiqueta,
  accept,
  inputRef,
  nombre,
  alSeleccionar,
  alLimpiar,
  descripcion,
  opcional,
  deshabilitado,
  preview,
}: {
  id: string;
  etiqueta: string;
  accept: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  nombre: string | null;
  alSeleccionar: (archivo: File) => void;
  alLimpiar: () => void;
  descripcion: string;
  opcional?: boolean;
  deshabilitado?: boolean;
  preview?: React.ReactNode;
}) {
  const [sobre, setSobre] = useState(false);

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{etiqueta}</FieldLabel>
        {opcional ? (
          <span className="text-xs font-normal text-muted-foreground">Opcional</span>
        ) : null}
      </div>

      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={deshabilitado}
        className="sr-only"
        onChange={(evento) => {
          const archivo = evento.target.files?.[0];
          if (archivo) alSeleccionar(archivo);
        }}
      />

      {nombre ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FileIcon className="size-4 shrink-0 text-brand-green" />
              <span className="truncate text-sm">{nombre}</span>
            </div>
            <button
              type="button"
              onClick={alLimpiar}
              disabled={deshabilitado}
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label={`Quitar ${etiqueta}`}
            >
              <XIcon className="size-4" />
            </button>
          </div>
          {preview ? <div className="overflow-hidden">{preview}</div> : null}
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(evento) => {
            evento.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(evento) => {
            evento.preventDefault();
            setSobre(false);
            const archivo = evento.dataTransfer.files?.[0];
            if (archivo && !deshabilitado) alSeleccionar(archivo);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
            sobre
              ? "border-brand-green bg-brand-green/5"
              : "border-border hover:border-brand-green/60 hover:bg-muted/40",
            deshabilitado && "pointer-events-none opacity-50"
          )}
        >
          <FileUpIcon className="size-6 text-muted-foreground" />
          <div className="text-sm">
            <span className="font-medium text-foreground">Selecciona un archivo</span>{" "}
            <span className="text-muted-foreground">o arrástralo aquí</span>
          </div>
        </label>
      )}

      <FieldDescription>{descripcion}</FieldDescription>
    </Field>
  );
}

export function CfdiCliente({ cfdis }: { cfdis: CfdiGuardado[] }) {
  const router = useRouter();
  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const [datos, setDatos] = useState<Cfdi | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [nombreXml, setNombreXml] = useState<string | null>(null);
  const [nombrePdf, setNombrePdf] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [relacionadoId, setRelacionadoId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const limpiar = () => {
    setDatos(null);
    setXml(null);
    setNombreXml(null);
    setNombrePdf(null);
    setPdfBase64(null);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    if (xmlRef.current) xmlRef.current.value = "";
    if (pdfRef.current) pdfRef.current.value = "";
  };

  const leerXml = async (archivo: File) => {
    if (archivo.size > MAX_XML) {
      limpiar();
      sileo.error({ title: "El XML supera el tamaño máximo de 1 MB." });
      return;
    }

    try {
      const texto = await archivo.text();
      const cfdi = parsearCfdi(texto);
      setXml(texto);
      setDatos(cfdi);
      setNombreXml(archivo.name);
      sileo.success({ title: "CFDI leído correctamente." });
    } catch (error) {
      limpiar();
      sileo.error({
        title: "No se pudo leer el CFDI.",
        description:
          error instanceof Error ? error.message : "Verifica que el archivo sea un CFDI válido.",
      });
    }
  };

  const leerPdf = (archivo: File) => {
    const esPdf = archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);

    if (!esPdf) {
      if (pdfRef.current) pdfRef.current.value = "";
      setNombrePdf(null);
      setPdfBase64(null);
      setPdfUrl(null);
      sileo.error({ title: "El archivo del PDF no es válido." });
      return;
    }
    if (archivo.size > MAX_PDF) {
      if (pdfRef.current) pdfRef.current.value = "";
      setNombrePdf(null);
      setPdfBase64(null);
      setPdfUrl(null);
      sileo.error({ title: "El PDF supera el tamaño máximo de 5 MB." });
      return;
    }

    const lector = new FileReader();
    lector.onload = () => {
      const resultado = lector.result as string;
      // data:application/pdf;base64,... -> quitamos el prefijo.
      const base64 = resultado.split(",")[1] ?? "";
      setPdfBase64(base64);
      setNombrePdf(archivo.name);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(archivo));
    };
    lector.onerror = () => {
      sileo.error({ title: "No se pudo leer el PDF." });
    };
    lector.readAsDataURL(archivo);
  };

  const guardar = async () => {
    if (!xml || !datos) {
      sileo.error({ title: "Adjunta primero el XML del CFDI." });
      return;
    }

    setGuardando(true);
    try {
      const resultado = await guardarCfdi({
        xml,
        datos,
        pdf: pdfBase64,
        relacionadoId: relacionadoId ?? undefined,
      });
      if (resultado.ok) {
        limpiar();
        setAbierto(false);
        router.refresh();
        sileo.success({ title: "CFDI guardado correctamente." });
      } else {
        sileo.error({ title: "No se pudo guardar el CFDI.", description: resultado.mensaje });
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      <Sheet
        open={abierto}
        onOpenChange={(ab) => {
          setAbierto(ab);
          if (!ab) setRelacionadoId(null);
        }}
      >
        <SheetTrigger
          render={
            <Button className="w-fit bg-brand-green text-white hover:bg-brand-green/90" />
          }
        >
          Cargas CFDI
        </SheetTrigger>
        <SheetContent
          className="dark inset-y-4 right-4 h-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-sidebar p-0 shadow-2xl"
        >
          <SheetHeader className="border-b p-5">
            <SheetTitle>{relacionadoId ? "Complemento de pago" : "Adjuntar CFDI"}</SheetTitle>
            <SheetDescription>
              {relacionadoId
                ? "Se vinculará a la factura seleccionada. Adjunta el XML del complemento de pago (tipo P) y, si lo tienes, su PDF."
                : "El XML contiene los datos del comprobante. El PDF es la representación impresa y solo se verifica el tipo y el tamaño."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">
            <FieldGroup>
              <SubidaArchivo
                id="cfdi-xml"
                etiqueta="XML del CFDI"
                accept=".xml,application/xml,text/xml"
                inputRef={xmlRef}
                nombre={nombreXml}
                alSeleccionar={(archivo) => void leerXml(archivo)}
                alLimpiar={() => {
                  setDatos(null);
                  setXml(null);
                  setNombreXml(null);
                  if (xmlRef.current) xmlRef.current.value = "";
                }}
                descripcion="Obligatorio. Tamaño máximo 1 MB."
                deshabilitado={guardando}
                preview={
                  datos ? (
                    <div className="flex flex-col gap-3 border-t pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ReceiptTextIcon className="size-4 text-brand-green" />
                          <span className="text-sm font-medium">
                            {TIPOS[datos.tipoDeComprobante] ?? datos.tipoDeComprobante}
                          </span>
                        </div>
                        {datos.timbre?.uuid ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {datos.timbre.uuid.slice(0, 8)}…
                          </Badge>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Emisor</p>
                          <p className="truncate font-medium" title={datos.emisor.nombre ?? ""}>
                            {datos.emisor.nombre}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Receptor</p>
                          <p className="truncate font-medium" title={datos.receptor.nombre ?? ""}>
                            {datos.receptor.nombre}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Folio</p>
                          <p className="font-medium">{datos.folio}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Fecha</p>
                          <p className="font-medium">{fecha(datos.fecha)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                        <span className="text-xs text-muted-foreground">Total</span>
                        <span className="font-semibold tabular-nums">
                          {importe(datos.total)} {datos.moneda}
                        </span>
                      </div>
                    </div>
                  ) : null
                }
              />
              <SubidaArchivo
                id="cfdi-pdf"
                etiqueta="PDF del CFDI"
                accept="application/pdf,.pdf"
                inputRef={pdfRef}
                nombre={nombrePdf}
                alSeleccionar={leerPdf}
                alLimpiar={() => {
                  setNombrePdf(null);
                  setPdfBase64(null);
                  if (pdfUrl) {
                    URL.revokeObjectURL(pdfUrl);
                    setPdfUrl(null);
                  }
                  if (pdfRef.current) pdfRef.current.value = "";
                }}
                descripcion="Opcional. Tamaño máximo 5 MB."
                opcional
                deshabilitado={guardando}
                preview={
                  pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      title="Previsualización del PDF"
                      className="h-48 w-full rounded-md border bg-background"
                    />
                  ) : null
                }
              />
            </FieldGroup>
          </div>
          {datos ? (
            <SheetFooter className="border-t p-5">
              <Button variant="ghost" onClick={limpiar} disabled={guardando}>
                Limpiar
              </Button>
              <Button
                onClick={guardar}
                disabled={guardando}
                className="bg-brand-green text-white hover:bg-brand-green/90"
              >
                {guardando ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                Guardar CFDI
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      {datos ? <DetalleCfdi datos={datos} /> : null}

      <SeccionGuardados
        cfdis={cfdis}
        onAgregarComplemento={(cfdi) => {
          setRelacionadoId(cfdi.id);
          setAbierto(true);
        }}
      />
    </div>
  );
}

function DetalleCfdi({ datos }: { datos: Cfdi }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del CFDI</CardTitle>
        <CardDescription>
          Información leída directamente del XML. Los importes se muestran en la moneda del
          comprobante.
        </CardDescription>
        <CardAction>
          <Badge>{TIPOS[datos.tipoDeComprobante] ?? datos.tipoDeComprobante}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Bloque titulo="Comprobante">
          <Dato etiqueta="Versión" valor={datos.version} />
          <Dato etiqueta="Serie" valor={datos.serie} />
          <Dato etiqueta="Folio" valor={datos.folio} />
          <Dato etiqueta="Tipo" valor={TIPOS[datos.tipoDeComprobante] ?? datos.tipoDeComprobante} />
          <Dato etiqueta="Fecha" valor={fecha(datos.fecha)} />
          <Dato etiqueta="Método de pago" valor={datos.metodoPago} />
          <Dato etiqueta="Forma de pago" valor={datos.formaPago} />
          <Dato etiqueta="Moneda" valor={datos.moneda} />
          <Dato etiqueta="Tipo de cambio" valor={datos.tipoCambio} />
          <Dato etiqueta="Exportación" valor={datos.exportacion} />
          <Dato etiqueta="Lugar de expedición" valor={datos.lugarExpedicion} />
          <Dato etiqueta="Condiciones de pago" valor={datos.condicionesDePago} />
        </Bloque>

        <Bloque titulo="Emisor">
          <Dato etiqueta="RFC" valor={datos.emisor.rfc} />
          <Dato etiqueta="Nombre" valor={datos.emisor.nombre} />
          <Dato etiqueta="Régimen fiscal" valor={datos.emisor.regimenFiscal} />
        </Bloque>

        <Bloque titulo="Receptor">
          <Dato etiqueta="RFC" valor={datos.receptor.rfc} />
          <Dato etiqueta="Nombre" valor={datos.receptor.nombre} />
          <Dato etiqueta="Domicilio fiscal" valor={datos.receptor.domicilioFiscal} />
          <Dato etiqueta="Régimen fiscal" valor={datos.receptor.regimenFiscal} />
          <Dato etiqueta="Uso del CFDI" valor={datos.receptor.usoCfdi} />
        </Bloque>

        <Bloque titulo="Importes">
          <Dato etiqueta="Subtotal" valor={importe(datos.subtotal)} />
          <Dato etiqueta="Descuento" valor={importe(datos.descuento)} />
          <Dato etiqueta="Total" valor={importe(datos.total)} />
          <Dato etiqueta="Impuestos trasladados" valor={importe(datos.impuestos.totalTrasladados)} />
          <Dato etiqueta="Impuestos retenidos" valor={importe(datos.impuestos.totalRetenidos)} />
        </Bloque>

        {datos.conceptos.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Conceptos</h3>
            <div className="rounded-lg border">
              <Table className="table-fixed [&_td]:truncate [&_th]:truncate">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[12%]">Clave</TableHead>
                    <TableHead className="w-[11%]">Cantidad</TableHead>
                    <TableHead className="w-[12%]">Unidad</TableHead>
                    <TableHead className="w-[33%]">Descripción</TableHead>
                    <TableHead className="w-[12%] text-right">Valor unitario</TableHead>
                    <TableHead className="w-[10%] text-right">Importe</TableHead>
                    <TableHead className="w-[10%] text-right">Descuento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.conceptos.map((concepto, indice) => (
                    <TableRow key={indice}>
                      <TableCell className="font-mono text-xs">{concepto.claveProdServ}</TableCell>
                      <TableCell className="tabular-nums">{concepto.cantidad}</TableCell>
                      <TableCell>{concepto.unidad || concepto.claveUnidad}</TableCell>
                      <TableCell>{concepto.descripcion}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {importe(concepto.valorUnitario)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {importe(concepto.importe)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {importe(concepto.descuento)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {datos.impuestos.traslados.length > 0 ? (
          <TablaImpuestos titulo="Impuestos trasladados" detalles={datos.impuestos.traslados} />
        ) : null}
        {datos.impuestos.retenciones.length > 0 ? (
          <TablaImpuestos titulo="Impuestos retenidos" detalles={datos.impuestos.retenciones} />
        ) : null}

        {datos.timbre ? (
          <Bloque titulo="Timbre fiscal digital">
            <Dato etiqueta="UUID" valor={datos.timbre.uuid} />
            <Dato etiqueta="Versión" valor={datos.timbre.version} />
            <Dato etiqueta="Fecha de timbrado" valor={fecha(datos.timbre.fechaTimbrado)} />
            <Dato etiqueta="RFC proveedor de certificación" valor={datos.timbre.rfcProvCertif} />
            <Dato etiqueta="No. de certificado del SAT" valor={datos.timbre.noCertificadoSat} />
            {datos.timbre.selloCfd || datos.timbre.selloSat ? (
              <details className="sm:col-span-2 md:col-span-3">
                <summary className="cursor-pointer text-xs text-muted-foreground">Sellos</summary>
                <div className="mt-2 flex flex-col gap-2 font-mono text-xs break-all text-muted-foreground">
                  {datos.timbre.selloCfd ? <p>CFD: {datos.timbre.selloCfd}</p> : null}
                  {datos.timbre.selloSat ? <p>SAT: {datos.timbre.selloSat}</p> : null}
                </div>
              </details>
            ) : null}
          </Bloque>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TablaImpuestos({
  titulo,
  detalles,
}: {
  titulo: string;
  detalles: ImpuestoDetalle[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <div className="rounded-lg border">
        <Table className="table-fixed [&_td]:truncate [&_th]:truncate">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">Impuesto</TableHead>
              <TableHead className="w-[24%]">Tipo de factor</TableHead>
              <TableHead className="w-[18%] text-right">Base</TableHead>
              <TableHead className="w-[19%] text-right">Tasa o cuota</TableHead>
              <TableHead className="w-[19%] text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detalles.map((detalle, indice) => (
              <TableRow key={indice}>
                <TableCell>{detalle.impuesto}</TableCell>
                <TableCell>{detalle.tipoFactor}</TableCell>
                <TableCell className="text-right tabular-nums">{importe(detalle.base)}</TableCell>
                <TableCell className="text-right tabular-nums">{detalle.tasaOCuota || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{importe(detalle.importe)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CarpetaIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 76"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="carpetaFrente" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a9d6a" />
          <stop offset="100%" stopColor="#1D6E47" />
        </linearGradient>
        <linearGradient id="carpetaAtras" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#174f33" />
          <stop offset="100%" stopColor="#123f28" />
        </linearGradient>
      </defs>
      {/* Parte trasera (pestaña superior) */}
      <path
        d="M6 18 Q6 10 14 10 H36 Q40 10 44 14 L48 18 H86 Q94 18 94 26 V30 H6 Z"
        fill="url(#carpetaAtras)"
      />
      {/* Parte frontal */}
      <path
        d="M6 24 H94 Q94 31 94 32 V62 Q94 70 86 70 H14 Q6 70 6 62 V32 Q6 24 6 24 Z"
        fill="url(#carpetaFrente)"
      />
      {/* Borde inferior sutil */}
      <path
        d="M6 62 Q6 70 14 70 H86 Q94 70 94 62"
        fill="none"
        stroke="#0e3322"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
    </svg>
  );
}

function nombreFactura(uuid: string | null) {
  const clave = (uuid ?? "").trim();
  return clave ? clave.slice(0, 13).toUpperCase() : "Factura";
}

function formatearTamano(bytes: number) {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Empaqueta en un ZIP todos los archivos de la carpeta: el XML y, si existe, el
// PDF del comprobante, más los complementos de pago que tenga vinculados.
async function descargarDocumentos(cfdi: CfdiGuardado, complementos: CfdiGuardado[] = []) {
  const zip = new JSZip();
  const agregar = (comprobante: CfdiGuardado) => {
    const nombre = nombreFactura(comprobante.uuid_fiscal);
    zip.file(`${nombre}.xml`, comprobante.xml);
    if (comprobante.pdf) {
      const base64 = comprobante.pdf.split(",")[1] ?? comprobante.pdf;
      zip.file(`${nombre}.pdf`, base64, { base64: true });
    }
  };

  agregar(cfdi);
  for (const complemento of complementos) agregar(complemento);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombreFactura(cfdi.uuid_fiscal)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function FilaArchivo({
  icono,
  nombre,
  fecha,
  tipo,
  tamBytes,
  disponible = true,
}: {
  icono: React.ReactNode;
  nombre: string;
  fecha: string;
  tipo: string;
  tamBytes: number;
  disponible?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="shrink-0">{icono}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{nombre}</p>
        <p className="truncate text-xs text-muted-foreground">{tipo}</p>
      </div>
      <CheckCircle2Icon
        className={cn(
          "size-5 shrink-0",
          disponible ? "text-brand-green" : "text-muted-foreground/40"
        )}
      />
      <span className="hidden w-40 shrink-0 truncate text-right text-xs text-muted-foreground sm:block">
        {fecha}
      </span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatearTamano(tamBytes)}
      </span>
    </div>
  );
}

function SeccionGuardados({
  cfdis,
  onAgregarComplemento,
}: {
  cfdis: CfdiGuardado[];
  onAgregarComplemento: (cfdi: CfdiGuardado) => void;
}) {
  const [seleccionado, setSeleccionado] = useState<CfdiGuardado | null>(null);

  // Los complementos de pago (tipo P) vinculados a una factura no se muestran
  // como carpeta suelta: viven dentro del detalle de esa factura.
  const facturas = cfdis.filter((cfdi) => cfdi.tipo_comprobante !== "P" || !cfdi.relacionado_id);
  const complementos = seleccionado
    ? cfdis.filter(
        (cfdi) => cfdi.tipo_comprobante === "P" && cfdi.relacionado_id === seleccionado.id,
      )
    : [];

  const abrir = (cfdi: CfdiGuardado) => {
    setSeleccionado(cfdi);
  };

  const cerrar = () => {
    setSeleccionado(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CFDI guardados</CardTitle>
        <CardDescription>Comprobantes registrados en tu organización.</CardDescription>
      </CardHeader>
      <CardContent>
        {facturas.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptTextIcon />
              </EmptyMedia>
              <EmptyTitle>Todavía no hay CFDI</EmptyTitle>
              <EmptyDescription>
                Adjunta un XML para leer y registrar el primer comprobante.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {facturas.map((cfdi) => (
              <button
                key={cfdi.id}
                type="button"
                onClick={() => abrir(cfdi)}
                className="group flex flex-col items-center gap-2 rounded-lg p-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
              >
                <CarpetaIcon className="w-16 drop-shadow-sm" />
                <span
                  className="w-full truncate text-sm font-medium"
                  title={nombreFactura(cfdi.uuid_fiscal)}
                >
                  {nombreFactura(cfdi.uuid_fiscal)}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={seleccionado !== null} onOpenChange={(ab) => !ab && cerrar()}>
        <SheetContent
          showCloseButton={false}
          className="dark flex max-h-[calc(100vh-2rem)] flex-col inset-y-4 right-4 h-auto w-[calc(100%-2rem)] max-w-3xl rounded-2xl border-0 bg-sidebar p-0 shadow-2xl"
        >
          {seleccionado ? (
            <>
              <SheetHeader className="shrink-0 border-b p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <SheetTitle className="flex items-center gap-2">
                      <CarpetaIcon className="w-5" />
                      {nombreFactura(seleccionado.uuid_fiscal)}
                    </SheetTitle>
                    <SheetDescription>
                      {TIPOS[seleccionado.tipo_comprobante ?? ""] ?? seleccionado.tipo_comprobante} ·{" "}
                      {seleccionado.emisor_nombre ?? "—"}
                    </SheetDescription>
                  </div>
                  <button
                    type="button"
                    onClick={cerrar}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Cerrar"
                  >
                    <XIcon className="size-5" />
                  </button>
                </div>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-5">
                <div className="overflow-hidden rounded-lg border bg-card">
                  <FilaArchivo
                    icono={<FileTextIcon className="size-5 text-brand-green" />}
                    nombre={`${nombreFactura(seleccionado.uuid_fiscal)}.xml`}
                    fecha={fecha(seleccionado.creado_en)}
                    tipo="Archivo XML"
                    tamBytes={new Blob([seleccionado.xml]).size}
                  />
                  <div className="border-t" />
                  {seleccionado.pdf ? (
                    <FilaArchivo
                      icono={<FileIcon className="size-5 text-brand-green" />}
                      nombre={`${nombreFactura(seleccionado.uuid_fiscal)}.pdf`}
                      fecha={fecha(seleccionado.creado_en)}
                      tipo="Archivo PDF"
                      tamBytes={Math.floor((seleccionado.pdf.length * 3) / 4)}
                    />
                  ) : (
                    <FilaArchivo
                      icono={<FileIcon className="size-5 text-muted-foreground" />}
                      nombre={`${nombreFactura(seleccionado.uuid_fiscal)}.pdf`}
                      fecha="—"
                      tipo="No disponible"
                      tamBytes={0}
                      disponible={false}
                    />
                  )}
                </div>

                {complementos.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Complementos de pago</p>
                    <div className="divide-y overflow-hidden rounded-lg border bg-card">
                      {complementos.map((complemento) => (
                        <button
                          key={complemento.id}
                          type="button"
                          onClick={() => void descargarDocumentos(complemento)}
                          className="block w-full text-left transition-colors hover:bg-muted/40"
                        >
                          <FilaArchivo
                            icono={<ReceiptTextIcon className="size-5 text-brand-green" />}
                            nombre={nombreFactura(complemento.uuid_fiscal)}
                            fecha={fecha(complemento.fecha ?? complemento.creado_en)}
                            tipo={complemento.pdf ? "Complemento de pago · XML + PDF" : "Complemento de pago · XML"}
                            tamBytes={new Blob([complemento.xml]).size}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col gap-3 border-t p-5">
                <Button
                  className="w-full bg-brand-green text-white hover:bg-brand-green/90"
                  onClick={() => void descargarDocumentos(seleccionado, complementos)}
                >
                  <FileDownIcon className="size-4" />
                  Descargar documentos
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onAgregarComplemento(seleccionado);
                    cerrar();
                  }}
                >
                  <ReceiptTextIcon className="size-4" />
                  Complemento de pago
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">{children}</dl>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
}: {
  etiqueta: string;
  valor: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("truncate text-sm", mono ? "font-mono text-xs" : "tabular-nums")}>
        {valor || "—"}
      </dd>
    </div>
  );
}

function fecha(valor: string) {
  return valor ? valor.replace("T", " ").trim() : "—";
}

function importe(valor: string) {
  if (!valor) return "—";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero);
}
