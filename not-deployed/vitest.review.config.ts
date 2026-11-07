import {defineConfig} from 'vitest/config';
export default defineConfig({esbuild:{jsx:'automatic'},test:{environment:'jsdom',include:['apps/web/src/components/RewriteReviewPanel.test.tsx','apps/web/src/components/QueueStatusPanel.test.tsx'],testTimeout:10000}});
