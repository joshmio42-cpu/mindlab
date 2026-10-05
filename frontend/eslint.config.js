import tseslint from "typescript-eslint";
export default tseslint.config(...tseslint.configs.recommended, {
  ignores: ["src/schema.ts"],
  rules: { "@typescript-eslint/no-explicit-any": "error" },
});
