export default function UserFooter() {
    return (
        <footer className="border-t bg-white">
            <div className="mx-auto max-w-5xl p-4 text-sm text-neutral-500">
                © {new Date().getFullYear()} MyApp — User Area
            </div>
        </footer>
    );
}