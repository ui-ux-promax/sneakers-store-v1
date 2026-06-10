import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './_layout';

export function VerificationCodeEmail({ code }: { code: string }) {
  return (
    <EmailLayout preview={`Код подтверждения: ${code}`}>
      <Heading style={{ fontSize: 20, margin: '0 0 12px' }}>Подтвердите почту</Heading>
      <Text style={{ fontSize: 14, color: '#444', margin: '0 0 24px' }}>
        Введите этот код в открытом окне, чтобы завершить регистрацию:
      </Text>
      <Text style={{ fontSize: 36, fontWeight: 700, letterSpacing: 8, textAlign: 'center', margin: '0 0 24px' }}>
        {code}
      </Text>
      <Text style={{ fontSize: 13, color: '#888', margin: 0 }}>
        Код действует 10 минут. Если вы не регистрировались — просто проигнорируйте это письмо.
      </Text>
    </EmailLayout>
  );
}

export default function Preview() {
  return <VerificationCodeEmail code="123456" />;
}
