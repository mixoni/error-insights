export type ErrorEvent = {
    timestamp: string; 
    userId: string;
    browser?: string;
    url?: string;
    errorMessage: string;
    stackTrace?: string;
  };
  