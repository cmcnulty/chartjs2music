#!/usr/bin/env node
// Enforce Yarn for contributors working in this repo directly. When this
// package is installed as a dependency of another project (e.g. via a git
// dependency), __dirname sits under that consumer's node_modules and the
// consumer is free to use whatever package manager they like.
if (__dirname.includes(`${require("path").sep}node_modules${require("path").sep}`)) {
    process.exit(0);
}

if (!/\byarn\//.test(process.env.npm_config_user_agent || "")) {
    console.error("\nThis project uses Yarn, not npm/pnpm. Please run:\n\n  yarn\n");
    process.exit(1);
}
