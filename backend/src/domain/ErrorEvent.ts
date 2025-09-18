export type ErrorEvent = {
    timestamp: string; // ISO format
    userId: string;
    browser?: string;
    url?: string;
    errorMessage: string;
    stackTrace?: string;
  };
  