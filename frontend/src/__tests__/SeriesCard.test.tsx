import { render, screen } from "@testing-library/react";
import { SeriesCard } from "@/components/series/SeriesCard";
import type { Series } from "@/types";

// Mock next/link
jest.mock("next/link", () => {
  const MockLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

// Mock next/image
jest.mock("next/image", () => {
  const MockImage = ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  );
  MockImage.displayName = "MockImage";
  return MockImage;
});

const baseSeries: Series = {
  id: 42,
  name: "My Test Series",
  sort_name: "test series",
  localized_name: "Minha Série de Teste",
  original_name: "My Test Series",
  cover_image: null,
  pages: 100,
  library_id: 1,
  metadata: null,
  avg_hours_to_read: 2,
  user_progress_pct: 0,
  created_at: "2024-01-01T00:00:00Z",
  last_modified: "2024-01-01T00:00:00Z",
};

describe("SeriesCard", () => {
  it("renders the series name", () => {
    render(<SeriesCard series={baseSeries} />);
    expect(screen.getByText("Minha Série de Teste")).toBeInTheDocument();
  });

  it("renders placeholder when cover_image is null", () => {
    render(<SeriesCard series={baseSeries} />);
    const img = screen.getByAltText("Sem capa");
    expect(img).toBeInTheDocument();
  });

  it("renders cover image when cover_image is provided", () => {
    const series: Series = { ...baseSeries, cover_image: "/covers/test.jpg" };
    render(<SeriesCard series={series} />);
    const img = screen.getByAltText("Minha Série de Teste");
    expect(img).toHaveAttribute("src", "/covers/test.jpg");
  });

  it("link points to /series/{id}", () => {
    render(<SeriesCard series={baseSeries} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/series/42");
  });

  it("does not show status badge when showStatus is false (default)", () => {
    const series: Series = {
      ...baseSeries,
      metadata: {
        id: 1,
        summary: "",
        language: "en",
        release_year: null,
        publication_status: "ongoing",
        total_count: 0,
        max_count: 0,
        web_links: [],
        genres: [],
        tags: [],
        people: [],
        age_rating: 0,
        rating: null,
        publisher: "",
      },
    };
    render(<SeriesCard series={series} />);
    expect(screen.queryByText("Em andamento")).not.toBeInTheDocument();
  });

  it("shows status badge when showStatus is true", () => {
    const series: Series = {
      ...baseSeries,
      metadata: {
        id: 1,
        summary: "",
        language: "en",
        release_year: null,
        publication_status: "ongoing",
        total_count: 0,
        max_count: 0,
        web_links: [],
        genres: [],
        tags: [],
        people: [],
        age_rating: 0,
        rating: null,
        publisher: "",
      },
    };
    render(<SeriesCard series={series} showStatus={true} />);
    expect(screen.getByText("Em andamento")).toBeInTheDocument();
  });
});
