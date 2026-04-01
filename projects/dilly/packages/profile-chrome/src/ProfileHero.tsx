'use client';

import './styles.css';

export type ProfileHeroProps = {
  name: string;
  majors: string[];
  minors: string[];
  school?: string | null;
  photoUrl?: string | null;
  avatarSize?: number;
};

function splitName(name: string): string {
  if (!name.trim()) return 'Student';
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function ProfileHero({
  name,
  majors,
  minors,
  school,
  photoUrl,
  avatarSize = 168,
}: ProfileHeroProps) {
  const display = splitName(name);
  const initial = display.charAt(0).toUpperCase();

  return (
    <div className="dilly-profile-chrome__identity">
      <div
        className="dilly-profile-chrome__avatar"
        style={{ width: avatarSize, height: avatarSize }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" />
        ) : (
          <span className="dilly-profile-chrome__avatar-initial" style={{ fontSize: avatarSize * 0.38 }}>
            {initial}
          </span>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <h1 className="dilly-profile-chrome__name">{display}</h1>
        <p className="dilly-profile-chrome__majors">
          {majors.length > 0 ? (
            <>
              <span className="dilly-profile-chrome__lbl">{majors.length > 1 ? 'Majors' : 'Major'}</span>{' '}
              {majors.join(', ')}
            </>
          ) : (
            <span style={{ color: 'var(--dpc-subtle)' }}>Add your major in Settings</span>
          )}
        </p>
        {minors.length > 0 && (
          <p className="dilly-profile-chrome__minors">
            <span className="dilly-profile-chrome__lbl">{minors.length > 1 ? 'Minors' : 'Minor'}</span>{' '}
            {minors.join(', ')}
          </p>
        )}
        {school ? <p className="dilly-profile-chrome__school">{school}</p> : null}
      </div>
    </div>
  );
}
