import { Suspense } from "react";
import { connection } from "next/server";

import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

import { DashboardCliente } from "./dashboard-cliente";

export default function PlatformPage() {
  return (
    <Suspense fallback={<DashboardEsqueleto />}>
      <DashboardContenido />
    </Suspense>
  );
}

async function DashboardContenido() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let ingresos: {
    id: string;
    concepto: string;
    monto: number;
    fecha_ingreso: string;
    origen: string;
  }[] = [];
  let pagos: {
    id: string;
    concepto: string;
    monto: number;
    dia_pago: number;
    recurrencia: string;
  }[] = [];

  if (user) {
    const [resIngresos, resPagos] = await Promise.all([
      supabase
        .from("ingresos")
        .select("id, concepto, monto, fecha_ingreso, origen")
        .order("fecha_ingreso", { ascending: false })
        .limit(500),
      supabase
        .from("pagos")
        .select("id, concepto, monto, dia_pago, recurrencia")
        .limit(200),
    ]);

    ingresos = (resIngresos.data ?? []) as typeof ingresos;
    pagos = (resPagos.data ?? []) as typeof pagos;
  }

  return <DashboardCliente ingresos={ingresos} pagos={pagos} />;
}

function DashboardEsqueleto() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
