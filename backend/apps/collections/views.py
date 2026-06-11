from rest_framework import generics, viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Collection, ReadingList, ReadingListItem, WantToRead, SmartFilter
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

        # DELETE: remove item by chapter_id
        chapter_id = request.data.get("chapter_id")
        reading_list.items.filter(chapter_id=chapter_id).delete()
        return Response(status=204)


class WantToReadViewSet(viewsets.ModelViewSet):
    serializer_class = WantToReadSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            WantToRead.objects
            .filter(user=self.request.user)
            .select_related("series__metadata")
            .prefetch_related("series__metadata__genres")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SmartFilterViewSet(viewsets.ModelViewSet):
    serializer_class = SmartFilterSerializer
    permission_classes = [permissions.IsAuthenticated, OwnedByUser]

    def get_queryset(self):
        return SmartFilter.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
