/**
 * Vitest setup file
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock import.meta.env
vi.stubGlobal('import.meta.env', {
  DEV: true,
  PROD: false,
  MODE: 'test',
});
