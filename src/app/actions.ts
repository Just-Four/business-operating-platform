"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(formData: FormData) {
  const supabase = await createClient();
  const id = randomUUID();
  const { error } = await supabase.from("businesses").insert({
    id,
    name: String(formData.get("name") ?? "").trim(),
    model: String(formData.get("model") ?? "other"),
    sector: String(formData.get("sector") ?? "").trim() || null,
    stage: "launch",
    country: String(formData.get("country") ?? "").trim() || null,
    currency: String(formData.get("currency") ?? "GBP"),
  });
  if (error) redirect(`/?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");
  redirect(`/b/${id}/start`);
}

// The platform's owner opens someone's business to read it. The database checks who is asking.
export async function ownerOpenBusiness(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("business_id"));
  const { data, error } = await supabase.rpc("admin_view_business", { p_business: id });
  if (error || !data) redirect(`/owner?error=${encodeURIComponent(error?.message ?? "That didn't work.")}`);
  revalidatePath("/");
  redirect(`/b/${id}`);
}

export async function ownerStopViewing(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("business_id"));
  const { data, error } = await supabase.rpc("admin_stop_viewing", { p_business: id });
  if (error || !data) redirect(`/owner?error=${encodeURIComponent(error?.message ?? "That didn't work.")}`);
  revalidatePath("/");
  redirect("/owner");
}
