import { useMemo } from 'react';
import { useParams } from 'react-router';
import { EVENTS } from '../constants';

const EVENT_MAP = Object.fromEntries(
  EVENTS.map((event) => [event.name, event]),
);

export default function useCurrentSection() {
  const { section: sectionName } = useParams();

  return useMemo(() => {
    return EVENT_MAP[sectionName as keyof typeof EVENT_MAP] ?? EVENTS[0];
  }, [sectionName]);
}
