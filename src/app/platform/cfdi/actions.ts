"use server";

import { revalidatePath } from "next/cache";

import { numeroOpcional, validarCfdi } from "@/lib/cfdi/validar";
import { createClient } from "@/lib/supabase/server";

export type GuardarResultado = { ok: true } | { ok: false; mensaje: string };

// Guarda el CFDI que envía el navegador. Primero revalida los datos en el
// servidor y después los persiste dentro de la organización del usuario
// (ESPECIFICACIONES.md, secciones 3.4, 3.5 y 3.6).
export async function guardarCfdi(entrada: unknown): Promise<GuardarResultado> {
  const validado = validarCfdi(entrada);
  if (!validado.ok) {
    return { ok: false, mensaje: validado.mensaje };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, mensaje: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const { data: organizacion, error: errorOrganizacion } = await supabase.rpc(
    "mi_organizacion",
  );

  if (errorOrganizacion || typeof organizacion !== "string") {
    return { ok: false, mensaje: "No se pudo preparar tu organización." };
  }

  const cfdi = validado.datos;

  // Cuando el complemento se sube desde el detalle de una factura, el navegador
  // envía el id de esa factura para dejarlo vinculado.
  const bruto = entrada as Record<string, unknown>;
  const relacionadoId =
    typeof bruto.relacionadoId === "string" ? bruto.relacionadoId.trim() : "";

  const { error } = await supabase.from("cfdi").insert({
    organizacion_id: organizacion,
    relacionado_id: relacionadoId || null,
    uuid_fiscal: cfdi.timbre?.uuid ?? null,
    version: cfdi.version,
    serie: cfdi.serie || null,
    folio: cfdi.folio || null,
    fecha: cfdi.fecha || null,
    tipo_comprobante: cfdi.tipoDeComprobante,
    metodo_pago: cfdi.metodoPago || null,
    forma_pago: cfdi.formaPago || null,
    moneda: cfdi.moneda,
    tipo_cambio: numeroOpcional(cfdi.tipoCambio),
    lugar_expedicion: cfdi.lugarExpedicion || null,
    subtotal: numeroOpcional(cfdi.subtotal),
    descuento: numeroOpcional(cfdi.descuento),
    total: numeroOpcional(cfdi.total),
    emisor_rfc: cfdi.emisor.rfc,
    emisor_nombre: cfdi.emisor.nombre,
    receptor_rfc: cfdi.receptor.rfc,
    receptor_nombre: cfdi.receptor.nombre,
    uso_cfdi: cfdi.receptor.usoCfdi || null,
    datos: cfdi,
    xml: validado.xml,
    pdf: validado.pdf,
    creado_por: user.id,
  });

  if (error) {
    console.error("[CFDI] Error al guardar:", error);

    // El CFDI ya estaba registrado. En vez de fallar, completamos la fila
    // existente con lo que falte: así se puede adjuntar después el PDF de un
    // complemento que se subió antes sin él.
    const uuid = cfdi.timbre?.uuid;
    if (error.code === "23505" && uuid) {
      const cambios: Record<string, string> = {};
      if (validado.pdf) cambios.pdf = validado.pdf;
      if (relacionadoId) cambios.relacionado_id = relacionadoId;

      if (Object.keys(cambios).length > 0) {
        const { error: errorActualizar } = await supabase
          .from("cfdi")
          .update(cambios)
          .eq("organizacion_id", organizacion)
          .eq("uuid_fiscal", uuid);

        if (!errorActualizar) {
          revalidatePath("/platform/cfdi");
          return { ok: true };
        }
        console.error("[CFDI] Error al actualizar:", errorActualizar);
      }

      return { ok: false, mensaje: "Este CFDI ya está registrado en tu organización." };
    }

    return {
      ok: false,
      mensaje: `No se pudo guardar el CFDI (${error.code}): ${error.message}`,
    };
  }

  revalidatePath("/platform/cfdi");
  return { ok: true };
}
