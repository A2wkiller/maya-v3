import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import {lingui} from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({plugins:[react(),babel({plugins:["@lingui/babel-plugin-lingui-macro"]}),lingui(),tailwindcss()],build:{outDir:"/proof-ui",emptyOutDir:true,rollupOptions:{input:"omb-proof.html"}}});
