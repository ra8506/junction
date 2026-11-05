import type { JunctionApi } from '../../preload/index';

declare global {
  interface Window {
    junction: JunctionApi;
  }
}
export {};
