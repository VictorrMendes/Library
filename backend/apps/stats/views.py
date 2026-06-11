from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import generics
from .models import ReadingHistory, UserStats
from .serializers import ReadingHistorySerializer, UserStatsSerializer


@api_view(["GET"])
def my_stats(request):
    stats, _ = UserStats.objects.get_or_create(user=request.user)
    return Response(UserStatsSerializer(stats).data)


class ReadingHistoryView(generics.ListAPIView):
    serializer_class = ReadingHistorySerializer

    def get_queryset(self):
        return ReadingHistory.objects.filter(
            user=self.request.user
        ).select_related("series").order_by("-read_at")[:100]


@api_view(["GET"])
def series_stats(request, series_id):
    from apps.reader.models import ReadingProgress
    progress = ReadingProgress.objects.filter(
        user=request.user, series_id=series_id
    )
    total_pages = sum(p.pages_read for p in progress)
    chapters_read = progress.filter(pages_read__gt=0).count()
    return Response({
        "series_id": series_id,
        "total_pages_read": total_pages,
        "chapters_read": chapters_read,
    })
