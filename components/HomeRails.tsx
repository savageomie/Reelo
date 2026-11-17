import { useFilmList } from '@/hooks/useFilms';
import { PosterRow } from './PosterRow';
import { Section } from './ui/Section';

/** Home carousels. Phase 3: trending; recommendation rails are added in Phase 6. */
export function HomeRails() {
  const trending = useFilmList('trending');
  return (
    <Section title="Trending this week">
      <PosterRow items={trending.data?.results} loading={trending.isLoading} error={trending.isError} />
    </Section>
  );
}
