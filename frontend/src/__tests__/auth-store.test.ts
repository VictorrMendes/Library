import { useAuthStore } from "@/store/auth";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock });

// Mock document.cookie
let cookieStore = "";
Object.defineProperty(document, "cookie", {
  get: () => cookieStore,
  set: (val: string) => { cookieStore = val; },
  configurable: true,
});

beforeEach(() => {
  localStorageMock.clear();
  cookieStore = "";
  // Reset the store state
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
});

describe("useAuthStore", () => {
  it("setTokens persists access and refresh tokens in localStorage", () => {
    useAuthStore.getState().setTokens("access123", "refresh456");

    expect(localStorage.getItem("access_token")).toBe("access123");
    expect(localStorage.getItem("refresh_token")).toBe("refresh456");
  });

  it("setTokens sets access_token cookie", () => {
    useAuthStore.getState().setTokens("mytoken", "myrefresh");

    expect(document.cookie).toContain("access_token=mytoken");
  });

  it("setTokens updates store state", () => {
    useAuthStore.getState().setTokens("tok", "ref");

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("tok");
    expect(state.refreshToken).toBe("ref");
  });

  it("logout clears localStorage tokens", () => {
    localStorage.setItem("access_token", "tok");
    localStorage.setItem("refresh_token", "ref");

    useAuthStore.getState().logout();

    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  it("logout clears store state", () => {
    useAuthStore.setState({ user: { username: "test" } as never, accessToken: "tok", refreshToken: "ref" });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
  });

  it("isAdmin returns true for admin role", () => {
    useAuthStore.setState({
      user: { id: 1, username: "admin", email: "", role: "admin" } as never,
    });

    expect(useAuthStore.getState().isAdmin).toBe(true);
  });

  it("isAdmin returns false for user role", () => {
    useAuthStore.setState({
      user: { id: 1, username: "user", email: "", role: "user" } as never,
    });

    expect(useAuthStore.getState().isAdmin).toBe(false);
  });

  it("isAdmin returns false when user is null", () => {
    useAuthStore.setState({ user: null });

    expect(useAuthStore.getState().isAdmin).toBe(false);
  });
});
