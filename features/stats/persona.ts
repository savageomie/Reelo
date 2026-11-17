/** Fun "taste persona" for Wrapped, derived from stats (pure). */
import type { StatsSummary } from './computeStats';

const BY_GENRE: Record<string, string> = {
  'Science Fiction': 'The Star Gazer',
  Horror: 'The Fearless One',
  Comedy: 'The Laugh Hunter',
  Drama: 'The Feeler',
  Animation: 'The Forever Young',
  Romance: 'The Hopeless Romantic',
  Thriller: 'The Edge-of-Seat Addict',
  Action: 'The Adrenaline Junkie',
  Crime: 'The Detective',
  Documentary: 'The Truth Seeker',
  Fantasy: 'The Dreamer',
  Adventure: 'The Explorer',
  Mystery: 'The Puzzle Solver',
  History: 'The Time Traveller',
  War: 'The Strategist',
  Music: 'The Rhythm Seeker',
  Family: 'The Cosy Watcher',
  Western: 'The Lone Rider',
};

export function tastePersona(s: Pick<StatsSummary, 'genres' | 'averageRating' | 'decades' | 'totalLogs'>): { name: string; blurb: string } {
  if (s.totalLogs === 0) return { name: 'The Fresh Start', blurb: 'Your story is just beginning.' };
  const top = s.genres[0]?.name;
  const name = (top && BY_GENRE[top]) || 'The Eclectic';
  const oldest = s.decades[0]?.key;
  const critic =
    s.averageRating == null ? '' : s.averageRating >= 4 ? 'You love generously.' : s.averageRating <= 2.8 ? 'A tough critic.' : 'Fair but firm.';
  const era = oldest && Number(oldest) < 1980 ? ` You dig into the classics too.` : '';
  return { name, blurb: `${top ? `Mostly ${top.toLowerCase()}.` : ''} ${critic}${era}`.trim() };
}
