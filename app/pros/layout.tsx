import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProShell from "@/components/pros/ProShell";

export const metadata = {
  title: "Pro Terminal — AzimutFinance",
};

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name && name.trim()) || (email && email.split("@")[0]) || "";
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) ?? "—").toUpperCase();
}

export default async function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Acces non restreint pendant le developpement. La protection role==='pro'
  // sera ajoutee plus tard.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const meta = (user?.user_metadata ?? {}) as { full_name?: string };
  const initials = initialsFrom(meta.full_name, user?.email);

  return <ProShell userInitials={initials}>{children}</ProShell>;
}
