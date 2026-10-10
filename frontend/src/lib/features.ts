// Flags de funções da demo (build-time). A cessão tokenizada (função B) só aparece com
// NEXT_PUBLIC_FEATURE_ASSIGNMENT=true e o backend com ASSIGNMENT_ENABLED=true.
export const FEATURE_ASSIGNMENT = process.env.NEXT_PUBLIC_FEATURE_ASSIGNMENT === "true";
