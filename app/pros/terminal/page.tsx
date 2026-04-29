import { redirect } from "next/navigation";

// Le "Terminal Pro" est desormais la home /pros (qui hebergait la zone Pro
// dans son ensemble). On garde cette route en redirection pour ne pas casser
// les liens externes ou bookmarks.
export default function Page() {
  redirect("/pros");
}
