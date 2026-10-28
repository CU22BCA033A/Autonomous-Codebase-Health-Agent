/**
 * Create (or update) the two accounts. (On Vercel you can use the /setup page instead.)
 *   npm run setup:users -- --student-email v@x.com --student-password '…' --mentor-email g@x.com --mentor-password '…'
 * Optional: --student-name Veeru --mentor-name GB
 */
import { ensureAccount } from "../lib/seed/base";
import { adminClient, arg } from "./_env";

async function main() {
  const se = arg("student-email"), sp = arg("student-password");
  const me = arg("mentor-email"), mp = arg("mentor-password");
  if (!se || !sp || !me || !mp) {
    console.error("Usage: npm run setup:users -- --student-email … --student-password … --mentor-email … --mentor-password …");
    process.exit(1);
  }
  if (sp.length < 8 || mp.length < 8) throw new Error("Passwords must be at least 8 characters");
  const db = adminClient();
  await ensureAccount(db, { email: se, password: sp, role: "student", name: arg("student-name") ?? "Veeru" });
  console.log(`✓ student: ${se}`);
  await ensureAccount(db, { email: me, password: mp, role: "mentor", name: arg("mentor-name") ?? "GB" });
  console.log(`✓ mentor: ${me}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
