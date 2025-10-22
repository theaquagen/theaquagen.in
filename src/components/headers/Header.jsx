import { Navbar } from './Navbar'
import { Gradient } from '../ui/Gradient'
import { Container } from '../ui/Container'
import { Button } from '../ui/NewButton'

export default function Header() {
    return (
        <div className="relative">
            <Gradient className="absolute inset-2 bottom-0 rounded-4xl ring-1 ring-black/5 ring-inset" />
            <Container className="relative">
                <Navbar />
                
                <div className="pt-16 pb-24 sm:pt-24 sm:pb-32 md:pt-32 md:pb-48">
                    <h1 className="font-display text-6xl/[0.9] font-medium tracking-tight text-balance text-gray-950 sm:text-8xl/[0.8] md:text-6xl/[0.8]">
                        Connect. Manage. Thrive.
                    </h1>
                    
                    <p className="mt-8 max-w-lg text-xl/7 font-medium text-gray-950/75 sm:text-2xl/8">
                        Built to empower farmers, vendors, and professionals in the aquaculture space.
                    </p>
                    
                    <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                        <Button href="#">Get started</Button>
                        <Button href="#" variant="secondary">
                            Learn more
                        </Button>
                </div>
                </div>
            </Container>
        </div>
    )
}