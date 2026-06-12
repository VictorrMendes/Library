import xml.etree.ElementTree as ET
from django.db import IntegrityError
from django.http import HttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import (
    Collection, ReadingList, ReadingListItem, WantToRead, SmartFilter
)
from .serializers import (
    CollectionSerializer,
    CollectionDetailSerializer,
    ReadingListSerializer,
    ReadingListItemSerializer,
    WantToReadSerializer,
    SmartFilterSerializer,
)


class OwnedByUser(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user


class CollectionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, OwnedByUser]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CollectionDetailSerializer
        return CollectionSerializer

    def get_queryset(self):
        return Collection.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ReadingListViewSet(viewsets.ModelViewSet):
    serializer_class = ReadingListSerializer
    permission_classes = [permissions.IsAuthenticated, OwnedByUser]

    def get_queryset(self):
        return ReadingList.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["get"], url_path="export-cbl")
    def export_cbl(self, request, pk=None):
        reading_list = self.get_object()
        items = (
            reading_list.items
            .select_related("chapter__volume__series")
            .order_by("order")
        )

        root = ET.Element("ReadingList")
        root.set("xmlns:xsd", "http://www.w3.org/2001/XMLSchema")
        root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
        ET.SubElement(root, "Name").text = reading_list.title
        items_el = ET.SubElement(root, "Items")

        for item in items:
            chapter = item.chapter
            volume = chapter.volume
            series = volume.series
            li = ET.SubElement(items_el, "ListItem")
            ET.SubElement(li, "Series").text = series.name
            vol_num = str(int(volume.min_number)) if volume.min_number else "0"
            ET.SubElement(li, "Volume").text = vol_num
            ET.SubElement(li, "Chapter").text = (
                chapter.range or str(chapter.min_number)
            )

        xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        response = HttpResponse(xml_bytes, content_type="application/xml")
        safe_title = "".join(
            c if c.isalnum() or c in " -_" else "_"
            for c in reading_list.title
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{safe_title}.cbl"'
        )
        return response

    @action(detail=True, methods=["post"], url_path="import-cbl")
    def import_cbl(self, request, pk=None):
        reading_list = self.get_object()
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "Arquivo CBL obrigatório."}, status=400)

        try:
            tree = ET.parse(file)
            root = tree.getroot()
        except ET.ParseError as e:
            return Response({"detail": f"XML inválido: {e}"}, status=400)

        from apps.library.models import Chapter, Series
        added = 0
        skipped = 0
        max_order = (
            reading_list.items
            .order_by("-order")
            .values_list("order", flat=True)
            .first() or 0
        )

        for li in root.findall(".//ListItem"):
            series_name = (li.findtext("Series") or "").strip()
            chapter_range = (li.findtext("Chapter") or "").strip()
            if not series_name:
                skipped += 1
                continue
            series_qs = Series.objects.filter(name__iexact=series_name)
            if not series_qs.exists():
                skipped += 1
                continue
            chapter_qs = Chapter.objects.filter(
                volume__series__in=series_qs
            )
            if chapter_range:
                chapter_qs = chapter_qs.filter(range=chapter_range)
            chapter = chapter_qs.order_by("sort_order").first()
            if not chapter:
                skipped += 1
                continue
            if not reading_list.items.filter(chapter=chapter).exists():
                max_order += 1
                ReadingListItem.objects.create(
                    reading_list=reading_list, chapter=chapter, order=max_order
                )
                added += 1
            else:
                skipped += 1

        return Response({"added": added, "skipped": skipped})

    @action(detail=True, methods=["get", "post", "delete"], url_path="items")
    def items(self, request, pk=None):
        reading_list = self.get_object()
        if request.method == "GET":
            items = (
                reading_list.items
                .select_related("chapter__volume__series")
                .order_by("order")
            )
            return Response(ReadingListItemSerializer(items, many=True).data)

        if request.method == "POST":
            serializer = ReadingListItemSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            serializer.save(reading_list=reading_list)
            return Response(serializer.data, status=201)

        chapter_id = request.data.get("chapter_id")
        reading_list.items.filter(chapter_id=chapter_id).delete()
        return Response(status=204)


class WantToReadViewSet(viewsets.ModelViewSet):
    serializer_class = WantToReadSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = (
            WantToRead.objects
            .filter(user=self.request.user)
            .select_related("series__metadata")
            .prefetch_related("series__metadata__genres")
        )
        series_id = self.request.query_params.get("series_id")
        if series_id:
            qs = qs.filter(series_id=series_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                {"series_id": ["Série já está na estante."]},
                status=status.HTTP_400_BAD_REQUEST,
            )


class SmartFilterViewSet(viewsets.ModelViewSet):
    serializer_class = SmartFilterSerializer
    permission_classes = [permissions.IsAuthenticated, OwnedByUser]

    def get_queryset(self):
        return SmartFilter.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
