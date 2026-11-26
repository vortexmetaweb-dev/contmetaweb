"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  PieChartIcon,
  TrendingUpIcon,
  WalletIcon,
} from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type IngresoDashboard = {
  id: string;
  concepto: string;
  monto: number;
  fecha_ingreso: string;
  origen: string;
};

type PagoDashboard = {
  id: string;
  concepto: string;
  monto: number;
  dia_pago: number;
  recurrencia: string;
};

type Props = {
  ingresos: IngresoDashboard[];
  pagos: PagoDashboard[];
};

function formatoMoneda(monto: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(monto);
}

function formatoMonedaCorto(valor: number) {
  if (valor >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1)}M`;
  if (valor >= 1_000) return `$${(valor / 1_000).toFixed(valor >= 10_000 ? 0 : 1)}k`;
  return `$${valor.toFixed(0)}`;
}

function parsearFechaLocal(fechaStr: string) {
  const [anio, mes, dia] = fechaStr.slice(0, 10).split("-").map(Number);
  return new Date(anio, mes - 1, dia);
}

const NOMBRES_MESES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DIAS_SEMANA = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Intervalo en meses para cada tipo de recurrencia de pagos.
const RECURRENCIA_MESES: Record<string, number> = {
  Monthly: 1,
  Bimonthly: 2,
  Quarterly: 3,
  Semiannual: 6,
  Annual: 12,
};

export function DashboardCliente({ ingresos, pagos }: Props) {
  const hoy = useMemo(() => new Date(), []);

  // --- Métricas del mes actual con tendencia vs mes anterior ---
  const metricas = useMemo(() => {
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();
    const fechaMesAnterior = new Date(anioActual, mesActual - 1, 1);
    const anioAnterior = fechaMesAnterior.getFullYear();
    const mesAnterior = fechaMesAnterior.getMonth();

    // Ingresos del mes actual y anterior por fecha real.
    const ingresosMesActual = ingresos
      .filter((i) => {
        const f = parsearFechaLocal(i.fecha_ingreso);
        return f.getFullYear() === anioActual && f.getMonth() === mesActual;
      })
      .reduce((s, i) => s + i.monto, 0);
    const ingresosMesAnterior = ingresos
      .filter((i) => {
        const f = parsearFechaLocal(i.fecha_ingreso);
        return f.getFullYear() === anioAnterior && f.getMonth() === mesAnterior;
      })
      .reduce((s, i) => s + i.monto, 0);

    // Pagos del mes actual y anterior según recurrencia (offset 0 y 1).
    const pagosMesActual = pagos.reduce((s, p) => {
      if (p.recurrencia === "One-time") return s;
      return 0 % (RECURRENCIA_MESES[p.recurrencia] ?? 1) === 0 ? s + p.monto : s;
    }, 0);
    const pagosMesAnterior = pagos.reduce((s, p) => {
      if (p.recurrencia === "One-time") return s;
      return 1 % (RECURRENCIA_MESES[p.recurrencia] ?? 1) === 0 ? s + p.monto : s;
    }, 0);

    const transaccionesActual = ingresos.filter((i) => {
      const f = parsearFechaLocal(i.fecha_ingreso);
      return f.getFullYear() === anioActual && f.getMonth() === mesActual;
    }).length;
    const transaccionesAnterior = ingresos.filter((i) => {
      const f = parsearFechaLocal(i.fecha_ingreso);
      return f.getFullYear() === anioAnterior && f.getMonth() === mesAnterior;
    }).length;

    const balanceActual = ingresosMesActual - pagosMesActual;
    const balanceAnterior = ingresosMesAnterior - pagosMesAnterior;

    const variacion = (actual: number, anterior: number) => {
      if (anterior === 0) return actual > 0 ? 100 : 0;
      return ((actual - anterior) / Math.abs(anterior)) * 100;
    };

    return {
      ingresos: ingresosMesActual,
      ingresosAnterior: ingresosMesAnterior,
      ingresosVariacion: variacion(ingresosMesActual, ingresosMesAnterior),
      pagos: pagosMesActual,
      pagosAnterior: pagosMesAnterior,
      pagosVariacion: variacion(pagosMesActual, pagosMesAnterior),
      balance: balanceActual,
      balanceAnterior: balanceAnterior,
      balanceVariacion: variacion(balanceActual, balanceAnterior),
      transacciones: transaccionesActual,
      transaccionesAnterior: transaccionesAnterior,
      transaccionesVariacion: variacion(transaccionesActual, transaccionesAnterior),
    };
  }, [ingresos, pagos, hoy]);

  // --- Serie mensual de ingresos vs pagos (últimos 12 meses) ---
  // Los ingresos se agrupan por su fecha real. Los pagos se distribuyen
  // según su recurrencia, anclando el mes actual como referencia.
  const serieMensual = useMemo(() => {
    const meses: { etiqueta: string; ingresos: number; pagos: number }[] = [];
    const mesActual = hoy.getMonth();

    for (let i = 11; i >= 0; i--) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const anio = fecha.getFullYear();
      const mes = fecha.getMonth();
      const offsetDesdeActual = ((mes - mesActual) % 12 + 12) % 12; // 0 = actual, 11 = hace 11 meses

      const ingresosMes = ingresos
        .filter((i) => {
          const f = parsearFechaLocal(i.fecha_ingreso);
          return f.getFullYear() === anio && f.getMonth() === mes;
        })
        .reduce((s, i) => s + i.monto, 0);

      // Pagos fijos: se cobran según su recurrencia, anclados al mes actual.
      // Monthly → cada mes; Bimonthly → cada 2 meses; Quarterly → cada 3;
      // Semiannual → cada 6; Annual → una vez al año; One-time → no se considera.
      const pagosMes = pagos.reduce((suma, p) => {
        if (p.recurrencia === "One-time") return suma;
        const intervalo = RECURRENCIA_MESES[p.recurrencia] ?? 1;
        // El pago ocurre en este mes si el offset es múltiplo del intervalo
        // y el offset está dentro del rango visible (siempre lo está).
        // Para que un pago anual no aparezca en todos los meses múltiplos de 12,
        // limitamos: solo se muestra si offset % intervalo === 0.
        return offsetDesdeActual % intervalo === 0 ? suma + p.monto : suma;
      }, 0);

      meses.push({
        etiqueta: NOMBRES_MESES[mes],
        ingresos: ingresosMes,
        pagos: pagosMes,
      });
    }
    return meses;
  }, [ingresos, pagos, hoy]);

  // --- Distribución de ingresos por origen del mes actual (para el donut) ---
  const distribucionOrigen = useMemo(() => {
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();
    const ingresosMes = ingresos.filter((i) => {
      const f = parsearFechaLocal(i.fecha_ingreso);
      return f.getFullYear() === anioActual && f.getMonth() === mesActual;
    });
    const conFactura = ingresosMes
      .filter((i) => i.origen === "Invoice")
      .reduce((s, i) => s + i.monto, 0);
    const manual = ingresosMes
      .filter((i) => i.origen !== "Invoice")
      .reduce((s, i) => s + i.monto, 0);
    return [
      { nombre: "Invoice", monto: conFactura, color: "#1D6E47" },
      { nombre: "Manual", monto: manual, color: "#6B7280" },
    ].filter((s) => s.monto > 0);
  }, [ingresos, hoy]);

  // --- Top fuentes de ingreso (para barras) ---
  const topConceptos = useMemo(() => {
    const agrupado = new Map<string, number>();
    for (const i of ingresos) {
      agrupado.set(i.concepto, (agrupado.get(i.concepto) ?? 0) + i.monto);
    }
    return [...agrupado.entries()]
      .map(([concepto, monto]) => ({ concepto, monto }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 6);
  }, [ingresos]);

  // --- Heatmap: actividad de ingresos en el mes actual ---
  const heatmap = useMemo(() => {
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth();
    const primerDiaMes = new Date(anioActual, mesActual, 1);
    const ultimoDiaMes = new Date(anioActual, mesActual + 1, 0);

    // Día de la semana del primer día (0 = domingo, 1 = lunes...).
    // Queremos que la semana empiece en lunes: lunes = 0.
    const offsetPrimerDia = (primerDiaMes.getDay() + 6) % 7;
    const diasMes = ultimoDiaMes.getDate();

    // Calculamos el número de semanas necesarias.
    const semanas = Math.ceil((offsetPrimerDia + diasMes) / 7);

    const celdas: { fecha: Date | null; monto: number; etiqueta: string }[] = [];

    // Celdas vacías antes del primer día del mes.
    for (let i = 0; i < offsetPrimerDia; i++) {
      celdas.push({ fecha: null, monto: 0, etiqueta: "" });
    }

    // Días del mes.
    for (let dia = 1; dia <= diasMes; dia++) {
      const fechaCelda = new Date(anioActual, mesActual, dia);
      const monto = ingresos
        .filter((i) => {
          const f = parsearFechaLocal(i.fecha_ingreso);
          return (
            f.getFullYear() === anioActual &&
            f.getMonth() === mesActual &&
            f.getDate() === dia
          );
        })
        .reduce((suma, i) => suma + i.monto, 0);
      celdas.push({
        fecha: fechaCelda,
        monto,
        etiqueta: `${mesActual + 1}/${dia}`,
      });
    }

    // Rellenar el final con celdas vacías para completar la última semana.
    const celdasTotales = semanas * 7;
    while (celdas.length < celdasTotales) {
      celdas.push({ fecha: null, monto: 0, etiqueta: "" });
    }

    const maximo = Math.max(...celdas.map((c) => c.monto), 1);
    return { celdas, maximo, semanas };
  }, [ingresos, hoy]);

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight dark:text-white">Dashboard</h1>
          <p className="text-sm text-muted-foreground dark:text-white/60">
            Financial overview of your organization.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-border/60 bg-muted/40 px-3 py-1 text-muted-foreground dark:border-white/15 dark:text-white/70">
          <CalendarDaysIcon data-icon="inline-start" />
          {hoy.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Badge>
      </div>

      {/* Métricas del mes actual */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaMetrica
          titulo="Income this month"
          valor={formatoMoneda(metricas.ingresos)}
          icono={<TrendingUpIcon className="size-4" />}
          color="green"
          tendencia={metricas.ingresosVariacion}
        />
        <TarjetaMetrica
          titulo="Payments this month"
          valor={formatoMoneda(metricas.pagos)}
          icono={<WalletIcon className="size-4" />}
          color="gray"
          tendencia={metricas.pagosVariacion}
          invertirTendencia
        />
        <TarjetaMetrica
          titulo="Net balance"
          valor={formatoMoneda(metricas.balance)}
          icono={metricas.balance >= 0 ? <ArrowUpRightIcon className="size-4" /> : <ArrowDownRightIcon className="size-4" />}
          color={metricas.balance >= 0 ? "green" : "gray"}
          tendencia={metricas.balanceVariacion}
        />
        <TarjetaMetrica
          titulo="Transactions"
          valor={String(metricas.transacciones)}
          icono={<BarChart3Icon className="size-4" />}
          color="green"
          tendencia={metricas.transaccionesVariacion}
        />
      </div>

      {/* Gráficas fila 1: Multiple Line Chart + Donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 dark:text-white">
                <TrendingUpIcon className="size-4 text-brand-green" />
                Income vs payments
              </CardTitle>
              <CardDescription className="dark:text-white/60">
                Last 12 months.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-brand-green" />
                <span className="text-muted-foreground dark:text-white/60">Income</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-muted-foreground/60 dark:bg-white/40" />
                <span className="text-muted-foreground dark:text-white/60">Payments</span>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <MultipleLineChart serie={serieMensual} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-5 p-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base dark:text-white">
                  <PieChartIcon className="size-4 text-brand-green" />
                  Income by origin
                </CardTitle>
                <CardDescription className="mt-1 dark:text-white/60">
                  Share of this month per source.
                </CardDescription>
              </div>
            </div>
            <DonutChart distribucion={distribucionOrigen} total={metricas.ingresos} />
          </CardContent>
        </Card>
      </div>

      {/* Gráficas fila 2: Heatmap + Top fuentes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <CalendarDaysIcon className="size-4 text-brand-green" />
              Income activity
            </CardTitle>
            <CardDescription className="dark:text-white/60">
              This month. Intensity reflects the amount collected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Heatmap
              celdas={heatmap.celdas}
              maximo={heatmap.maximo}
              semanas={heatmap.semanas}
              nombreMes={hoy.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 dark:text-white">
              <BarChart3Icon className="size-4 text-brand-green" />
              Top income sources
            </CardTitle>
            <CardDescription className="dark:text-white/60">
              Concepts with the highest accumulated amount.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarrasHorizontales conceptos={topConceptos} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de métrica
// ---------------------------------------------------------------------------
function TarjetaMetrica({
  titulo,
  valor,
  icono,
  color,
  tendencia,
  invertirTendencia = false,
}: {
  titulo: string;
  valor: string;
  icono: React.ReactNode;
  color: "green" | "gray";
  tendencia?: number;
  invertirTendencia?: boolean;
}) {
  // Para pagos, una tendencia positiva (subida) es mala → se muestra en gris/rojo.
  // Para ingresos y balance, una tendencia positiva es buena → verde.
  const tendenciaPositiva = invertirTendencia ? tendencia! <= 0 : tendencia! >= 0;
  const flecha = tendencia! >= 0 ? <ArrowUpRightIcon className="size-3" /> : <ArrowDownRightIcon className="size-3" />;

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            color === "green"
              ? "bg-brand-green/10 text-brand-green dark:bg-brand-green/20 dark:text-white"
              : "bg-muted/60 text-muted-foreground dark:bg-white/10 dark:text-white/70",
          )}
        >
          {icono}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground dark:text-white/60">{titulo}</p>
          <p className="text-xl font-semibold tabular-nums dark:text-white">{valor}</p>
          {tendencia !== undefined ? (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-0.5 text-xs tabular-nums",
                tendenciaPositiva ? "text-brand-green dark:text-green-400" : "text-red-500 dark:text-red-400",
              )}
            >
              {flecha}
              <span>{Math.abs(tendencia).toFixed(1)}%</span>
              <span className="text-muted-foreground dark:text-white/40">vs last month</span>
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Multiple Line Chart: ingresos vs pagos
// ---------------------------------------------------------------------------
function MultipleLineChart({
  serie,
}: {
  serie: { etiqueta: string; ingresos: number; pagos: number }[];
}) {
  const [hoverIndice, setHoverIndice] = useState<number | null>(null);

  const ancho = 700;
  const alto = 260;
  const padding = { arriba: 16, derecha: 16, abajo: 28, izquierda: 56 };

  const maximo = Math.max(...serie.flatMap((p) => [p.ingresos, p.pagos]), 1);
  const maximoEscala = Math.ceil(maximo / 1000) * 1000 || maximo;

  const anchoUtil = ancho - padding.izquierda - padding.derecha;
  const altoUtil = alto - padding.arriba - padding.abajo;
  const paso = serie.length > 1 ? anchoUtil / (serie.length - 1) : 0;

  const puntosIngresos = serie.map((p, i) => ({
    x: padding.izquierda + i * paso,
    y: padding.arriba + altoUtil - (p.ingresos / maximoEscala) * altoUtil,
    ...p,
  }));
  const puntosPagos = serie.map((p, i) => ({
    x: padding.izquierda + i * paso,
    y: padding.arriba + altoUtil - (p.pagos / maximoEscala) * altoUtil,
    ...p,
  }));

  const lineaIngresos = curvaSuave(puntosIngresos);
  const lineaPagos = curvaSuave(puntosPagos);

  const grid = Array.from({ length: 5 }, (_, i) => {
    const valor = (maximoEscala / 4) * i;
    return {
      valor,
      y: padding.arriba + altoUtil - (valor / maximoEscala) * altoUtil,
      base: i === 0,
    };
  });

  const puntoHover = hoverIndice !== null ? serie[hoverIndice] : null;
  const hoverX = hoverIndice !== null ? padding.izquierda + hoverIndice * paso : 0;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-64 w-full select-none"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIndice(null)}
      >
        {/* Grid */}
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

        {/* Línea de pagos */}
        <path
          d={lineaPagos}
          fill="none"
          stroke="oklch(0.55 0 0)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-muted-foreground/60 dark:text-white/40"
        />

        {/* Línea de ingresos */}
        <path
          d={lineaIngresos}
          fill="none"
          stroke="#1D6E47"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Línea vertical de hover */}
        {hoverIndice !== null ? (
          <line
            x1={hoverX}
            y1={padding.arriba}
            x2={hoverX}
            y2={padding.arriba + altoUtil}
            stroke="#1D6E47"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.4"
          />
        ) : null}

        {/* Puntos */}
        {puntosIngresos.map((p, i) => (
          <circle
            key={`i-${i}`}
            cx={p.x}
            cy={p.y}
            r={hoverIndice === i ? 5 : 3}
            fill="#1D6E47"
            stroke="white"
            strokeWidth="2"
            style={{ opacity: hoverIndice === null || hoverIndice === i ? 1 : 0.3, transition: "r 0.15s" }}
          />
        ))}
        {puntosPagos.map((p, i) => (
          <circle
            key={`p-${i}`}
            cx={p.x}
            cy={p.y}
            r={hoverIndice === i ? 4 : 2.5}
            fill="oklch(0.55 0 0)"
            stroke="white"
            strokeWidth="1.5"
            style={{ opacity: hoverIndice === null || hoverIndice === i ? 1 : 0.3, transition: "r 0.15s" }}
          />
        ))}

        {/* Etiquetas eje X */}
        {serie.map((p, i) => (
          <text
            key={i}
            x={padding.izquierda + i * paso}
            y={alto - 8}
            fontSize="10"
            className="fill-muted-foreground dark:fill-white/50"
            textAnchor="middle"
          >
            {p.etiqueta}
          </text>
        ))}

        {/* Zonas de hover */}
        {serie.map((_, i) => (
          <rect
            key={`h-${i}`}
            x={padding.izquierda + i * paso - paso / 2}
            y={padding.arriba}
            width={paso}
            height={altoUtil}
            fill="transparent"
            onMouseEnter={() => setHoverIndice(i)}
          />
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
          <p className="mb-1 text-[11px] font-medium text-muted-foreground dark:text-white/60">
            {puntoHover.etiqueta}
          </p>
          <div className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-brand-green" />
            <span className="text-muted-foreground dark:text-white/70">Income</span>
            <span className="ml-auto font-semibold tabular-nums text-brand-green dark:text-white">
              {formatoMoneda(puntoHover.ingresos)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-muted-foreground/60 dark:bg-white/40" />
            <span className="text-muted-foreground dark:text-white/70">Payments</span>
            <span className="ml-auto font-semibold tabular-nums dark:text-white">
              {formatoMoneda(puntoHover.pagos)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function curvaSuave(puntos: { x: number; y: number }[]): string {
  if (puntos.length === 0) return "";
  if (puntos.length === 1) return `M ${puntos[0].x.toFixed(1)} ${puntos[0].y.toFixed(1)}`;

  let ruta = `M ${puntos[0].x.toFixed(1)} ${puntos[0].y.toFixed(1)}`;
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1] ?? puntos[i];
    const p1 = puntos[i];
    const p2 = puntos[i + 1];
    const p3 = puntos[i + 2] ?? p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ruta += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return ruta;
}

// ---------------------------------------------------------------------------
// Donut Chart con contenido interno
// ---------------------------------------------------------------------------
function DonutChart({
  distribucion,
  total,
}: {
  distribucion: { nombre: string; monto: number; color: string }[];
  total: number;
}) {
  const radio = 70;
  const circunferencia = 2 * Math.PI * radio;

  const segmentos = distribucion.map((segmento, indice) => {
    const proporcion = total > 0 ? segmento.monto / total : 0;
    const longitud = proporcion * circunferencia;
    const offset = distribucion
      .slice(0, indice)
      .reduce((suma, s) => suma + (total > 0 ? s.monto / total : 0) * circunferencia, 0);
    return { ...segmento, longitud, offset };
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex items-center justify-center">
        <svg width="180" height="180" viewBox="0 0 180 180" className="-rotate-90">
          <circle
            cx="90"
            cy="90"
            r={radio}
            fill="none"
            stroke="oklch(0.922 0 0 / 0.4)"
            strokeWidth="20"
            className="dark:stroke-white/10"
          />
          {segmentos.map((segmento) => (
            <circle
              key={segmento.nombre}
              cx="90"
              cy="90"
              r={radio}
              fill="none"
              stroke={segmento.color}
              strokeWidth="20"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(segmento.longitud - 4, 0)} ${circunferencia}`}
              strokeDashoffset={-segmento.offset}
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums dark:text-white">{formatoMoneda(total)}</span>
          <span className="text-xs text-muted-foreground dark:text-white/60">total</span>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        {segmentos.map((segmento) => {
          const porcentaje = total > 0 ? Math.round((segmento.monto / total) * 100) : 0;
          return (
            <div key={segmento.nombre} className="flex items-center gap-2.5">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segmento.color }}
              />
              <span className="truncate text-sm dark:text-white/90">{segmento.nombre}</span>
              <span className="ml-auto text-sm font-medium tabular-nums dark:text-white">
                {formatoMoneda(segmento.monto)}
              </span>
              <span className="w-10 text-right text-xs text-muted-foreground dark:text-white/60 tabular-nums">
                {porcentaje}%
              </span>
            </div>
          );
        })}
        {segmentos.length === 0 ? (
          <span className="text-center text-sm text-muted-foreground dark:text-white/60">No data</span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heatmap de actividad (estilo GitHub)
// ---------------------------------------------------------------------------
function Heatmap({
  celdas,
  maximo,
  semanas,
  nombreMes,
}: {
  celdas: { fecha: Date | null; monto: number; etiqueta: string }[];
  maximo: number;
  semanas: number;
  nombreMes: string;
}) {
  const [hoverCelda, setHoverCelda] = useState<number | null>(null);

  const tamanoCelda = 12;
  const gap = 3;

  const intensidad = (monto: number) => {
    if (monto <= 0) return 0;
    const proporcion = monto / maximo;
    return Math.min(Math.ceil(proporcion * 4), 4);
  };

  const colores = [
    "bg-muted/40 dark:bg-white/5",
    "bg-brand-green/20 dark:bg-brand-green/30",
    "bg-brand-green/40 dark:bg-brand-green/50",
    "bg-brand-green/70 dark:bg-brand-green/80",
    "bg-brand-green",
  ];

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center justify-between pl-8">
        <span className="text-xs font-medium text-muted-foreground dark:text-white/60">
          {nombreMes}
        </span>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground dark:text-white/50">
          <span>Less</span>
          {colores.map((c, i) => (
            <span key={i} className={cn("size-3 rounded-[2px]", c)} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between py-0.5">
          {DIAS_SEMANA.map((d, i) => (
            <span key={d} className="text-[10px] leading-[15px] text-muted-foreground dark:text-white/50">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${semanas}, ${tamanoCelda}px)`,
            gridTemplateRows: `repeat(7, ${tamanoCelda}px)`,
            gap: `${gap}px`,
            gridAutoFlow: "column",
          }}
        >
          {celdas.map((celda, i) => {
            if (celda.fecha === null) {
              return <div key={i} className="rounded-[2px] bg-transparent" />;
            }
            const nivel = intensidad(celda.monto);
            const activo = hoverCelda === i;
            return (
              <div
                key={i}
                className={cn("rounded-[2px] transition-colors", colores[nivel], activo && "ring-2 ring-brand-green ring-offset-1 dark:ring-offset-sidebar")}
                style={{ width: tamanoCelda, height: tamanoCelda }}
                onMouseEnter={() => setHoverCelda(i)}
                onMouseLeave={() => setHoverCelda(null)}
                title={`${celda.etiqueta}: ${formatoMoneda(celda.monto)}`}
              />
            );
          })}
        </div>
      </div>
      {hoverCelda !== null && celdas[hoverCelda]?.fecha !== null ? (
        <div className="text-xs text-muted-foreground dark:text-white/60">
          {celdas[hoverCelda].etiqueta} —{" "}
          <span className="font-medium tabular-nums text-brand-green dark:text-white">
            {formatoMoneda(celdas[hoverCelda].monto)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras horizontales: top fuentes de ingreso
// ---------------------------------------------------------------------------
function BarrasHorizontales({
  conceptos,
}: {
  conceptos: { concepto: string; monto: number }[];
}) {
  const maxMonto = Math.max(...conceptos.map((c) => c.monto), 0);

  if (conceptos.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground dark:text-white/60">
        No data
      </div>
    );
  }

  return (
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
                style={{ width: `${proporcion}%`, transition: "width 0.5s ease" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
