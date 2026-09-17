# Dependency review — 16 September 2026

The committed lockfiles were reviewed with `npm audit --omit=dev` after the final dependency changes. Counts are package findings, including affected parent packages, not necessarily distinct vulnerabilities.

| Application | Critical | High | Moderate | Low |
| --- | ---: | ---: | ---: | ---: |
| API | 0 | 0 | 4 | 0 |
| Worker | 0 | 0 | 0 | 0 |
| Web | 0 | 0 | 0 | 0 |

## Applied changes

Fastify was updated to 5.12.5, Swagger UI to 6.1.1, and React Router DOM to 7.18.4. Compatible transitive dependency updates were included in the API lockfile.

The API and worker retain Prisma 6.19.0 and use scoped overrides for `@prisma/config`: `deepmerge-ts=8.0.0` and `effect=3.20.0`. These address the reported [recursive-merge advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) and [Effect context advisory](https://github.com/advisories/GHSA-38f7-945m-qr2g). Prisma client generation succeeded for both apps; schema validation and the database-backed API tests passed with these overrides.

Deepmerge 8 changes Map-merging behavior, as described in its [release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0). This project has no custom Prisma config file or custom Map configuration. Reassess the overrides when upgrading Prisma or adding custom config, and verify migration deployment on your native PostgreSQL staging host.

## Remaining optional S3 adapter findings

The MinIO 8.0.7 SDK dependency tree still reports four moderate package findings: `minio`, `query-string`, `decode-uri-component`, and `stream-json`. They derive from [malformed URI decoding](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) and [deeply nested JSON filtering](https://github.com/advisories/GHSA-528h-pc64-c93x) denial-of-service advisories. The SDK and parent-package counts overlap.

The default `STORAGE_DRIVER=local` implementation does not load or call the MinIO SDK. S3 is retained for compatibility with existing installations, and the SDK is loaded only when `STORAGE_DRIVER=s3` is explicitly configured. That limits the default runtime's use of this code, but does not remove the findings from the installed dependency tree. Assess/remediate these before enabling or continuing the S3 adapter for organization use. A forced SDK downgrade or incompatible transitive major upgrade was not applied without S3 compatibility testing.

These results cover production npm dependencies at the time checked. They are not a security certification, container-image scan, development-tool audit, or proof that the application has no vulnerabilities. Recheck advisories and container images as part of each deployment.
