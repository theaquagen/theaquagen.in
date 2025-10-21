import { forwardRef } from "react";

const Input = forwardRef(({ className = "", ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={
        "flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm ring-offset-background " +
        "placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 " +
        "disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
      {...props}
    />
  );
});
Input.displayName = "Input";
export default Input;