export interface Movie {
  id: number
  title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  vote_average: number
  vote_count: number
  genre_ids: number[]
  popularity: number
  adult: boolean
  original_language: string
  original_title: string
  video: boolean
}

export interface Genre {
  id: number
  name: string
}

export interface ProductionCompany {
  id: number
  name: string
  logo_path: string | null
  origin_country: string
}

export interface ProductionCountry {
  iso_3166_1: string
  name: string
}

export interface SpokenLanguage {
  iso_639_1: string
  name: string
  english_name: string
}

export interface MovieDetails extends Omit<Movie, 'genre_ids'> {
  genres: Genre[]
  runtime: number | null
  status: string
  tagline: string | null
  budget: number
  revenue: number
  production_companies: ProductionCompany[]
  production_countries: ProductionCountry[]
  spoken_languages: SpokenLanguage[]
  homepage: string | null
  imdb_id: string | null
}

export interface CastMember {
  id: number
  name: string
  character: string
  profile_path: string | null
  order: number
  known_for_department: string
  cast_id: number
  credit_id: string
}

export interface CrewMember {
  id: number
  name: string
  job: string
  department: string
  profile_path: string | null
  credit_id: string
}

export interface Credits {
  id: number
  cast: CastMember[]
  crew: CrewMember[]
}

export interface Video {
  id: string
  key: string
  name: string
  site: string
  type: string
  official: boolean
  published_at: string
  size: number
}

export interface VideosResponse {
  id: number
  results: Video[]
}

export interface MoviesResponse {
  page: number
  results: Movie[]
  total_pages: number
  total_results: number
}
