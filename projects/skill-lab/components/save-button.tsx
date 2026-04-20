"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  videoId: string;
  initiallySaved: boolean;
  isAuthed: boolean;
  saveLabel: string;
  savedLabel: string;
};

export function SaveButton({
  videoId,
  initiallySaved,
  isAuthed,
  saveLabel,
  savedLabel,
}: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    if (!isAuthed) {
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
      {saved ? savedLabel : saveLabel}
    </button>
  );
}
