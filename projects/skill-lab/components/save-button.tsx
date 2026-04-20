"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  videoId: string;
  initiallySaved: boolean;
  isAuthed: boolean;
};

export function SaveButton({ videoId, initiallySaved, isAuthed }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    if (!isAuthed) {
      // Take them to sign-up with a return path and a gentle hint
      router.push(`/sign-up?next=/video/${videoId}&reason=save`);
      return;
    }
    const nextSaved = !saved;
    setSaved(nextSaved);
    startTransition(async () => {
      const res = await fetch(`/api/library/${videoId}`, {
        method: nextSaved ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setSaved(!nextSaved);
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={saved ? "btn btn-ghost" : "btn btn-primary"}
      aria-pressed={saved}
    >
      {saved ? "Saved ✓" : "Save to library"}
    </button>
  );
}
