import React from 'react';

import { Container } from './Container';

import { Heading, Lead } from './Text';

export default function PageHeading({ title, description }) {
    return (
        <Container className="mt-16">
            <Heading as="h1">{title}</Heading>
                <Lead className="mt-6 max-w-3xl">
                    {description}
                </Lead>
        </Container>
    );
}
