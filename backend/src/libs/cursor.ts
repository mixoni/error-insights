export type CursorPayload = {
    pitId: string;
    sort: [number | string, string];
    size: number;
    order: 'asc' | 'desc';
  };
  
  export function encodeCursor(c: CursorPayload): string {
    return Buffer.from(JSON.stringify(c), 'utf8').toString('base64');
  }
  export function decodeCursor(token: string): CursorPayload {
    return JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  }
  