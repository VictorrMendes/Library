import { render, screen } from "@testing-library/react";
import { Skeleton, SeriesCardSkeleton, DashboardSkeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("renders with animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("animate-pulse");
  });

  it("applies additional className", () => {
    const { container } = render(<Skeleton className="h-10 w-full" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("h-10");
    expect(el).toHaveClass("w-full");
  });
});

describe("SeriesCardSkeleton", () => {
  it("renders 3 skeleton elements", () => {
    const { container } = render(<SeriesCardSkeleton />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  });

  it("has a wrapper with space-y-2", () => {
    const { container } = render(<SeriesCardSkeleton />);
    expect(container.firstChild).toHaveClass("space-y-2");
  });
});

describe("DashboardSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("contains multiple skeleton elements", () => {
    const { container } = render(<DashboardSkeleton />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(5);
  });
});
