import CryptoJS from 'crypto-js';

export const hashKey = (prefix: string, payload: unknown) =>
  `${prefix}:${CryptoJS.SHA1(JSON.stringify(payload)).toString()}`;
