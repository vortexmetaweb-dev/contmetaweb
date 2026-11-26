"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type GuardarPagoResultado = { ok: true } | { ok: false; mensaje: string };

const RECURRENCIAS = ["Monthly", "Bimonthly", "Quarterly", "Semiannual", "Annual", "One-time"];
const MAX_CONCEPTO = 120;
// ~2 MB en base64 (los isotipos/logos suelen ser pequeños).
const MAX_LOGO = 2 * 1024 * 1024;

type PagoValidado = {
  concepto: string;
  monto: number;
  diaPago: number;
  recurrencia: string;
  logo: string | null;
};

// Revalida en el servidor lo que llega del navegador antes de persistirlo
// (ESPECIFICACIONES.md, secciones 3.4 y 3.5).
function validarPago(
  entrada: unknown,
): { ok: true; datos: PagoValidado } | { ok: false; mensaje: string } {
  if (typeof entrada !== "object" || entrada === null) {
    return { ok: false, mensaje: "No se recibieron datos del pago." };
  }

  const bruto = entrada as Record<string, unknown>;

  const concepto = typeof bruto.concepto === "string" ? bruto.concepto.trim() : "";
  if (!concepto) {
    return { ok: false, mensaje: "Enter the payment concept." };
  }
  if (concepto.length > MAX_CONCEPTO) {
    return { ok: false, mensaje: `The concept cannot exceed ${MAX_CONCEPTO} characters.` };
  }

  const monto = typeof bruto.monto === "number" ? bruto.monto : Number(bruto.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, mensaje: "The amount must be a number greater than zero." };
  }
  if (monto > 1_000_000_000) {
    return { ok: false, mensaje: "The amount is too high." };
  }

  const diaPago = typeof bruto.diaPago === "number" ? bruto.diaPago : Number(bruto.diaPago);
  if (!Number.isInteger(diaPago) || diaPago < 1 || diaPago > 31) {
    return { ok: false, mensaje: "The payment day must be between 1 and 31." };
  }

  const recurrencia = typeof bruto.recurrencia === "string" ? bruto.recurrencia.trim() : "";
  if (!RECURRENCIAS.includes(recurrencia)) {
    return { ok: false, mensaje: "The selected recurrence is not valid." };
  }

  // Logo opcional: debe ser una data URL de imagen o nulo/string vacío.
  const logoBruto = typeof bruto.logo === "string" ? bruto.logo.trim() : "";
  let logo: string | null = null;
  if (logoBruto) {
    if (!logoBruto.startsWith("data:image/")) {
      return { ok: false, mensaje: "The logo must be a valid image." };
    }
    if (logoBruto.length > MAX_LOGO) {
      return { ok: false, mensaje: "The logo is too large (max 2 MB)." };
    }
    logo = logoBruto;
  }

  return { ok: true, datos: { concepto, monto, diaPago, recurrencia, logo } };
}

// Guarda un pago fijo dentro de la organización del usuario.
export async function guardarPago(entrada: unknown): Promise<GuardarPagoResultado> {
  const validado = validarPago(entrada);
  if (!validado.ok) {
    return { ok: false, mensaje: validado.mensaje };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, mensaje: "Your session expired. Please sign in again." };
  }

  const { data: organizacion, error: errorOrganizacion } = await supabase.rpc("mi_organizacion");

  if (errorOrganizacion || typeof organizacion !== "string") {
    return { ok: false, mensaje: "Could not prepare your organization." };
  }

  const { error } = await supabase.from("pagos").insert({
    organizacion_id: organizacion,
    concepto: validado.datos.concepto,
    monto: validado.datos.monto,
    dia_pago: validado.datos.diaPago,
    recurrencia: validado.datos.recurrencia,
    logo: validado.datos.logo,
    creado_por: user.id,
  });

  if (error) {
    console.error("[Pagos] Error al guardar:", error);
    return { ok: false, mensaje: `Could not save the payment (${error.code}).` };
  }

  revalidatePath("/platform/payments");
  return { ok: true };
}

// Edita un pago existente. La política RLS limita la edición a miembros de la
// organización del pago.
export async function editarPago(
  id: string,
  entrada: unknown,
): Promise<GuardarPagoResultado> {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, mensaje: "The payment identifier is missing." };
  }

  const validado = validarPago(entrada);
  if (!validado.ok) {
    return { ok: false, mensaje: validado.mensaje };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("pagos")
    .update({
      concepto: validado.datos.concepto,
      monto: validado.datos.monto,
      dia_pago: validado.datos.diaPago,
      recurrencia: validado.datos.recurrencia,
      logo: validado.datos.logo,
    })
    .eq("id", id);

  if (error) {
    console.error("[Pagos] Error al editar:", error);
    return { ok: false, mensaje: `Could not update the payment (${error.code}).` };
  }

  revalidatePath("/platform/payments");
  return { ok: true };
}

// Elimina un pago. La política RLS limita el borrado a miembros de la organización.
export async function eliminarPago(id: string): Promise<GuardarPagoResultado> {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, mensaje: "The payment identifier is missing." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("pagos").delete().eq("id", id);

  if (error) {
    console.error("[Pagos] Error al eliminar:", error);
    return { ok: false, mensaje: `Could not delete the payment (${error.code}).` };
  }

  revalidatePath("/platform/payments");
  return { ok: true };
}
