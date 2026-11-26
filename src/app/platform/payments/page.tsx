import { Suspense } from "react";
import { connection } from "next/server";

import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

import { PaymentsCliente, type PagoGuardado } from "./payments-cliente";

export default function PaymentsPage() {
  return (
    <Suspense fallback={<PaymentsEsqueleto />}>
      <PaymentsContenido />
    </Suspense>
  );
}

async function PaymentsContenido() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let pagos: PagoGuardado[] = [];

  if (user) {
    const { data } = await supabase
      .from("pagos")
      .select("id, concepto, monto, moneda, dia_pago, recurrencia, logo, creado_en")
      .order("creado_en", { ascending: false })
      .limit(200);

    pagos = (data ?? []) as PagoGuardado[];
  }

  return <PaymentsCliente pagos={pagos} />;
}

function PaymentsEsqueleto() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      <Skeleton className="h-9 w-40 rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
