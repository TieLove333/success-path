/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Lock embedding to the WP members site
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://members.porchlyte.com; base-uri 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
