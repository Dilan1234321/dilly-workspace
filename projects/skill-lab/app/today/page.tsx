import { redirect } from "next/navigation";

/** /today is an alias for the home Today panel. */
export default function TodayPage() {
  redirect("/");
}
