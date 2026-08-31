/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    apiBaseUrl: string;
    savePdf?: (defaultFileName: string) => Promise<{
      canceled: boolean;
      filePath?: string;
    }>;
  };
}
