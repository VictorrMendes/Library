from rest_framework.test import APITestCase
from rest_framework import status
from django.test import TestCase
from apps.accounts.models import User
from apps.library.models import Library, Series, Volume, Chapter
from apps.reader.models import ReadingProgress
from apps.stats.models import UserStats, ReadingHistory


class UserStatsModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )

    def test_total_reading_hours_calculation(self):
        stats = UserStats.objects.create(
            user=self.user, total_reading_time_minutes=90
        )
        self.assertEqual(stats.total_reading_hours, 1.5)

    def test_total_reading_hours_zero(self):
        stats = UserStats.objects.create(user=self.user)
        self.assertEqual(stats.total_reading_hours, 0.0)

    def test_total_reading_hours_rounds_to_one_decimal(self):
        stats = UserStats.objects.create(
            user=self.user, total_reading_time_minutes=100
        )
        # 100 / 60 = 1.666... → 1.7
        self.assertEqual(stats.total_reading_hours, 1.7)

    def test_one_to_one_with_user(self):
        stats = UserStats.objects.create(user=self.user)
        self.assertEqual(stats.user, self.user)
        with self.assertRaises(Exception):
            UserStats.objects.create(user=self.user)


class MyStatsViewTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)

    def test_returns_stats_for_current_user(self):
        UserStats.objects.create(
            user=self.user, total_pages_read=100
        )
        response = self.client.get("/api/stats/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_pages_read"], 100)

    def test_creates_stats_if_not_exists(self):
        response = self.client.get("/api/stats/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            UserStats.objects.filter(user=self.user).exists()
        )

    def test_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/stats/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class SeriesStatsViewTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.lib.users.add(self.user)
        self.series = Series.objects.create(
            library=self.lib, name="S1"
        )
        self.volume = Volume.objects.create(
            series=self.series, name="Vol 1", min_number=1, max_number=1
        )
        self.ch1 = Chapter.objects.create(
            volume=self.volume,
            min_number=1,
            max_number=1,
            sort_order=1,
            pages=10,
        )
        self.ch2 = Chapter.objects.create(
            volume=self.volume,
            min_number=2,
            max_number=2,
            sort_order=2,
            pages=15,
        )

    def test_aggregates_total_pages(self):
        ReadingProgress.objects.create(
            user=self.user,
            chapter=self.ch1,
            series=self.series,
            library=self.lib,
            pages_read=10,
        )
        ReadingProgress.objects.create(
            user=self.user,
            chapter=self.ch2,
            series=self.series,
            library=self.lib,
            pages_read=8,
        )
        response = self.client.get(
            f"/api/stats/series/{self.series.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_pages_read"], 18)

    def test_chapters_read_excludes_unstarted(self):
        ReadingProgress.objects.create(
            user=self.user,
            chapter=self.ch1,
            series=self.series,
            library=self.lib,
            pages_read=10,
        )
        ReadingProgress.objects.create(
            user=self.user,
            chapter=self.ch2,
            series=self.series,
            library=self.lib,
            pages_read=0,  # not started
        )
        response = self.client.get(
            f"/api/stats/series/{self.series.pk}/"
        )
        self.assertEqual(response.data["chapters_read"], 1)

    def test_empty_series_returns_zeros(self):
        response = self.client.get(
            f"/api/stats/series/{self.series.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_pages_read"], 0)
        self.assertEqual(response.data["chapters_read"], 0)

    def test_only_counts_own_progress(self):
        user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        ReadingProgress.objects.create(
            user=self.user,
            chapter=self.ch1,
            series=self.series,
            library=self.lib,
            pages_read=5,
        )
        ReadingProgress.objects.create(
            user=user2,
            chapter=self.ch1,
            series=self.series,
            library=self.lib,
            pages_read=10,
        )
        response = self.client.get(
            f"/api/stats/series/{self.series.pk}/"
        )
        self.assertEqual(response.data["total_pages_read"], 5)
