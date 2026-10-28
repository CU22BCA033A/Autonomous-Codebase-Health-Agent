/**
 * Create (or update) the two accounts.
 *   npm run setup:users -- --student-email v@x.com --student-password '…' --mentor-email g@x.com --mentor-password '…'
 * Optional: --student-name Veeru --mentor-name GB
 */
import { adminClient, arg } from "./_env";

async function ensureUser(email: string, password: string, role: "student" | "mentor", name: string) {
  const db = adminClient();
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
  } else {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await db.from("profiles").upsert({ id: user.id, role, display_name: name });
  if (error) throw error;
  console.log(`✓ ${role}: ${email}`);
}

async function main() {
  const se = arg("student-email"), sp = arg("student-password");
  const me = arg("mentor-email"), mp = arg("mentor-password");
  if (!se || !sp || !me || !mp) {
    console.error("Usage: npm run setup:users -- --student-email … --student-password … --mentor-email … --mentor-password …");
    process.exit(1);
  }
  if (sp.length < 8 || mp.length < 8) throw new Error("Passwords must be at least 8 characters");
  await ensureUser(se, sp, "student", arg("student-name") ?? "Veeru");
  await ensureUser(me, mp, "mentor", arg("mentor-name") ?? "GB");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
