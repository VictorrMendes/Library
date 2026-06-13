from rest_framework import viewsets, filters, permissions
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as df
from django.db.models import Subquery, OuterRef, Sum, IntegerField, Value, F
from django.db.models.functions import Coalesce
from .models import Library, Series, SeriesRelation, Volume, Chapter, Genre, Tag, Person
from .serializers import (
    LibrarySerializer,
    SeriesListSerializer,
    SeriesDetailSerializer,
    SeriesMetadataSerializer,
    SeriesRelationSerializer,
    VolumeSerializer,
    ChapterSerializer,
    GenreSerializer,
    TagSerializer,
    PersonSerializer,
)


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == "admin"


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.role == "admin"


class LibraryViewSet(viewsets.ModelViewSet):
    serializer_class = LibrarySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Library.objects.all()

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    def scan(self, request, pk=None):
        if request.user.role != "admin":
            return Response(
                {"detail": "Apenas administradores podem iniciar scans."},
                status=403,
            )
        from apps.scanner.tasks import scan_library
        library = self.get_object()
        task = scan_library.delay(library.id)
        return Response({"task_id": task.id, "detail": "Scan iniciado."})


class SeriesFilter(df.FilterSet):
    library = df.NumberFilter(field_name="library_id")
    genre = df.CharFilter(
        field_name="metadata__genres__normalized", lookup_expr="icontains"
    )
    tag = df.CharFilter(
        field_name="metadata__tags__normalized", lookup_expr="icontains"
    )
    status = df.CharFilter(field_name="metadata__publication_status")
    language = df.CharFilter(field_name="metadata__language")
    year = df.NumberFilter(field_name="metadata__release_year")
    reading_status = df.CharFilter(method="filter_reading_status")

    class Meta:
        model = Series
        fields = [
            "library", "genre", "tag", "status",
            "language", "year", "reading_status",
        ]

    def filter_reading_status(self, queryset, name, value):
        if value == "in_progress":
            return queryset.filter(
                user_pages_read__gt=0, user_pages_read__lt=F("pages")
            )
        elif value == "completed":
            return queryset.filter(
                user_pages_read__gte=F("pages"), pages__gt=0
            )
        elif value == "not_started":
            return queryset.filter(user_pages_read=0)
        return queryset


class SeriesViewSet(viewsets.ModelViewSet):
    filter_backends = [
        DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter
    ]
    filterset_class = SeriesFilter
    search_fields = [
        "name", "localized_name", "original_name", "metadata__summary"
    ]
    ordering_fields = ["sort_name", "created_at", "last_modified", "pages"]
    ordering = ["sort_name"]

    def get_queryset(self):
        from apps.reader.models import ReadingProgress
        user = self.request.user
        accessible = Library.objects.all()
        user_progress_sq = (
            ReadingProgress.objects
            .filter(user=user, series=OuterRef("pk"))
            .values("series")
            .annotate(total=Sum("pages_read"))
            .values("total")
        )
        qs = (
            Series.objects.filter(library__in=accessible)
            .select_related("metadata")
            .prefetch_related(
                "metadata__genres", "metadata__tags", "metadata__people",
                "relations__target",
            )
            .annotate(
                user_pages_read=Coalesce(
                    Subquery(
                        user_progress_sq, output_field=IntegerField()
                    ),
                    Value(0),
                )
            )
        )
        # Age restriction: filter out series above the user's configured limit
        if user.age_restriction and user.age_restriction > 0:
            if user.age_restriction_include_unknowns:
                qs = qs.filter(metadata__age_rating__lte=user.age_restriction)
            else:
                qs = qs.filter(
                    metadata__age_rating__gt=0,
                    metadata__age_rating__lte=user.age_restriction,
                )
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SeriesDetailSerializer
        return SeriesListSerializer

    @action(detail=True, methods=["get"])
    def volumes(self, request, pk=None):
        series = self.get_object()
        volumes = series.volumes.prefetch_related(
            "chapters__files"
        ).order_by("min_number")
        return Response(VolumeSerializer(volumes, many=True).data)

    @action(detail=True, methods=["patch"], url_path="metadata")
    def update_metadata(self, request, pk=None):
        series = self.get_object()
        serializer = SeriesMetadataSerializer(
            series.metadata, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(
        detail=True, methods=["post"], url_path="scan"
    )
    def scan(self, request, pk=None):
        from apps.scanner.tasks import scan_series
        series = self.get_object()
        task = scan_series.delay(series.id)
        return Response({"task_id": task.id, "detail": "Scan iniciado."})

    @action(detail=True, methods=["get"], url_path="fetch-metadata")
    def fetch_metadata(self, request, pk=None):
        import requests as req
        series = self.get_object()
        title = series.name

        result = {}

        # Google Books (no API key needed for basic queries)
        try:
            gb = req.get(
                "https://www.googleapis.com/books/v1/volumes",
                params={"q": title, "maxResults": 1},
                timeout=5,
            )
            if gb.status_code == 200:
                items = gb.json().get("items", [])
                if items:
                    vi = items[0]["volumeInfo"]
                    result["summary"] = vi.get("description", "")
                    result["language"] = vi.get("language", "")
                    release_year = vi.get("publishedDate", "")[:4]
                    result["release_year"] = (
                        int(release_year) if release_year.isdigit() else None
                    )
                    result["genres"] = vi.get("categories", [])
                    result["thumbnail"] = (
                        vi.get("imageLinks", {}).get("thumbnail", "")
                    )
                    result["authors"] = vi.get("authors", [])
        except Exception:
            pass

        # Fallback: Open Library
        if not result.get("summary"):
            try:
                ol = req.get(
                    "https://openlibrary.org/search.json",
                    params={"title": title, "limit": 1},
                    timeout=5,
                )
                if ol.status_code == 200:
                    docs = ol.json().get("docs", [])
                    if docs:
                        d = docs[0]
                        if not result.get("authors"):
                            result["authors"] = d.get("author_name", [])
                        if not result.get("release_year"):
                            yr = d.get("first_publish_year")
                            result["release_year"] = yr
            except Exception:
                pass

        return Response(result)

    @action(detail=True, methods=["get", "post"], url_path="relations")
    def relations(self, request, pk=None):
        series = self.get_object()
        if request.method == "GET":
            rels = series.relations.select_related("target")
            return Response(SeriesRelationSerializer(rels, many=True, context={"request": request}).data)
        # POST — create relation
        serializer = SeriesRelationSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            rel = SeriesRelation.objects.create(
                series=series,
                target_id=serializer.validated_data["target_id"],
                relation_type=serializer.validated_data["relation_type"],
            )
        except Exception as e:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(str(e))
        return Response(SeriesRelationSerializer(rel, context={"request": request}).data, status=201)

    @action(detail=True, methods=["delete"], url_path=r"relations/(?P<relation_id>\d+)")
    def delete_relation(self, request, pk=None, relation_id=None):
        series = self.get_object()
        SeriesRelation.objects.filter(series=series, pk=relation_id).delete()
        return Response(status=204)

    @action(
        detail=True, methods=["post"], url_path="cover",
        parser_classes=[MultiPartParser],
    )
    def upload_cover(self, request, pk=None):
        series = self.get_object()
        cover = request.FILES.get("cover")
        if not cover:
            return Response(
                {"detail": "Arquivo não enviado."}, status=400
            )
        series.cover_image.delete(save=False)
        series.cover_image = cover
        series.save(update_fields=["cover_image"])
        return Response({"cover_image": request.build_absolute_uri(
            series.cover_image.url
        )})


class VolumeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = VolumeSerializer

    def get_queryset(self):
        return Volume.objects.filter(
            series__library__in=self._accessible_libraries()
        ).prefetch_related("chapters")

    def _accessible_libraries(self):
        user = self.request.user
        return Library.objects.all()


class ChapterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChapterSerializer

    def get_queryset(self):
        return Chapter.objects.filter(
            volume__series__library__in=self._accessible_libraries()
        ).prefetch_related("files")

    def _accessible_libraries(self):
        user = self.request.user
        return Library.objects.all()


class GenreViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Genre.objects.all()
    serializer_class = GenreSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]


class TagViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]


class PersonViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Person.objects.all()
    serializer_class = PersonSerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ["name"]
    filterset_fields = ["role"]
