export const HERO_CONTENT = {
  prelude: "A Celebration of Love",
  title1: "Zaid",
  title2: "Munawwarah",
  titleConnector: "&",
  date: "February 2026",
  scrollIndicator: "Guestbook",
} as const;

export const EVENTS = [
  {
    name: "ijab",
    nameAlt: "night",
    label: "The Sacred Night",
    shortLabel: "Night",
    title: "Ijab & Qabul" as const,
    date: "February 7, 2026",
    theme: "ijab",
    section: "section-night",
    gallery: "gallery-ijab",
  },
  {
    name: "sanding",
    nameAlt: "grandeur",
    label: "The Grandeur",
    shortLabel: "Grandeur",
    title: "Sanding" as const,
    date: "February 8, 2026",
    theme: "sanding",
    section: "section-grandeur",
    gallery: "gallery-sanding",
  },
  {
    name: "tandang",
    nameAlt: "journey",
    label: "The Journey",
    shortLabel: "Journey",
    title: "Tandang" as const,
    date: "February 14, 2026",
    theme: "tandang",
    section: "section-journey",
    gallery: "gallery-tandang",
  },
] as const;

export type EventTitle = (typeof EVENTS)[number]["title"];
export type EventGallery = (typeof EVENTS)[number]["gallery"];

export const EVENT_MAP = EVENTS.reduce(
  (acc, event) => {
    acc[event.title] = event;
    return acc;
  },
  {} as Record<EventTitle, (typeof EVENTS)[number]>,
);

export const PHOTOS_STALE_TIME = 15_000;
