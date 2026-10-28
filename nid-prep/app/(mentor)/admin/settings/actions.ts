"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { loadSettings } from "@/lib/config/settings";
import { phasesConfigSchema } from "@/lib/config/schemas";
import { supabaseServer } from "@/lib/supabase/server";

const formSchema = z.object({
  mentorMessage: z.string().max(400),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetReadiness: z.coerce.number().int().min(0).max(100),
});

export async function saveSettings(_prev: { message: string | null }, form: FormData): Promise<{ message: string | null }> {
  await requireViewer("mentor");
  const parsed = formSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Check the values and try again." };
  const current = await loadSettings();
  const phases = phasesConfigSchema.parse({
    ...current.phases,
    startDate: parsed.data.startDate,
    targetReadiness: parsed.data.targetReadiness,
  });
  const supabase = await supabaseServer();
  const { error } = await supabase.from("settings").upsert({
    id: 1,
    phases,
    mentor_message: parsed.data.mentorMessage.trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { message: `Couldn't save: ${error.message}` };
  revalidatePath("/", "layout");
  return { message: "Saved." };
}
