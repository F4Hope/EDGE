import type { SupportedSport } from "@/lib/providers/types";

export type ParticipantVisual = {
  name: string;
  country: string | null;
  provider: string | null;
  externalId: string | null;
};

const countryCodes: Record<string, string> = {
  argentina: "AR", australia: "AU", austria: "AT", belgium: "BE",
  brazil: "BR", canada: "CA", chile: "CL", china: "CN", colombia: "CO",
  croatia: "HR", czechia: "CZ", "czech republic": "CZ", denmark: "DK",
  ecuador: "EC", egypt: "EG", england: "GB", finland: "FI", france: "FR",
  germany: "DE", greece: "GR", hungary: "HU", india: "IN", ireland: "IE",
  italy: "IT", japan: "JP", mexico: "MX", morocco: "MA", netherlands: "NL",
  nigeria: "NG", norway: "NO", peru: "PE", poland: "PL", portugal: "PT",
  romania: "RO", scotland: "GB", serbia: "RS", slovakia: "SK", slovenia: "SI",
  "south africa": "ZA", "south korea": "KR", spain: "ES", sweden: "SE",
  switzerland: "CH", tunisia: "TN", turkey: "TR", ukraine: "UA",
  "united kingdom": "GB", "united states": "US", usa: "US", uruguay: "UY", wales: "GB",
};

export function participantInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

function toFlag(code: string): string {
  return code.toUpperCase().replace(/./g, (char) =>
    String.fromCodePoint(127397 + char.charCodeAt(0)),
  );
}

export function countryFlag(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return toFlag(trimmed);
  const code = countryCodes[trimmed.toLowerCase()];
  return code ? toFlag(code) : null;
}

export function participantLogoUrl(
  participant: ParticipantVisual | null | undefined,
  sport: SupportedSport,
): string | null {
  if (!participant?.externalId || participant.provider !== "api-sports") return null;
  if (!/^\d+$/.test(participant.externalId)) return null;
  if (sport === "football") return `https://media.api-sports.io/football/teams/${participant.externalId}.png`;
  if (sport === "basketball") return `https://media.api-sports.io/basketball/teams/${participant.externalId}.png`;
  if (sport === "tennis") return `https://media.api-sports.io/tennis/players/${participant.externalId}.png`;
  return null;
}
