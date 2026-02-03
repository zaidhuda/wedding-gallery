import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { EventTitle } from "../../constants";

export type PhotoFormValues = {
  file?: File;
  name: string;
  message: string;
  eventTag: EventTitle;
};

type Props = {
  children: ReactNode;
  form: UseFormReturn<PhotoFormValues>;
  PhotoElement: React.FC;
  onSubmit: (data: PhotoFormValues) => void;
};

export default function BaseForm({
  children,
  form,
  PhotoElement,
  onSubmit,
}: Props) {
  return (
    <form
      className="modal-form"
      aria-label="Photo upload form"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <PhotoElement />
      <div className="form-field">
        <label className="form-label" htmlFor="name">
          Your Name
        </label>
        <input
          {...form.register("name")}
          type="text"
          className="form-input form-input-handwriting"
          placeholder="Write your name here..."
          aria-required="true"
          maxLength={50}
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="message">
          Message (Optional)
        </label>
        <textarea
          {...form.register("message")}
          className="form-input form-textarea form-input-handwriting"
          placeholder="A few words about this moment..."
          aria-required="false"
          maxLength={500}
        ></textarea>
      </div>
      {children}
      <p className="form-helper-text">
        You can edit or delete your entry from this device within 1 hour after
        posting.
      </p>
    </form>
  );
}
