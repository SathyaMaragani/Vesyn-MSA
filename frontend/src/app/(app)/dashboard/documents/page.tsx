import { redirect } from "next/navigation";

// The page moved when the tab was renamed; old links keep working.
export default function Page() {
  redirect("/dashboard/rag");
}
