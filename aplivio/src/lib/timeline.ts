import type { College } from "@/types/college";

export type TimelineTask = {
  id: string;
  label: string;
  due: string;
  schoolId?: string;
  done?: boolean;
};

function sortByDate(a: TimelineTask, b: TimelineTask) {
  return a.due.localeCompare(b.due);
}

export function buildTimelineTasks(colleges: College[]): TimelineTask[] {
  const tasks: TimelineTask[] = [];

  tasks.push({
    id: "global-teacher-ask",
    label: "Ask two teachers for recommendation letters (provide resume + deadlines)",
    due: "2025-09-15",
  });
  tasks.push({
    id: "global-fafsa",
    label: "Open FAFSA / CSS Profile accounts; gather tax documents",
    due: "2025-10-01",
  });

  for (const c of colleges) {
    const d = c.deadlines;
    if (d.early) {
      tasks.push({
        id: `${c.id}-early`,
        schoolId: c.id,
        label: `Submit early application — ${c.name}`,
        due: d.early,
      });
    }
    if (d.regular) {
      tasks.push({
        id: `${c.id}-regular`,
        schoolId: c.id,
        label: `Application deadline — ${c.name}`,
        due: d.regular,
      });
    }
    if (d.rolling) {
      tasks.push({
        id: `${c.id}-rolling`,
        schoolId: c.id,
        label: `Rolling / priority date — ${c.name}`,
        due: d.rolling,
      });
    }
    if (d.financialAid) {
      tasks.push({
        id: `${c.id}-aid`,
        schoolId: c.id,
        label: `Financial aid priority — ${c.name}`,
        due: d.financialAid,
      });
    }
  }

  return tasks.sort(sortByDate);
}
