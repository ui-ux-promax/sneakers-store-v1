import { Heading, Link, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

export function NewsletterWelcomeEmail({ unsubscribeUrl }: { unsubscribeUrl: string }) {
  return (
    <EmailLayout preview="Ты подписан на дропы STRIDE">
      <Heading style={{ fontSize: 20, margin: '0 0 12px' }}>Ты в списке 🎉</Heading>
      <Text style={{ fontSize: 14, color: '#444', margin: '0 0 24px' }}>
        Будем присылать новые модели и дропы первыми. Без спама.
      </Text>
      <Text style={{ fontSize: 12, color: '#888', margin: 0 }}>
        Передумал? <Link href={unsubscribeUrl} style={{ color: '#888' }}>Отписаться</Link>.
      </Text>
    </EmailLayout>
  );
}

export default function Preview() {
  return <NewsletterWelcomeEmail unsubscribeUrl="https://cloudd3r.eu.cc/unsubscribe?token=demo" />;
}
