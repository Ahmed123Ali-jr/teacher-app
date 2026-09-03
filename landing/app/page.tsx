import { Hero } from '@/components/sections/Hero';
import { Statement } from '@/components/sections/Statement';
import { Features } from '@/components/sections/Features';
import { Bento } from '@/components/sections/Bento';
import { Stats } from '@/components/sections/Stats';
import { FinalCta } from '@/components/sections/FinalCta';
import { Footer } from '@/components/sections/Footer';

export default function Page() {
    return (
        <>
            <main>
                <Hero />
                <Statement />
                <Features />
                <Bento />
                <Stats />
                <FinalCta />
            </main>
            <Footer />
        </>
    );
}
