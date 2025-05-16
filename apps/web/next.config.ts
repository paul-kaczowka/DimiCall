import type { NextConfig } from "next";
import path from 'node:path'; // Importer path

const nextConfig: NextConfig = {
  /* config options here */
  // Ajouter outputFileTracingRoot pour le développement en monorepo
  ...(process.env.NODE_ENV === 'development' && {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  }),
};

export default nextConfig;
