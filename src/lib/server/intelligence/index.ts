import { createIntelligence } from './service.ts';

// Shared process-local instance. Server callers own authorization and fallback.
export const intelligence = createIntelligence(process.env);
