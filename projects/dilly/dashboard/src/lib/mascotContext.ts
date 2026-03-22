/**
 * Contextual mascot: calendar context + recent activity.
 * No time of day, no weather.
 */

export type MascotContext = {
  calendarContext: "upcoming_deadlines" | "none" | "many";
  recentActivity: "just_audited" | "just_applied" | "inactive";
};

export type MascotMessage = {
  message: string;
  mood: "default" | "happy" | "encouraging" | "celebrating";
};

/**
 * Get contextual mascot message based on calendar and recent activity.
 */
export function getMascotMessage(ctx: MascotContext): MascotMessage {
  const { calendarContext, recentActivity } = ctx;

  // Recent activity takes precedence for tone
  if (recentActivity === "just_audited") {
    return {
      message: "Nice work on that audit. Check your scores and recommendations.",
      mood: "happy",
    };
  }
  if (recentActivity === "just_applied") {
    return {
      message: "Application sent. Fingers crossed!",
      mood: "celebrating",
    };
  }

  // Calendar context
  if (calendarContext === "upcoming_deadlines") {
    return {
      message: "You've got deadlines coming up. Want to prep?",
      mood: "encouraging",
    };
  }
  if (calendarContext === "many") {
    return {
      message: "Busy schedule ahead. One step at a time.",
      mood: "encouraging",
    };
  }

  if (recentActivity === "inactive") {
    return {
      message: "Welcome back. What can I help with today?",
      mood: "default",
    };
  }

  return {
    message: "What's on your mind?",
    mood: "default",
  };
}
