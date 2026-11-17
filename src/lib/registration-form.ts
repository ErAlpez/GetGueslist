export const registrationQuestionTypes = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "SELECT",
  "CHECKBOX",
] as const;

export type RegistrationQuestionType = (typeof registrationQuestionTypes)[number];

export type RegistrationFormQuestion = {
  id: string;
  label: string;
  type: RegistrationQuestionType;
  required: boolean;
  options: string[];
};

export type RegistrationQuestionDraft = Omit<RegistrationFormQuestion, "id"> & {
  id?: string;
  locked?: boolean;
};

export function isRegistrationQuestionType(value: string): value is RegistrationQuestionType {
  return (registrationQuestionTypes as readonly string[]).includes(value);
}

export function readRegistrationQuestionOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((option): option is string => typeof option === "string") : [];
}
