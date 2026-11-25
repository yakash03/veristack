// VeriStack — Sample Real package.json Templates for Live Multi-Source Scanning

export interface ManifestSample {
  id: string;
  label: string;
  description: string;
  packageJsonText: string;
}

export const SAMPLE_MANIFESTS: readonly ManifestSample[] = [
  {
    id: "legacy-node-api",
    label: "Legacy Express API",
    description: "Pinned dependencies with real public OSV CVEs and safe upgrade paths",
    packageJsonText: JSON.stringify(
      {
        name: "legacy-checkout-service",
        version: "1.4.2",
        dependencies: {
          express: "^4.17.1",
          lodash: "4.17.15",
          axios: "0.21.1",
          jsonwebtoken: "8.5.1",
          minimist: "1.2.5",
        },
        devDependencies: {
          typescript: "^5.6.3",
        },
      },
      null,
      2
    ),
  },
  {
    id: "modern-nextjs",
    label: "Modern TypeScript App",
    description: "Clean permissive React / Next.js / Zod / Tailwind stack",
    packageJsonText: JSON.stringify(
      {
        name: "modern-saas-portal",
        version: "2.1.0",
        dependencies: {
          next: "16.4.6",
          react: "19.3.0",
          "react-dom": "19.3.0",
          zod: "^3.24.2",
        },
        devDependencies: {
          vitest: "^3.1.1",
          eslint: "^9.20.0",
        },
      },
      null,
      2
    ),
  },
  {
    id: "mixed-deprecation",
    label: "Maintenance & License Check",
    description: "Demonstrates deprecated npm package and license policy flags",
    packageJsonText: JSON.stringify(
      {
        name: "worker-pipeline",
        version: "0.9.0",
        dependencies: {
          request: "^2.88.2",
          uuid: "^3.4.0",
          chalk: "^5.3.0",
          semver: "7.5.1",
        },
      },
      null,
      2
    ),
  },
] as const;
