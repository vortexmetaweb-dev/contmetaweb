import { Suspense } from "react";
import { connection } from "next/server";

import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

import { IngresosCliente, type IngresoGuardado } from "./ingresos-cliente";

export default function IngresosPage() {
  return (
    <Suspense fallback={<IngresosEsqueleto />}>
      <IngresosContenido />
    </Suspense>
  );
}

async function IngresosContenido() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let ingresos: IngresoGuardado[] = [];

  if (user) {
    const { data } = await supabase
      .from("ingresos")
      .select("id, concepto, monto, moneda, fecha_ingreso, origen, cliente, logo, creado_en")
      .order("fecha_ingreso", { ascending: false })
      .limit(300);

    ingresos = (data ?? []) as IngresoGuardado[];
  }

  return <IngresosCliente ingresos={ingresos} />;
}

function IngresosEsqueleto() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      <Skeleton className="h-9 w-40 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
