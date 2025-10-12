export default function FooterPublic() {
  return (
    <footer className="border-t">
      <div className="container mx-auto p-4 text-sm text-gray-600">
        © {new Date().getFullYear()} The Aqua Gen — Public
      </div>
    </footer>
  );
}
