import { useFilmList } from '@/hooks/useFilms';
import { useRecommendations } from '@/hooks/useRecommendations';
import { PosterRow } from './PosterRow';
import { Section } from './ui/Section';
import { Text } from './ui/Text';

/** Personalised Home carousels: hybrid "For you", "Because you loved X", and trending. */
export function HomeRails() {
  const recs = useRecommendations();
  const trending = useFilmList('trending');
  const rows = recs.data?.rows;
  const toItem = (id: number, subtitle?: string) => {
    const r = rows?.get(id);
    return { tmdb_id: id, title: r?.title ?? '…', poster_path: r?.poster_path ?? null, year: r?.year, subtitle };
  };
  const seedTitle = recs.data?.becauseOf ? rows?.get(recs.data.becauseOf.seed)?.title : null;

  return (
    <>
      <Section title={recs.data?.coldStart ? 'Popular picks to start with' : 'Recommended for you'}>
        <PosterRow
          loading={recs.isLoading}
          error={recs.isError}
          width={116}
          emptyText="Rate a few films and recommendations appear here."
          items={(recs.data?.forYou ?? []).map((r) =>
            toItem(
              r.tmdbId,
              r.becauseOf && rows?.get(r.becauseOf)
                ? `Fans of ${rows.get(r.becauseOf)!.title}`
                : r.sources.content > r.sources.popularity
                  ? 'Matches your taste'
                  : 'Popular',
            ),
          )}
          showTitles
        />
        {recs.data?.coldStart ? (
          <Text variant="caption" className="mt-2 px-4 text-xs">
            Rate 5+ films to unlock personalised recommendations.
          </Text>
        ) : null}
      </Section>
      {recs.data?.becauseOf && seedTitle ? (
        <Section title={`Because you loved ${seedTitle}`}>
          <PosterRow items={recs.data.becauseOf.items.map((i) => toItem(i.tmdbId))} />
        </Section>
      ) : null}
      <Section title="Trending this week">
        <PosterRow items={trending.data?.results} loading={trending.isLoading} error={trending.isError} />
      </Section>
    </>
  );
}
