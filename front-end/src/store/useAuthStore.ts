import { create } from "zustand";
import { fetchSession, login, logout, register, type AuthResponse, type AuthUser, type LoginPayload, type RegisterPayload } from "../api/client";
import { getDefaultDemoUser, getDemoUserByRole } from "../constants/demoUsers";

const SESSION_KEY = "apron-platform-session";

interface AuthState {
  currentUser?: AuthUser;
  sessionId?: string;
  loading: boolean;
  bootstrapped: boolean;
  isDemoMode: boolean;
  hydrate: () => Promise<void>;
  loginWithPassword: (payload: LoginPayload) => Promise<AuthResponse>;
  registerAccount: (payload: RegisterPayload) => Promise<AuthResponse>;
  logoutCurrent: () => Promise<void>;
  switchRole: (role: string) => void;
}

function writeSession(sessionId?: string) {
  if (typeof window === "undefined") return;
  if (sessionId) {
    window.localStorage.setItem(SESSION_KEY, sessionId);
    return;
  }
  window.localStorage.removeItem(SESSION_KEY);
}

function buildDemoState(role?: string) {
  const demoUser = getDemoUserByRole(role);
  return {
    currentUser: demoUser,
    sessionId: undefined,
    loading: false,
    bootstrapped: true,
    isDemoMode: true
  };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: getDefaultDemoUser(),
  sessionId: undefined,
  loading: false,
  bootstrapped: false,
  isDemoMode: true,
  async hydrate() {
    if (get().bootstrapped || get().loading) return;
    set({ loading: true });
    try {
      const sessionId = typeof window === "undefined" ? undefined : window.localStorage.getItem(SESSION_KEY) || undefined;
      if (!sessionId) {
        set(buildDemoState());
        return;
      }
      const response = await fetchSession(sessionId);
      set({
        currentUser: response.user,
        sessionId: response.session_id,
        bootstrapped: true,
        loading: false,
        isDemoMode: false
      });
    } catch {
      writeSession(undefined);
      set(buildDemoState());
    }
  },
  async loginWithPassword(payload) {
    set({ loading: true });
    try {
      const response = await login(payload);
      writeSession(response.session_id);
      set({
        currentUser: response.user,
        sessionId: response.session_id,
        bootstrapped: true,
        loading: false,
        isDemoMode: false
      });
      return response;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async registerAccount(payload) {
    set({ loading: true });
    try {
      const response = await register(payload);
      writeSession(response.session_id);
      set({
        currentUser: response.user,
        sessionId: response.session_id,
        bootstrapped: true,
        loading: false,
        isDemoMode: false
      });
      return response;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
  async logoutCurrent() {
    const sessionId = get().sessionId;
    set({ loading: true });
    try {
      if (sessionId) {
        await logout(sessionId);
      }
    } finally {
      writeSession(undefined);
      set(buildDemoState());
    }
  },
  switchRole(role) {
    writeSession(undefined);
    set(buildDemoState(role));
  }
}));
