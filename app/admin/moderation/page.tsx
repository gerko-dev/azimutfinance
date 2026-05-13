import ModerationList from "@/components/admin/ModerationList";
import { requireAdmin } from "@/lib/admin/auth";
import { listRecentMessages } from "@/lib/admin/queries";

export default async function ModerationPage() {
  const { level } = await requireAdmin(2);
  const messages = await listRecentMessages(150);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Modération messagerie</h1>
        <p className="text-sm text-slate-500 mt-1">
          150 messages les plus récents sur la plateforme. Tous les niveaux d&apos;admin
          peuvent supprimer un message individuel
          {level <= 2 && " ; le niveau 1 et 2 peut aussi supprimer une conversation entière"}
          .
        </p>
      </div>

      <ModerationList messages={messages} myLevel={level} />
    </div>
  );
}
