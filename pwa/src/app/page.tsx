import { Conversa } from '@/components/Conversa';

/**
 * O chat anônimo, em teste de campo.
 *
 * O chat inteiro mora em `components/Conversa.tsx`, compartilhado com o staging.
 * Sem props, ele se comporta exatamente como antes da extração.
 */
export default function Pagina() {
  return <Conversa />;
}
