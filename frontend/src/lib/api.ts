import axios from "axios";

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

const apiBaseUrl =
  window.electronAPI?.apiBaseUrl ?? import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({
  baseURL: apiBaseUrl
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth.token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>("/auth/login", { username, password });
  localStorage.setItem("auth.token", response.data.token);
  return response.data;
}

export async function getMe(): Promise<AuthUser> {
  const response = await api.get<{ user: AuthUser }>("/auth/me");
  return response.data.user;
}

export function logout(): void {
  localStorage.removeItem("auth.token");
}

