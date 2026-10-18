export interface DesktopApi {
  auth: {
    getToken(): Promise<string | null>;
    setToken(token: string): Promise<void>;
    clearToken(): Promise<void>;
  };
}

declare global {
  interface Window {
    projectzero: DesktopApi;
  }
}
