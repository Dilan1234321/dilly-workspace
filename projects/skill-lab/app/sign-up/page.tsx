import { redirect } from "next/navigation";

// There's no separate sign-up in Dilly's auth — verifying a code on an email
// that has no profile creates one. We keep /sign-up as a route for friendlier
// marketing CTAs, and forward to /sign-in which handles both cases.

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.next) params.set("next", sp.next);
  redirect(`/sign-in${params.toString() ? `?${params.toString()}` : ""}`);
}
