import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cloudd3r.eu.cc';

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="ru">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#0a0a0a', margin: 0, fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ maxWidth: 480, margin: '0 auto', padding: '32px 24px' }}>
          <Section style={{ paddingBottom: 24 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>STRIDE</Text>
          </Section>
          <Section style={{ backgroundColor: '#fff', borderRadius: 16, padding: 32 }}>
            {children}
          </Section>
          <Section style={{ paddingTop: 24 }}>
            <Text style={{ color: '#888', fontSize: 12, margin: 0 }}>
              © 2026 STRIDE · {SITE.replace(/^https?:\/\//, '')}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
