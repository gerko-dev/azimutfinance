import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the brvm.org TLS intermediate with serverless functions so
  // NODE_EXTRA_CA_CERTS can resolve it at runtime on Vercel.
  // brvm.org sends only the leaf cert; without this intermediate the live
  // scraper fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
  outputFileTracingIncludes: {
    "/*": ["./certs/**/*"],
  },
  // pdfjs-dist spawns a worker that resolves its sibling pdf.worker.mjs by
  // relative path. Turbopack/webpack hoist the bundle into .next/, which
  // breaks that resolution. Keep pdfjs-dist external so it loads directly
  // from node_modules at runtime.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
