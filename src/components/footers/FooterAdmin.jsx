export default function FooterAdmin() {
  return (
    <footer className="border-t bg-gray-100">
      <div className="container mx-auto p-4 text-sm text-gray-600">
        © {new Date().getFullYear()} The Aqua Gen — Admin
      </div>
    </footer>
  );
}