from django.test import TestCase
from django.db import IntegrityError
from rest_framework.test import APITestCase
from rest_framework import status
from apps.accounts.models import User
from apps.library.models import Library, Series
from apps.collections.models import Collection, WantToRead, ReadingList


class WantToReadModelTest(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.series = Series.objects.create(
            library=self.lib, name="Series 1"
        )

    def test_unique_constraint_user_series(self):
        WantToRead.objects.create(
            user=self.user, series=self.series
        )
        with self.assertRaises(Exception):
            WantToRead.objects.create(
                user=self.user, series=self.series
            )

    def test_different_users_can_have_same_series(self):
        user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        WantToRead.objects.create(user=self.user, series=self.series)
        WantToRead.objects.create(user=user2, series=self.series)
        self.assertEqual(WantToRead.objects.count(), 2)


class CollectionViewSetTest(APITestCase):

    def setUp(self):
        self.user1 = User.objects.create_user(
            username="user1", email="u1@t.com", password="pass"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )

    def test_user_only_sees_own_collections(self):
        Collection.objects.create(
            owner=self.user1, title="My Collection"
        )
        Collection.objects.create(
            owner=self.user2, title="Other Collection"
        )
        self.client.force_authenticate(user=self.user1)
        response = self.client.get("/api/collections/collections/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [c["title"] for c in response.data["results"]]
        self.assertIn("My Collection", titles)
        self.assertNotIn("Other Collection", titles)

    def test_create_collection_sets_owner(self):
        self.client.force_authenticate(user=self.user1)
        response = self.client.post(
            "/api/collections/collections/",
            {"title": "New Collection"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        col = Collection.objects.get(title="New Collection")
        self.assertEqual(col.owner, self.user1)

    def test_cannot_update_other_users_collection(self):
        col2 = Collection.objects.create(
            owner=self.user2, title="User2 Collection"
        )
        self.client.force_authenticate(user=self.user1)
        response = self.client.patch(
            f"/api/collections/collections/{col2.pk}/",
            {"title": "Hacked"},
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
        )

    def test_cannot_delete_other_users_collection(self):
        col2 = Collection.objects.create(
            owner=self.user2, title="User2 Collection"
        )
        self.client.force_authenticate(user=self.user1)
        response = self.client.delete(
            f"/api/collections/collections/{col2.pk}/"
        )
        self.assertIn(
            response.status_code,
            [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND],
        )

    def test_delete_own_collection(self):
        col = Collection.objects.create(
            owner=self.user1, title="My Collection"
        )
        self.client.force_authenticate(user=self.user1)
        response = self.client.delete(
            f"/api/collections/collections/{col.pk}/"
        )
        self.assertEqual(
            response.status_code, status.HTTP_204_NO_CONTENT
        )
        self.assertFalse(Collection.objects.filter(pk=col.pk).exists())


class WantToReadViewSetTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.lib = Library.objects.create(
            name="Lib", folder_paths=["/l"]
        )
        self.lib.users.add(self.user)
        self.series = Series.objects.create(
            library=self.lib, name="Series 1"
        )
        self.client.force_authenticate(user=self.user)

    def test_add_to_want_to_read(self):
        response = self.client.post(
            "/api/collections/want-to-read/",
            {"series_id": self.series.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_cannot_add_same_series_twice(self):
        self.client.post(
            "/api/collections/want-to-read/",
            {"series_id": self.series.pk},
        )
        response = self.client.post(
            "/api/collections/want-to-read/",
            {"series_id": self.series.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_remove_from_want_to_read(self):
        resp = self.client.post(
            "/api/collections/want-to-read/",
            {"series_id": self.series.pk},
        )
        item_id = resp.data["id"]
        response = self.client.delete(
            f"/api/collections/want-to-read/{item_id}/"
        )
        self.assertEqual(
            response.status_code, status.HTTP_204_NO_CONTENT
        )
        self.assertFalse(
            WantToRead.objects.filter(
                user=self.user, series=self.series
            ).exists()
        )

    def test_user_only_sees_own_want_to_read(self):
        user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        series2 = Series.objects.create(
            library=self.lib, name="Series 2"
        )
        WantToRead.objects.create(user=self.user, series=self.series)
        WantToRead.objects.create(user=user2, series=series2)
        response = self.client.get("/api/collections/want-to-read/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)


class ReadingListViewSetTest(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="user", email="u@t.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)

    def test_create_reading_list(self):
        response = self.client.post(
            "/api/collections/reading-lists/",
            {"title": "My List"},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        rl = ReadingList.objects.get(title="My List")
        self.assertEqual(rl.owner, self.user)

    def test_user_only_sees_own_lists(self):
        user2 = User.objects.create_user(
            username="user2", email="u2@t.com", password="pass"
        )
        ReadingList.objects.create(owner=self.user, title="My List")
        ReadingList.objects.create(owner=user2, title="Their List")
        response = self.client.get("/api/collections/reading-lists/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [r["title"] for r in response.data["results"]]
        self.assertIn("My List", titles)
        self.assertNotIn("Their List", titles)
