import planned from './serials.json';

/** A stable type even when the public serial manifest has no entries. */
export interface PlannedSerial {
  slug: string;
  totalChapters: number;
  initialChapters: number;
  timezone: string;
  chapters: { number: number; title: string }[];
}
const serials: PlannedSerial[] = planned;
export default serials;
