// Shared Server Action result shape (client-safe: pure types, no server imports).
export interface FormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export const EMPTY_FORM_STATE: FormState = {};
