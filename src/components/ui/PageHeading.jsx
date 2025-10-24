export default function PageHeading({ title, description }) {
    return (
        <div className="px-4 py-16 text-center sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">{title}</h1>
                <p className="mx-auto mt-4 max-w-xl text-base text-gray-500">
                    {description}
                </p>
        </div>
    );
}
