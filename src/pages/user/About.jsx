import { Container } from "../../components/ui/Container";
import PageHeading from "../../components/ui/PageHeading";

export default function About() {
    return (
        <Container className="my-16">
            <PageHeading title="Welcome to Our Platform" description="Build modern, elegant UIs with simplicity and speed." />
        </Container>
    );
}