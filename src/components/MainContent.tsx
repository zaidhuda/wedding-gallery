import { EVENTS } from '../constants';
import EventSection from './EventSection';

export default function MainContent() {
  return EVENTS.map(EventSection);
}
