import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single in-flight refresh promise — prevents race condition when multiple
// requests expire simultaneously (each would otherwise refresh independently).
let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          const refresh = localStorage.getItem("refresh_token");
          refreshPromise = axios
            .post(`${api.defaults.baseURL}/account/token/refresh/`, { refresh })
            .then(({ data }) => {
              localStorage.setItem("access_token", data.access);
              document.cookie = `access_token=${data.access}; path=/; max-age=3600; SameSite=Strict`;
              return data.access as string;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        refreshPromise = null;
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        document.cookie = "access_token=; path=/; max-age=0; SameSite=Strict";
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    api.post("/account/login/", { username, password }),
  register: (data: { username: string; email: string; password: string }) =>
    api.post("/account/register/", data),
  me: () => api.get("/account/me/"),
  updatePreferences: (data: Record<string, unknown>) =>
    api.patch("/account/me/preferences/", data),
  changePassword: (current_password: string, new_password: string) =>
    api.post("/account/me/password/", { current_password, new_password }),
  updateProfile: (data: FormData | { email?: string; username?: string }) =>
    api.patch("/account/me/", data, {
      headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : {},
    }),
};

// ─── Library ─────────────────────────────────────────────────────────────────
export const libraryApi = {
  list: () => api.get("/library/libraries/"),
  get: (id: number) => api.get(`/library/libraries/${id}/`),
  create: (data: unknown) => api.post("/library/libraries/", data),
  update: (id: number, data: unknown) => api.patch(`/library/libraries/${id}/`, data),
  delete: (id: number) => api.delete(`/library/libraries/${id}/`),
  scan: (id: number) => api.post(`/library/libraries/${id}/scan/`),
};

// ─── Series ──────────────────────────────────────────────────────────────────
export const seriesApi = {
  list: (params?: Record<string, unknown>) => api.get("/library/series/", { params }),
  get: (id: number) => api.get(`/library/series/${id}/`),
  volumes: (id: number) => api.get(`/library/series/${id}/volumes/`),
  updateMetadata: (id: number, data: unknown) =>
    api.patch(`/library/series/${id}/metadata/`, data),
  uploadCover: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("cover", file);
    return api.post(`/library/series/${id}/cover/`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  fetchMetadata: (id: number) => api.get(`/library/series/${id}/fetch-metadata/`),
  applyMetadata: (id: number, data: Record<string, unknown>) =>
    api.post(`/library/series/${id}/apply-metadata/`, data),
  anilistMetadata: (id: number) => api.get(`/library/series/${id}/anilist-metadata/`),
  scan: (id: number) => api.post(`/library/series/${id}/scan/`),
  delete: (id: number) => api.delete(`/library/series/${id}/`),
  // Relations
  getRelations: (id: number) => api.get(`/library/series/${id}/relations/`),
  addRelation: (id: number, target_id: number, relation_type: string) =>
    api.post(`/library/series/${id}/relations/`, { target_id, relation_type }),
  deleteRelation: (id: number, relationId: number) =>
    api.delete(`/library/series/${id}/relations/${relationId}/`),
};

// ─── Reader ──────────────────────────────────────────────────────────────────
export const readerApi = {
  chapterImages: (chapterId: number) =>
    api.get(`/reader/chapter/${chapterId}/images/`),
  imageUrl: (chapterId: number, page: number) =>
    `${api.defaults.baseURL}/reader/chapter/${chapterId}/image/${page}/`,
  pdfUrl: (chapterId: number) =>
    `${api.defaults.baseURL}/reader/chapter/${chapterId}/pdf/`,
  continuePoint: (seriesId: number) =>
    api.get(`/reader/series/${seriesId}/continue/`),
  seriesProgress: (seriesId: number) =>
    api.get(`/reader/series/${seriesId}/progress/`),
  updateProgress: (data: { chapter_id: number; pages_read: number; book_scroll_id?: string }) =>
    api.post("/reader/progress/", data),
  bookmarks: () => api.get("/reader/bookmarks/"),
  createBookmark: (data: unknown) => api.post("/reader/bookmarks/", data),
  deleteBookmark: (id: number) => api.delete(`/reader/bookmarks/${id}/`),
  annotations: (chapterId?: number) =>
    api.get("/reader/annotations/", { params: chapterId ? { chapter_id: chapterId } : {} }),
  createAnnotation: (data: unknown) => api.post("/reader/annotations/", data),
  updateAnnotation: (id: number, data: unknown) =>
    api.patch(`/reader/annotations/${id}/`, data),
  deleteAnnotation: (id: number) => api.delete(`/reader/annotations/${id}/`),
};

// ─── Collections ─────────────────────────────────────────────────────────────
export const collectionsApi = {
  list: () => api.get("/collections/collections/"),
  get: (id: number) => api.get(`/collections/collections/${id}/`),
  create: (data: unknown) => api.post("/collections/collections/", data),
  update: (id: number, data: unknown) => api.patch(`/collections/collections/${id}/`, data),
  delete: (id: number) => api.delete(`/collections/collections/${id}/`),
  readingLists: () => api.get("/collections/reading-lists/"),
  createReadingList: (data: unknown) => api.post("/collections/reading-lists/", data),
  updateReadingList: (id: number, data: unknown) => api.patch(`/collections/reading-lists/${id}/`, data),
  deleteReadingList: (id: number) => api.delete(`/collections/reading-lists/${id}/`),
  wantToRead: (params?: Record<string, unknown>) =>
    api.get("/collections/want-to-read/", { params }),
  addWantToRead: (series_id: number, status = "want_to_read") =>
    api.post("/collections/want-to-read/", { series_id, status }),
  updateWantToRead: (id: number, status: string) =>
    api.patch(`/collections/want-to-read/${id}/`, { status }),
  removeWantToRead: (id: number) =>
    api.delete(`/collections/want-to-read/${id}/`),
  smartFilters: () => api.get("/collections/smart-filters/"),
  createSmartFilter: (data: unknown) => api.post("/collections/smart-filters/", data),
  readingListItems: (id: number) => api.get(`/collections/reading-lists/${id}/items/`),
  exportCbl: (id: number) =>
    api.get(`/collections/reading-lists/${id}/export-cbl/`, { responseType: "blob" }),
  importCbl: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`/collections/reading-lists/${id}/import-cbl/`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ─── Scrobble ────────────────────────────────────────────────────────────────
export const scrobbleApi = {
  list: () => api.get("/account/scrobble-credentials/"),
  save: (provider: string, access_token: string) =>
    api.post("/account/scrobble-credentials/", { provider, access_token }),
  revoke: (provider: string) =>
    api.delete(`/account/scrobble-credentials/${provider}/`),
};

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminApi = {
  users: {
    list: () => api.get("/account/users/"),
    get: (id: number) => api.get(`/account/users/${id}/`),
    update: (id: number, data: unknown) => api.patch(`/account/users/${id}/`, data),
    delete: (id: number) => api.delete(`/account/users/${id}/`),
  },
};

// ─── Scanner ─────────────────────────────────────────────────────────────────
export const scannerApi = {
  jobs: (libraryId?: number) =>
    api.get("/scanner/jobs/", { params: libraryId ? { library_id: libraryId } : {} }),
  scanAll: () => api.post("/scanner/scan-all/"),
  upload: (formData: FormData, onProgress?: (pct: number) => void) =>
    api.post("/scanner/upload/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    }),
  uploadJobs: () => api.get("/scanner/uploads/"),
  uploadJob: (id: number) => api.get(`/scanner/uploads/${id}/`),
};

// ─── Metadata ────────────────────────────────────────────────────────────────
export const metaApi = {
  genres: () => api.get("/library/genres/", { params: { page_size: 500 } }),
  tags: () => api.get("/library/tags/", { params: { page_size: 500 } }),
};

// ─── Stats ───────────────────────────────────────────────────────────────────
export const statsApi = {
  me: () => api.get("/stats/me/"),
  history: () => api.get("/stats/history/"),
  series: (id: number) => api.get(`/stats/series/${id}/`),
  goals: () => api.get("/stats/goals/"),
  createGoal: (data: { period: string; metric: string; target: number }) =>
    api.post("/stats/goals/", data),
  deleteGoal: (id: number) => api.delete(`/stats/goals/${id}/`),
  activity: (days = 90) => api.get("/stats/activity/", { params: { days } }),
  heatmap: () => api.get("/stats/heatmap/"),
  estimate: (seriesId: number) => api.get(`/stats/estimate/${seriesId}/`),
};

// ─── Ratings ─────────────────────────────────────────────────────────────────
export const ratingsApi = {
  list: (series_id: number) =>
    api.get("/library/ratings/", { params: { series_id } }),
  create: (data: { series_id: number; score: number; review?: string }) =>
    api.post("/library/ratings/", data),
  update: (id: number, data: { score: number; review?: string }) =>
    api.patch(`/library/ratings/${id}/`, data),
  delete: (id: number) => api.delete(`/library/ratings/${id}/`),
};

// ─── People ──────────────────────────────────────────────────────────────────
export const peopleApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/library/people/", { params }),
  get: (id: number) => api.get(`/library/people/${id}/`),
  series: (id: number) => api.get(`/library/people/${id}/series/`),
};

// ─── Media Errors ─────────────────────────────────────────────────────────────
export const mediaErrorsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/library/media-errors/", { params }),
  resolve: (id: number) =>
    api.post(`/library/media-errors/${id}/resolve/`),
  resolveAll: () => api.post("/library/media-errors/resolve-all/"),
};

// ─── EPUB TOC ─────────────────────────────────────────────────────────────────
export const tocApi = {
  get: (chapterId: number) =>
    api.get(`/library/chapters/${chapterId}/toc/`),
};

// ─── Progress export ─────────────────────────────────────────────────────────
export const progressApi = {
  export: () =>
    api.get("/account/me/export/", { responseType: "blob" }),
};

// ─── API Keys ────────────────────────────────────────────────────────────────
export const apiKeysApi = {
  list: () => api.get("/account/api-keys/"),
  create: (label: string) => api.post("/account/api-keys/", { label }),
  revoke: (id: number) => api.delete(`/account/api-keys/${id}/`),
};

// ─── SSE ─────────────────────────────────────────────────────────────────────
export const sseUrl = () =>
  `${api.defaults.baseURL}/library/scan-stream/`;

// ─── Backup & export ─────────────────────────────────────────────────────────
export const backupApi = {
  download: () => api.get("/account/me/backup/", { responseType: "blob" }),
  exportAnnotations: (series_id?: number) =>
    api.get("/account/me/annotations/export/", {
      params: series_id ? { series_id } : {},
      responseType: "blob",
    }),
};

// ─── Version ─────────────────────────────────────────────────────────────────
export const versionApi = {
  check: () => api.get("/account/version/"),
};

// ─── Device Profiles ─────────────────────────────────────────────────────────
export const deviceProfilesApi = {
  list: () => api.get("/account/device-profiles/"),
  save: (data: Record<string, unknown>) =>
    api.post("/account/device-profiles/", data),
  delete: (id: number) => api.delete(`/account/device-profiles/${id}/`),
};

// ─── Scrobble Errors ─────────────────────────────────────────────────────────
export const scrobbleErrorsApi = {
  list: () => api.get("/account/scrobble-errors/"),
  resolve: (id: number) =>
    api.post(`/account/scrobble-errors/${id}/resolve/`),
};

// ─── EPUB Fonts ──────────────────────────────────────────────────────────────
export const fontsApi = {
  list: () => api.get("/library/fonts/"),
  upload: (name: string, file: File) => {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("file", file);
    return api.post("/library/fonts/", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  delete: (id: number) => api.delete(`/library/fonts/${id}/`),
};

// ─── Vocabulary ───────────────────────────────────────────────────────────────
export const vocabularyApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/vocabulary/", { params }),
  create: (data: {
    word: string; translation: string; phonetic?: string; definition?: string;
    example?: string; context_sentence?: string; source_series_name?: string;
    direction?: string;
  }) => api.post("/vocabulary/", data),
  update: (id: number, data: Partial<{ status: string; context_sentence: string }>) =>
    api.patch(`/vocabulary/${id}/`, data),
  delete: (id: number) => api.delete(`/vocabulary/${id}/`),
  review: (entry_id: number, quality: number) =>
    api.post("/vocabulary/review/", { entry_id, quality }),
  exportAnki: () =>
    api.get("/vocabulary/export/anki/", { responseType: "blob" }),
  stats: () => api.get("/vocabulary/stats/"),
};
