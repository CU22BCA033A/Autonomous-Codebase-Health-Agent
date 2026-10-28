"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function toggleChecklist(itemId: string, done: boolean) {
  const id = z.string().min(1).max(64).parse(itemId);
  const viewer = await requireViewer("student");
  const supabase = await supabaseServer();
  if (done) {
    await supabase.from("checklist_ticks").upsert({ user_id: viewer.id, item_id: id });
  } else {
    await supabase.from("checklist_ticks").delete().eq("user_id", viewer.id).eq("item_id", id);
  }
  revalidatePath("/exam-day");
}
