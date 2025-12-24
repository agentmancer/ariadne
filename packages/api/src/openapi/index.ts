/**
 * OpenAPI Documentation Entry Point
 * Import all route documentation and generate the complete OpenAPI spec
 */

import { generateOpenAPISpec } from './config';

// Import route documentation (registers paths with the registry)
import './routes/auth';
// TODO: Import other route documentation files as they're created
// import './routes/studies';
// import './routes/participants';
// etc.

/**
 * Get the complete OpenAPI specification
 */
export function getOpenAPISpec() {
  return generateOpenAPISpec();
}

export { registry } from './config';
