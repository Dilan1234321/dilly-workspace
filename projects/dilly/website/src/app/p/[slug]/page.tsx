import type { Metadata } from "next";
import PublicProfile from "../../../components/PublicProfile";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.trydilly.com";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API}/profile/web/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) {
      const data = await res.json();
      const title = data.name ? `${data.name} | Dilly` : "Dilly Profile";
      const desc = [data.tagline, data.career_fields?.[0], data.cities?.[0]].filter(Boolean).join(" - ");
      return {
        title,
        description: desc || "Career profile powered by Dilly",
        openGraph: {
          title,
          description: desc || "Career profile powered by Dilly",
          type: "profile",
        },
      };
    }
  } catch {}
  return { title: "Dilly Profile" };
}

export default async function ProfessionalProfilePage({ params }: Props) {
  const { slug } = await params;
  return <PublicProfile slug={slug} prefix="p" />;
}
