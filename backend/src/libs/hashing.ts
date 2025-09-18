import CryptoJS from 'crypto-js';

export const hashKey = (prefix: string, payload: unknown) =>
  `${prefix}:v1:${CryptoJS.SHA1(JSON.stringify(payload)).toString()}`;