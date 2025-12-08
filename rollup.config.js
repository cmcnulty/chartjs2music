import typescript from "@rollup/plugin-typescript";

export default [
    {
        input: "src/c2m-plugin.ts",
        output: [
            {
                file: "dist/plugin.js",
                name: "chartjs2music",
                format: "iife"
            }
        ],
        plugins: [
            typescript({tsconfig: "./tsconfig.json"})
        ]
    },
    {
        input: "src/c2m-plugin.ts",
        output: [
            {
                file: "dist/plugin.mjs",
                format: "es"
            }
        ],
        plugins: [
            typescript({
                tsconfig: "./tsconfig.json",
                declaration: true,
                declarationDir: "./dist"
            })
        ]
    },
    {
        input: "src/c2m-plugin.ts",
        output: [
            {
                file: "dist/plugin.amd.js",
                format: "amd"
            }
        ],
        plugins: [
            typescript({tsconfig: "./tsconfig.json"})
        ]
    },
]