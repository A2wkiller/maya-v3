import {defineConfig} from 'vitest/config';
import base from './vitest.config';
export default defineConfig({resolve:base.resolve,test:{environment:'jsdom',include:['apps/web/src/pages/shell/composer.test.tsx'],testTimeout:30000}});
