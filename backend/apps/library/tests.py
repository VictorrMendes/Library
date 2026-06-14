from django.test import TestCase
from django.db import IntegrityError
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import AccessToken
from apps.accounts.models import User, UserRole
from apps.library.models import (
    Library, Series, Volume, Chapter,
    Genre, Tag, Person,
    LibraryType, PersonRole,
)


class TaxonomyModelTest(TestCase):

    def test_genre_normalized_auto_generated(self):
        genre = Genre.objects.create(name="  Action  ")
        self.assertEqual(genre.normalized, "action")

    def test_tag_normalized_auto_generated(self):
        tag = Tag.objects.create(name="  Sci-Fi  ")
        self.assertEqual(tag.normalized, "sci-fi")

    def test_genre_unique_normalized(self):
        Genre.objects.create(name="Romance")
        with self.assertRaises(IntegrityError):
            Genre.objects.create(name="romance")

    def test_person_unique_per_role(self):
        Person.objects.create(name="Author One", role=PersonRole.WRITER)
        # Same name, different role — allowed
        Person.objects.create(name="Author One", role=PersonRole.PENCILLER)
        # Same name, same role — not allowed
        with self.assertRaises(Exception):
            Person.objects.create(
                name="Author One", role=PersonRole.WRITER
            )


class LibraryModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.library = Library.objects.create(
            name="Test Library",
            type=LibraryType.MANGA,
            folder_paths=["/manga"],
        )

    def test_library_m2m_user_association(self):
        self.library.users.add(self.user)
        self.assertIn(self.library, self.user.libraries.all())

    def test_series_count_serializer_field(self):
        Series.objects.create(library=self.library, name="S1")
        Series.objects.create(library=self.library, name="S2")
        self.assertEqual(self.library.series.count(), 2)


class LibraryViewSetTest(APITestCase):

    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            email="a@t.com",
            password="pass",
            role=UserRole.ADMIN,
        )
        self.user1 = User.objects.create_user(
            username="user1", email="u1@t.com", password="pass"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        self.lib1 = Library.objects.create(
            name="Library 1", folder_paths=["/l1"]
        )
        self.lib1.users.add(self.user1)
        self.lib2 = Library.objects.create(
            name="Library 2", folder_paths=["/l2"]
        )
        self.lib2.users.add(self.user2)

    def test_user_only_sees_own_libraries(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/library/libraries/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [lib["name"] for lib in response.data["results"]]
        self.assertIn("Library 1", names)
        self.assertNotIn("Library 2", names)

    def test_admin_sees_all_libraries(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/library/libraries/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_create_library_adds_creator_to_members(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(
            "/api/library/libraries/",
            {"name": "New Library", "folder_paths": ["/new"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        library = Library.objects.get(name="New Library")
        self.assertIn(self.user1, library.users.all())

    def test_created_library_appears_in_subsequent_list(self):
        """Library created by user must show in their queryset (M2M add)."""
        self.client.force_authenticate(user=self.user2)
        self.client.post(
            "/api/library/libraries/",
            {"name": "User2 New Lib", "folder_paths": ["/u2"]},
            format="json",
        )
        response = self.client.get("/api/library/libraries/")
        names = [lib["name"] for lib in response.data["results"]]
        self.assertIn("User2 New Lib", names)

    def test_unauthenticated_returns_401(self):
        response = self.client.get("/api/library/libraries/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_cannot_access_other_library(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(
            f"/api/library/libraries/{self.lib2.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SeriesViewSetTest(APITestCase):

    def setUp(self):
        self.user1 = User.objects.create_user(
            username="user1", email="u1@t.com", password="pass"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        self.lib1 = Library.objects.create(
            name="Library 1", folder_paths=["/l1"]
        )
        self.lib1.users.add(self.user1)
        self.lib2 = Library.objects.create(
            name="Library 2", folder_paths=["/l2"]
        )
        self.lib2.users.add(self.user2)
        self.series1 = Series.objects.create(
            library=self.lib1, name="Series 1"
        )
        self.series2 = Series.objects.create(
            library=self.lib2, name="Series 2"
        )

    def test_user_only_sees_own_library_series(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/library/series/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [s["name"] for s in response.data["results"]]
        self.assertIn("Series 1", names)
        self.assertNotIn("Series 2", names)

    def test_user_cannot_retrieve_other_library_series(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(
            f"/api/library/series/{self.series2.pk}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_search_respects_library_access(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(
            "/api/library/series/?search=Series+2"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)

    def test_filter_by_library_id(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.get(
            f"/api/library/series/?library={self.lib1.pk}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["name"], "Series 1"
        )


class ScanStreamAuthTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="viewer", email="v@t.com", password="pass"
        )
        self.url = "/api/library/scan-stream/"

    def test_no_cookie_returns_401(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_token_cookie_returns_401(self):
        self.client.cookies["access_token"] = "not.a.valid.token"
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_valid_token_cookie_opens_stream(self):
        token = str(AccessToken.for_user(self.user))
        self.client.cookies["access_token"] = token
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/event-stream")
