"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type GuardarIngresoResultado = { ok: true } | { ok: false; mensaje: string };

const ORIGENES = ["Invoice", "Manual"];
const MAX_CONCEPTO = 120;
const MAX_CLIENTE = 120;
const MAX_LOGO = 2 * 1024 * 1024;

type IngresoValidado = {
  concepto: string;
  monto: number;
  fechaIngreso: string;
  origen: string;
  cliente: string | null;
  logo: string | null;
};

function validarIngreso(
  entrada: unknown,
): { ok: true; datos: IngresoValidado } | { ok: false; mensaje: string } {
  if (typeof entrada !== "object" || entrada === null) {
    return { ok: false, mensaje: "No income data was received." };
  }

  const bruto = entrada as Record<string, unknown>;

  const concepto = typeof bruto.concepto === "string" ? bruto.concepto.trim() : "";
  if (!concepto) {
    return { ok: false, mensaje: "Enter the income concept." };
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

  const fechaIngreso =
    typeof bruto.fechaIngreso === "string" ? bruto.fechaIngreso.trim() : "";
  if (!fechaIngreso || !/^\d{4}-\d{2}-\d{2}$/.test(fechaIngreso)) {
    return { ok: false, mensaje: "Select a valid date." };
  }

  const origen = typeof bruto.origen === "string" ? bruto.origen.trim() : "";
  if (!ORIGENES.includes(origen)) {
    return { ok: false, mensaje: "The origin is not valid." };
  }

  const clienteBruto = typeof bruto.cliente === "string" ? bruto.cliente.trim() : "";
  if (clienteBruto.length > MAX_CLIENTE) {
    return { ok: false, mensaje: `The client name cannot exceed ${MAX_CLIENTE} characters.` };
  }
  const cliente = clienteBruto || null;

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

  return { ok: true, datos: { concepto, monto, fechaIngreso, origen, cliente, logo } };
}

export async function guardarIngreso(entrada: unknown): Promise<GuardarIngresoResultado> {
  const validado = validarIngreso(entrada);
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

  const { error } = await supabase.from("ingresos").insert({
    organizacion_id: organizacion,
    concepto: validado.datos.concepto,
    monto: validado.datos.monto,
    fecha_ingreso: validado.datos.fechaIngreso,
    origen: validado.datos.origen,
    cliente: validado.datos.cliente,
    logo: validado.datos.logo,
    creado_por: user.id,
  });

  if (error) {
    console.error("[Ingresos] Error al guardar:", error);
    return { ok: false, mensaje: `Could not save the income (${error.code}).` };
  }

  revalidatePath("/platform/ingresos");
  return { ok: true };
}

export async function editarIngreso(
  id: string,
  entrada: unknown,
): Promise<GuardarIngresoResultado> {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, mensaje: "The income identifier is missing." };
  }

  const validado = validarIngreso(entrada);
  if (!validado.ok) {
    return { ok: false, mensaje: validado.mensaje };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("ingresos")
    .update({
      concepto: validado.datos.concepto,
      monto: validado.datos.monto,
      fecha_ingreso: validado.datos.fechaIngreso,
      origen: validado.datos.origen,
      cliente: validado.datos.cliente,
      logo: validado.datos.logo,
    })
    .eq("id", id);

  if (error) {
    console.error("[Ingresos] Error al editar:", error);
    return { ok: false, mensaje: `Could not update the income (${error.code}).` };
  }

  revalidatePath("/platform/ingresos");
  return { ok: true };
}

export async function eliminarIngreso(id: string): Promise<GuardarIngresoResultado> {
  if (typeof id !== "string" || !id.trim()) {
    return { ok: false, mensaje: "The income identifier is missing." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("ingresos").delete().eq("id", id);

  if (error) {
    console.error("[Ingresos] Error al eliminar:", error);
    return { ok: false, mensaje: `Could not delete the income (${error.code}).` };
  }

  revalidatePath("/platform/ingresos");
  return { ok: true };
}
