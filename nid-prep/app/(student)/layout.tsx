import { Nav } from "@/components/nav";
import { requireViewer } from "@/lib/auth";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireViewer("student");
  return (
    <div className="pb-20 md:pb-0">
      <Nav
        items={[
          { href: "/", label: "Today" },
          { href: "/exam-day", label: "Exam" },
        ]}
      />
      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">{children}</main>
    </div>
  );
}
