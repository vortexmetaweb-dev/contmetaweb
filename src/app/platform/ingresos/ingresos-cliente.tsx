"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileCode2Icon,
  FileTextIcon,
  FilterIcon,
  HandCoinsIcon,
  ImagePlusIcon,
  PencilIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TrendingUpIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { sileo } from "sileo";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

import { editarIngreso, eliminarIngreso, guardarIngreso } from "./actions";

export type IngresoGuardado = {
  id: string;
  concepto: string;
  monto: number;
  moneda: string;
  fecha_ingreso: string;
  origen: string;
  cliente: string | null;
  logo: string | null;
  creado_en: string;
};

const DIAS = Array.from({ length: 31 }, (_, indice) => indice + 1);
const MESES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MAX_LOGO = 2 * 1024 * 1024;

// Parsea un string YYYY-MM-DD como fecha local (no UTC) para evitar desfases
// de un día en zonas horarias detrás de UTC.
function parsearFechaLocal(fechaStr: string) {
  const [anio, mes, dia] = fechaStr.slice(0, 10).split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

function formatoMoneda(monto: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(monto);
}

function iniciales(texto: string) {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  const primeras = palabras.slice(0, 2).map((palabra) => palabra[0]?.toUpperCase() ?? "");
  return primeras.join("") || "I";
}

function Isotipo({ concepto, compacto }: { concepto: string; compacto?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-lg bg-brand-green font-semibold text-white",
        compacto ? "size-7 text-[11px]" : "size-10 text-sm",
      )}
    >
      {iniciales(concepto)}
    </span>
  );
}

export function IngresosCliente({ ingresos }: { ingresos: IngresoGuardado[] }) {
  const router = useRouter();

  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [diaPago, setDiaPago] = useState(String(new Date().getDate()));
  const [mes, setMes] = useState(String(new Date().getMonth() + 1));
  const [origen, setOrigen] = useState("Manual");
  const [modo, setModo] = useState<"Manual" | "Xml">("Manual");
  const [xmlNombre, setXmlNombre] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [ingresoEnEdicion, setIngresoEnEdicion] = useState<IngresoGuardado | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const hoy = new Date();
  const anioDefault = hoy.getFullYear();
  const fechaIngresoDefault = `${anioDefault}-${String(mes).padStart(2, "0")}-${String(diaPago).padStart(2, "0")}`;

  const limpiar = () => {
    setConcepto("");
    setMonto("");
    setDiaPago(String(new Date().getDate()));
    setMes(String(new Date().getMonth() + 1));
    setOrigen("Manual");
    setModo("Manual");
    setXmlNombre(null);
    setCliente("");
    setLogo(null);
    setIngresoEnEdicion(null);
  };

  const abrirEdicion = (ingreso: IngresoGuardado) => {
    setIngresoEnEdicion(ingreso);
    setConcepto(ingreso.concepto);
    setMonto(String(ingreso.monto));
    const fecha = parsearFechaLocal(ingreso.fecha_ingreso);
    setDiaPago(String(fecha.getDate()));
    setMes(String(fecha.getMonth() + 1));
    setOrigen(ingreso.origen);
    setModo(ingreso.origen === "Invoice" ? "Xml" : "Manual");
    setXmlNombre(null);
    setCliente(ingreso.cliente ?? "");
    setLogo(ingreso.logo);
    setAbierto(true);
  };

  const manejarLogo = (archivo: File | null) => {
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
      sileo.error({ title: "The file must be an image." });
      return;
    }
    if (archivo.size > MAX_LOGO) {
      sileo.error({ title: "The image is too large (max 2 MB)." });
      return;
    }
    const lector = new FileReader();
    lector.onload = () => setLogo(lector.result as string);
    lector.onerror = () => sileo.error({ title: "Could not read the image." });
    lector.readAsDataURL(archivo);
  };

  const procesarXml = (archivo: File | null) => {
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith(".xml") && !archivo.type.includes("xml")) {
      sileo.error({ title: "The file must be a CFDI XML." });
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      sileo.error({ title: "The XML is too large (max 5 MB)." });
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const xml = lector.result as string;
        const cfdi = parsearCfdi(xml);

        // Solo aceptamos comprobantes de ingreso (tipo I) para registrar ingresos.
        if (cfdi.tipoDeComprobante && cfdi.tipoDeComprobante !== "I") {
          sileo.error({
            title: "This CFDI is not an income invoice.",
            description: "Only type I (income) CFDIs can be registered as income.",
          });
          return;
        }

        const total = Number(cfdi.total);
        if (!Number.isFinite(total) || total <= 0) {
          sileo.error({ title: "The CFDI does not have a valid total." });
          return;
        }

        // Concepto: primera descripción del CFDI, o el nombre del emisor.
        const conceptoCfdi =
          cfdi.conceptos[0]?.descripcion ||
          cfdi.emisor.nombre ||
          "CFDI income";

        setConcepto(conceptoCfdi.slice(0, 120));
        setMonto(String(total));
        setCliente(cfdi.receptor.nombre || "");
        setOrigen("Invoice");
        setXmlNombre(archivo.name);

        // Fecha del CFDI (formato ISO: YYYY-MM-DDTHH:MM:SS)
        if (cfdi.fecha) {
          const fecha = new Date(cfdi.fecha);
          if (!isNaN(fecha.getTime())) {
            setDiaPago(String(fecha.getDate()));
            setMes(String(fecha.getMonth() + 1));
          }
        }

        sileo.success({
          title: "CFDI read successfully.",
          description: "Review the data and save the income.",
        });
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "The file is not a valid CFDI.";
        sileo.error({ title: "Could not read the CFDI.", description: mensaje });
      }
    };
    lector.onerror = () => sileo.error({ title: "Could not read the file." });
    lector.readAsText(archivo);
  };

  const guardar = async () => {
    if (!concepto.trim()) {
      sileo.error({ title: "Enter the income concept." });
      return;
    }
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      sileo.error({ title: "The amount must be greater than zero." });
      return;
    }

    setGuardando(true);
    try {
      const datos = {
        concepto,
        monto: valor,
        fechaIngreso: fechaIngresoDefault,
        origen,
        cliente,
        logo,
      };

      const resultado = ingresoEnEdicion
        ? await editarIngreso(ingresoEnEdicion.id, datos)
        : await guardarIngreso(datos);

      if (resultado.ok) {
        limpiar();
        setAbierto(false);
        router.refresh();
        sileo.success({
          title: ingresoEnEdicion ? "Income updated successfully." : "Income registered successfully.",
        });
      } else {
        sileo.error({ title: "Could not save the income.", description: resultado.mensaje });
      }
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (ingreso: IngresoGuardado) => {
    if (eliminandoId !== ingreso.id) {
      setEliminandoId(ingreso.id);
      return;
    }
    try {
      const resultado = await eliminarIngreso(ingreso.id);
      if (resultado.ok) {
        setEliminandoId(null);
        router.refresh();
        sileo.success({ title: "Income deleted." });
      } else {
        sileo.error({ title: "Could not delete the income.", description: resultado.mensaje });
      }
    } finally {
      setEliminandoId(null);
    }
  };

  const valido = Boolean(concepto.trim()) && Number(monto) > 0;

  const metricas = useMemo(() => {
    const total = ingresos.reduce((suma, ing) => suma + ing.monto, 0);
    const cantidad = ingresos.length;
    const conFactura = ingresos.filter((i) => i.origen === "Invoice").length;
    return { total, cantidad, conFactura };
  }, [ingresos]);

  // Serie temporal de los últimos N días agrupados por fecha para la gráfica de área.
  const serie = useMemo(() => {
    const dias = 30;
    const puntos: { fecha: string; monto: number; etiqueta: string }[] = [];
    for (let i = dias - 1; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
      puntos.push({
        fecha: clave,
        monto: 0,
        etiqueta: `${fecha.getMonth() + 1}/${fecha.getDate()}`,
      });
    }
    for (const ingreso of ingresos) {
      const clave = ingreso.fecha_ingreso.slice(0, 10);
      const punto = puntos.find((p) => p.fecha === clave);
      if (punto) punto.monto += ingreso.monto;
    }
    return puntos;
  }, [ingresos]);

  const ingresosFiltrados = ingresos;

  // Top 6 conceptos por monto acumulado para la gráfica de barras.
  const topConceptos = useMemo(() => {
    const agrupado = new Map<string, number>();
    for (const ingreso of ingresos) {
      agrupado.set(
        ingreso.concepto,
        (agrupado.get(ingreso.concepto) ?? 0) + ingreso.monto,
      );
    }
    return [...agrupado.entries()]
      .map(([concepto, monto]) => ({ concepto, monto }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 6);
  }, [ingresos]);

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight dark:text-white">Income</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="dark:text-white dark:border-white/30">
            <FilterIcon data-icon="inline-start" />
            Filters
          </Button>
          <Sheet
            open={abierto}
            onOpenChange={(ab) => {
              setAbierto(ab);
              if (!ab) limpiar();
            }}
          >
            <SheetTrigger
              render={
                <Button className="bg-brand-green text-white hover:bg-brand-green/90" size="sm" />
              }
            >
              <PlusIcon data-icon="inline-start" />
              New income
            </SheetTrigger>
            <SheetContent className="dark flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden inset-y-4 right-4 h-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-sidebar p-0 shadow-2xl">
              <SheetHeader className="border-b px-5 py-3">
                <SheetTitle className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
                    <HandCoinsIcon className="size-4" />
                  </span>
                  {ingresoEnEdicion ? "Edit income" : "Register income"}
                </SheetTitle>
                <SheetDescription className="mt-1">
                  {ingresoEnEdicion
                    ? "Update the details of this income."
                    : "Record income from invoices or without them."}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-3">
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel htmlFor="ing-concepto">Concept</FieldLabel>
                    <div className="flex gap-2">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/60">
                        {logo ? (
                          <img src={logo} alt="" className="size-full rounded-xl object-cover" />
                        ) : (
                          <Isotipo concepto={concepto || "I"} compacto />
                        )}
                      </div>
                      <Input
                        id="ing-concepto"
                        value={concepto}
                        onChange={(e) => setConcepto(e.target.value)}
                        placeholder="Consulting, product, service…"
                        maxLength={120}
                        disabled={guardando}
                        className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-brand-green/40"
                      />
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel>Mode</FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { valor: "Manual", label: "Manual", icono: <HandCoinsIcon className="size-4" /> },
                          { valor: "Xml", label: "XML (CFDI)", icono: <FileCode2Icon className="size-4" /> },
                        ] as const
                      ).map((op) => {
                        const seleccionado = modo === op.valor;
                        return (
                          <button
                            key={op.valor}
                            type="button"
                            onClick={() => {
                              setModo(op.valor);
                              if (op.valor === "Manual") {
                                setOrigen("Manual");
                                setXmlNombre(null);
                              }
                            }}
                            disabled={guardando}
                            className={cn(
                              "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
                              seleccionado
                                ? "border-brand-green bg-brand-green/[0.06] text-brand-green dark:text-white ring-1 ring-brand-green"
                                : "border-border bg-muted/30 text-muted-foreground hover:border-brand-green/50 dark:text-white/70",
                            )}
                          >
                            {op.icono}
                            {op.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  {modo === "Xml" ? (
                    <>
                      <Field>
                        <FieldLabel>Upload CFDI XML</FieldLabel>
                        {xmlNombre ? (
                          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
                              <FileTextIcon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm dark:text-white/90">{xmlNombre}</p>
                              <p className="text-xs text-muted-foreground dark:text-white/60">
                                Data loaded from the CFDI
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setXmlNombre(null)}
                              disabled={guardando}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <XIcon />
                            </Button>
                          </div>
                        ) : (
                          <label
                            htmlFor="ing-xml"
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 px-3 py-3 transition-colors hover:border-brand-green hover:bg-brand-green/[0.04]"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
                              <UploadIcon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm dark:text-white/90">Upload XML invoice</p>
                              <p className="text-xs text-muted-foreground dark:text-white/60">
                                CFDI type I · max 5 MB
                              </p>
                            </div>
                            <input
                              id="ing-xml"
                              type="file"
                              accept=".xml,application/xml,text/xml"
                              className="sr-only"
                              onChange={(e) => procesarXml(e.target.files?.[0] ?? null)}
                              disabled={guardando}
                            />
                          </label>
                        )}
                      </Field>

                      <Field>
                        <FieldLabel>Logo / icon</FieldLabel>
                        {logo ? (
                          <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                            <img src={logo} alt="Income logo preview" className="size-12 rounded-lg object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm dark:text-white/90">Custom logo</p>
                              <p className="text-xs text-muted-foreground dark:text-white/60">
                                Replaces the generated icon
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setLogo(null)}
                              disabled={guardando}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <XIcon />
                            </Button>
                          </div>
                        ) : (
                          <label
                            htmlFor="ing-logo-xml"
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 px-3 py-3 transition-colors hover:border-brand-green hover:bg-brand-green/[0.04]"
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
                              <ImagePlusIcon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm dark:text-white/90">Upload a logo</p>
                              <p className="text-xs text-muted-foreground dark:text-white/60">
                                PNG, JPG or SVG · max 2 MB
                              </p>
                            </div>
                            <input
                              id="ing-logo-xml"
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) => manejarLogo(e.target.files?.[0] ?? null)}
                              disabled={guardando}
                            />
                          </label>
                        )}
                      </Field>
                    </>
                  ) : null}

                  <Field>
                    <FieldLabel htmlFor="ing-cliente">Client / source</FieldLabel>
                    <Input
                      id="ing-cliente"
                      value={cliente}
                      onChange={(e) => setCliente(e.target.value)}
                      placeholder="Client name (optional)"
                      maxLength={120}
                      disabled={guardando}
                      className="h-11 bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-brand-green/40"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="ing-monto">Amount</FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground dark:text-white/70">
                        $
                      </span>
                      <Input
                        id="ing-monto"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={monto}
                        onChange={(e) => setMonto(e.target.value)}
                        placeholder="0.00"
                        disabled={guardando}
                        className="h-11 pl-8 tabular-nums bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-brand-green/40"
                      />
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel>Income day</FieldLabel>
                    <div className="flex flex-col gap-2">
                      {/* Selector de mes personalizado */}
                      <div className="flex w-full items-center gap-2">
                        <span className="shrink-0 text-xs text-muted-foreground dark:text-white/60">Month</span>
                        <div className="min-w-0 flex-1">
                          <MesPicker valor={mes} onChange={setMes} disabled={guardando} />
                        </div>
                      </div>
                      <DiaPicker valor={diaPago} onChange={setDiaPago} disabled={guardando} />
                    </div>
                  </Field>

                  {modo === "Manual" ? (
                    <Field>
                      <FieldLabel>Logo / icon</FieldLabel>
                      {logo ? (
                        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                          <img src={logo} alt="Income logo preview" className="size-12 rounded-lg object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm dark:text-white/90">Custom logo</p>
                            <p className="text-xs text-muted-foreground dark:text-white/60">
                              Replaces the generated icon
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setLogo(null)}
                            disabled={guardando}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <XIcon />
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor="ing-logo"
                          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 px-3 py-3 transition-colors hover:border-brand-green hover:bg-brand-green/[0.04]"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
                            <ImagePlusIcon className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm dark:text-white/90">Upload a logo</p>
                            <p className="text-xs text-muted-foreground dark:text-white/60">
                              PNG, JPG or SVG · max 2 MB
                            </p>
                          </div>
                          <input
                            id="ing-logo"
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(e) => manejarLogo(e.target.files?.[0] ?? null)}
                            disabled={guardando}
                          />
                        </label>
                      )}
                    </Field>
                  ) : null}
                </FieldGroup>
              </div>

              <SheetFooter className="border-t px-5 py-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    limpiar();
                    setAbierto(false);
                  }}
                  disabled={guardando}
                >
                  Cancel
                </Button>
                <Button
                  onClick={guardar}
                  disabled={guardando || !valido}
                  className="bg-brand-green text-white hover:bg-brand-green/90"
                >
                  {guardando ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SaveIcon data-icon="inline-start" />
                  )}
                  {ingresoEnEdicion ? "Update income" : "Save income"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="overflow-hidden bg-gradient-to-br from-brand-green to-brand-green/80 border-0 text-white">
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Total income</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatoMoneda(metricas.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-white/60">
              Transactions
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums dark:text-white">{metricas.cantidad}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-white/60">
              With invoice
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums dark:text-white">{metricas.conFactura}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-white/60">
              Without invoice
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums dark:text-white">
              {metricas.cantidad - metricas.conFactura}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        {/* Gráficas */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 dark:text-white">
                  <TrendingUpIcon className="size-4 text-brand-green" />
                  Income over the last 30 days
                </CardTitle>
                <CardDescription className="dark:text-white/60">
                  Accumulated amounts grouped by collection date.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <BarrasDiariasChart serie={serie} />
            </CardContent>
          </Card>

          <BarChartCard conceptos={topConceptos} />
        </div>

        {/* Tabla */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="dark:text-white">Registered income</CardTitle>
              <CardDescription className="dark:text-white/60 mt-0.5">
                {ingresosFiltrados.length}{" "}
                {ingresosFiltrados.length === 1 ? "transaction" : "transactions"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {ingresosFiltrados.length === 0 ? (
              <div className="px-4 pb-6">
                <Empty>
                  <EmptyMedia>
                    <EmptyIcon />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>No income yet</EmptyTitle>
                    <EmptyDescription>
                      Register your first income using the form.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 dark:bg-sidebar/95">
                    <TableRow className="border-b border-border/60 hover:bg-transparent dark:hover:bg-transparent">
                      <TableHead className="h-10 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-white/50">
                        Concept
                      </TableHead>
                      <TableHead className="h-10 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-white/50">
                        Client
                      </TableHead>
                      <TableHead className="h-10 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-white/50">
                        Amount
                      </TableHead>
                      <TableHead className="h-10 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-white/50">
                        Date
                      </TableHead>
                      <TableHead className="h-10 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-white/50">
                        Origin
                      </TableHead>
                      <TableHead className="h-10 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-white/50">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ingresosFiltrados.map((ingreso) => (
                      <TableRow
                        key={ingreso.id}
                        className="group border-b border-border/40 transition-colors hover:bg-brand-green/[0.03] dark:hover:bg-white/[0.03]"
                      >
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2.5">
                            {ingreso.logo ? (
                              <img
                                src={ingreso.logo}
                                alt=""
                                className="size-8 rounded-lg object-cover ring-1 ring-black/5 dark:ring-white/10"
                              />
                            ) : (
                              <Isotipo concepto={ingreso.concepto} compacto />
                            )}
                            <span className="truncate font-medium dark:text-white max-w-[220px]">
                              {ingreso.concepto}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-muted-foreground dark:text-white/70">
                          {ingreso.cliente ?? (
                            <span className="text-muted-foreground/50 dark:text-white/30">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span className="font-semibold tabular-nums text-brand-green dark:text-white">
                            {formatoMoneda(ingreso.monto)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-muted-foreground dark:text-white/70 tabular-nums">
                          {parsearFechaLocal(ingreso.fecha_ingreso).toLocaleDateString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-medium",
                              ingreso.origen === "Invoice"
                                ? "border-brand-green/30 bg-brand-green/10 text-brand-green dark:border-brand-green/40 dark:bg-brand-green/15 dark:text-white"
                                : "border-border bg-muted/50 text-muted-foreground dark:border-white/10 dark:bg-white/10 dark:text-white/80",
                            )}
                          >
                            {ingreso.origen === "Invoice" ? "Invoice" : "Manual"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirEdicion(ingreso)}
                              aria-label="Edit income"
                              className="size-8 text-muted-foreground hover:bg-brand-green/10 hover:text-brand-green dark:text-white/70 dark:hover:text-white"
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                            {eliminandoId === ingreso.id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => eliminar(ingreso)}
                                className="text-destructive hover:bg-destructive hover:text-white"
                              >
                                <Trash2Icon data-icon="inline-start" className="size-4" />
                                Confirm
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => eliminar(ingreso)}
                                aria-label={`Delete ${ingreso.concepto}`}
                                className="size-8 text-muted-foreground hover:text-destructive dark:text-white/70"
                              >
                                <Trash2Icon className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyIcon() {
  return (
    <div className="flex size-12 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
      <HandCoinsIcon className="size-6" />
    </div>
  );
}

// Gráfica de barras horizontales con los conceptos que generan más ingresos.
function BarChartCard({
  conceptos,
}: {
  conceptos: { concepto: string; monto: number }[];
}) {
  const maxMonto = Math.max(...conceptos.map((c) => c.monto), 0);

  return (
    <Card className="lg:col-span-2">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Top income sources</CardTitle>
            <CardDescription className="mt-1">
              Concepts with the highest accumulated amount.
            </CardDescription>
          </div>
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-white">
            <BarChart3Icon className="size-4" />
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {conceptos.map((item) => {
            const proporcion = maxMonto > 0 ? (item.monto / maxMonto) * 100 : 0;
            return (
              <div key={item.concepto} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm dark:text-white/90">{item.concepto}</span>
                  <span className="text-sm font-semibold tabular-nums text-brand-green dark:text-white">
                    {formatoMoneda(item.monto)}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-green"
                    style={{
                      width: `${proporcion}%`,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
          {conceptos.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground dark:text-white/60">
              No data
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// Formato corto para el eje Y (ej. $1.2k, $15k).
function formatoMonedaCorto(valor: number) {
  if (valor >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `$${(valor / 1_000).toFixed(valor >= 10_000 ? 0 : 1)}k`;
  return `$${valor.toFixed(0)}`;
}

// Gráfica de barras verticales: ingreso acumulado por día en los últimos 30 días.
function BarrasDiariasChart({ serie }: { serie: { etiqueta: string; monto: number }[] }) {
  const [hoverIndice, setHoverIndice] = useState<number | null>(null);

  const ancho = 600;
  const alto = 240;
  const padding = { arriba: 16, derecha: 8, abajo: 28, izquierda: 56 };

  const maximo = Math.max(...serie.map((p) => p.monto), 1);
  const maximoEscala = Math.ceil(maximo / 1000) * 1000 || maximo;

  const anchoUtil = ancho - padding.izquierda - padding.derecha;
  const altoUtil = alto - padding.arriba - padding.abajo;
  const anchoBarra = anchoUtil / serie.length;
  const grosorBarra = Math.max(anchoBarra * 0.6, 2);

  const lineasGrid = 4;
  const grid = Array.from({ length: lineasGrid + 1 }, (_, i) => {
    const valor = (maximoEscala / lineasGrid) * i;
    return { valor, y: padding.arriba + altoUtil - (valor / maximoEscala) * altoUtil, base: i === 0 };
  });

  const puntoHover = hoverIndice !== null ? serie[hoverIndice] : null;
  const hoverX = hoverIndice !== null ? padding.izquierda + hoverIndice * anchoBarra + anchoBarra / 2 : 0;

  return (
    <div className="relative w-full" onMouseLeave={() => setHoverIndice(null)}>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-60 w-full select-none" preserveAspectRatio="none">
        {/* Líneas de grid y etiquetas del eje Y */}
        {grid.map((linea, i) => (
          <g key={i}>
            <line
              x1={padding.izquierda}
              y1={linea.y}
              x2={ancho - padding.derecha}
              y2={linea.y}
              className={linea.base ? "text-border dark:text-white/15" : "text-border/60 dark:text-white/10"}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray={linea.base ? "0" : "3 3"}
            />
            <text
              x={padding.izquierda - 10}
              y={linea.y + 3}
              fontSize="10"
              className="fill-muted-foreground dark:fill-white/50 tabular-nums"
              textAnchor="end"
            >
              {formatoMonedaCorto(linea.valor)}
            </text>
          </g>
        ))}

        {/* Barras */}
        {serie.map((p, i) => {
          const altura = (p.monto / maximoEscala) * altoUtil;
          const x = padding.izquierda + i * anchoBarra + (anchoBarra - grosorBarra) / 2;
          const y = padding.arriba + altoUtil - altura;
          const activo = hoverIndice === i;
          return (
            <g key={i}>
              <rect
                x={padding.izquierda + i * anchoBarra}
                y={padding.arriba}
                width={anchoBarra}
                height={altoUtil}
                fill="transparent"
                onMouseEnter={() => setHoverIndice(i)}
              />
              <rect
                x={x}
                y={y}
                width={grosorBarra}
                height={Math.max(altura, 1)}
                rx="2"
                fill="#1D6E47"
                style={{
                  opacity: activo ? 1 : 0.75,
                  transition: "opacity 0.15s ease",
                }}
              />
              {activo ? (
                <rect
                  x={x}
                  y={y}
                  width={grosorBarra}
                  height={Math.max(altura, 1)}
                  rx="2"
                  fill="none"
                  stroke="#1D6E47"
                  strokeWidth="2"
                  opacity="0.3"
                />
              ) : null}
            </g>
          );
        })}

        {/* Etiquetas del eje X */}
        {serie
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => i % 5 === 0 || i === serie.length - 1)
          .map(({ p, i }) => (
            <text
              key={i}
              x={padding.izquierda + i * anchoBarra + anchoBarra / 2}
              y={alto - 8}
              fontSize="10"
              className="fill-muted-foreground dark:fill-white/50"
              textAnchor="middle"
            >
              {p.etiqueta}
            </text>
          ))}
      </svg>

      {/* Tooltip */}
      {puntoHover ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border/60 bg-background px-3 py-2 shadow-lg dark:border-white/10 dark:bg-sidebar"
          style={{
            left: `${(hoverX / ancho) * 100}%`,
            top: `${(padding.arriba / alto) * 100}%`,
            marginTop: "-4px",
          }}
        >
          <p className="text-[11px] text-muted-foreground dark:text-white/60">{puntoHover.etiqueta}</p>
          <p className="text-sm font-semibold tabular-nums text-brand-green dark:text-white">
            {formatoMoneda(puntoHover.monto)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DiaPicker({
  valor,
  onChange,
  disabled,
}: {
  valor: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
}) {
  const indice = Math.max(0, DIAS.indexOf(Number(valor)));
  const [arrastrando, setArrastrando] = useState(false);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const inicioRef = useRef<{ x: number; indice: number } | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const irA = (nuevo: number) => {
    const limite = Math.min(Math.max(nuevo, 0), DIAS.length - 1);
    if (limite !== indice) onChange(String(DIAS[limite]));
  };

  const onPointerDown = (evento: React.PointerEvent) => {
    if (disabled) return;
    inicioRef.current = { x: evento.clientX, indice };
    setArrastrando(true);
    (evento.target as Element).setPointerCapture?.(evento.pointerId);
  };

  const onPointerMove = (evento: React.PointerEvent) => {
    if (!arrastrando || !inicioRef.current) return;
    const ancho = contenedorRef.current?.offsetWidth ?? 1;
    const delta = evento.clientX - inicioRef.current.x;
    setDesplazamiento(delta / ancho);
  };

  const onPointerUp = () => {
    if (!inicioRef.current) return;
    const umbral = 0.2;
    if (desplazamiento < -umbral) irA(inicioRef.current.indice + 1);
    else if (desplazamiento > umbral) irA(inicioRef.current.indice - 1);
    inicioRef.current = null;
    setArrastrando(false);
    setDesplazamiento(0);
  };

  return (
    <div className="relative flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => irA(indice - 1)}
        disabled={disabled || indice === 0}
        className="shrink-0 text-muted-foreground hover:text-brand-green dark:text-white/70"
        aria-label="Previous day"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <div
        ref={contenedorRef}
        className="relative flex-1 overflow-hidden rounded-xl bg-muted/60"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${-indice * 100}% + ${desplazamiento * 100}%))`,
            transition: arrastrando ? "none" : "transform 0.3s ease",
          }}
        >
          {DIAS.map((dia) => (
            <div key={dia} className="flex w-full shrink-0 items-center gap-3 px-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-green text-sm font-semibold text-white tabular-nums">
                {String(dia).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium dark:text-white">Day {dia}</p>
                <p className="text-xs text-muted-foreground dark:text-white/60">
                  {dia === 1
                    ? "First day of the month."
                    : dia === 31
                      ? "Last day of the month."
                      : `Day ${dia} of the month.`}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => irA(indice + 1)}
        disabled={disabled || indice === DIAS.length - 1}
        className="shrink-0 text-muted-foreground hover:text-brand-green dark:text-white/70"
        aria-label="Next day"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

// Selector personalizado de mes, con el mismo estilo swipe que DiaPicker.
function MesPicker({
  valor,
  onChange,
  disabled,
}: {
  valor: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
}) {
  const indice = Math.max(0, Math.min(Number(valor) - 1, MESES.length - 1));
  const [arrastrando, setArrastrando] = useState(false);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const inicioRef = useRef<{ x: number; indice: number } | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const irA = (nuevo: number) => {
    const limite = Math.min(Math.max(nuevo, 0), MESES.length - 1);
    if (limite !== indice) onChange(String(limite + 1));
  };

  const onPointerDown = (evento: React.PointerEvent) => {
    if (disabled) return;
    inicioRef.current = { x: evento.clientX, indice };
    setArrastrando(true);
    (evento.target as Element).setPointerCapture?.(evento.pointerId);
  };

  const onPointerMove = (evento: React.PointerEvent) => {
    if (!arrastrando || !inicioRef.current) return;
    const ancho = contenedorRef.current?.offsetWidth ?? 1;
    const delta = evento.clientX - inicioRef.current.x;
    setDesplazamiento(delta / ancho);
  };

  const onPointerUp = () => {
    if (!inicioRef.current) return;
    const umbral = 0.2;
    if (desplazamiento < -umbral) irA(inicioRef.current.indice + 1);
    else if (desplazamiento > umbral) irA(inicioRef.current.indice - 1);
    inicioRef.current = null;
    setArrastrando(false);
    setDesplazamiento(0);
  };

  return (
    <div className="relative flex w-full items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => irA(indice - 1)}
        disabled={disabled || indice === 0}
        className="size-7 shrink-0 text-muted-foreground hover:text-brand-green dark:text-white/70"
        aria-label="Previous month"
      >
        <ChevronLeftIcon className="size-3.5" />
      </Button>
      <div
        ref={contenedorRef}
        className="relative min-w-0 flex-1 overflow-hidden rounded-lg bg-muted/60"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className="flex"
          style={{
            transform: `translateX(calc(${-indice * 100}% + ${desplazamiento * 100}%))`,
            transition: arrastrando ? "none" : "transform 0.3s ease",
          }}
        >
          {MESES.map((mes, i) => (
            <div key={mes} className="flex w-full shrink-0 items-center px-2.5 py-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-green text-[10px] font-semibold text-white">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="ml-2 truncate text-xs font-medium dark:text-white">{mes}</span>
            </div>
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => irA(indice + 1)}
        disabled={disabled || indice === MESES.length - 1}
        className="size-7 shrink-0 text-muted-foreground hover:text-brand-green dark:text-white/70"
        aria-label="Next month"
      >
        <ChevronRightIcon className="size-3.5" />
      </Button>
    </div>
  );
}

