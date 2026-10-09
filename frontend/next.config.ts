import type { NextConfig } from "next";

// §12 do contrato: o build de produção recusa o modo mock.
if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_API_MODE === "mock") {
  throw new Error(
    "NEXT_PUBLIC_API_MODE=mock não é permitido em build de produção. Use `npm run dev` para o modo mock.",
  );
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
