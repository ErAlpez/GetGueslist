import { CircleCheck } from "lucide-react";

export function FormSaveSuccess({ message }: { message: string }) {
  return (
    <p className="form-message form-success form-save-success" role="status">
      <CircleCheck aria-hidden="true" size={16} />
      <span>{message}</span>
    </p>
  );
}
