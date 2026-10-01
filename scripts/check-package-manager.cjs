#!/usr/bin/env node
// Enforce Yarn for contributors working in this repo directly. When this
// package is installed as a dependency of another project, the consumer is
// free to use whatever package manager they like. That's easy to detect for
// a registry dependency (__dirname sits under the consumer's node_modules),
// but npm resolves a git dependency by staging a clone of this repo under
// its own cache (<cache>/_cacache/tmp/git-clone-*) and running lifecycle
// scripts there *before* copying the result into node_modules, so the
// node_modules check alone misses that case.
const { sep } = require("path");
const stagedUnderNodeModules = __dirname.includes(`${sep}node_modules${sep}`);
const stagedByNpmGitClone = /[/\\]_cacache[/\\]tmp[/\\]git-clone/.test(__dirname);
if (stagedUnderNodeModules || stagedByNpmGitClone) {
    process.exit(0);
}

if (!/\byarn\//.test(process.env.npm_config_user_agent || "")) {
    console.error("\nThis project uses Yarn, not npm/pnpm. Please run:\n\n  yarn\n");
    process.exit(1);
}
