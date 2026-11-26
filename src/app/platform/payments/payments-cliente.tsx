"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3Icon,
  CalendarDaysIcon,
  CreditCardIcon,
  FilterIcon,
  ImagePlusIcon,
  PencilIcon,
  PieChartIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  Trash2Icon,
  TrendingDownIcon,
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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

import { editarPago, eliminarPago, guardarPago } from "./actions";

export type PagoGuardado = {
  id: string;
  concepto: string;
  monto: number;
  moneda: string;
  dia_pago: number;
  recurrencia: string;
  logo: string | null;
  creado_en: string;
};

const RECURRENCIAS = ["Monthly", "Bimonthly", "Quarterly", "Semiannual", "Annual", "One-time"];
const DIAS = Array.from({ length: 31 }, (_, indice) => indice + 1);
const MAX_LOGO = 2 * 1024 * 1024;

// Segment colors for the distribution chart, based on the brand green.
const COLORES_SEGMENTOS = [
  "#1D6E47",
  "#2a9d6a",
  "#45b884",
  "#6fcf9f",
  "#9ee0c0",
  "#0a3322",
];

// Same visual treatment as Input, for the <select> fields in the form.
const CLASE_SELECT =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

export function PaymentsCliente({ pagos }: { pagos: PagoGuardado[] }) {
  const router = useRouter();

  const [abierto, setAbierto] = useState(false);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [diaPago, setDiaPago] = useState("1");
  const [recurrencia, setRecurrencia] = useState("Monthly");
  const [logo, setLogo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [pagoEnEdicion, setPagoEnEdicion] = useState<PagoGuardado | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  const limpiar = () => {
    setConcepto("");
    setMonto("");
    setDiaPago("1");
    setRecurrencia("Monthly");
    setLogo(null);
    setPagoEnEdicion(null);
  };

  const abrirEdicion = (pago: PagoGuardado) => {
    setPagoEnEdicion(pago);
    setConcepto(pago.concepto);
    setMonto(String(pago.monto));
    setDiaPago(String(pago.dia_pago));
    setRecurrencia(pago.recurrencia);
    setLogo(pago.logo);
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
    lector.onload = () => {
      setLogo(lector.result as string);
    };
    lector.onerror = () => {
      sileo.error({ title: "Could not read the image." });
    };
    lector.readAsDataURL(archivo);
  };

  const guardar = async () => {
    if (!concepto.trim()) {
      sileo.error({ title: "Enter the payment concept." });
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
        diaPago: Number(diaPago),
        recurrencia,
        logo,
      };

      const resultado = pagoEnEdicion
        ? await editarPago(pagoEnEdicion.id, datos)
        : await guardarPago(datos);

      if (resultado.ok) {
        limpiar();
        setAbierto(false);
        router.refresh();
        sileo.success({
          title: pagoEnEdicion ? "Payment updated successfully." : "Payment registered successfully.",
        });
      } else {
        sileo.error({ title: "Could not save the payment.", description: resultado.mensaje });
      }
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (pago: PagoGuardado) => {
    if (eliminandoId !== pago.id) {
      setEliminandoId(pago.id);
      return;
    }

    try {
      const resultado = await eliminarPago(pago.id);
      if (resultado.ok) {
        setEliminandoId(null);
        router.refresh();
        sileo.success({ title: "Payment deleted." });
      } else {
        sileo.error({ title: "Could not delete the payment.", description: resultado.mensaje });
      }
    } finally {
      setEliminandoId(null);
    }
  };

  // The button is only enabled when the payment is valid.
  const valido = Boolean(concepto.trim()) && Number(monto) > 0;

  // Metrics shown in the top cards.
  const metricas = useMemo(() => {
    const total = pagos.reduce((suma, pago) => suma + pago.monto, 0);
    const cantidad = pagos.length;

    const hoy = new Date().getDate();
    // Next payment: the day closest to today (following the monthly cycle).
    const proximos = [...pagos]
      .map((pago) => {
        let dias = pago.dia_pago - hoy;
        if (dias < 0) dias += 30;
        return { pago, dias };
      })
      .sort((a, b) => a.dias - b.dias);
    const proximo = proximos[0]?.pago ?? null;

    return { total, cantidad, proximo };
  }, [pagos]);

  // Distribution by recurrence for the donut chart. Includes both count and
  // total amount per recurrence.
  const distribucion = useMemo(() => {
    const conteo: Record<string, number> = {};
    const montos: Record<string, number> = {};
    for (const pago of pagos) {
      conteo[pago.recurrencia] = (conteo[pago.recurrencia] ?? 0) + 1;
      montos[pago.recurrencia] = (montos[pago.recurrencia] ?? 0) + pago.monto;
    }
    return RECURRENCIAS.map((nombre, indice) => ({
      nombre,
      valor: conteo[nombre] ?? 0,
      monto: montos[nombre] ?? 0,
      color: COLORES_SEGMENTOS[indice % COLORES_SEGMENTOS.length],
    })).filter((segmento) => segmento.valor > 0);
  }, [pagos]);

  const pagosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return pagos;
    return pagos.filter((pago) => pago.concepto.toLowerCase().includes(termino));
  }, [pagos, busqueda]);

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      {/* Header: search and actions */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight dark:text-white">Payments</h1>
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
                New payment
              </SheetTrigger>
              <SheetContent className="dark inset-y-4 right-4 h-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-sidebar p-0 shadow-2xl">
                <SheetHeader className="border-b p-5">
                  <SheetTitle>
                    {pagoEnEdicion ? "Edit payment" : "Register fixed payment"}
                  </SheetTitle>
                  <SheetDescription>
                    {pagoEnEdicion
                      ? "Update the amount, concept, day or recurrence of this payment."
                      : "Enter the amount, concept and the day of the month when it is paid. Recurrence defines how often it repeats."}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-5">
                  <FieldGroup>
                    <Field>
                      <div className="flex items-center justify-between gap-2">
                        <FieldLabel htmlFor="pago-concepto">Concept</FieldLabel>
                        {logo ? (
                          <img
                            src={logo}
                            alt=""
                            className="size-6 rounded-lg object-cover"
                          />
                        ) : concepto.trim() ? (
                          <Isotipo concepto={concepto} compacto />
                        ) : null}
                      </div>
                      <Input
                        id="pago-concepto"
                        value={concepto}
                        onChange={(evento) => setConcepto(evento.target.value)}
                        placeholder="Rent, internet, hosting…"
                        maxLength={120}
                        disabled={guardando}
                      />
                      <FieldDescription>
                        The icon is generated automatically from the concept initials unless you upload a logo.
                      </FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel>Logo / icon</FieldLabel>
                      {logo ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={logo}
                            alt="Payment logo preview"
                            className="size-16 rounded-lg border object-cover"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setLogo(null)}
                            disabled={guardando}
                          >
                            <XIcon data-icon="inline-start" />
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor="pago-logo"
                          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input py-6 text-center transition-colors hover:border-brand-green hover:bg-brand-green/[0.03]"
                        >
                          <ImagePlusIcon className="size-5 text-muted-foreground dark:text-white/60" />
                          <span className="text-sm text-muted-foreground dark:text-white/60">
                            Click to upload an image
                          </span>
                          <span className="text-xs text-muted-foreground dark:text-white/40">
                            PNG, JPG or SVG · max 2 MB
                          </span>
                          <input
                            id="pago-logo"
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(evento) => manejarLogo(evento.target.files?.[0] ?? null)}
                            disabled={guardando}
                          />
                        </label>
                      )}
                      <FieldDescription>
                        Optional. If you do not upload one, an icon will be generated from the concept.
                      </FieldDescription>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="pago-monto">Amount</FieldLabel>
                      <div className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground dark:text-white/80"
                        >
                          $
                        </span>
                        <Input
                          id="pago-monto"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={monto}
                          onChange={(evento) => setMonto(evento.target.value)}
                          placeholder="0.00"
                          className="pl-6 tabular-nums"
                          disabled={guardando}
                        />
                      </div>
                      <FieldDescription>Amount in Mexican pesos (MXN).</FieldDescription>
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="pago-dia">Payment day</FieldLabel>
                        <select
                          id="pago-dia"
                          className={CLASE_SELECT}
                          value={diaPago}
                          onChange={(evento) => setDiaPago(evento.target.value)}
                          disabled={guardando}
                        >
                          {DIAS.map((dia) => (
                            <option key={dia} value={dia}>
                              Day {dia}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field>
                        <FieldLabel htmlFor="pago-recurrencia">Recurrence</FieldLabel>
                        <select
                          id="pago-recurrencia"
                          className={CLASE_SELECT}
                          value={recurrencia}
                          onChange={(evento) => setRecurrencia(evento.target.value)}
                          disabled={guardando}
                        >
                          {RECURRENCIAS.map((opcion) => (
                            <option key={opcion} value={opcion}>
                              {opcion}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </FieldGroup>
                </div>

                <SheetFooter className="border-t p-5">
                  <Button variant="ghost" onClick={() => setAbierto(false)} disabled={guardando}>
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
                    Save payment
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <div className="relative max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground dark:text-white/80" />
          <Input
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Search payment…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          titulo="Monthly total"
          valor={`$${importe(metricas.total)}`}
          descripcion={`${metricas.cantidad} payment${metricas.cantidad === 1 ? "" : "s"} registered`}
          icono={<TrendingDownIcon />}
          destacado
        />
        <MetricCard
          titulo="Next payment"
          valor={metricas.proximo ? metricas.proximo.concepto : "—"}
          descripcion={metricas.proximo ? `Day ${metricas.proximo.dia_pago} of the month` : "No payments registered"}
          icono={<CalendarDaysIcon />}
        />
        <MetricCard
          titulo="Payment count"
          valor={String(metricas.cantidad)}
          descripcion="Active fixed payments"
          icono={<CreditCardIcon />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DonutCard distribucion={distribucion} total={metricas.total} />
        <BarChartCard pagos={pagos} />
      </div>

      {/* Payments table */}
      <Card>
        <CardHeader>
          <CardTitle>Registered payments</CardTitle>
          <CardDescription>
            Recurring payments of your organization. Filter by concept using the search bar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pagosFiltrados.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CreditCardIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {pagos.length === 0 ? "No payments yet" : "No results"}
                </EmptyTitle>
                <EmptyDescription>
                  {pagos.length === 0
                    ? "Register your first fixed payment to see it in the table."
                    : "No payment matches your search."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Concept</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Payment day</TableHead>
                    <TableHead>Recurrence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagosFiltrados.map((pago) => (
                    <TableRow key={pago.id} className="last:border-0">
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          {pago.logo ? (
                            <img
                              src={pago.logo}
                              alt=""
                              className="size-9 rounded-lg border object-cover"
                            />
                          ) : (
                            <Isotipo concepto={pago.concepto} />
                          )}
                          <span
                            className="truncate font-medium"
                            title={pago.concepto}
                          >
                            {pago.concepto}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${importe(pago.monto)}{" "}
                        <span className="text-xs text-muted-foreground dark:text-white/80">{pago.moneda}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex size-7 items-center justify-center rounded-md bg-brand-green text-xs font-semibold text-white tabular-nums">
                            {pago.dia_pago}
                          </span>
                          <span className="text-xs text-muted-foreground dark:text-white/80">of the month</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{pago.recurrencia}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-brand-green text-white border-0 hover:bg-brand-green/90">
                          Active
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => abrirEdicion(pago)}
                            aria-label={`Edit ${pago.concepto}`}
                          >
                            <PencilIcon />
                          </Button>
                          {eliminandoId === pago.id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => eliminar(pago)}
                              className="text-destructive hover:bg-destructive hover:text-white"
                            >
                              <Trash2Icon data-icon="inline-start" />
                              Confirm
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => eliminar(pago)}
                              aria-label={`Delete ${pago.concepto}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2Icon />
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
  );
}

// Simple metric card with title, value and description.
function MetricCard({
  titulo,
  valor,
  descripcion,
  icono,
  destacado,
}: {
  titulo: string;
  valor: string;
  descripcion: string;
  icono: React.ReactNode;
  destacado?: boolean;
}) {
  return (
    <Card className={cn(destacado && "border-brand-green/30 bg-brand-green/[0.03]")}>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground dark:text-white/80">
            {titulo}
          </span>
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              destacado ? "bg-brand-green text-white" : "bg-muted text-muted-foreground dark:text-white/80",
            )}
          >
            {icono}
          </span>
        </div>
        <p
          className={cn(
            "truncate text-2xl font-semibold tabular-nums",
            destacado && "text-brand-green dark:text-white",
          )}
          title={valor}
        >
          {valor}
        </p>
        <p className="text-xs text-muted-foreground dark:text-white/80">{descripcion}</p>
      </CardContent>
    </Card>
  );
}

// Donut chart showing the payment distribution by recurrence amount. Each segment
// is an arc of the circle proportional to its share of the total amount, with a
// legend that includes the amount and percentage.
function DonutCard({
  distribucion,
  total,
}: {
  distribucion: { nombre: string; valor: number; monto: number; color: string }[];
  total: number;
}) {
  const radio = 70;
  const circunferencia = 2 * Math.PI * radio;

  const longitudes = distribucion.map((segmento) => {
    const proporcion = total > 0 ? segmento.monto / total : 0;
    return proporcion * circunferencia;
  });

  const segmentos = distribucion.map((segmento, indice) => ({
    ...segmento,
    longitud: longitudes[indice] ?? 0,
    offset: longitudes.slice(0, indice).reduce((suma, longitud) => suma + longitud, 0),
  }));

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Distribution by recurrence</CardTitle>
            <CardDescription className="mt-1">Share of total amount per recurrence.</CardDescription>
          </div>
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-white">
            <PieChartIcon className="size-4" />
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="relative flex shrink-0 items-center justify-center">
            <svg width="170" height="170" viewBox="0 0 170 170" className="-rotate-90">
              {/* Background track */}
              <circle
                cx="85"
                cy="85"
                r={radio}
                fill="none"
                stroke="oklch(0.922 0 0 / 0.4)"
                strokeWidth="18"
                className="dark:stroke-white/10"
              />
              {segmentos.map((segmento) => (
                <circle
                  key={segmento.nombre}
                  cx="85"
                  cy="85"
                  r={radio}
                  fill="none"
                  stroke={segmento.color}
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(segmento.longitud - 4, 0)} ${circunferencia}`}
                  strokeDashoffset={-segmento.offset}
                  style={{ transition: "stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease" }}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">${importe(total)}</span>
              <span className="text-xs text-muted-foreground dark:text-white/60">total</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            {segmentos.map((segmento) => {
              const porcentaje = total > 0 ? Math.round((segmento.monto / total) * 100) : 0;
              return (
                <div key={segmento.nombre} className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segmento.color }}
                  />
                  <span className="truncate text-sm dark:text-white/90">{segmento.nombre}</span>
                  <span className="ml-auto text-sm font-medium tabular-nums">
                    ${importe(segmento.monto)}
                  </span>
                  <span className="w-10 text-right text-xs text-muted-foreground dark:text-white/60 tabular-nums">
                    {porcentaje}%
                  </span>
                </div>
              );
            })}
            {segmentos.length === 0 ? (
              <span className="text-center text-sm text-muted-foreground dark:text-white/60">
                No data
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Horizontal bar chart showing the largest individual payments by amount, sorted
// from highest to lowest. Helps identify where the biggest expenses are.
function BarChartCard({ pagos }: { pagos: PagoGuardado[] }) {
  const topPagos = useMemo(
    () => [...pagos].sort((a, b) => b.monto - a.monto).slice(0, 6),
    [pagos],
  );
  const maxMonto = Math.max(...topPagos.map((p) => p.monto), 0);

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Top payments by amount</CardTitle>
            <CardDescription className="mt-1">Largest fixed payments registered.</CardDescription>
          </div>
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-white">
            <BarChart3Icon className="size-4" />
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {topPagos.map((pago) => {
            const proporcion = maxMonto > 0 ? (pago.monto / maxMonto) * 100 : 0;
            return (
              <div key={pago.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm dark:text-white/90">{pago.concepto}</span>
                  <span className="text-sm font-semibold tabular-nums dark:text-white">
                    ${importe(pago.monto)}
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
          {topPagos.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground dark:text-white/60">
              No data
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// Automatic icon: initials are generated from the concept, without external
// images or extra configuration.
function Isotipo({ concepto, compacto }: { concepto: string; compacto?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-brand-green font-semibold text-white",
        compacto ? "size-6 text-[10px]" : "size-9 text-xs",
      )}
    >
      {iniciales(concepto)}
    </span>
  );
}

function iniciales(concepto: string) {
  const palabras = concepto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

function importe(valor: number) {
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}
