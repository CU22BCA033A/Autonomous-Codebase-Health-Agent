import { Card } from "@/components/ui/card";
import { loadSettings } from "@/lib/config/settings";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const s = await loadSettings();
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Settings</h1>
      <Card>
        <SettingsForm
          mentorMessage={s.mentorMessage ?? ""}
          startDate={s.phases.startDate}
          targetReadiness={s.phases.targetReadiness}
        />
      </Card>
    </div>
  );
}
