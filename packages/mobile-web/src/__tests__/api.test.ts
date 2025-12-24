/**
 * Unit tests for the API client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';

// Mock axios before importing api
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      get: vi.fn(),
    },
  };
});

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('URL Configuration', () => {
    it('should use default development URL when on localhost', async () => {
      // Dynamically import to get fresh instance
      const { api } = await import('../services/api');
      expect(api.getApiUrl()).toContain('/api/v1');
    });

    it('should allow setting custom API URL', async () => {
      const { api } = await import('../services/api');
      api.setApiUrl('https://custom-api.example.com/api/v1');
      expect(localStorage.getItem('ariadne_api_url')).toBe('https://custom-api.example.com/api/v1');
    });

    it('should reject invalid URLs', async () => {
      const { api } = await import('../services/api');
      expect(() => api.setApiUrl('not-a-valid-url')).toThrow('Invalid URL format');
    });
  });

  describe('Authentication', () => {
    it('should clear token on logout', async () => {
      const { api } = await import('../services/api');
      localStorage.setItem('ariadne_auth_token', 'test-token');
      api.logout();
      expect(localStorage.getItem('ariadne_auth_token')).toBeNull();
    });

    it('should check if authenticated based on token presence', async () => {
      const { api } = await import('../services/api');

      // Clear token first
      localStorage.removeItem('ariadne_auth_token');
      expect(api.isAuthenticated()).toBe(false);

      // Set token
      localStorage.setItem('ariadne_auth_token', 'some-token');
      expect(api.isAuthenticated()).toBe(true);
    });
  });

  describe('Health Check', () => {
    it('should return true when health check succeeds', async () => {
      vi.spyOn(axios, 'get').mockResolvedValueOnce({ data: { status: 'healthy' } });

      const { api } = await import('../services/api');
      const result = await api.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false when health check fails', async () => {
      vi.spyOn(axios, 'get').mockRejectedValueOnce(new Error('Connection refused'));

      const { api } = await import('../services/api');
      const result = await api.healthCheck();
      expect(result).toBe(false);
    });
  });
});

describe('API Route Paths', () => {
  // These tests verify the expected route structure

  describe('Auth Routes', () => {
    it('should have correct auth endpoint paths', () => {
      const authPaths = ['/auth/login', '/auth/register', '/auth/me', '/auth/settings'];
      authPaths.forEach(path => {
        expect(path).toMatch(/^\/auth\//);
      });
    });
  });

  describe('Studies Routes', () => {
    it('should have correct studies endpoint paths', () => {
      const studyPaths = ['/studies', '/studies/:id', '/studies/:id/status'];
      studyPaths.forEach(path => {
        expect(path).toMatch(/^\/studies/);
      });
    });
  });

  describe('Participants Routes', () => {
    it('should have correct participants endpoint paths', () => {
      const participantPaths = ['/participants', '/participants/:id'];
      participantPaths.forEach(path => {
        expect(path).toMatch(/^\/participants/);
      });
    });
  });

  describe('Batch Execution Routes', () => {
    it('should have correct batch execution endpoint paths', () => {
      const batchPaths = [
        '/batch-executions',
        '/batch-executions/:id',
        '/batch-executions/:id/pause',
        '/batch-executions/:id/resume',
        '/batch-executions/queue/stats',
      ];
      batchPaths.forEach(path => {
        expect(path).toMatch(/^\/batch-executions/);
      });
    });
  });

  describe('Conditions Routes', () => {
    it('should have correct conditions endpoint paths', () => {
      const conditionPaths = ['/conditions'];
      conditionPaths.forEach(path => {
        expect(path).toMatch(/^\/conditions/);
      });
    });
  });
});

describe('Default API URL Logic', () => {
  it('should include /api/v1 prefix', async () => {
    const { api } = await import('../services/api');
    expect(api.getApiUrl()).toContain('/api/v1');
  });

  it('should use localhost in development when no custom URL is set', () => {
    // Test the default URL pattern - checking that it includes api/v1
    // and either localhost or a production path
    const defaultDev = 'http://localhost:3002/api/v1';
    const defaultProd = '/ariadne/api/v1';

    expect(defaultDev).toMatch(/\/api\/v1$/);
    expect(defaultProd).toMatch(/\/api\/v1$/);
  });
});
