import { z } from "zod";

export const registrationAge = z.string()
  .trim()
  .regex(/^$|^\d{1,3}$/, "Enter an age between 0 and 150.")
  .transform((value) => value === "" ? null : Number(value))
  .refine((value) => value === null || value <= 150, "Enter an age between 0 and 150.");

export const registrationGender = z.enum(["", "MALE", "FEMALE"], { error: "Choose a valid gender." })
  .transform((value) => value || null);
