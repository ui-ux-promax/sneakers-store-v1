import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cloudd3r.eu.cc';

export function WelcomeEmail({ name }: { name?: string }) {
  return (
    <EmailLayout preview="Добро пожаловать в STRIDE">
      <Heading style={{ fontSize: 20, margin: '0 0 12px' }}>
        {name ? `Привет, ${name}!` : 'Привет!'}
      </Heading>
      <Text style={{ fontSize: 14, color: '#444', margin: '0 0 24px' }}>
        Почта подтверждена — аккаунт готов. Залетай за новыми дропами.
      </Text>
      <Button href={`${SITE}/catalog`} style={{ backgroundColor: '#0a0a0a', color: '#fff', borderRadius: 999, padding: '12px 24px', fontSize: 14 }}>
        Смотреть каталог
      </Button>
    </EmailLayout>
  );
}

export default function Preview() {
  return <WelcomeEmail name="Neo" />;
}
