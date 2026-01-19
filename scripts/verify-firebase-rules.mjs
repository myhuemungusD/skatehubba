import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID;
const token = process.env.FIREBASE_TOKEN;

if (!projectId || !token) {
  console.error("Missing FIREBASE_PROJECT_ID or FIREBASE_TOKEN for rules verification.");
  process.exit(1);
}

const runFirebase = (args) =>
  execFileSync("npx", ["firebase-tools@latest", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const normalize = (rules) => rules.replace(/\r\n/g, "\n").trim();

const localFirestoreRules = normalize(
  readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8")
);
const localStorageRules = normalize(
  readFileSync(path.join(process.cwd(), "storage.rules"), "utf8")
);

const remoteFirestoreRules = normalize(
  runFirebase(["firestore:rules:get", "--project", projectId, "--token", token, "--non-interactive"])
);
const remoteStorageRules = normalize(
  runFirebase(["storage:rules:get", "--project", projectId, "--token", token, "--non-interactive"])
);

if (remoteFirestoreRules !== localFirestoreRules) {
  console.error("Firestore rules mismatch between repo and deployed.");
  process.exit(1);
}

if (remoteStorageRules !== localStorageRules) {
  console.error("Storage rules mismatch between repo and deployed.");
  process.exit(1);
}

console.log("Rules verified.");
