/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // NOT: `typescript.ignoreBuildErrors` ve `eslint` anahtarları bilerek YOK.
  // Öncekinde ignoreBuildErrors=true vardı; tip hataları sessizce üretime gidiyordu.
  // Artık `next build` tip hatasında kırılır — kapı build'in kendisi.
};

export default nextConfig;
