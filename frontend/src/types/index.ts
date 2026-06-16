export interface User {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user" | "read_only";
  avatar: string | null;
  primary_color: string;
  age_restriction: number;
  reading_direction: "ltr" | "rtl" | "ttb";
  reading_mode: "single" | "double" | "webtoon";
  scaling: "fit_screen" | "fit_height" | "fit_width" | "original";
  theme: string;
  book_font_size: number;
  book_font_family: string;
  book_line_spacing: number;
  blur_unread_summaries: boolean;
  dashboard_sections: string[];
  created_at: string;
  last_active: string | null;
}

export interface ScrobbleCredential {
  id: number;
  provider: "anilist" | "mal";
  created_at: string;
}

export interface SeriesRelation {
  id: number;
  target_id: number;
  target_name: string;
  target_cover: string | null;
  relation_type: "sequel" | "prequel" | "spin_off" | "adaptation" | "alternative" | "contains" | "side_story";
}

export interface Library {
  id: number;
  name: string;
  type: "manga" | "comic" | "book" | "light_novel" | "image";
  cover_image: string | null;
  folder_paths: string[];
  include_in_dashboard: boolean;
  include_in_search: boolean;
  include_in_recommended: boolean;
  folder_watching: boolean;
  allow_scrobbling: boolean;
  enable_metadata: boolean;
  last_scanned: string | null;
  created_at: string;
  series_count: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Person {
  id: number;
  name: string;
  role: string;
  cover_image: string | null;
}

export interface SeriesMetadata {
  id: number;
  summary: string;
  language: string;
  release_year: number | null;
  publication_status: "ongoing" | "completed" | "hiatus" | "cancelled" | "ended" | "unknown";
  total_count: number;
  max_count: number;
  web_links: string[];
  genres: Genre[];
  tags: Tag[];
  people: Person[];
  age_rating: number;
  rating: number | null;
  publisher: string;
}

export interface Series {
  id: number;
  name: string;
  sort_name: string;
  localized_name: string;
  original_name: string;
  cover_image: string | null;
  pages: number;
  library_id: number;
  metadata: SeriesMetadata | null;
  avg_hours_to_read: number;
  user_progress_pct: number;
  relations?: SeriesRelation[];
  anilist_id?: number | null;
  mal_id?: number | null;
  avg_score?: number | null;
  rating_count?: number;
  dominant_color?: string;
  created_at: string;
  last_modified: string;
}

export interface MangaFile {
  id: number;
  file_path: string;
  pages: number;
  format: "image" | "archive" | "epub" | "pdf" | "unknown";
  bytes: number;
  extension: string;
  has_text_layer: boolean | null;
}

export interface Chapter {
  id: number;
  title: string;
  title_name: string;
  range: string;
  min_number: number;
  max_number: number;
  sort_order: number;
  is_special: boolean;
  cover_image: string | null;
  pages: number;
  word_count: number;
  isbn: string;
  release_date: string | null;
  summary: string;
  language: string;
  age_rating: number;
  volume_id: number;
  files: MangaFile[];
}

export interface Volume {
  id: number;
  name: string;
  min_number: number;
  max_number: number;
  cover_image: string | null;
  pages: number;
  series_id: number;
  chapters: Chapter[];
}

export interface ReadingProgress {
  id: number;
  chapter_id: number;
  series_id: number;
  library_id: number;
  pages_read: number;
  book_scroll_id: string;
  total_reads: number;
  is_completed: boolean;
  last_modified: string;
}

export interface Collection {
  id: number;
  title: string;
  summary: string;
  cover_image: string | null;
  is_promoted: boolean;
  series_count: number;
  created_at: string;
}

export interface ReadingList {
  id: number;
  title: string;
  summary: string;
  cover_image: string | null;
  is_promoted: boolean;
  item_count: number;
  created_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface UserStats {
  total_pages_read: number;
  total_chapters_read: number;
  total_series_read: number;
  total_reading_time_minutes: number;
  total_reading_hours: number;
  last_aggregated: string | null;
}

export interface VocabularyEntry {
  id: number;
  word: string;
  translation: string;
  phonetic: string;
  definition: string;
  example: string;
  context_sentence: string;
  source_series_name: string;
  direction: "en-pt" | "pt-en";
  status: "new" | "learning" | "known";
  review_count: number;
  ease_factor: number;
  interval_days: number;
  next_review_at: string | null;
  created_at: string;
  last_reviewed_at: string | null;
}

export interface VocabularyStats {
  total: number;
  new: number;
  learning: number;
  known: number;
  due_today: number;
  streak_days: number;
}

