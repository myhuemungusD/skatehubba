import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const rulesFiles = ["firestore.rules", "storage.rules"].map((file) =>
  path.join(repoRoot, file)
);

const violations = [];
const missing = [];

for (const filePath of rulesFiles) {
  if (!fs.existsSync(filePath)) {
    missing.push(path.basename(filePath));
    continue;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const insecurePattern = /allow\s+[a-zA-Z_,\s]+:\s*if\s*true\s*(?:;|\r?\n|$)/gi;
  if (insecurePattern.test(contents)) {
    violations.push(`${path.basename(filePath)} contains an "allow ...: if true" rule`);
  }
}

if (missing.length > 0) {
  console.error(`Missing Firebase rules files: ${missing.join(", ")}`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error("Insecure Firebase rules detected:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Firebase rules verified.");
