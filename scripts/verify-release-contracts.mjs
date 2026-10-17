import fs from "node:fs";
import assert from "node:assert/strict";
import YAML from "yaml";
import { hash } from "./contract-hash.mjs";
for (const release of [
  "v1.0.0-demo",
  "pre-b2-working-tree",
  "b2-v1.1-dev",
  "b3-v1.1-dev",
]) {
  const dir = `contracts/openapi/releases/${release}`;
  const freeze = JSON.parse(fs.readFileSync(`${dir}/freeze.json`, "utf8"));
  for (const surface of ["customer", "public"]) {
    assert.equal(
      hash(YAML.parse(fs.readFileSync(`${dir}/${surface}.yaml`, "utf8"))),
      freeze[surface].sha256,
    );
    console.log(
      release,
      surface,
      freeze[surface].revision,
      freeze[surface].sha256,
    );
  }
}
assert.equal(
  hash(YAML.parse(fs.readFileSync("contracts/openapi/public.yaml", "utf8"))),
  "460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef",
);
