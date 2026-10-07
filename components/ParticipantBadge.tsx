"use client";

import { useState } from "react";
import type { SupportedSport } from "@/lib/providers/types";
import {
  countryFlag,
  participantInitials,
  participantLogoUrl,
  type ParticipantVisual,
} from "@/lib/ui/participantVisual";

export function ParticipantBadge({
  participant,
  sport,
  compact = false,
}: {
  participant: ParticipantVisual | null | undefined;
  sport: SupportedSport;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const logoUrl = participantLogoUrl(participant, sport);
  const flag = countryFlag(participant?.country);
  const name = participant?.name ?? "Participant";
  const classes = compact ? "participant-badge compact" : "participant-badge";

  return (
    <span className={classes} title={name} aria-label={name}>
      {logoUrl && !failed ? (
        // Provider-backed sports marks are remote media assets; the native img
        // preserves the provider URL without introducing a Next image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : flag ? (
        <span className="participant-flag" aria-hidden="true">{flag}</span>
      ) : (
        <span className="participant-initials" aria-hidden="true">
          {participantInitials(name)}
        </span>
      )}
    </span>
  );
}
