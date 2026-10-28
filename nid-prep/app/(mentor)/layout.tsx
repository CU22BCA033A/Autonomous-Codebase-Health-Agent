import { Nav } from "@/components/nav";
import { requireViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MentorLayout({ children }: { children: React.ReactNode }) {
  await requireViewer("mentor");
  return (
    <div className="pb-20 md:pb-0">
      <Nav
        items={[
          { href: "/admin", label: "Overview" },
          { href: "/admin/settings", label: "Settings" },
        ]}
      />
      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">{children}</main>
    </div>
  );
}
