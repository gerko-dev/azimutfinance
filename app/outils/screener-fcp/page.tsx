import { redirect } from "next/navigation";

// L'outil est desormais heberge dans le Pro Terminal.
// Cette route reste en place pour ne pas casser les liens externes.
export default function Page() {
  redirect("/pros/screener-fcp");
}
