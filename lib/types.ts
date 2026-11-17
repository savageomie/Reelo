/** Row types mirroring supabase/migrations (hand-written; regenerate with `supabase gen types` later). */

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  favourites: number[];
  favourite_genres: number[];
  onboarded: boolean;
  created_at: string;
}

export interface Credit {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profile_path: string | null;
}

export interface ProviderInfo {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface Film {
  tmdb_id: number;
  title: string;
  original_title?: string | null;
  year: number | null;
  release_date?: string | null;
  overview: string | null;
  tagline?: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres?: { id: number; name: string }[];
  genre_ids: number[];
  runtime?: number | null;
  directors?: Credit[];
  cast?: Credit[];
  providers?: { region: string; link: string | null; flatrate: ProviderInfo[]; rent: ProviderInfo[]; buy: ProviderInfo[] };
  trailer_key?: string | null;
  popularity: number | null;
  vote_average: number | null;
  palette?: { primary: string; dark: string; light: string } | null;
  is_partial?: boolean;
}

export type FilmSummary = Pick<
  Film,
  'tmdb_id' | 'title' | 'year' | 'poster_path' | 'backdrop_path' | 'genre_ids' | 'popularity' | 'vote_average' | 'overview'
>;

export interface Paged<T> {
  results: T[];
  page: number;
  totalPages: number;
}

export interface PersonSummary {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string | null;
}

export interface Person extends PersonSummary {
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  credits: (FilmSummary & { role: string })[];
}

export interface DiaryEntry {
  id: string;
  user_id: string;
  tmdb_id: number;
  watched_on: string;
  rating: number | null;
  review: string | null;
  spoiler: boolean;
  tags: string[];
  is_rewatch: boolean;
  liked: boolean;
  created_at: string;
  updated_at: string;
  /** true while only in the offline queue */
  pending?: boolean;
}

export interface FilmStats {
  tmdb_id: number;
  rating_count: number;
  avg_rating: number | null;
  histogram: number[];
  log_count: number;
  like_count: number;
}

export interface List {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  is_public: boolean;
  is_ranked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListItem {
  list_id: string;
  tmdb_id: number;
  position: number;
  note: string | null;
}

export interface Comment {
  id: string;
  user_id: string;
  target_type: 'review' | 'list';
  target_id: string;
  body: string;
  spoiler: boolean;
  created_at: string;
  profile?: Pick<Profile, 'username' | 'avatar_url'>;
}

export interface FeedItem {
  id: string;
  type: 'log' | 'list' | 'follow';
  ref_id: string;
  tmdb_id: number | null;
  created_at: string;
  actor_id: string;
  actor_username: string;
  actor_avatar_url: string | null;
  rating: number | null;
  review: string | null;
  spoiler: boolean | null;
  liked: boolean | null;
  is_rewatch: boolean | null;
  watched_on: string | null;
  list_id: string | null;
  list_title: string | null;
  target_user_id: string | null;
  target_username: string | null;
  film_title: string | null;
  film_year: number | null;
  poster_path: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type:
    | 'follow'
    | 'follow_request'
    | 'follow_accepted'
    | 'like_review'
    | 'like_list'
    | 'comment_review'
    | 'comment_list'
    | 'group_voting'
    | 'group_closed'
    | 'group_joined';
  payload: { target_id?: string; tmdb_id?: number | null; excerpt?: string; group_id?: string; group_name?: string };
  read_at: string | null;
  created_at: string;
  actor?: Pick<Profile, 'username' | 'avatar_url'> | null;
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  status: 'picking' | 'voting' | 'closed';
  voting_mode: 'swipe' | 'ranked';
  filters: { max_runtime?: number | null; genre_ids?: number[]; provider_ids?: number[] };
  winner_pick_id: string | null;
  result: {
    winner: string | null;
    rounds?: { counts: Record<string, number>; eliminated: string | null }[];
    points?: Record<string, number>;
    yes?: Record<string, number>;
  } | null;
  created_at: string;
  voting_opened_at: string | null;
  closed_at: string | null;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
  profile?: Pick<Profile, 'username' | 'avatar_url'>;
}

export interface GroupPick {
  id: string;
  group_id: string;
  tmdb_id: number;
  added_by: string;
  created_at: string;
}

export interface GroupVote {
  group_id: string;
  pick_id: string;
  user_id: string;
  value: 0 | 1 | null;
  rank: number | null;
}
