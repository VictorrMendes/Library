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

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem("refresh_token");
        const { data } = await axios.post(
          `${api.defaults.baseURL}/account/token/refresh/`,
          { refresh }
        );
        localStorage.setItem("access_token", data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
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
  scan: (id: number) => api.post(`/library/series/${id}/scan/`),
  delete: (id: number) => api.delete(`/library/series/${id}/`),
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
  wantToRead: () => api.get("/collections/want-to-read/"),
  addWantToRead: (series_id: number) =>
    api.post("/collections/want-to-read/", { series_id }),
  removeWantToRead: (id: number) => api.delete(`/collections/want-to-read/${id}/`),
  smartFilters: () => api.get("/collections/smart-filters/"),
  createSmartFilter: (data: unknown) => api.post("/collections/smart-filters/", data),
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
  genres: () => api.get("/library/genres/"),
  tags: () => api.get("/library/tags/"),
};

// ─── Stats ───────────────────────────────────────────────────────────────────
export const statsApi = {
  me: () => api.get("/stats/me/"),
  history: () => api.get("/stats/history/"),
  series: (id: number) => api.get(`/stats/series/${id}/`),
};
