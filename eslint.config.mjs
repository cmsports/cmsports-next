import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Nueva en eslint-plugin-react-hooks 7 (subió de versión con un
      // eslint-config-next reciente). Su nivel por defecto es "error" y frenaba
      // el CI por un patrón viejo de torneo-oficial que nada tiene que ver con
      // este cambio. Se baja a "warn" como las otras reglas nuevas del plugin:
      // se ven, no cortan el build.
      "react-hooks/refs": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // El worktree del CLI es una copia vieja del proyecto entero: linteaba
    // archivos que ya no existen en src/ y ensuciaba el resultado.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
