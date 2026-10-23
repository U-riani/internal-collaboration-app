import { createECDH } from "node:crypto";

const key = createECDH("prime256v1");
key.generateKeys();
console.log("Put these values in your LOCAL .env or server .env.production:");
console.log(`PUSH_VAPID_PUBLIC_KEY=${key.getPublicKey().toString("base64url")}`);
console.log(`PUSH_VAPID_PRIVATE_KEY=${key.getPrivateKey().toString("base64url")}`);
console.log("PUSH_VAPID_SUBJECT=mailto:YOUR_SUPPORT_EMAIL");
console.log("Keep the private key secret; do not commit it to Git.");
