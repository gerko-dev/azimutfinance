import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the brvm.org TLS intermediate with serverless functions so
  // NODE_EXTRA_CA_CERTS can resolve it at runtime on Vercel.
  // brvm.org sends only the leaf cert; without this intermediate the live
  // scraper fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
  outputFileTracingIncludes: {
    "/*": ["./certs/**/*"],
  },
};

export default nextConfig;
