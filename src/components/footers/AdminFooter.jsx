export default function AdminFooter() {
    return (
        <footer className="border-t bg-white">
            <div className="mx-auto max-w-5xl p-4 text-sm text-neutral-500">
                © {new Date().getFullYear()} MyApp — Admin Area
            </div>
        </footer>
    );
}