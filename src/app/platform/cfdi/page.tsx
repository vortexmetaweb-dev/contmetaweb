import { Suspense } from "react";
import { connection } from "next/server";

import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

import { CfdiCliente, type CfdiGuardado } from "./cfdi-cliente";

export default function CfdiPage() {
  return (
    <Suspense fallback={<CfdiEsqueleto />}>
      <CfdiContenido />
    </Suspense>
  );
}

async function CfdiContenido() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let cfdis: CfdiGuardado[] = [];

  if (user) {
    const { data } = await supabase
      .from("cfdi")
      .select(
        "id, uuid_fiscal, serie, folio, fecha, tipo_comprobante, moneda, total, emisor_nombre, receptor_nombre, creado_en, xml, pdf, relacionado_id",
      )
      .order("creado_en", { ascending: false })
      .limit(100);

    cfdis = (data ?? []) as CfdiGuardado[];
  }

  return <CfdiCliente cfdis={cfdis} />;
}

function CfdiEsqueleto() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-14">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
