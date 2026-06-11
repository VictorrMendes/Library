from rest_framework import generics, viewsets, filters, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as df
from .models import Library, Series, Volume, Chapter, Genre, Tag, Person
from .serializers import (
    LibrarySerializer,
    SeriesListSerializer,
    SeriesDetailSerializer,
    SeriesMetadataSerializer,
    VolumeSerializer,
    ChapterSerializer,
    GenreSerializer,
    TagSerializer,
    PersonSerializer,
)


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user.is_authenticated
        return request.user.is_authenticated and request.user.is_admin


class LibraryViewSet(viewsets.ModelViewSet):
    serializer_class = LibrarySerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return Library.objects.all()
        return user.libraries.all()

    @action(detail=True, methods=["post"])
    def scan(self, request, pk=None):
        from apps.scanner.tasks import scan_library
        library = self.get_object()
        task = scan_library.delay(library.id)
        return Response({"task_id": task.id, "detail": "Scan iniciado."})


class SeriesFilter(df.FilterSet):
    library = df.NumberFilter(field_name="library_id")
    genre = df.CharFilter(field_name="metadata__genres__normalized", lookup_expr="icontains")
    tag = df.CharFilter(field_name="metadata__tags__normalized", lookup_expr="icontains")
    status = df.CharFilter(field_name="metadata__publication_status")
    language = df.CharFilter(field_name="metadata__language")
    year = df.NumberFilter(field_name="metadata__release_year")

    class Meta:
        model = Series
        fields = ["library", "genre", "tag", "status", "language", "year"]


class SeriesViewSet(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = SeriesFilter
    search_fields = ["name", "localized_name", "original_name", "metadata__summary"]
    ordering_fields = ["sort_name", "created_at", "last_modified", "pages"]
    ordering = ["sort_name"]

    def get_queryset(self):
        user = self.request.user
        accessible_libraries = (
            Library.objects.all() if user.is_admin else user.libraries.all()
        )
        return (
            Series.objects.filter(library__in=accessible_libraries)
            .select_related("metadata")
            .prefetch_related("metadata__genres", "metadata__tags", "metadata__people")
        )

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SeriesDetailSerializer
        return SeriesListSerializer

    @action(detail=True, methods=["get"])
    def volumes(self, request, pk=None):
        series = self.get_object()
        volumes = series.volumes.prefetch_related("chapters__files").order_by("min_number")
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

    @action(detail=True, methods=["post"], url_path="scan")
    def scan(self, request, pk=None):
        from apps.scanner.tasks import scan_series
        series = self.get_object()
        task = scan_series.delay(series.id)
        return Response({"task_id": task.id, "detail": "Scan da série iniciado."})


class VolumeViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = VolumeSerializer

    def get_queryset(self):
        return Volume.objects.filter(
            series__library__in=self._accessible_libraries()
        ).prefetch_related("chapters")

    def _accessible_libraries(self):
        user = self.request.user
        return Library.objects.all() if user.is_admin else user.libraries.all()


class ChapterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChapterSerializer

    def get_queryset(self):
        return Chapter.objects.filter(
            volume__series__library__in=self._accessible_libraries()
        ).prefetch_related("files")

    def _accessible_libraries(self):
        user = self.request.user
        return Library.objects.all() if user.is_admin else user.libraries.all()


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
