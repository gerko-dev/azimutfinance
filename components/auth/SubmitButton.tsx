"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel?: string;
};

export default function SubmitButton({ label, pendingLabel }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full px-4 py-2.5 text-sm font-medium bg-blue-700 text-white rounded-md hover:bg-blue-800 disabled:bg-blue-300 disabled:cursor-not-allowed"
    >
      {pending ? (pendingLabel ?? "Patiente...") : label}
    </button>
  );
}
