export default function Button({ className = "", children, ...props }) {
  return (
    <button
      className={`px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}